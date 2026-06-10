import { useCallback, useEffect, useRef, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import type { DemoProject, Hotspot } from "@/lib/demobuilder/types";

interface DemoPlayerProps {
	project: DemoProject;
	onExit: () => void;
	initialStepId?: string;
}

type PlayerPhase = "idle" | "cursorMove" | "highlight" | "click" | "caption" | "transition";

/** Check if a hotspot is a cursor marker (small dot placed by cursor annotation tool). */
function isCursorMarker(hotspot: Hotspot): boolean {
	return hotspot.width <= 3 && hotspot.height <= 3 && hotspot.clickAnimation !== "none";
}

export function DemoPlayer({ project, onExit, initialStepId }: DemoPlayerProps) {
	const t = useScopedT("demobuilder");
	const initialIndex = initialStepId
		? Math.max(
				0,
				project.steps.findIndex((s) => s.id === initialStepId),
			)
		: 0;
	const [currentIndex, setCurrentIndex] = useState(initialIndex);
	const [isPlaying, setIsPlaying] = useState(false);
	const [, setPhase] = useState<PlayerPhase>("idle");
	const [showCursor, setShowCursor] = useState(false);
	const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
	const [activeHotspotIds, setActiveHotspotIds] = useState<Set<string>>(new Set());
	const [clickingHotspotId, setClickingHotspotId] = useState<string | null>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const steps = project.steps;
	const currentStep = steps[currentIndex] ?? null;
	const currentScreenshot = currentStep
		? (project.screenshots.find((s) => s.id === currentStep.screenshotId) ?? null)
		: null;

	const clearTimers = useCallback(() => {
		if (timerRef.current) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
	}, []);

	const schedule = useCallback((fn: () => void, delay: number) => {
		timerRef.current = setTimeout(fn, delay);
	}, []);

	const goToStep = useCallback(
		(index: number) => {
			clearTimers();
			setPhase("idle");
			setShowCursor(false);
			setActiveHotspotIds(new Set());
			setClickingHotspotId(null);
			setCurrentIndex(Math.max(0, Math.min(index, steps.length - 1)));
		},
		[steps.length, clearTimers],
	);

	const nextStep = useCallback(() => {
		if (currentIndex < steps.length - 1) {
			goToStep(currentIndex + 1);
		} else {
			setIsPlaying(false);
		}
	}, [currentIndex, steps.length, goToStep]);

	const prevStep = useCallback(() => {
		goToStep(currentIndex - 1);
	}, [currentIndex, goToStep]);

	// Auto-play sequence for the current step — supports multiple cursor markers
	useEffect(() => {
		if (!isPlaying || !currentStep) return;

		const hotspots = currentStep.hotspots;
		const cursorMarkers = hotspots.filter(isCursorMarker);
		const highlightAreas = hotspots.filter((h) => !isCursorMarker(h));
		const cursor = currentStep.cursor;
		const moveDuration = cursor.movementDuration;

		// Show highlight areas immediately
		if (highlightAreas.length > 0) {
			setActiveHotspotIds(new Set(highlightAreas.map((h) => h.id)));
			setPhase("highlight");
		}

		if (cursorMarkers.length === 0) {
			// No cursor markers — hold on highlights then advance
			if (highlightAreas.length === 0) {
				// No hotspots at all, just hold
				schedule(() => {
					if (currentIndex < steps.length - 1) {
						setPhase("transition");
						schedule(() => nextStep(), currentStep.transition.duration);
					} else {
						setIsPlaying(false);
						setPhase("idle");
					}
				}, 2000);
			} else {
				schedule(() => {
					if (currentIndex < steps.length - 1) {
						setPhase("transition");
						schedule(() => nextStep(), currentStep.transition.duration);
					} else {
						setIsPlaying(false);
						setPhase("idle");
					}
				}, 2500);
			}
			return () => clearTimers();
		}

		// Animate cursor through each marker sequentially
		setShowCursor(true);
		setCursorPos(cursor.startPosition);
		setPhase("cursorMove");

		// Chain: start → marker[0] → click → marker[1] → click → ... → advance
		let delay = 300; // initial pause

		cursorMarkers.forEach((marker) => {
			const targetPos = marker.mouseTarget ?? {
				x: marker.x + marker.width / 2,
				y: marker.y + marker.height / 2,
			};

			// Move cursor to this marker
			schedule(() => {
				setPhase("cursorMove");
				setCursorPos(targetPos);
			}, delay);

			delay += moveDuration;

			// Click effect at this marker
			schedule(() => {
				setPhase("click");
				setClickingHotspotId(marker.id);
				if (cursor.clickSound) {
					playClickSound();
				}
			}, delay);

			delay += cursor.delayBeforeClick + 200;

			// Clear click effect
			schedule(() => {
				setClickingHotspotId(null);
			}, delay);

			delay += 300; // pause between markers
		});

		// After all markers: hold, then transition to next step
		schedule(() => {
			setPhase("caption");
			schedule(() => {
				if (currentIndex < steps.length - 1) {
					setPhase("transition");
					schedule(() => nextStep(), currentStep.transition.duration);
				} else {
					setIsPlaying(false);
					setPhase("idle");
				}
			}, 1500);
		}, delay);

		return () => clearTimers();
	}, [isPlaying, currentStep, currentIndex, nextStep, clearTimers, steps.length, schedule]);

	// Keyboard navigation
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "ArrowRight" || e.key === " ") {
				e.preventDefault();
				nextStep();
			} else if (e.key === "ArrowLeft") {
				e.preventDefault();
				prevStep();
			} else if (e.key === "Escape") {
				onExit();
			}
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [nextStep, prevStep, onExit]);

	return (
		<div className="h-screen flex flex-col bg-[#09090b] text-zinc-100">
			{/* Top bar */}
			<div className="h-12 flex items-center justify-between px-4 border-b border-zinc-800 shrink-0">
				<div className="flex items-center gap-3">
					<h1 className="text-sm font-medium text-zinc-300">{project.name}</h1>
					<span className="text-xs text-zinc-600">
						{t("player.stepCounter", { current: currentIndex + 1, total: steps.length })}
					</span>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => setIsPlaying(!isPlaying)}
						className="px-3 py-1 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
					>
						{isPlaying ? t("player.pause") : t("player.play")}
					</button>
					<button
						type="button"
						onClick={onExit}
						className="px-3 py-1 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
					>
						{t("player.exit")}
					</button>
				</div>
			</div>

			{/* Main player area */}
			<div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
				{currentScreenshot ? (
					<div className="relative max-w-full max-h-full">
						<img
							src={currentScreenshot.url}
							alt={currentStep?.title ?? ""}
							className="max-w-full max-h-full object-contain rounded"
							draggable={false}
						/>

						{/* Highlight area overlays */}
						{currentStep?.hotspots
							.filter((h) => !isCursorMarker(h))
							.map((hotspot) => (
								<PlayerHighlight
									key={hotspot.id}
									hotspot={hotspot}
									isActive={activeHotspotIds.has(hotspot.id)}
								/>
							))}

						{/* Cursor marker click effects */}
						{currentStep?.hotspots.filter(isCursorMarker).map((hotspot) => {
							const isClicking = clickingHotspotId === hotspot.id;
							if (!isClicking) return null;
							const cx = hotspot.mouseTarget?.x ?? hotspot.x + hotspot.width / 2;
							const cy = hotspot.mouseTarget?.y ?? hotspot.y + hotspot.height / 2;
							return <PlayerClickEffect key={hotspot.id} hotspot={hotspot} x={cx} y={cy} />;
						})}

						{/* Cursor overlay */}
						{showCursor && (
							<div
								className="absolute pointer-events-none transition-all"
								style={{
									left: `${cursorPos.x}%`,
									top: `${cursorPos.y}%`,
									width: "24px",
									height: "24px",
									marginLeft: "-12px",
									marginTop: "-12px",
									transitionDuration: `${currentStep?.cursor.movementDuration ?? 800}ms`,
									transitionTimingFunction:
										currentStep?.cursor.movementType === "easing"
											? (currentStep.cursor.easingFunction ?? "ease-in-out")
											: "linear",
									zIndex: 50,
								}}
							>
								<svg
									width="24"
									height="24"
									viewBox="0 0 24 24"
									fill="white"
									style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.6))" }}
								>
									<title>Cursor</title>
									<path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.85a.5.5 0 0 0-.85.36z" />
								</svg>
							</div>
						)}

						{/* Subtitle overlay */}
						{currentStep?.subtitles.map((sub) => (
							<div
								key={sub.id}
								className="absolute left-0 right-0 flex justify-center pointer-events-none px-4"
								style={{
									top:
										sub.position === "top" ? "5%" : sub.position === "center" ? "45%" : undefined,
									bottom: sub.position === "bottom" ? "5%" : undefined,
									zIndex: 40,
								}}
							>
								<span
									className="px-3 py-1.5 rounded text-center"
									style={{
										fontSize: sub.fontSize,
										fontFamily: sub.fontFamily,
										color: sub.style.color,
										backgroundColor: sub.style.backgroundColor,
										opacity: sub.style.opacity,
									}}
								>
									{sub.text}
								</span>
							</div>
						))}

						{/* Step title overlay */}
						{currentStep && (
							<div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/70 to-transparent">
								<p className="text-sm font-medium text-white">{currentStep.title}</p>
								{currentStep.description && (
									<p className="text-xs text-white/70 mt-0.5">{currentStep.description}</p>
								)}
							</div>
						)}
					</div>
				) : (
					<div className="text-zinc-600 text-sm">{t("player.noScreenshot")}</div>
				)}
			</div>

			{/* Bottom controls */}
			<div className="h-14 flex items-center justify-center gap-4 border-t border-zinc-800 shrink-0 px-4">
				<button
					type="button"
					onClick={prevStep}
					disabled={currentIndex === 0}
					className="px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
				>
					{t("player.previous")}
				</button>

				{/* Progress dots */}
				<div className="flex items-center gap-1.5">
					{steps.map((_, i) => (
						<button
							type="button"
							key={i}
							onClick={() => goToStep(i)}
							className={`w-2 h-2 rounded-full transition-colors ${
								i === currentIndex ? "bg-[#34B27B]" : "bg-zinc-600 hover:bg-zinc-500"
							}`}
						/>
					))}
				</div>

				<button
					type="button"
					onClick={nextStep}
					disabled={currentIndex === steps.length - 1}
					className="px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
				>
					{t("player.next")}
				</button>
			</div>
		</div>
	);
}

