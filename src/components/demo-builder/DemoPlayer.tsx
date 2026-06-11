import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import type { DemoFrameState } from "@/lib/demobuilder/demoPlaybackEngine";
import {
	computeFrameState,
	computeTotalDurationMs,
	PLAYBACK_TIMING,
} from "@/lib/demobuilder/demoPlaybackEngine";
import type { DemoProject } from "@/lib/demobuilder/types";
import { DemoFrameView } from "./DemoFrameView";

interface DemoPlayerProps {
	project: DemoProject;
	onExit: () => void;
	initialStepId?: string;
}

export function DemoPlayer({ project, onExit, initialStepId }: DemoPlayerProps) {
	const t = useScopedT("demobuilder");

	// ── Screenshot URL map ──
	const screenshotMap = useMemo(() => {
		const map = new Map<string, string>();
		for (const s of project.screenshots) {
			map.set(s.id, s.url);
		}
		return map;
	}, [project.screenshots]);

	// ── Compute step global start times for seeking ──
	const stepStartTimes = useMemo(() => {
		const T = PLAYBACK_TIMING;
		const times: number[] = [];
		let globalStart = 0;

		for (const step of [...project.steps].sort((a, b) => a.order - b.order)) {
			times.push(globalStart);
			let t: number = T.INITIAL_DELAY_MS;

			const highlightAreas = step.hotspots.filter(
				(h) => !(h.width <= 3 && h.height <= 3 && h.clickAnimation !== "none"),
			);
			for (const h of highlightAreas) {
				const duration = h.highlightDuration ?? T.DEFAULT_HIGHLIGHT_DURATION_MS;
				t += T.HIGHLIGHT_FADE_MS + duration + T.HIGHLIGHT_FADE_MS;
			}
			if (highlightAreas.length > 0) {
				t += T.REGION_TO_CURSOR_BUFFER_MS;
			}

			const cursorMarkers = step.hotspots.filter(
				(h) => h.width <= 3 && h.height <= 3 && h.clickAnimation !== "none",
			);
			if (cursorMarkers.length > 0) {
				t += T.CURSOR_SHOW_DELAY_MS;
				for (const _marker of cursorMarkers) {
					t +=
						step.cursor.movementDuration +
						T.CLICK_EFFECT_MS +
						T.HOLD_AFTER_CLICK_MS +
						T.HOLD_BETWEEN_MS;
				}
				t += T.CURSOR_HIDE_BUFFER_MS;
			}

			t += T.FINAL_HOLD_MS;
			if (step.hotspots.length === 0) {
				t = T.NO_HOTSPOTS_HOLD_MS;
			}
			const transitionDuration =
				step.transition.type === "none" ? 50 : (step.transition.duration ?? T.TRANSITION_MS);
			t += transitionDuration;
			globalStart += t;
		}
		return times;
	}, [project.steps]);

	// ── State ──
	const initialIndex = initialStepId
		? Math.max(
				0,
				project.steps.findIndex((s) => s.id === initialStepId),
			)
		: 0;

	const [_timeMs, setTimeMs] = useState(stepStartTimes[initialIndex] ?? 0);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentIndex, setCurrentIndex] = useState(initialIndex);
	const [frameState, setFrameState] = useState<DemoFrameState | null>(null);
	const [viewportSize, setViewportSize] = useState({ w: 1280, h: 720 });

	const rafRef = useRef<number>(0);
	const lastFrameTimeRef = useRef<number>(0);
	const playedClickRef = useRef(false);
	const containerRef = useRef<HTMLDivElement>(null);

	const totalMs = useMemo(() => computeTotalDurationMs(project), [project]);
	const steps = project.steps;

	// ── Measure container ──
	useEffect(() => {
		const el = containerRef.current;
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

	// ── rAF playback loop ──
	useEffect(() => {
		if (!isPlaying) return;

		lastFrameTimeRef.current = performance.now();

		function tick() {
			const now = performance.now();
			const delta = now - lastFrameTimeRef.current;
			lastFrameTimeRef.current = now;

			setTimeMs((prev) => {
				const next = prev + delta;
				if (next >= totalMs) {
					setIsPlaying(false);
					return prev;
				}

				try {
					const state = computeFrameState(project, next);
					setFrameState(state);
					setCurrentIndex(state.stepIndex);

					// Play click sound
					if (state.clickEffect && !playedClickRef.current) {
						playedClickRef.current = true;
						playClickSound();
					}
					if (!state.clickEffect) {
						playedClickRef.current = false;
					}
				} catch {
					// project has no steps
				}

				return next;
			});

			rafRef.current = requestAnimationFrame(tick);
		}

		rafRef.current = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(rafRef.current);
	}, [isPlaying, project, totalMs]);

	// ── Navigation ──
	const goToStep = useCallback(
		(index: number) => {
			const idx = Math.max(0, Math.min(index, steps.length - 1));
			setCurrentIndex(idx);
			const t = stepStartTimes[idx] ?? 0;
			setTimeMs(t);
			try {
				setFrameState(computeFrameState(project, t));
			} catch {
				// ignore
			}
		},
		[steps.length, stepStartTimes, project],
	);

	const nextStep = useCallback(() => {
		if (currentIndex < steps.length - 1) goToStep(currentIndex + 1);
		else setIsPlaying(false);
	}, [currentIndex, steps.length, goToStep]);

	const prevStep = useCallback(() => {
		goToStep(currentIndex - 1);
	}, [currentIndex, goToStep]);

	// ── Keyboard navigation ──
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

	// ── Compute display size ──
	const displaySize = useMemo(() => {
		const currentStep = steps[currentIndex] ?? null;
		const screenshot = currentStep
			? project.screenshots.find((s) => s.id === currentStep.screenshotId)
			: null;
		const availW = viewportSize.w - 32;
		const availH = viewportSize.h - 32;
		if (screenshot && screenshot.width > 0 && screenshot.height > 0) {
			const scale = Math.min(availW / screenshot.width, availH / screenshot.height, 1);
			return {
				w: Math.round(screenshot.width * scale),
				h: Math.round(screenshot.height * scale),
			};
		}
		return { w: Math.min(1280, availW), h: Math.min(720, availH) };
	}, [viewportSize, steps, currentIndex, project]);

	const currentStep = steps[currentIndex] ?? null;
	const currentScreenshot = currentStep
		? project.screenshots.find((s) => s.id === currentStep.screenshotId)
		: null;

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
			<div
				ref={containerRef}
				className="flex-1 flex items-center justify-center p-4 overflow-hidden"
			>
				{currentScreenshot && frameState ? (
					<div style={{ position: "relative", width: displaySize.w, height: displaySize.h }}>
						<DemoFrameView
							state={frameState}
							width={displaySize.w}
							height={displaySize.h}
							background={project.settings.background}
							appearance={project.settings.appearance}
							screenshots={screenshotMap}
							screenshotList={project.screenshots}
							cursorType={project.settings.defaultCursorType}
							cursorTheme={project.settings.cursorTheme}
						/>
						{/* Step title overlay */}
						<div
							style={{
								position: "absolute",
								bottom: 0,
								left: 0,
								right: 0,
								padding: 12,
								background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)",
								pointerEvents: "none",
								borderRadius: project.settings.appearance.borderRadius,
							}}
						>
							<p style={{ fontSize: 14, fontWeight: 500, color: "white", margin: 0 }}>
								{currentStep?.title}
							</p>
							{currentStep?.description && (
								<p
									style={{
										fontSize: 12,
										color: "rgba(255,255,255,0.7)",
										marginTop: 2,
										marginBottom: 0,
									}}
								>
									{currentStep.description}
								</p>
							)}
						</div>
					</div>
				) : currentScreenshot ? (
					<div className="relative max-w-full max-h-full">
						<img
							src={currentScreenshot.url}
							alt={currentStep?.title ?? ""}
							className="max-w-full max-h-full object-contain rounded"
							draggable={false}
						/>
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
