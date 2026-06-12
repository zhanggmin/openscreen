/**
 * DemoComposition — Remotion Composition for Demo video rendering.
 *
 * Uses useCurrentFrame() to compute timeMs, then delegates to
 * computeFrameState + DemoFrameView for pixel-perfect rendering.
 *
 * 同时叠加：字幕条 + 字幕 TTS 音频 + 点击音效 + 背景音乐。
 * ⚡ 性能：timelines / audioCues / screenshotMap 全部 useMemo 缓存，
 *   避免每帧（一次渲染 = 数百~上千次 React render）重新计算。
 */

import { useMemo } from "react";
import { Audio, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { DemoFrameView } from "@/components/demo-builder/DemoFrameView";
import { SubtitleBar } from "@/components/demo-builder/SubtitleBar";
import {
	computeAudioCuesFromTimelines,
	computeFrameStateFromTimelines,
	computeStepTimelines,
} from "@/lib/demobuilder/demoPlaybackEngine";
import type { DemoProject } from "@/lib/demobuilder/types";

export interface DemoCompositionProps {
	project: DemoProject;
	screenshotUrls: Record<string, string>;
	/** Cursor theme asset URL map (assetPath → dataUrl) injected by main process. */
	cursorAssetUrls?: Record<string, string>;
	/** 点击音效 data URL（主进程注入） */
	clickSoundUrl?: string | null;
	/** 背景音乐 data URL（主进程注入） */
	bgmUrl?: string | null;
}

export function DemoComposition({
	project,
	screenshotUrls,
	cursorAssetUrls,
	clickSoundUrl,
	bgmUrl,
}: DemoCompositionProps) {
	const frame = useCurrentFrame();
	const { fps, width, height, durationInFrames } = useVideoConfig();
	const timeMs = (frame / fps) * 1000;

	// ⚡ 关键优化：timelines 只依赖 project，缓存后跨帧复用
	const timelines = useMemo(() => computeStepTimelines(project), [project]);

	// 当前帧的视觉状态（依赖 timelines + timeMs，但 timelines 本身被缓存）
	const state = useMemo(
		() => computeFrameStateFromTimelines(timelines, timeMs),
		[timelines, timeMs],
	);

	// 截图 Map：仅在 screenshotUrls 引用变化时重建
	const screenshotMap = useMemo(() => new Map(Object.entries(screenshotUrls)), [screenshotUrls]);

	// 音频提示：依赖 project + clickSoundUrl，整段渲染过程只计算一次
	const audioCues = useMemo(
		() =>
			computeAudioCuesFromTimelines(timelines, project, {
				defaultClickSoundSrc: clickSoundUrl ?? null,
				clickSoundDurationMs: 200,
			}),
		[timelines, project, clickSoundUrl],
	);

	// 音频 cue → frame 偏移：缓存
	const ttsSequences = useMemo(
		() =>
			audioCues.ttsAudios.map((cue, idx) => ({
				key: `tts-${idx}`,
				from: Math.max(0, Math.round((cue.startMs / 1000) * fps)),
				dur: Math.max(1, Math.round((cue.durationMs / 1000) * fps)),
				src: cue.src,
				volume: cue.volume,
			})),
		[audioCues.ttsAudios, fps],
	);
	const clickSequences = useMemo(
		() =>
			audioCues.clickEvents.map((cue, idx) => ({
				key: `click-${idx}`,
				from: Math.max(0, Math.round((cue.startMs / 1000) * fps)),
				dur: Math.max(1, Math.round((cue.durationMs / 1000) * fps)),
				src: cue.src,
				volume: cue.volume,
			})),
		[audioCues.clickEvents, fps],
	);

	// BGM ducking：仅在 TTS 区间降低 BGM
	const bgmBaseVolume = project.settings.sound?.backgroundMusicVolume ?? 0.5;
	const isDuringTTS = audioCues.ttsAudios.some(
		(c) => timeMs >= c.startMs && timeMs < c.startMs + c.durationMs,
	);
	const bgmVolume = isDuringTTS ? bgmBaseVolume * 0.2 : bgmBaseVolume;

	return (
		<>
			{/* 视觉层 */}
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
				cursorAssetUrls={cursorAssetUrls}
			/>

			{/* 字幕条（固定在容器底部） */}
			{state.visibleSubtitles.map((sub) => (
				<SubtitleBar key={sub.id} subtitle={sub} />
			))}

			{/* 字幕 TTS 音频 */}
			{ttsSequences.map((s) => (
				<Sequence key={s.key} from={s.from} durationInFrames={s.dur}>
					<Audio src={s.src} volume={s.volume} />
				</Sequence>
			))}

			{/* 点击音效 */}
			{clickSequences.map((s) => (
				<Sequence key={s.key} from={s.from} durationInFrames={s.dur}>
					<Audio src={s.src} volume={s.volume} />
				</Sequence>
			))}

			{/* 背景音乐（贯穿整个时长，loop 播放，TTS 期间 ducking） */}
			{bgmUrl && <Audio src={bgmUrl} loop volume={bgmVolume} endAt={durationInFrames} />}
		</>
	);
}
