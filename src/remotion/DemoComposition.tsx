/**
 * DemoComposition — Remotion Composition for Demo video rendering.
 *
 * Uses useCurrentFrame() to compute timeMs, then delegates to
 * computeFrameState + DemoFrameView for pixel-perfect rendering.
 */

import { useCurrentFrame, useVideoConfig } from "remotion";
import { DemoFrameView } from "@/components/demo-builder/DemoFrameView";
import { computeFrameState } from "@/lib/demobuilder/demoPlaybackEngine";
import type { DemoProject } from "@/lib/demobuilder/types";

export interface DemoCompositionProps {
	project: DemoProject;
	screenshotUrls: Record<string, string>;
}

export function DemoComposition({ project, screenshotUrls }: DemoCompositionProps) {
	const frame = useCurrentFrame();
	const { fps, width, height } = useVideoConfig();
	const timeMs = (frame / fps) * 1000;

	const state = computeFrameState(project, timeMs);

	// Convert Record<string, string> to Map<string, string>
	const screenshotMap = new Map(Object.entries(screenshotUrls));

	return (
		<DemoFrameView
			state={state}
			width={width}
			height={height}
			background={project.settings.background}
			appearance={project.settings.appearance}
			screenshots={screenshotMap}
			screenshotList={project.screenshots}
			cursorType={project.settings.defaultCursorType}
			cursorTheme={project.settings.cursorTheme}
		/>
	);
}
