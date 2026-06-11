/**
 * DemoBuilder 时间线计算模块
 *
 * 将 DemoProject 的离散步骤序列转换为线性时间线，
 * 为视频导出提供每一帧所属步骤及阶段（光标移动/点击/转场）的精确时间映射。
 */

import type { DemoProject, Step } from "./types";

// ─── 时间线段 ──────────────────────────────────────────────────────────────────

/** 单个 Step 在导出时间线中的完整时间映射。 */
export interface TimelineSegment {
	stepId: string;
	stepIndex: number;
	screenshotId: string;
	/** Step 在导出时间线中的起始时间（ms）。 */
	startTimeMs: number;
	/** Step 在导出时间线中的结束时间（ms），包含转场。 */
	endTimeMs: number;
	/** 光标动画开始时间（ms，全局）。 */
	cursorStartMs: number;
	/** 光标动画结束时间（ms，全局）。 */
	cursorEndMs: number;
	/** 光标点击时刻（ms，全局），= cursorEndMs + delayBeforeClick。 */
	clickTimeMs: number;
	/** 转场开始时间（ms，全局）。 */
	transitionStartMs: number;
	/** 转场结束时间（ms，全局）。 */
	transitionEndMs: number;
	/** 当前 Step 的原始数据。 */
	step: Step;
}

export interface DemoTimeline {
	segments: TimelineSegment[];
	/** 导出总时长（ms）。 */
	totalDurationMs: number;
	/** 导出总帧数（基于给定 fps）。 */
	totalFrames: number;
}

// ─── 常量 ─────────────────────────────────────────────────────────────────────

/** 光标到达目标后到点击前的默认等待时间（ms），由 Step.cursor.delayBeforeClick 提供。 */
const DEFAULT_POST_CLICK_HOLD_MS = 600;

/** 每个 Step 在光标点击后、转场前的最短停留时间（ms），用于展示高亮效果。 */
const MIN_HOLD_AFTER_CLICK_MS = 400;

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

/**
 * 计算单个 Step 的"内容时长"（不含转场）：
 *   内容时长 = max(cursorDuration + delayBeforeClick + holdAfterClick, voiceDuration)
 */
function computeStepContentDurationMs(step: Step): number {
	const cursorDur = step.cursor.movementDuration;
	const delayBeforeClick = step.cursor.delayBeforeClick;
	// 高亮展示时长取 hotspots 中最长的 highlightDuration（如果有）
	const maxHighlightDur = step.hotspots.reduce(
		(max, h) => Math.max(max, h.highlightDuration ?? 0),
		0,
	);
	const holdAfterClick = Math.max(MIN_HOLD_AFTER_CLICK_MS, maxHighlightDur);

	const cursorTotal = cursorDur + delayBeforeClick + holdAfterClick;

	// 如果有 TTS 旁白，Step 时长至少等于旁白时长
	const voiceDur = step.voice?.duration ?? 0;

	return Math.max(cursorTotal, voiceDur, DEFAULT_POST_CLICK_HOLD_MS);
}

// ─── 主函数 ───────────────────────────────────────────────────────────────────

/**
 * 将 DemoProject 的步骤序列转换为线性导出时间线。
 *
 * @param project   图文项目数据
 * @param frameRate 导出帧率（fps），用于计算 totalFrames
 */
export function computeDemoTimeline(project: DemoProject, frameRate: number): DemoTimeline {
	const sortedSteps = [...project.steps].sort((a, b) => a.order - b.order);
	const segments: TimelineSegment[] = [];
	let currentTimeMs = 0;

	for (let i = 0; i < sortedSteps.length; i++) {
		const step = sortedSteps[i];
		const contentDurationMs = computeStepContentDurationMs(step);
		const transitionDurationMs = step.transition.duration;

		const startTimeMs = currentTimeMs;
		const cursorStartMs = startTimeMs;
		const cursorEndMs = startTimeMs + step.cursor.movementDuration;
		const clickTimeMs = cursorEndMs + step.cursor.delayBeforeClick;
		const transitionStartMs = startTimeMs + contentDurationMs;
		const transitionEndMs = transitionStartMs + transitionDurationMs;
		const endTimeMs = transitionEndMs;

		segments.push({
			stepId: step.id,
			stepIndex: i,
			screenshotId: step.screenshotId,
			startTimeMs,
			endTimeMs,
			cursorStartMs,
			cursorEndMs,
			clickTimeMs,
			transitionStartMs,
			transitionEndMs,
			step,
		});

		// 下一个 Step 从当前转场结束开始
		currentTimeMs = endTimeMs;
	}

	const totalDurationMs = currentTimeMs;
	const totalFrames = Math.ceil((totalDurationMs / 1000) * frameRate);

	return { segments, totalDurationMs, totalFrames };
}

// ─── 查询工具 ─────────────────────────────────────────────────────────────────

/** 根据全局时间戳查找当前所在的 Segment。 */
export function findSegmentAtTime(
	segments: TimelineSegment[],
	globalTimeMs: number,
): TimelineSegment | null {
	for (const seg of segments) {
		if (globalTimeMs >= seg.startTimeMs && globalTimeMs < seg.endTimeMs) {
			return seg;
		}
	}
	// 最后一帧精确等于 endTimeMs 时，返回最后一个 segment
	if (segments.length > 0) {
		const last = segments[segments.length - 1];
		if (Math.abs(globalTimeMs - last.endTimeMs) < 0.5) {
			return last;
		}
	}
	return null;
}

/** 计算当前时间在 Segment 内的相对偏移（ms）。 */
export function timeInSegment(segment: TimelineSegment, globalTimeMs: number): number {
	return globalTimeMs - segment.startTimeMs;
}

/**
 * 判断当前帧是否处于转场阶段，返回转场进度 0-1。
 * 如果不在转场阶段返回 null。
 */
export function getTransitionProgress(
	segment: TimelineSegment,
	globalTimeMs: number,
): number | null {
	if (globalTimeMs < segment.transitionStartMs || globalTimeMs >= segment.transitionEndMs) {
		return null;
	}
	const duration = segment.transitionEndMs - segment.transitionStartMs;
	if (duration <= 0) return null;
	return Math.min(1, Math.max(0, (globalTimeMs - segment.transitionStartMs) / duration));
}
