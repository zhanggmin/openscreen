// Remotion composition for rendering demo tutorials as video.
// Requires: npm install remotion @remotion/player @remotion/cli @remotion/renderer
//
// @ts-expect-error — Remotion not yet installed. Uncomment after installing dependencies.
// import { Img, Sequence, staticFile, useVideoConfig } from "remotion";

import type { DemoProject, Step } from "@/lib/demobuilder/types";

interface DemoCompositionProps {
	project: DemoProject;
}

// Placeholder composition component. Replace with actual Remotion components
// once the remotion packages are installed.
export function DemoComposition({ project }: DemoCompositionProps) {
	// const { width, height, fps, durationInFrames } = useVideoConfig();
	const width = project.settings.canvasWidth;
	const height = project.settings.canvasHeight;
	const fps = 30;

	// Calculate total duration from all steps
	const totalDuration = project.steps.reduce(
		(sum, step) => sum + step.cursor.movementDuration + step.transition.duration,
		0,
	);
	const durationInFrames = Math.ceil((totalDuration / 1000) * fps);

	return (
		<div
			style={{
				width,
				height,
				backgroundColor: "#09090b",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				color: "white",
				fontFamily: "system-ui",
			}}
		>
			<div>
				<h1 style={{ fontSize: 32, marginBottom: 16 }}>{project.name}</h1>
				<p style={{ fontSize: 18, opacity: 0.7 }}>
					{project.steps.length} steps · {durationInFrames} frames @ {fps}fps
				</p>
			</div>
		</div>
	);
}

// Helper to build Remotion Sequence data from a step
export function getStepSequences(steps: Step[], fps: number) {
	let currentFrame = 0;
	return steps.map((step) => {
		const durationInFrames = Math.ceil((step.cursor.movementDuration / 1000) * fps);
		const transitionFrames = Math.ceil((step.transition.duration / 1000) * fps);
		const from = currentFrame;
		currentFrame += durationInFrames + transitionFrames;
		return {
			step,
			from,
			durationInFrames,
			transitionFrames,
		};
	});
}
