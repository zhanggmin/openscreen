/**
 * DemoWebPlayer — Lightweight standalone web player for Demo projects.
 *
 * Can be embedded in any web page. Uses requestAnimationFrame + computeFrameState
 * to drive playback, and DemoFrameView for rendering.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DemoFrameState } from "@/lib/demobuilder/demoPlaybackEngine";
import { computeFrameState, computeTotalDurationMs } from "@/lib/demobuilder/demoPlaybackEngine";
import type { DemoProject } from "@/lib/demobuilder/types";
import { DemoFrameView } from "./DemoFrameView";

export interface DemoWebPlayerProps {
	project: DemoProject;
	/** Width of the player canvas in pixels. */
	width?: number;
	/** Height of the player canvas in pixels. */
	height?: number;
}

export function DemoWebPlayer({ project, width = 1280, height = 720 }: DemoWebPlayerProps) {
	const [timeMs, setTimeMs] = useState(0);
	const [isPlaying, setIsPlaying] = useState(false);
	const [frameState, setFrameState] = useState<DemoFrameState | null>(null);

	const rafRef = useRef<number>(0);
	const lastTimeRef = useRef<number>(0);

	const totalMs = useMemo(() => computeTotalDurationMs(project), [project]);

	const screenshotMap = useMemo(() => {
		const map = new Map<string, string>();
		for (const s of project.screenshots) {
			map.set(s.id, s.url);
		}
		return map;
	}, [project.screenshots]);

	// Compute initial frame state
	useEffect(() => {
		try {
			setFrameState(computeFrameState(project, 0));
		} catch {
			// project has no steps
		}
	}, [project]);

	// rAF playback loop
	useEffect(() => {
		if (!isPlaying) return;

		lastTimeRef.current = performance.now();

		function tick() {
			const now = performance.now();
			const delta = now - lastTimeRef.current;
			lastTimeRef.current = now;

			setTimeMs((prev) => {
				const next = prev + delta;
				if (next >= totalMs) {
					setIsPlaying(false);
					return prev;
				}
				try {
					setFrameState(computeFrameState(project, next));
				} catch {
					// ignore
				}
				return next;
			});

			rafRef.current = requestAnimationFrame(tick);
		}

		rafRef.current = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(rafRef.current);
	}, [isPlaying, project, totalMs]);

	const handleSeek = useCallback(
		(newTimeMs: number) => {
			const clamped = Math.max(0, Math.min(newTimeMs, totalMs));
			setTimeMs(clamped);
			try {
				setFrameState(computeFrameState(project, clamped));
			} catch {
				// ignore
			}
		},
		[project, totalMs],
	);

	const togglePlay = useCallback(() => {
		if (!isPlaying && timeMs >= totalMs) {
			// Restart from beginning
			handleSeek(0);
		}
		setIsPlaying((p) => !p);
	}, [isPlaying, timeMs, totalMs, handleSeek]);

	// Format time as mm:ss
	const formatTime = (ms: number) => {
		const totalSec = Math.floor(ms / 1000);
		const min = Math.floor(totalSec / 60);
		const sec = totalSec % 60;
		return `${min}:${sec.toString().padStart(2, "0")}`;
	};

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				width,
				background: "#09090b",
				borderRadius: 8,
				overflow: "hidden",
			}}
		>
			{/* Frame area */}
			<div style={{ width, height, position: "relative" }}>
				{frameState ? (
					<DemoFrameView
						state={frameState}
						width={width}
						height={height}
						background={project.settings.background}
						appearance={project.settings.appearance}
						screenshots={screenshotMap}
						screenshotList={project.screenshots}
						cursorType={project.settings.defaultCursorType}
						cursorTheme={project.settings.cursorTheme}
					/>
				) : (
					<div
						style={{
							width: "100%",
							height: "100%",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							color: "#52525b",
						}}
					>
						No steps available
					</div>
				)}
			</div>

			{/* Controls */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 12,
					padding: "8px 12px",
					borderTop: "1px solid #27272a",
				}}
			>
				<button
					type="button"
					onClick={togglePlay}
					style={{
						background: "none",
						border: "none",
						color: "#e4e4e7",
						cursor: "pointer",
						fontSize: 14,
						padding: "4px 8px",
					}}
				>
					{isPlaying ? "⏸" : "▶"}
				</button>

				<span style={{ color: "#71717a", fontSize: 11, fontFamily: "monospace", minWidth: 40 }}>
					{formatTime(timeMs)}
				</span>

				<input
					type="range"
					min={0}
					max={totalMs}
					value={timeMs}
					onChange={(e) => handleSeek(Number(e.target.value))}
					style={{ flex: 1, accentColor: "#34B27B" }}
				/>

				<span style={{ color: "#71717a", fontSize: 11, fontFamily: "monospace", minWidth: 40 }}>
					{formatTime(totalMs)}
				</span>
			</div>
		</div>
	);
}
