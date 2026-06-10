import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import type {
	DemoAppearance,
	DemoBackground,
	Hotspot,
	Point,
	Screenshot,
	Step,
	TransitionType,
} from "@/lib/demobuilder/types";
import { resolveImageWallpaperUrl } from "@/lib/wallpaper";

interface CanvasAreaProps {
	screenshot: Screenshot | null;
	step: Step | null;
	selectedHotspotId: string | null;
	background: DemoBackground;
	appearance: DemoAppearance;
	canvasWidth: number;
	canvasHeight: number;
	onSelectHotspot: (hotspotId: string | null) => void;
	onAddHotspot: (hotspot: Hotspot) => void;
	onUpdateHotspot: (hotspotId: string, updates: Partial<Hotspot>) => void;
	annotationMode: "cursor" | "highlight" | null;
	onSetAnnotationMode: (mode: "cursor" | "highlight" | null) => void;
	onAddCursorMarker: (position: { x: number; y: number }) => void;
	/** Whether inline playback is currently active. */
	isPlaying: boolean;
	/** Called when the current step's playback sequence finishes. */
	onStepPlaybackDone: () => void;
	/** Called when the user requests to stop playback (e.g. Escape key). */
	onStopPlayback: () => void;
}

function getBackgroundStyle(bg: DemoBackground): React.CSSProperties {
	if (!bg) return { backgroundColor: "#09090b" };
	if (bg.type === "wallpaper") {
		const url = resolveImageWallpaperUrl(bg.value);
		return {
			backgroundImage: `url(${url})`,
			backgroundSize: "cover",
			backgroundPosition: "center",
		};
	}
	if (bg.type === "gradient") {
		return { background: bg.value };
	}
	return { backgroundColor: bg.value };
}

/** Check if a hotspot is a cursor marker (small dot placed by cursor annotation tool). */
function isCursorMarker(hotspot: Hotspot): boolean {
	return hotspot.width <= 3 && hotspot.height <= 3 && hotspot.clickAnimation !== "none";
}

// ─── Playback timing constants ────────────────────────────────────────────────
const CURSOR_MOVE_MS = 800;
const CLICK_EFFECT_MS = 250;
const HOLD_AFTER_CLICK_MS = 700;
const HOLD_BETWEEN_MS = 200;
const INITIAL_DELAY_MS = 400;
const FINAL_HOLD_MS = 600;
const TRANSITION_MS = 500;
const HIGHLIGHT_FADE_MS = 400;
const DEFAULT_HIGHLIGHT_DURATION_MS = 1000;

// ─── 播放状态接口 ───────────────────────────────────────────────────────────
interface PlaybackState {
	cursorPos: Point | null;
	cursorVisible: boolean;
	clickingId: string | null;
	highlightedIds: Set<string>;
	/** 当前显示浮动说明的热点 ID */
	tooltipId: string | null;
	phase: "idle" | "moving" | "clicking" | "holding" | "transitioning";
}

const IDLE_PLAYBACK: PlaybackState = {
	cursorPos: null,
	cursorVisible: false,
	clickingId: null,
	highlightedIds: new Set(),
	tooltipId: null,
	phase: "idle",
};

