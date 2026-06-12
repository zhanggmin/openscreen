/**
 * RemotionRoot — 注册 DemoExport composition。
 *
 * 始终渲染 <Composition>（bundle 时 props 为空也能注册成功），
 * 通过 calculateMetadata 在实际渲染时根据传入的 project 动态计算
 * fps、分辨率、总帧数等参数。
 */

import React from "react";
import { Composition } from "remotion";
import { computeTotalDurationMs } from "@/lib/demobuilder/demoPlaybackEngine";
import type { DemoProject, VideoResolution } from "@/lib/demobuilder/types";
import { DemoComposition } from "./DemoComposition";

function resolutionToDimensions(resolution: VideoResolution): { width: number; height: number } {
	switch (resolution) {
		case "4k":
			return { width: 3840, height: 2160 };
		case "2k":
			return { width: 2560, height: 1440 };
		case "1080p":
		default:
			return { width: 1920, height: 1080 };
	}
}

export interface RemotionRootProps {
	project?: DemoProject | null;
	screenshotUrls?: Record<string, string>;
	cursorAssetUrls?: Record<string, string>;
	/** 点击音效 data URL（主进程注入） */
	clickSoundUrl?: string | null;
	/** 背景音乐 data URL（主进程注入） */
	bgmUrl?: string | null;
}

/** 占位默认 props，确保 bundle 阶段 Composition 能注册成功 */
const DEFAULT_PROPS: RemotionRootProps = {
	project: null,
	screenshotUrls: {},
	cursorAssetUrls: {},
	clickSoundUrl: null,
	bgmUrl: null,
};

export function RemotionRoot() {
	return (
		<Composition
			id="DemoExport"
			component={DemoComposition as unknown as React.FC<Record<string, unknown>>}
			fps={30}
			width={1920}
			height={1080}
			durationInFrames={300}
			defaultProps={DEFAULT_PROPS}
			calculateMetadata={({ props }) => {
				const project = (props as RemotionRootProps).project;
				if (!project) return {};

				const fps = project.settings.exportSettings.videoFps || 30;
				const dims = resolutionToDimensions(project.settings.exportSettings.videoResolution);
				const totalMs = computeTotalDurationMs(project);
				const durationInFrames = Math.max(1, Math.ceil((totalMs / 1000) * fps));

				return { fps, width: dims.width, height: dims.height, durationInFrames };
			}}
		/>
	);
}
