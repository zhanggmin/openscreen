import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import type { DemoFrameState } from "@/lib/demobuilder/demoPlaybackEngine";
import { computeFrameState, computeTotalDurationMs } from "@/lib/demobuilder/demoPlaybackEngine";
import type {
	CursorStyle,
	DemoAppearance,
	DemoBackground,
	DemoProject,
	Hotspot,
	Screenshot,
	Step,
} from "@/lib/demobuilder/types";
import { isCursorMarker, isZoomRegion, ZOOM_LEVEL_SCALES } from "@/lib/demobuilder/types";
import { resolveImageWallpaperUrl } from "@/lib/wallpaper";
import { DemoFrameView } from "./DemoFrameView";

interface CanvasAreaProps {
	screenshot: Screenshot | null;
	step: Step | null;
	selectedHotspotId: string | null;
	background: DemoBackground;
	appearance: DemoAppearance;
	canvasWidth: number;
	canvasHeight: number;
	cursorType?: CursorStyle;
	cursorTheme?: string;
	onSelectHotspot: (hotspotId: string | null) => void;
	onAddHotspot: (hotspot: Hotspot) => void;
	onUpdateHotspot: (hotspotId: string, updates: Partial<Hotspot>) => void;
	annotationMode: "cursor" | "highlight" | "zoom" | null;
	onSetAnnotationMode: (mode: "cursor" | "highlight" | "zoom" | null) => void;
	onAddCursorMarker: (position: { x: number; y: number }) => void;
	/** Full project data (needed for computeFrameState during playback). */
	project: DemoProject;
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

// 点击音效：将音频文件放在 public/sounds/click.mp3
const CLICK_SOUND_URL = "/sounds/click.mp3";
let clickAudio: HTMLAudioElement | null = null;
try {
	clickAudio = new Audio(CLICK_SOUND_URL);
	clickAudio.preload = "auto";
	clickAudio.volume = 0.5;
} catch {
	// 环境不支持 Audio
}

/** 播放点击音效，失败时回退为合成音效 */
function playClickSound() {
	if (clickAudio) {
		try {
			clickAudio.currentTime = 0;
			clickAudio.play();
			return;
		} catch {
			// 音频文件不存在或加载失败，回退为合成音
		}
	}
	// 回退：Web Audio API 合成音效
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
}

function CanvasAreaInner({
	screenshot,
	step,
	selectedHotspotId,
	background,
	appearance,
	canvasWidth,
	canvasHeight,
	cursorType,
	cursorTheme,
	onSelectHotspot,
	onAddHotspot,
	onUpdateHotspot,
	annotationMode,
	onSetAnnotationMode,
	onAddCursorMarker,
	project,
	isPlaying,
	onStepPlaybackDone,
	onStopPlayback,
}: CanvasAreaProps) {
	const t = useScopedT("demobuilder");
	const viewportRef = useRef<HTMLDivElement>(null);
	const screenshotRef = useRef<HTMLDivElement>(null);
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

			if (annotationMode === "zoom") {
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
			if (isPlaying || !isDrawing) return;
			if (annotationMode !== "highlight" && annotationMode !== "zoom") return;
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
			(annotationMode !== "highlight" && annotationMode !== "zoom")
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
				zoomLevel: annotationMode === "zoom" ? 3 : undefined,
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

	// ── Screenshot URL map for DemoFrameView ──
	const screenshotMap = useMemo(() => {
		const map = new Map<string, string>();
		for (const s of project.screenshots) {
			map.set(s.id, s.url);
		}
		return map;
	}, [project.screenshots]);

	// ── rAF-based playback engine using computeFrameState ──
	const [frameState, setFrameState] = useState<DemoFrameState | null>(null);
	const rafRef = useRef<number>(0);
	const startTimeRef = useRef<number>(0);
	const playedClickRef = useRef<boolean>(false);

	// ── Zoom transform for editor preview ─────────────────────────────────────
	// 思路（参考视频编辑器）：
	//  1) 计算焦点 = 缩放区域中心 (cx, cy)，归一化到 [0,1]
	//  2) clamp 到安全范围 [1/(2s), 1-1/(2s)]，避免缩放后画布边缘露白
	//  3) 按 target scale 计算最终偏移 finalT = stageCenter - focusPx * targetScale
	//  4) 实际偏移 = finalT * progress，scale 也用 progress 渐进，保证进场流畅
	const zoomTransform = useMemo(() => {
		const z = frameState?.zoom;
		if (!z || z.progress <= 0) return undefined;
		const zoomLevel = z.region.zoomLevel ?? 3;
		const targetScale = ZOOM_LEVEL_SCALES[zoomLevel];
		const w = imgDisplaySize.width;
		const h = imgDisplaySize.height;
		if (w <= 0 || h <= 0) return undefined;

		// 焦点（区域中心）归一化坐标
		const rawCx = (z.region.x + z.region.width / 2) / 100;
		const rawCy = (z.region.y + z.region.height / 2) / 100;
		// clamp：保证缩放后视口完全落在原图范围内
		const margin = Math.min(0.5, 1 / (2 * targetScale));
		const focusCx = Math.max(margin, Math.min(1 - margin, rawCx));
		const focusCy = Math.max(margin, Math.min(1 - margin, rawCy));

		// 焦点像素坐标
		const focusPxX = focusCx * w;
		const focusPxY = focusCy * h;
		// 最终偏移（按目标倍率）
		const finalTx = w / 2 - focusPxX * targetScale;
		const finalTy = h / 2 - focusPxY * targetScale;
		// 当前帧偏移与缩放（按进度渐进）
		const scale = 1 + (targetScale - 1) * z.progress;
		const tx = finalTx * z.progress;
		const ty = finalTy * z.progress;

		return {
			transform: `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${scale})`,
			transformOrigin: "0 0",
		};
	}, [frameState?.zoom, imgDisplaySize]);

	// Reset playback state when stopping
	useEffect(() => {
		if (!isPlaying) {
			cancelAnimationFrame(rafRef.current);
			setFrameState(null);
		}
	}, [isPlaying]);

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

	// Main playback loop using requestAnimationFrame + computeFrameState
	useEffect(() => {
		if (!isPlaying || !step || !project) return;

		startTimeRef.current = performance.now();
		playedClickRef.current = false;

		// Build a single-step project for computeFrameState
		const singleStepProject: DemoProject = {
			...project,
			steps: [step],
		};

		const totalMs = computeTotalDurationMs(singleStepProject);

		function tick() {
			const elapsed = performance.now() - startTimeRef.current;

			try {
				const state = computeFrameState(singleStepProject, elapsed);
				setFrameState(state);

				// Play click sound when a click effect first appears
				if (state.clickEffect && !playedClickRef.current) {
					playedClickRef.current = true;
					playClickSound();
				}
				if (!state.clickEffect) {
					playedClickRef.current = false;
				}

				if (elapsed < totalMs) {
					rafRef.current = requestAnimationFrame(tick);
				} else {
					onStepPlaybackDone();
				}
			} catch {
				onStepPlaybackDone();
			}
		}

		rafRef.current = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(rafRef.current);
	}, [isPlaying, step, project, onStepPlaybackDone]);

	// Canvas cursor style
	const canvasCursorClass = isPlaying
		? "cursor-default"
		: annotationMode === "cursor" || annotationMode === "highlight" || annotationMode === "zoom"
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
								{/* Zoom layer：仅放大内部内容，外层容器保持固定尺寸 */}
								<div
									className="absolute inset-0"
									style={{
										...(zoomTransform ?? {}),
										transition: zoomTransform ? "none" : undefined,
									}}
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
												annotationMode={annotationMode}
												onSelect={() => onSelectHotspot(hotspot.id)}
												onDrag={handleHotspotDrag}
												onResize={handleHotspotResize}
											/>
										))}

									{/* ── Playback: DemoFrameView ── */}
									{isPlaying && frameState && (
										<DemoFrameView
											state={frameState}
											width={imgDisplaySize.width}
											height={imgDisplaySize.height}
											background={background}
											appearance={appearance}
											screenshots={screenshotMap}
											screenshotList={project.screenshots}
											cursorType={cursorType}
											cursorTheme={cursorTheme}
											skipChrome
										/>
									)}

									{/* Drawing preview rectangle (highlight / zoom mode) */}
									{!isPlaying && isDrawing && drawStart && drawCurrent && (
										<div
											className={`absolute border-2 ${
												annotationMode === "zoom"
													? "border-[#3B82F6] bg-[#3B82F6]/10"
													: "border-[#34B27B] bg-[#34B27B]/10"
											} pointer-events-none`}
											style={{
												left: `${Math.min(drawStart.x, drawCurrent.x)}%`,
												top: `${Math.min(drawStart.y, drawCurrent.y)}%`,
												width: `${Math.abs(drawCurrent.x - drawStart.x)}%`,
												height: `${Math.abs(drawCurrent.y - drawStart.y)}%`,
											}}
										/>
									)}
								</div>

								{/* Annotation mode hint overlay — 不参与缩放 */}
								{!isPlaying && annotationMode && (
									<div className="absolute inset-0 pointer-events-none flex items-start justify-center pt-2">
										<div className="px-2.5 py-1 rounded-full bg-[#34B27B]/90 text-white text-[10px] font-medium shadow-lg backdrop-blur-sm">
											{annotationMode === "cursor"
												? t("canvas.clickToPlaceCursor")
												: annotationMode === "zoom"
													? t("canvas.dragToDrawZoomRegion")
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

// ─── Annotation Toolbar ──────────────────────────────────────────────────────

interface AnnotationToolbarProps {
	mode: "cursor" | "highlight" | "zoom" | null;
	onChangeMode: (mode: "cursor" | "highlight" | "zoom" | null) => void;
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

			<div className="w-px h-4 bg-zinc-800" />

			<ToolbarButton
				active={mode === "zoom"}
				disabled={!hasStep}
				onClick={() => onChangeMode(mode === "zoom" ? null : "zoom")}
				title={t("toolbar.zoomAnnotationTitle")}
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
					<circle cx="11" cy="11" r="7" />
					<line x1="16.5" y1="16.5" x2="21" y2="21" />
					<line x1="8" y1="11" x2="14" y2="11" />
					<line x1="11" y1="8" x2="11" y2="14" />
				</svg>
				<span>{t("toolbar.zoomAnnotation")}</span>
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
	annotationMode: "cursor" | "highlight" | "zoom" | null;
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
	annotationMode,
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
			// 在光标标注模式下，不阻止事件冒泡，让父级处理光标放置
			if (annotationMode === "cursor") return;
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
		[annotationMode, onSelect, hotspot.x, hotspot.y],
	);

	const handleDragMove = useCallback(
		(clientX: number, clientY: number) => {
			if (!dragStartRef.current) return;
			const parent = document.querySelector("[data-canvas-image]");
			if (!parent) return;
			const rect = parent.getBoundingClientRect();
			const deltaX = ((clientX - dragStartRef.current.mouseX) / rect.width) * 100;
			const deltaY = ((clientY - dragStartRef.current.mouseY) / rect.height) * 100;
			onDrag(
				hotspot.id,
				dragStartRef.current.hotspotX + deltaX,
				dragStartRef.current.hotspotY + deltaY,
			);
		},
		[hotspot.id, onDrag],
	);

	const handleMouseUp = useCallback(() => {
		setIsDragging(false);
		dragStartRef.current = null;
	}, []);

	// 拖拽时绑定全局文档事件，避免鼠标离开元素后丢失事件
	useEffect(() => {
		if (!isDragging) return;
		const onMouseMove = (e: MouseEvent) => handleDragMove(e.clientX, e.clientY);
		const onMouseUp = () => handleMouseUp();
		document.addEventListener("mousemove", onMouseMove);
		document.addEventListener("mouseup", onMouseUp);
		return () => {
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
		};
	}, [isDragging, handleDragMove, handleMouseUp]);

	// 缩放拖拽处理器
	const handleResizeMouseDown = useCallback(
		(e: React.MouseEvent, handle: ResizeHandlePos) => {
			// 在光标标注模式下，不阻止事件冒泡
			if (annotationMode === "cursor") return;
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
		[annotationMode, hotspot.x, hotspot.y, hotspot.width, hotspot.height, onSelect],
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

	// Render differently for cursor markers vs highlight hotspots vs zoom regions
	const cursorMarker = isCursorMarker(hotspot);
	const zoomRegion = isZoomRegion(hotspot);

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

	// 普通高亮热点 / 缩放区域，支持形状、遮罩和拖拽缩放
	const hColor = zoomRegion ? "#3B82F6" : hotspot.highlightColor || "#34B27B";
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
					strokeDasharray={zoomRegion ? "4 2" : isSelected ? "none" : "4 2"}
					vectorEffect="non-scaling-stroke"
				/>
			</svg>

			{/* 缩放区域标识 */}
			{zoomRegion && (
				<div className="absolute -top-5 left-0 flex items-center gap-1 text-[10px] text-[#3B82F6] whitespace-nowrap pointer-events-none">
					<svg
						width="10"
						height="10"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
					>
						<circle cx="11" cy="11" r="7" />
						<line x1="16.5" y1="16.5" x2="21" y2="21" />
					</svg>
					{hotspot.zoomLevel != null ? `${ZOOM_LEVEL_SCALES[hotspot.zoomLevel ?? 3]}×` : ""}
				</div>
			)}

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