function CanvasAreaInner({
	screenshot,
	step,
	selectedHotspotId,
	background,
	appearance,
	canvasWidth,
	canvasHeight,
	onSelectHotspot,
	onAddHotspot,
	onUpdateHotspot,
	annotationMode,
	onSetAnnotationMode,
	onAddCursorMarker,
	isPlaying,
	onStepPlaybackDone,
	onStopPlayback,
}: CanvasAreaProps) {
	const t = useScopedT("demobuilder");
	const viewportRef = useRef<HTMLDivElement>(null);
	const screenshotRef = useRef<HTMLDivElement>(null);
	/** 播放时跟踪上一张截图，用于转场动画双层渲染 */
	const prevScreenshotUrlRef = useRef<string | null>(null);
	const [isDrawing, setIsDrawing] = useState(false);
	const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
	const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);

	// ── Viewport scale ────────────────────────────────────────────────────────
	const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });
	const [imgNaturalSize, setImgNaturalSize] = useState({ w: 0, h: 0 });

	useEffect(() => {
		const el = viewportRef.current;
		if (!el) return;
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) {
				setViewportSize({
					w: entry.contentRect.width,
					h: entry.contentRect.height,
				});
			}
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const scale = useMemo(() => {
		if (viewportSize.w === 0 || viewportSize.h === 0) return 0;
		const MARGIN = 32;
		return Math.min(
			(viewportSize.w - MARGIN) / canvasWidth,
			(viewportSize.h - MARGIN) / canvasHeight,
			1,
		);
	}, [viewportSize, canvasWidth, canvasHeight]);

	// ── Memoized styles ───────────────────────────────────────────────────────
	const bgStyle = useMemo(() => getBackgroundStyle(background), [background]);

	const blurFilter = useMemo(
		() => (appearance.blurIntensity > 0 ? `blur(${appearance.blurIntensity * 20}px)` : undefined),
		[appearance.blurIntensity],
	);

	const shadowStyle = useMemo(
		() =>
			appearance.shadowIntensity > 0
				? `0 25px 60px rgba(0,0,0,${appearance.shadowIntensity}), 0 10px 25px rgba(0,0,0,${appearance.shadowIntensity * 0.6})`
				: undefined,
		[appearance.shadowIntensity],
	);

	// ── Image display size (fit within padded area, maintain aspect ratio) ────
	const imgDisplaySize = useMemo(() => {
		const pad = appearance.padding * 2;
		const availW = canvasWidth - pad;
		const availH = canvasHeight - pad;
		if (imgNaturalSize.w === 0 || imgNaturalSize.h === 0 || availW <= 0 || availH <= 0) {
			return { width: availW, height: availH };
		}
		const scale = Math.min(availW / imgNaturalSize.w, availH / imgNaturalSize.h);
		return {
			width: Math.round(imgNaturalSize.w * scale),
			height: Math.round(imgNaturalSize.h * scale),
		};
	}, [imgNaturalSize, canvasWidth, canvasHeight, appearance.padding]);

	// ── Mouse coordinate conversion ───────────────────────────────────────────
	const toPercent = useCallback((clientX: number, clientY: number) => {
		if (!screenshotRef.current) return { x: 0, y: 0 };
		const rect = screenshotRef.current.getBoundingClientRect();
		return {
			x: ((clientX - rect.left) / rect.width) * 100,
			y: ((clientY - rect.top) / rect.height) * 100,
		};
	}, []);

	// ── Mouse handlers — disabled during playback ─────────────────────────────
	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			if (isPlaying || !step) return;
			const target = e.target as HTMLElement;

			if (target.dataset.hotspotId && annotationMode !== "cursor") {
				onSelectHotspot(target.dataset.hotspotId);
				return;
			}

			if (annotationMode === "cursor") {
				const pos = toPercent(e.clientX, e.clientY);
				onAddCursorMarker(pos);
				return;
			}

			if (annotationMode === "highlight") {
				setIsDrawing(true);
				setDrawStart(toPercent(e.clientX, e.clientY));
				setDrawCurrent(toPercent(e.clientX, e.clientY));
				return;
			}

			if (!target.dataset.hotspotId) {
				onSelectHotspot(null);
			}
		},
		[step, isPlaying, annotationMode, toPercent, onSelectHotspot, onAddCursorMarker],
	);

	const handleMouseMove = useCallback(
		(e: React.MouseEvent) => {
			if (isPlaying || !isDrawing || annotationMode !== "highlight") return;
			setDrawCurrent(toPercent(e.clientX, e.clientY));
		},
		[isPlaying, isDrawing, annotationMode, toPercent],
	);

	const handleMouseUp = useCallback(() => {
		if (
			isPlaying ||
			!isDrawing ||
			!drawStart ||
			!drawCurrent ||
			!step ||
			annotationMode !== "highlight"
		) {
			setIsDrawing(false);
			setDrawStart(null);
			setDrawCurrent(null);
			return;
		}

		const x = Math.min(drawStart.x, drawCurrent.x);
		const y = Math.min(drawStart.y, drawCurrent.y);
		const width = Math.abs(drawCurrent.x - drawStart.x);
		const height = Math.abs(drawCurrent.y - drawStart.y);

		if (width > 1 && height > 1) {
			const hotspot: Hotspot = {
				id: crypto.randomUUID(),
				stepId: step.id,
				x,
				y,
				width,
				height,
				label: "",
				highlightStyle: "border",
				clickAnimation: "none",
				mouseTarget: null,
				jumpToStepId: null,
				shape: "rect",
			};
			onAddHotspot(hotspot);
		}

		setIsDrawing(false);
		setDrawStart(null);
		setDrawCurrent(null);
	}, [isPlaying, isDrawing, drawStart, drawCurrent, step, annotationMode, onAddHotspot]);

	const handleHotspotDrag = useCallback(
		(hotspotId: string, deltaX: number, deltaY: number) => {
			if (isPlaying) return;
			onUpdateHotspot(hotspotId, { x: deltaX, y: deltaY });
		},
		[isPlaying, onUpdateHotspot],
	);

	const handleHotspotResize = useCallback(
		(hotspotId: string, updates: { x: number; y: number; width: number; height: number }) => {
			if (isPlaying) return;
			onUpdateHotspot(hotspotId, updates);
		},
		[isPlaying, onUpdateHotspot],
	);

	// 播放时跟踪上一张截图 URL（用于转场动画）
	useEffect(() => {
		if (screenshot?.url) {
			prevScreenshotUrlRef.current = screenshot.url;
		}
	}, [screenshot?.url]);

	// ── Inline playback engine ────────────────────────────────────────────────
	const [playback, setPlayback] = useState<PlaybackState>(IDLE_PLAYBACK);
	const timerRef = useRef<ReturnType<typeof setTimeout>[]>([]);

	const clearPlaybackTimers = useCallback(() => {
		for (const id of timerRef.current) clearTimeout(id);
		timerRef.current = [];
	}, []);

	const schedule = useCallback((fn: () => void, delay: number) => {
		const id = setTimeout(fn, delay);
		timerRef.current.push(id);
	}, []);

	// Reset playback state when stopping
	useEffect(() => {
		if (!isPlaying) {
			clearPlaybackTimers();
			setPlayback(IDLE_PLAYBACK);
		}
	}, [isPlaying, clearPlaybackTimers]);

	// Escape key to stop playback
	useEffect(() => {
		if (!isPlaying) return;
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") {
				e.preventDefault();
				onStopPlayback();
			}
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isPlaying, onStopPlayback]);

	// Main playback sequence
	useEffect(() => {
		if (!isPlaying || !step) return;

		clearPlaybackTimers();
		setPlayback({
			cursorPos: null,
			cursorVisible: false,
			clickingId: null,
			highlightedIds: new Set(),
			tooltipId: null,
			phase: "idle",
		});

		const hotspots = [...step.hotspots]; // preserve insertion order
		const transitionDuration =
			step.transition.type === "none" ? 50 : (step.transition.duration ?? TRANSITION_MS);
		if (hotspots.length === 0) {
			// No hotspots: hold then advance
			schedule(() => {
				setPlayback((p) => ({ ...p, phase: "transitioning" }));
				schedule(() => onStepPlaybackDone(), transitionDuration);
			}, 2000);
			return () => clearPlaybackTimers();
		}

		let delay = INITIAL_DELAY_MS;

		// Show all highlight areas with a slight stagger
		const highlightAreas = hotspots.filter((h) => !isCursorMarker(h));
		highlightAreas.forEach((h, i) => {
			const appearTime = delay + i * HIGHLIGHT_FADE_MS;
			schedule(
				() =>
					setPlayback((p) => ({
						...p,
						highlightedIds: new Set([...p.highlightedIds, h.id]),
					})),
				appearTime,
			);

			// 高亮显示指定时长后自动消失
			const duration = h.highlightDuration ?? DEFAULT_HIGHLIGHT_DURATION_MS;
			schedule(
				() =>
					setPlayback((p) => {
						const next = new Set(p.highlightedIds);
						next.delete(h.id);
						return { ...p, highlightedIds: next };
					}),
				appearTime + HIGHLIGHT_FADE_MS + duration,
			);
		});
		if (highlightAreas.length > 0) {
			// 等待所有高亮显示完毕后开始后续动作
			const maxDuration = Math.max(
				...highlightAreas.map((h) => h.highlightDuration ?? DEFAULT_HIGHLIGHT_DURATION_MS),
			);
			delay += highlightAreas.length * HIGHLIGHT_FADE_MS + maxDuration + HIGHLIGHT_FADE_MS + 300;
		}

		// Animate cursor through each cursor marker in sequence
		const cursorMarkers = hotspots.filter(isCursorMarker);

		if (cursorMarkers.length > 0) {
			// Show cursor
			schedule(() => setPlayback((p) => ({ ...p, cursorVisible: true })), delay);
			delay += 100;

			cursorMarkers.forEach((marker) => {
				const target = marker.mouseTarget ?? {
					x: marker.x + marker.width / 2,
					y: marker.y + marker.height / 2,
				};

				// Move cursor
				schedule(() => {
					setPlayback((p) => ({
						...p,
						phase: "moving",
						cursorPos: target,
						cursorVisible: true,
					}));
				}, delay);
				delay += CURSOR_MOVE_MS;

				// 点击效果
				schedule(() => {
					setPlayback((p) => ({
						...p,
						phase: "clicking",
						clickingId: marker.id,
						// 如果该热点有浮动说明，同步显示
						tooltipId: marker.tooltip ? marker.id : p.tooltipId,
					}));
					// Play click sound
					try {
						const ctx = new AudioContext();
						const osc = ctx.createOscillator();
						const gain = ctx.createGain();
						osc.connect(gain);
						gain.connect(ctx.destination);
						osc.type = "sine";
						osc.frequency.setValueAtTime(800, ctx.currentTime);
						osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.08);
						gain.gain.setValueAtTime(0.15, ctx.currentTime);
						gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
						osc.start(ctx.currentTime);
						osc.stop(ctx.currentTime + 0.08);
					} catch {
						// AudioContext not available
					}
				}, delay);
				delay += CLICK_EFFECT_MS;

				// Clear click, hold
				schedule(() => {
					setPlayback((p) => ({ ...p, phase: "holding", clickingId: null }));
				}, delay);
				delay += HOLD_AFTER_CLICK_MS;

				// Brief pause before next marker
				delay += HOLD_BETWEEN_MS;
			});

			// Hide cursor after all markers
			schedule(() => {
				setPlayback((p) => ({ ...p, cursorVisible: false }));
			}, delay);
			delay += 200;
		}

		// Final hold, then transition
		delay += FINAL_HOLD_MS;
		schedule(() => {
			setPlayback((p) => ({ ...p, phase: "transitioning" }));
			schedule(() => onStepPlaybackDone(), transitionDuration);
		}, delay);

		return () => clearPlaybackTimers();
	}, [isPlaying, step, schedule, clearPlaybackTimers, onStepPlaybackDone]);

	// Canvas cursor style
	const canvasCursorClass = isPlaying
		? "cursor-default"
		: annotationMode === "cursor" || annotationMode === "highlight"
			? "cursor-crosshair"
			: "cursor-default";

	return (
		<div ref={viewportRef} className="h-full w-full flex flex-col overflow-hidden bg-[#09090b]">
			{/* ── Annotation Toolbar (hidden during playback) ── */}
			{!isPlaying && (
				<AnnotationToolbar
					mode={annotationMode}
					onChangeMode={onSetAnnotationMode}
					hasStep={!!step}
				/>
			)}

			{/* ── Playback status bar ── */}
			{isPlaying && (
				<div className="h-9 shrink-0 flex items-center justify-center gap-3 border-b border-zinc-800/60 bg-zinc-950/80 px-3">
					<div className="flex items-center gap-2">
						<div className="w-2 h-2 rounded-full bg-[#34B27B] animate-pulse" />
						<span className="text-[11px] font-medium text-[#34B27B]">{t("canvas.playing")}</span>
						{step && <span className="text-[11px] text-zinc-500">— {step.title}</span>}
					</div>
					<button
						type="button"
						onClick={onStopPlayback}
						className="px-2 py-0.5 text-[10px] text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
					>
						{t("canvas.stopPlayback")}
					</button>
				</div>
			)}

			{/* ── Canvas viewport ── */}
			<div className="flex-1 flex items-center justify-center overflow-hidden">
				<div
					className="relative"
					style={{
						width: canvasWidth,
						height: canvasHeight,
						transform: `scale(${scale})`,
						transformOrigin: "center center",
						flexShrink: 0,
					}}
				>
					{/* Background layer — blur isolated here */}
					<div
						className="absolute inset-0 bg-cover bg-center"
						style={{
							...bgStyle,
							filter: blurFilter,
						}}
					/>

					{/* Foreground: padding + screenshot + effects */}
					<div
						className="absolute inset-0 flex items-center justify-center"
						style={{ padding: appearance.padding }}
					>
						{!screenshot ? (
							<div
								className="w-full h-full bg-zinc-900/80 flex items-center justify-center"
								style={{ borderRadius: appearance.borderRadius }}
							>
								<div className="text-center text-zinc-600">
									<p className="text-sm">{t("canvas.noScreenshot")}</p>
									<p className="text-xs mt-1">{t("canvas.drawHotspotHint")}</p>
								</div>
							</div>
						) : (
							<div
								ref={screenshotRef}
								data-canvas-image
								className={`relative ${canvasCursorClass}`}
								style={{
									width: imgDisplaySize.width,
									height: imgDisplaySize.height,
									borderRadius: appearance.borderRadius,
									boxShadow: shadowStyle,
									overflow: "hidden",
								}}
								onMouseDown={handleMouseDown}
								onMouseMove={handleMouseMove}
								onMouseUp={handleMouseUp}
								onMouseLeave={handleMouseUp}
							>
								<img
									src={screenshot.url}
									alt={screenshot.originalName}
									className="w-full h-full select-none"
									draggable={false}
									onLoad={(e) => {
										const img = e.currentTarget;
										setImgNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
									}}
								/>

								{/* Hotspot overlays — hide during playback, show editor markers */}
								{!isPlaying &&
									step?.hotspots.map((hotspot) => (
										<HotspotOverlay
											key={hotspot.id}
											hotspot={hotspot}
											isSelected={selectedHotspotId === hotspot.id}
											onSelect={() => onSelectHotspot(hotspot.id)}
											onDrag={handleHotspotDrag}
											onResize={handleHotspotResize}
										/>
									))}

								{/* ── 播放：高亮区域，使用自定义颜色 ── */}
								{isPlaying &&
									step?.hotspots
										.filter((h) => !isCursorMarker(h))
										.map((h) => (
											<PlaybackHighlight
												key={h.id}
												hotspot={h}
												isActive={playback.highlightedIds.has(h.id)}
											/>
										))}

								{/* ── 播放：点击效果 + 浮动说明 ── */}
								{isPlaying &&
									playback.clickingId &&
									step?.hotspots
										.filter((h) => h.id === playback.clickingId)
										.map((h) => {
											const cx = h.mouseTarget?.x ?? h.x + h.width / 2;
											const cy = h.mouseTarget?.y ?? h.y + h.height / 2;
											return (
												<React.Fragment key={h.id}>
													<PlaybackClickEffect hotspot={h} x={cx} y={cy} />
													{h.tooltip && <PlaybackTooltip text={h.tooltip} x={cx} y={cy} />}
												</React.Fragment>
											);
										})}

								{/* ── Playback: animated cursor ── */}
								{isPlaying && playback.cursorVisible && playback.cursorPos && (
									<div
										className="absolute pointer-events-none"
										style={{
											left: `${playback.cursorPos.x}%`,
											top: `${playback.cursorPos.y}%`,
											width: 28,
											height: 28,
											marginLeft: -14,
											marginTop: -14,
											transition: `left ${CURSOR_MOVE_MS}ms cubic-bezier(0.4, 0, 0.2, 1), top ${CURSOR_MOVE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
											zIndex: 50,
										}}
									>
										<svg
											width="24"
											height="24"
											viewBox="0 0 24 24"
											fill="white"
											style={{
												filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
											}}
										>
											<title>Cursor</title>
											<path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.85a.5.5 0 0 0-.85.36z" />
										</svg>
									</div>
								)}

								{/* ── Playback: transition overlay ── */}
								{isPlaying && playback.phase === "transitioning" && (
									<TransitionLayer
										type={step?.transition.type ?? "fade"}
										duration={step?.transition.duration ?? TRANSITION_MS}
										prevScreenshotUrl={prevScreenshotUrlRef.current}
										currentScreenshotUrl={screenshot?.url ?? null}
										borderRadius={appearance.borderRadius}
										imgWidth={imgDisplaySize.width}
										imgHeight={imgDisplaySize.height}
									/>
								)}

								{/* Drawing preview rectangle (highlight mode) */}
								{!isPlaying && isDrawing && drawStart && drawCurrent && (
									<div
										className="absolute border-2 border-[#34B27B] bg-[#34B27B]/10 pointer-events-none"
										style={{
											left: `${Math.min(drawStart.x, drawCurrent.x)}%`,
											top: `${Math.min(drawStart.y, drawCurrent.y)}%`,
											width: `${Math.abs(drawCurrent.x - drawStart.x)}%`,
											height: `${Math.abs(drawCurrent.y - drawStart.y)}%`,
										}}
									/>
								)}

								{/* Annotation mode hint overlay */}
								{!isPlaying && annotationMode && (
									<div className="absolute inset-0 pointer-events-none flex items-start justify-center pt-2">
										<div className="px-2.5 py-1 rounded-full bg-[#34B27B]/90 text-white text-[10px] font-medium shadow-lg backdrop-blur-sm">
											{annotationMode === "cursor"
												? t("canvas.clickToPlaceCursor")
												: t("canvas.dragToDrawHighlight")}
										</div>
									</div>
								)}
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

// Memoize to prevent re-renders when parent state changes but our props are identical
export const CanvasArea = React.memo(CanvasAreaInner);

// ─── 播放视觉组件 ──────────────────────────────────────────────────────────

/** 播放时的高亮遮罩层：区域内透明、区域外遮罩，支持多种形状 */
function PlaybackHighlight({ hotspot, isActive }: { hotspot: Hotspot; isActive: boolean }) {
	const color = hotspot.highlightColor || "#34B27B";
	const shape = hotspot.shape ?? "rect";

	// 生成 SVG 切割路径（even-odd 填充规则）
	const cutoutPath = useMemo(() => {
		const x = hotspot.x;
		const y = hotspot.y;
		const w = hotspot.width;
		const h = hotspot.height;
		const fullRect = "M0 0H100V100H0Z";
		if (shape === "circle" || shape === "ellipse") {
			const cx = x + w / 2;
			const cy = y + h / 2;
			const rx = w / 2;
			const ry = h / 2;
			return `${fullRect} M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
		}
		return `${fullRect} M${x} ${y}H${x + w}V${y + h}H${x}Z`;
	}, [hotspot.x, hotspot.y, hotspot.width, hotspot.height, shape]);

	return (
		<>
			{/* SVG 遮罩层：区域内透明，区域外半透明遮罩 */}
			<svg
				className="absolute inset-0 w-full h-full pointer-events-none transition-opacity"
				viewBox="0 0 100 100"
				preserveAspectRatio="none"
				style={{
					opacity: isActive ? 1 : 0,
					transitionDuration: `${HIGHLIGHT_FADE_MS}ms`,
					zIndex: 10,
				}}
			>
				<path d={cutoutPath} fill="rgba(0,0,0,0.55)" fillRule="evenodd" />
			</svg>

			{/* 高亮区域形状描边 */}
			<div
				className="absolute pointer-events-none transition-all"
				style={{
					left: `${hotspot.x}%`,
					top: `${hotspot.y}%`,
					width: `${hotspot.width}%`,
					height: `${hotspot.height}%`,
					opacity: isActive ? 1 : 0,
					transitionDuration: `${HIGHLIGHT_FADE_MS}ms`,
					zIndex: 11,
				}}
			>
				<svg
					viewBox="0 0 100 100"
					preserveAspectRatio="none"
					style={{ width: "100%", height: "100%", overflow: "visible" }}
				>
					{shape === "rect" && (
						<rect
							x="0"
							y="0"
							width="100"
							height="100"
							fill="none"
							stroke={color}
							strokeWidth="2"
							vectorEffect="non-scaling-stroke"
						/>
					)}
					{(shape === "circle" || shape === "ellipse") && (
						<ellipse
							cx="50"
							cy="50"
							rx="50"
							ry="50"
							fill="none"
							stroke={color}
							strokeWidth="2"
							vectorEffect="non-scaling-stroke"
						/>
					)}
				</svg>
				{hotspot.label && isActive && (
					<span className="absolute -top-6 left-0 text-[10px] bg-zinc-900/90 text-zinc-200 px-1.5 py-0.5 rounded whitespace-nowrap backdrop-blur-sm">
						{hotspot.label}
					</span>
				)}
			</div>
		</>
	);
}

/** 点击效果组件 */
function PlaybackClickEffect({ hotspot, x, y }: { hotspot: Hotspot; x: number; y: number }) {
	return (
		<div
			className="absolute pointer-events-none"
			style={{
				left: `${x}%`,
				top: `${y}%`,
				width: 44,
				height: 44,
				marginLeft: -22,
				marginTop: -22,
				zIndex: 45,
			}}
		>
			{hotspot.clickAnimation === "ripple" && (
				<div className="absolute inset-0 rounded-full animate-ping bg-[#34B27B]/30" />
			)}
			{hotspot.clickAnimation === "zoom" && (
				<div className="absolute inset-0 rounded-full animate-pulse bg-[#34B27B]/20" />
			)}
			{hotspot.clickAnimation === "flash" && (
				<div className="absolute inset-0 rounded-full bg-white/50 animate-[flash_0.3s_ease-out]" />
			)}
		</div>
	);
}

/** 播放时的浮动说明气泡，显示在光标点击位置上方 */
function PlaybackTooltip({ text, x, y }: { text: string; x: number; y: number }) {
	return (
		<div
			className="absolute pointer-events-none"
			style={{
				left: `${x}%`,
				top: `${y}%`,
				transform: "translate(-50%, -130%)",
				zIndex: 55,
				animation: "fadeIn 300ms ease-out forwards",
			}}
		>
			<div className="px-2.5 py-1.5 rounded-lg bg-zinc-900/95 text-white text-[11px] font-medium shadow-xl backdrop-blur-sm border border-white/10 whitespace-nowrap max-w-[200px] truncate">
				{text}
			</div>
			{/* 小三角箭头 */}
			<div className="w-0 h-0 mx-auto border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-zinc-900/95" />
		</div>
	);
}

// ─── Annotation Toolbar ──────────────────────────────────────────────────────

interface AnnotationToolbarProps {
	mode: "cursor" | "highlight" | null;
	onChangeMode: (mode: "cursor" | "highlight" | null) => void;
	hasStep: boolean;
}

const AnnotationToolbar = React.memo(function AnnotationToolbar({
	mode,
	onChangeMode,
	hasStep,
}: AnnotationToolbarProps) {
	const t = useScopedT("demobuilder");

	return (
		<div className="h-9 shrink-0 flex items-center justify-center gap-1 border-b border-zinc-800/60 bg-zinc-950/50 px-3">
			<ToolbarButton
				active={mode === "cursor"}
				disabled={!hasStep}
				onClick={() => onChangeMode(mode === "cursor" ? null : "cursor")}
				title={t("toolbar.cursorAnnotationTitle")}
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
					<path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.85a.5.5 0 0 0-.85.36z" />
				</svg>
				<span>{t("toolbar.cursorAnnotation")}</span>
			</ToolbarButton>

			<div className="w-px h-4 bg-zinc-800" />

			<ToolbarButton
				active={mode === "highlight"}
				disabled={!hasStep}
				onClick={() => onChangeMode(mode === "highlight" ? null : "highlight")}
				title={t("toolbar.highlightAnnotationTitle")}
			>
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					className="shrink-0"
				>
					<rect x="3" y="3" width="18" height="18" rx="2" />
					<rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor" opacity="0.25" />
				</svg>
				<span>{t("toolbar.highlightAnnotation")}</span>
			</ToolbarButton>

			{mode && (
				<>
					<div className="w-px h-4 bg-zinc-800" />
					<button
						type="button"
						onClick={() => onChangeMode(null)}
						className="px-2 py-0.5 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
					>
						{t("toolbar.cancel")}
					</button>
				</>
			)}
		</div>
	);
});

function ToolbarButton({
	active,
	disabled,
	onClick,
	title,
	children,
}: {
	active: boolean;
	disabled: boolean;
	onClick: () => void;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			title={title}
			className={`
				flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors
				${
					active
						? "bg-[#34B27B]/15 text-[#34B27B] ring-1 ring-[#34B27B]/30"
						: "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
				}
				disabled:opacity-30 disabled:cursor-not-allowed
			`}
		>
			{children}
		</button>
	);
}

// ─── HotspotOverlay (editor mode) ────────────────────────────────────────────

interface HotspotOverlayProps {
	hotspot: Hotspot;
	isSelected: boolean;
	onSelect: () => void;
	onDrag: (hotspotId: string, x: number, y: number) => void;
	onResize: (
		hotspotId: string,
		updates: { x: number; y: number; width: number; height: number },
	) => void;
}

type ResizeHandlePos = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const RESIZE_HANDLE_CURSOR: Record<ResizeHandlePos, string> = {
	nw: "nwse-resize",
	n: "ns-resize",
	ne: "nesw-resize",
	e: "ew-resize",
	se: "nwse-resize",
	s: "ns-resize",
	sw: "nesw-resize",
	w: "ew-resize",
};

/** 生成形状的 SVG 切割路径，用于 even-odd 填充规则 */
function shapeCutoutPath(shape: string, x: number, y: number, w: number, h: number): string {
	const fullRect = "M0 0H100V100H0Z";
	if (shape === "circle" || shape === "ellipse") {
		const cx = x + w / 2;
		const cy = y + h / 2;
		const rx = w / 2;
		const ry = h / 2;
		return `${fullRect} M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
	}
	// rect
	return `${fullRect} M${x} ${y}H${x + w}V${y + h}H${x}Z`;
}

/** 生成单独的 SVG 形状路径（用于描边） */
function shapePath(shape: string, x: number, y: number, w: number, h: number): string {
	if (shape === "circle" || shape === "ellipse") {
		const cx = x + w / 2;
		const cy = y + h / 2;
		const rx = w / 2;
		const ry = h / 2;
		return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
	}
	return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
}

const HotspotOverlay = React.memo(function HotspotOverlay({
	hotspot,
	isSelected,
	onSelect,
	onDrag,
	onResize,
}: HotspotOverlayProps) {
	const [isDragging, setIsDragging] = useState(false);
	const dragStartRef = useRef<{
		mouseX: number;
		mouseY: number;
		hotspotX: number;
		hotspotY: number;
	} | null>(null);

	// 拖拽缩放状态
	const [isResizing, setIsResizing] = useState(false);
	const resizeRef = useRef<{
		handle: ResizeHandlePos;
		mouseX: number;
		mouseY: number;
		initX: number;
		initY: number;
		initW: number;
		initH: number;
	} | null>(null);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			onSelect();
			setIsDragging(true);
			dragStartRef.current = {
				mouseX: e.clientX,
				mouseY: e.clientY,
				hotspotX: hotspot.x,
				hotspotY: hotspot.y,
			};
		},
		[onSelect, hotspot.x, hotspot.y],
	);

	const handleMouseMove = useCallback(
		(e: React.MouseEvent) => {
			if (!isDragging || !dragStartRef.current) return;
			const parent = (e.target as HTMLElement).parentElement;
			if (!parent) return;
			const rect = parent.getBoundingClientRect();
			const deltaX = ((e.clientX - dragStartRef.current.mouseX) / rect.width) * 100;
			const deltaY = ((e.clientY - dragStartRef.current.mouseY) / rect.height) * 100;
			onDrag(
				hotspot.id,
				dragStartRef.current.hotspotX + deltaX,
				dragStartRef.current.hotspotY + deltaY,
			);
		},
		[isDragging, hotspot.id, onDrag],
	);

	const handleMouseUp = useCallback(() => {
		setIsDragging(false);
		dragStartRef.current = null;
	}, []);

	// 缩放拖拽处理器
	const handleResizeMouseDown = useCallback(
		(e: React.MouseEvent, handle: ResizeHandlePos) => {
			e.stopPropagation();
			e.preventDefault();
			onSelect();
			setIsResizing(true);
			resizeRef.current = {
				handle,
				mouseX: e.clientX,
				mouseY: e.clientY,
				initX: hotspot.x,
				initY: hotspot.y,
				initW: hotspot.width,
				initH: hotspot.height,
			};
		},
		[hotspot.x, hotspot.y, hotspot.width, hotspot.height, onSelect],
	);

	const handleResizeMove = useCallback(
		(clientX: number, clientY: number) => {
			if (!resizeRef.current) return;
			// 通过 data-canvas-image 属性查找父容器
			const parent = document.querySelector("[data-canvas-image]");
			if (!parent) return;
			const rect = parent.getBoundingClientRect();
			const dPctX = ((clientX - resizeRef.current.mouseX) / rect.width) * 100;
			const dPctY = ((clientY - resizeRef.current.mouseY) / rect.height) * 100;
			const { handle, initX, initY, initW, initH } = resizeRef.current;
			let nx = initX;
			let ny = initY;
			let nw = initW;
			let nh = initH;

			// 根据拖拽的手柄计算新尺寸
			if (handle.includes("w")) {
				nw = Math.max(3, initW - dPctX);
				nx = initX + initW - nw;
			}
			if (handle.includes("e")) {
				nw = Math.max(3, initW + dPctX);
			}
			if (handle.includes("n")) {
				nh = Math.max(3, initH - dPctY);
				ny = initY + initH - nh;
			}
			if (handle.includes("s")) {
				nh = Math.max(3, initH + dPctY);
			}

			onResize(hotspot.id, { x: nx, y: ny, width: nw, height: nh });
		},
		[hotspot.id, onResize],
	);

	const handleResizeUp = useCallback(() => {
		setIsResizing(false);
		resizeRef.current = null;
	}, []);

	// 缩放时绑定全局文档事件，避免鼠标离开手柄后丢失事件
	useEffect(() => {
		if (!isResizing) return;
		const onMouseMove = (e: MouseEvent) => handleResizeMove(e.clientX, e.clientY);
		const onMouseUp = () => handleResizeUp();
		document.addEventListener("mousemove", onMouseMove);
		document.addEventListener("mouseup", onMouseUp);
		return () => {
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
		};
	}, [isResizing, handleResizeMove, handleResizeUp]);

	// Render differently for cursor markers vs highlight hotspots
	const cursorMarker = isCursorMarker(hotspot);

	if (cursorMarker) {
		const borderColor = isSelected ? "#34B27B" : "rgba(52, 178, 123, 0.6)";
		return (
			<div
				data-hotspot-id={hotspot.id}
				className="absolute cursor-move flex items-center justify-center"
				style={{
					left: `${hotspot.x}%`,
					top: `${hotspot.y}%`,
					width: "28px",
					height: "28px",
					marginLeft: "-14px",
					marginTop: "-14px",
					zIndex: 20,
				}}
				onMouseDown={handleMouseDown}
				onMouseMove={handleMouseMove}
				onMouseUp={handleMouseUp}
				onMouseLeave={handleMouseUp}
			>
				<div
					className="absolute inset-0 rounded-full"
					style={{
						border: `2px solid ${borderColor}`,
						backgroundColor: isSelected ? "rgba(52, 178, 123, 0.3)" : "rgba(52, 178, 123, 0.15)",
					}}
				/>
				<svg
					width="12"
					height="12"
					viewBox="0 0 24 24"
					fill="#34B27B"
					style={{
						filter: "drop-shadow(0 0 2px rgba(0,0,0,0.6))",
						position: "relative",
						zIndex: 1,
					}}
				>
					<path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.85a.5.5 0 0 0-.85.36z" />
				</svg>
			</div>
		);
	}

	// 普通高亮热点，支持形状、遮罩和拖拽缩放
	const hColor = hotspot.highlightColor || "#34B27B";
	const shape = hotspot.shape ?? "rect";

	return (
		<div
			data-hotspot-id={hotspot.id}
			className="absolute"
			style={{
				left: `${hotspot.x}%`,
				top: `${hotspot.y}%`,
				width: `${hotspot.width}%`,
				height: `${hotspot.height}%`,
				cursor: isDragging ? "grabbing" : "move",
				zIndex: isSelected ? 25 : 20,
			}}
			onMouseDown={handleMouseDown}
			onMouseMove={handleMouseMove}
			onMouseUp={handleMouseUp}
			onMouseLeave={handleMouseUp}
		>
			{/* 半透明遮罩层：区域内透明，区域外遮罩 */}
			<svg
				style={{
					position: "absolute",
					left: "-100vw",
					top: "-100vh",
					width: "300vw",
					height: "300vh",
					pointerEvents: "none",
					overflow: "visible",
				}}
			>
				<path
					d={shapeCutoutPath(shape, 0, 0, 100, 100)}
					fill={isSelected ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.35)"}
					fillRule="evenodd"
				/>
			</svg>

			{/* 形状描边 */}
			<svg
				viewBox="0 0 100 100"
				preserveAspectRatio="none"
				style={{
					position: "absolute",
					inset: 0,
					width: "100%",
					height: "100%",
					pointerEvents: "none",
					overflow: "visible",
				}}
			>
				<path
					d={shapePath(shape, 0, 0, 100, 100)}
					fill="none"
					stroke={hColor}
					strokeWidth={isSelected ? "2.5" : "1.5"}
					strokeDasharray={isSelected ? "none" : "4 2"}
					vectorEffect="non-scaling-stroke"
				/>
			</svg>

			{/* 标签 */}
			{hotspot.label && (
				<span className="absolute -top-5 left-0 text-[10px] bg-zinc-900 text-zinc-300 px-1.5 py-0.5 rounded whitespace-nowrap pointer-events-none">
					{hotspot.label}
				</span>
			)}

			{/* 选中时显示 8 个缩放手柄 */}
			{isSelected &&
				!isDragging &&
				(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const).map((handle) => (
					<div
						key={handle}
						className="absolute w-2.5 h-2.5 bg-white rounded-sm border border-zinc-600"
						style={{
							left: handle.includes("w")
								? "-5px"
								: handle.includes("e")
									? "calc(100% - 5px)"
									: "calc(50% - 5px)",
							top: handle.includes("n")
								? "-5px"
								: handle.includes("s")
									? "calc(100% - 5px)"
									: "calc(50% - 5px)",
							cursor: RESIZE_HANDLE_CURSOR[handle],
							zIndex: 30,
							boxShadow: "0 0 3px rgba(0,0,0,0.5)",
						}}
						onMouseDown={(e) => handleResizeMouseDown(e, handle)}
					/>
				))}
		</div>
	);
});

// ─── 转场动画层 ─────────────────────────────────────────────────────────────

interface TransitionLayerProps {
	type: TransitionType;
	duration: number;
	prevScreenshotUrl: string | null;
	currentScreenshotUrl: string | null;
	borderRadius: number;
	imgWidth: number;
	imgHeight: number;
}

/**
 * 步骤切换时的转场动画层。
 * 支持淡入淡出、滑动、缩放、溶解、擦除等多种效果。
 */
function TransitionLayer({
	type,
	duration,
	prevScreenshotUrl,
	currentScreenshotUrl,
	borderRadius,
	imgWidth,
	imgHeight,
}: TransitionLayerProps) {
	// 无转场效果
	if (type === "none") return null;

	const baseStyle: React.CSSProperties = {
		position: "absolute",
		left: 0,
		top: 0,
		width: imgWidth,
		height: imgHeight,
		borderRadius,
		overflow: "hidden",
		pointerEvents: "none",
		zIndex: 60,
	};

	// 滑动类型需要双层渲染：旧图退出 + 新图进入
	if (type === "slide-left" || type === "slide-right" || type === "slide-up") {
		const configs: Record<string, { exitAnim: string; enterAnim: string }> = {
			"slide-left": { exitAnim: "demo-slide-exit-left", enterAnim: "demo-slide-enter-right" },
			"slide-right": { exitAnim: "demo-slide-exit-right", enterAnim: "demo-slide-enter-left" },
			"slide-up": { exitAnim: "demo-slide-exit-up", enterAnim: "demo-slide-enter-up" },
		};
		const cfg = configs[type];
		return (
			<>
				{/* 旧截图退出 */}
				{prevScreenshotUrl && prevScreenshotUrl !== currentScreenshotUrl && (
					<div
						style={{
							...baseStyle,
							animation: `${cfg.exitAnim} ${duration}ms ease-in-out forwards`,
						}}
					>
						<img
							src={prevScreenshotUrl}
							alt=""
							className="w-full h-full object-cover"
							draggable={false}
						/>
					</div>
				)}
				{/* 新截图进入 */}
				<div
					style={{
						...baseStyle,
						animation: `${cfg.enterAnim} ${duration}ms ease-in-out forwards`,
						zIndex: 61,
					}}
				>
					<img
						src={currentScreenshotUrl ?? ""}
						alt=""
						className="w-full h-full object-cover"
						draggable={false}
					/>
				</div>
			</>
		);
	}

	// 缩放类型
	if (type === "zoom") {
		return (
			<>
				{/* 旧截图缩小退出 */}
				{prevScreenshotUrl && prevScreenshotUrl !== currentScreenshotUrl && (
					<div
						style={{
							...baseStyle,
							animation: `demo-zoom-out ${duration}ms ease-in forwards`,
						}}
					>
						<img
							src={prevScreenshotUrl}
							alt=""
							className="w-full h-full object-cover"
							draggable={false}
						/>
					</div>
				)}
				{/* 新截图放大进入 */}
				<div
					style={{
						...baseStyle,
						animation: `demo-zoom-in ${duration}ms ease-out forwards`,
						zIndex: 61,
					}}
				>
					<img
						src={currentScreenshotUrl ?? ""}
						alt=""
						className="w-full h-full object-cover"
						draggable={false}
					/>
				</div>
			</>
		);
	}

	// 溶解类型（透明度交叉淡入淡出）
	if (type === "dissolve") {
		return (
			<>
				{/* 旧截图淡出 */}
				{prevScreenshotUrl && prevScreenshotUrl !== currentScreenshotUrl && (
					<div
						style={{
							...baseStyle,
							animation: `demo-fade-in ${duration}ms ease-in-out reverse forwards`,
						}}
					>
						<img
							src={prevScreenshotUrl}
							alt=""
							className="w-full h-full object-cover"
							draggable={false}
						/>
					</div>
				)}
				{/* 新截图淡入 */}
				<div
					style={{
						...baseStyle,
						animation: `demo-fade-in ${duration}ms ease-in-out forwards`,
						zIndex: 61,
					}}
				>
					<img
						src={currentScreenshotUrl ?? ""}
						alt=""
						className="w-full h-full object-cover"
						draggable={false}
					/>
				</div>
			</>
		);
	}

	// 擦除类型（从左到右擦除）
	if (type === "wipe") {
		return (
			<>
				{/* 旧截图保持底层 */}
				{prevScreenshotUrl && prevScreenshotUrl !== currentScreenshotUrl && (
					<div style={baseStyle}>
						<img
							src={prevScreenshotUrl}
							alt=""
							className="w-full h-full object-cover"
							draggable={false}
						/>
					</div>
				)}
				{/* 新截图通过 clip-path 擦除显示 */}
				<div
					style={{
						...baseStyle,
						animation: `demo-wipe ${duration}ms ease-in-out forwards`,
						zIndex: 61,
					}}
				>
					<img
						src={currentScreenshotUrl ?? ""}
						alt=""
						className="w-full h-full object-cover"
						draggable={false}
					/>
				</div>
			</>
		);
	}

	// 默认淡入黑色遮罩（fade 类型）
	return (
		<div
			className="absolute inset-0 bg-black pointer-events-none"
			style={{
				animation: `demo-fade-in ${duration}ms ease-in forwards`,
				zIndex: 60,
			}}
		/>
	);
}