// ─── Sound Effects ───────────────────────────────────────────────────────────

function playClickSound() {
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

// ─── PlayerHighlight ─────────────────────────────────────────────────────────

function PlayerHighlight({ hotspot, isActive }: { hotspot: Hotspot; isActive: boolean }) {
	return (
		<div
			className="absolute pointer-events-none transition-all duration-500"
			style={{
				left: `${hotspot.x}%`,
				top: `${hotspot.y}%`,
				width: `${hotspot.width}%`,
				height: `${hotspot.height}%`,
				borderRadius: "4px",
				border:
					isActive && hotspot.highlightStyle === "border"
						? "2px solid rgba(52, 178, 123, 0.9)"
						: "none",
				backgroundColor:
					isActive && hotspot.highlightStyle === "background"
						? "rgba(52, 178, 123, 0.2)"
						: isActive && hotspot.highlightStyle === "pulse"
							? "rgba(52, 178, 123, 0.1)"
							: "transparent",
				boxShadow:
					isActive && hotspot.highlightStyle === "border"
						? "0 0 12px rgba(52, 178, 123, 0.4), inset 0 0 8px rgba(52, 178, 123, 0.1)"
						: "none",
				animation:
					isActive && hotspot.highlightStyle === "pulse"
						? "pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite"
						: "none",
				opacity: isActive ? 1 : 0,
				zIndex: 10,
			}}
		>
			{hotspot.label && isActive && (
				<span className="absolute -top-6 left-0 text-[10px] bg-zinc-900/90 text-zinc-200 px-1.5 py-0.5 rounded whitespace-nowrap backdrop-blur-sm">
					{hotspot.label}
				</span>
			)}
		</div>
	);
}

// ─── PlayerClickEffect ───────────────────────────────────────────────────────

function PlayerClickEffect({ hotspot, x, y }: { hotspot: Hotspot; x: number; y: number }) {
	return (
		<div
			className="absolute pointer-events-none"
			style={{
				left: `${x}%`,
				top: `${y}%`,
				width: "40px",
				height: "40px",
				marginLeft: "-20px",
				marginTop: "-20px",
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
