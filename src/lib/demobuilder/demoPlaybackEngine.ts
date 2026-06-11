/**
 * DemoBuilder 播放时序引擎
 *
 * 纯函数模块：给定 DemoProject + timeMs，精确返回该时刻的完整视觉状态。
 * 这是所有渲染场景（编辑器预览、全屏播放、Remotion 导出、网页嵌入）的唯一事实来源。
 *
 * 时序逻辑精确复刻 CanvasArea.tsx 的播放序列：
 *   初始延迟 → 高亮串行显示 → 光标动画 → 点击效果 → 停留 → 转场
 */

import type {
	ClickEffect,
	CursorAnimation,
	DemoProject,
	Hotspot,
	Point,
	Step,
	Subtitle,
	TransitionType,
} from "./types";
import { isCursorMarker, isZoomRegion } from "./types";

// ─── 时序常量 ────────────────────────────────────────────────────────────────

/** 与 CanvasArea.tsx 中的播放常量完全一致 */
export const PLAYBACK_TIMING = {
	INITIAL_DELAY_MS: 400,
	CURSOR_MOVE_MS: 500,
	CLICK_EFFECT_MS: 1000,
	HOLD_AFTER_CLICK_MS: 700,
	HOLD_BETWEEN_MS: 200,
	FINAL_HOLD_MS: 600,
	TRANSITION_MS: 500,
	HIGHLIGHT_FADE_MS: 400,
	DEFAULT_HIGHLIGHT_DURATION_MS: 1000,
	/** 无热点时的默认展示时长 */
	NO_HOTSPOTS_HOLD_MS: 2000,
	/** 光标显示后到首次移动前的延迟 */
	CURSOR_SHOW_DELAY_MS: 100,
	/** 光标隐藏后到最终停留前的缓冲 */
	CURSOR_HIDE_BUFFER_MS: 200,
	/** 缩放进场动画时长 */
	ZOOM_IN_MS: 500,
	/** 缩放保持时长 */
	ZOOM_HOLD_MS: 1200,
	/** 缩放退场动画时长 */
	ZOOM_OUT_MS: 500,
	/** 高亮区/缩放区结束到光标出现之间的缓冲 */
	REGION_TO_CURSOR_BUFFER_MS: 300,
} as const;

// ─── 帧状态 ──────────────────────────────────────────────────────────────────

export interface DemoFrameState {
	/** 当前步骤索引 */
	stepIndex: number;
	/** 当前步骤数据 */
	step: Step;
	/** 当前截图 ID */
	screenshotId: string;
	/** 上一张截图 ID（转场时需要） */
	prevScreenshotId: string | null;

	/** 光标是否可见 */
	cursorVisible: boolean;
	/** 光标位置（百分比 0-100） */
	cursorPosition: Point;

	/** 点击效果（含进度 0-1） */
	clickEffect: {
		type: ClickEffect;
		position: Point;
		progress: number;
	} | null;

	/** 高亮区域及其当前透明度 */
	highlights: Array<{
		hotspot: Hotspot;
		opacity: number;
	}>;

	/** 转场状态 */
	transition: {
		type: TransitionType;
		progress: number;
		prevScreenshotId: string | null;
	} | null;

	/** 当前可见字幕 */
	visibleSubtitles: Subtitle[];

	/** 浮动说明气泡 */
	tooltip: { text: string; x: number; y: number } | null;

	/** 缩放状态 */
	zoom: {
		/** 缩放目标区域（百分比坐标） */
		region: Hotspot;
		/** 缩放进度：0=正常, 1=完全放大，由 ZOOM_IN_MS 控制 */
		progress: number;
	} | null;
}

// ─── 内部时间线结构 ──────────────────────────────────────────────────────────

interface HighlightTimeEntry {
	hotspot: Hotspot;
	/** 淡入开始（步骤内相对时间） */
	fadeInStart: number;
	/** 完全显示时刻 */
	fullAt: number;
	/** 淡出开始时刻 */
	fadeOutStart: number;
	/** 淡出结束时刻 */
	fadeOutEnd: number;
}

interface CursorMarkerTimeEntry {
	/** 光标从此位置开始移动 */
	from: Point;
	/** 光标移动到此位置 */
	to: Point;
	/** 移动开始时间 */
	moveStart: number;
	/** 移动结束时间 */
	moveEnd: number;
	/** 点击效果开始时间 */
	clickStart: number;
	/** 点击效果结束时间 */
	clickEnd: number;
	/** 热点数据（用于 tooltip） */
	hotspot: Hotspot;
}

interface ZoomTimeEntry {
	hotspot: Hotspot;
	/** 缩放进场开始（步骤内相对时间） */
	zoomInStart: number;
	/** 缩放进场结束（此时 progress=1） */
	zoomInEnd: number;
	/** 缩放退场开始 */
	zoomOutStart: number;
	/** 缩放退场结束（此时 progress=0） */
	zoomOutEnd: number;
	/** 嵌套在该缩放区内的高亮（中心点几何上落在矩形内） */
	nestedHighlights: HighlightTimeEntry[];
	/** 嵌套在该缩放区内的光标标记（点击位置几何上落在矩形内） */
	nestedCursors: CursorMarkerTimeEntry[];
}

interface StepTimeline {
	step: Step;
	stepIndex: number;
	globalStart: number;
	globalEnd: number;
	localDuration: number;
	highlights: HighlightTimeEntry[];
	zoomRegions: ZoomTimeEntry[];
	cursorMarkers: CursorMarkerTimeEntry[];
	cursorShowTime: number;
	cursorHideTime: number;
	transitionStart: number;
	transitionDuration: number;
}

// ─── 光标插值 ────────────────────────────────────────────────────────────────

function easeInOut(t: number): number {
	return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function bezierPoint(p0: number, p1: number, p2: number, p3: number, t: number): number {
	const u = 1 - t;
	return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** 根据光标动画配置和经过时间，计算当前位置（百分比 0-100）。 */
function interpolateCursorPosition(
	from: Point,
	to: Point,
	cursor: CursorAnimation,
	elapsedMs: number,
): Point {
	const duration = cursor.movementDuration;
	if (duration <= 0 || elapsedMs <= 0) return from;
	if (elapsedMs >= duration) return to;

	const rawT = elapsedMs / duration;

	switch (cursor.movementType) {
		case "linear":
			return { x: lerp(from.x, to.x, rawT), y: lerp(from.y, to.y, rawT) };
		case "easing": {
			const t = easeInOut(rawT);
			return { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) };
		}
		case "bezier": {
			const cp = cursor.bezierControlPoints;
			return {
				x: bezierPoint(from.x, cp?.cp1.x ?? from.x, cp?.cp2.x ?? to.x, to.x, rawT),
				y: bezierPoint(from.y, cp?.cp1.y ?? from.y, cp?.cp2.y ?? to.y, to.y, rawT),
			};
		}
		default:
			return to;
	}
}

// ─── Step 时间线计算 ─────────────────────────────────────────────────────────

function computeStepTimelines(project: DemoProject): StepTimeline[] {
	const sortedSteps = [...project.steps].sort((a, b) => a.order - b.order);
	const timelines: StepTimeline[] = [];
	let globalStart = 0;

	for (let i = 0; i < sortedSteps.length; i++) {
		const step = sortedSteps[i];
		const T = PLAYBACK_TIMING;

		let t = 0;

		// ── 初始延迟 ──
		t = T.INITIAL_DELAY_MS;

		// ── 分类与几何分配 ──
		// 1) 把 hotspots 拆分为 高亮/缩放/光标 三类
		// 2) 对每个高亮和光标，判断其几何中心是否落在某个缩放区内
		//    - 落在缩放区内 → 嵌套播放（在该缩放区的 hold 期）
		//    - 否则 → 顶层串行播放
		const allHighlights = step.hotspots.filter((h) => !isCursorMarker(h) && !isZoomRegion(h));
		const zoomAreas = step.hotspots.filter(isZoomRegion);
		const allCursors = step.hotspots.filter(isCursorMarker);

		// 几何归类：每个缩放区收集自己的嵌套高亮和光标
		const zoneHighlights = new Map<string, Hotspot[]>();
		const zoneCursors = new Map<string, Hotspot[]>();
		for (const z of zoomAreas) {
			zoneHighlights.set(z.id, []);
			zoneCursors.set(z.id, []);
		}

		const topHighlights: Hotspot[] = [];
		for (const h of allHighlights) {
			const cx = h.x + h.width / 2;
			const cy = h.y + h.height / 2;
			const zone = zoomAreas.find(
				(z) => cx >= z.x && cx <= z.x + z.width && cy >= z.y && cy <= z.y + z.height,
			);
			if (zone) zoneHighlights.get(zone.id)?.push(h);
			else topHighlights.push(h);
		}

		const topCursors: Hotspot[] = [];
		for (const c of allCursors) {
			const target = c.mouseTarget ?? { x: c.x + c.width / 2, y: c.y + c.height / 2 };
			const zone = zoomAreas.find(
				(z) =>
					target.x >= z.x &&
					target.x <= z.x + z.width &&
					target.y >= z.y &&
					target.y <= z.y + z.height,
			);
			if (zone) zoneCursors.get(zone.id)?.push(c);
			else topCursors.push(c);
		}

		// ── 顶层高亮（串行） ──
		const highlightTimings: HighlightTimeEntry[] = [];
		for (const h of topHighlights) {
			const duration = h.highlightDuration ?? T.DEFAULT_HIGHLIGHT_DURATION_MS;
			const entry: HighlightTimeEntry = {
				hotspot: h,
				fadeInStart: t,
				fullAt: t + T.HIGHLIGHT_FADE_MS,
				fadeOutStart: t + T.HIGHLIGHT_FADE_MS + duration,
				fadeOutEnd: t + T.HIGHLIGHT_FADE_MS + duration + T.HIGHLIGHT_FADE_MS,
			};
			highlightTimings.push(entry);
			t = entry.fadeOutEnd;
		}

		// ── 缩放区域（串行；每个缩放区内部嵌套高亮 → 嵌套光标） ──
		const zoomTimings: ZoomTimeEntry[] = [];
		const cursorTimings: CursorMarkerTimeEntry[] = [];

		// 共享游标：用于推算后续顶层光标的起始位置
		let lastCursorTo: Point | null = null;

		const buildCursorSequence = (
			cursors: Hotspot[],
			startAt: number,
		): { entries: CursorMarkerTimeEntry[]; endAt: number } => {
			let t2 = startAt + T.CURSOR_SHOW_DELAY_MS;
			const entries: CursorMarkerTimeEntry[] = [];
			if (cursors.length === 0) return { entries, endAt: startAt };

			const firstTarget = cursors[0].mouseTarget ?? {
				x: cursors[0].x + cursors[0].width / 2,
				y: cursors[0].y + cursors[0].height / 2,
			};
			let prevPos: Point = lastCursorTo ?? {
				x: Math.max(0, firstTarget.x - 15),
				y: Math.max(0, firstTarget.y - 8),
			};

			for (const c of cursors) {
				const target = c.mouseTarget ?? { x: c.x + c.width / 2, y: c.y + c.height / 2 };
				const moveStart = t2;
				const moveEnd = t2 + step.cursor.movementDuration;
				const clickStart = moveEnd;
				const clickEnd = clickStart + T.CLICK_EFFECT_MS;
				entries.push({
					from: prevPos,
					to: target,
					moveStart,
					moveEnd,
					clickStart,
					clickEnd,
					hotspot: c,
				});
				t2 = clickEnd + T.HOLD_AFTER_CLICK_MS + T.HOLD_BETWEEN_MS;
				prevPos = target;
			}
			lastCursorTo = prevPos;
			return { entries, endAt: t2 + T.CURSOR_HIDE_BUFFER_MS };
		};

		for (const zone of zoomAreas) {
			const nestedHl = zoneHighlights.get(zone.id) ?? [];
			const nestedCs = zoneCursors.get(zone.id) ?? [];

			const zoomInStart = t;
			const zoomInEnd = zoomInStart + T.ZOOM_IN_MS;
			t = zoomInEnd;

			// 嵌套高亮（先于嵌套光标）
			const nestedHighlightTimings: HighlightTimeEntry[] = [];
			for (const h of nestedHl) {
				const duration = h.highlightDuration ?? T.DEFAULT_HIGHLIGHT_DURATION_MS;
				const entry: HighlightTimeEntry = {
					hotspot: h,
					fadeInStart: t,
					fullAt: t + T.HIGHLIGHT_FADE_MS,
					fadeOutStart: t + T.HIGHLIGHT_FADE_MS + duration,
					fadeOutEnd: t + T.HIGHLIGHT_FADE_MS + duration + T.HIGHLIGHT_FADE_MS,
				};
				nestedHighlightTimings.push(entry);
				highlightTimings.push(entry);
				t = entry.fadeOutEnd;
			}

			// 高亮与光标之间的缓冲
			if (nestedHl.length > 0 && nestedCs.length > 0) {
				t += T.REGION_TO_CURSOR_BUFFER_MS;
			}

			// 嵌套光标
			const { entries: nestedCursorTimings, endAt: cursorEndAt } = buildCursorSequence(nestedCs, t);
			cursorTimings.push(...nestedCursorTimings);
			if (nestedCs.length > 0) {
				t = cursorEndAt;
			}

			// 若没有嵌套内容，退化为默认 hold
			const minHoldEnd = zoomInEnd + T.ZOOM_HOLD_MS;
			if (t < minHoldEnd) t = minHoldEnd;

			const zoomOutStart = t;
			const zoomOutEnd = zoomOutStart + T.ZOOM_OUT_MS;
			t = zoomOutEnd;

			zoomTimings.push({
				hotspot: zone,
				zoomInStart,
				zoomInEnd,
				zoomOutStart,
				zoomOutEnd,
				nestedHighlights: nestedHighlightTimings,
				nestedCursors: nestedCursorTimings,
			});
		}

		// 区域结束 → 顶层光标 之间的缓冲
		const hasAnyRegion = topHighlights.length > 0 || zoomAreas.length > 0;
		if (hasAnyRegion && topCursors.length > 0) {
			t += T.REGION_TO_CURSOR_BUFFER_MS;
		}

		// ── 顶层光标（串行） ──
		const { entries: topCursorTimings, endAt: topCursorEndAt } = buildCursorSequence(topCursors, t);
		cursorTimings.push(...topCursorTimings);
		if (topCursors.length > 0) {
			t = topCursorEndAt;
		}

		// 兼容旧字段：基于第一个/最后一个光标的边界。computeFrameState 会用 per-marker 判断显示窗口。
		const cursorShowTime =
			cursorTimings.length > 0
				? cursorTimings[0].moveStart - T.CURSOR_SHOW_DELAY_MS
				: Number.POSITIVE_INFINITY;
		const cursorHideTime =
			cursorTimings.length > 0
				? cursorTimings[cursorTimings.length - 1].clickEnd +
					T.HOLD_AFTER_CLICK_MS +
					T.HOLD_BETWEEN_MS
				: Number.POSITIVE_INFINITY;

		// ── 最终停留 + 转场 ──
		t += T.FINAL_HOLD_MS;
		const transitionStart = t;

		const transitionDuration =
			step.transition.type === "none" ? 50 : (step.transition.duration ?? T.TRANSITION_MS);

		// 无热点的 Step 使用固定展示时长
		if (step.hotspots.length === 0) {
			const totalWithoutTransition = T.NO_HOTSPOTS_HOLD_MS;
			if (transitionStart < totalWithoutTransition) {
				// 保持 2000ms 的展示时长
			}
			t = totalWithoutTransition;
		}

		t += transitionDuration;

		timelines.push({
			step,
			stepIndex: i,
			globalStart,
			globalEnd: globalStart + t,
			localDuration: t,
			highlights: highlightTimings,
			zoomRegions: zoomTimings,
			cursorMarkers: cursorTimings,
			cursorShowTime,
			cursorHideTime,
			transitionStart,
			transitionDuration,
		});

		globalStart += t;
	}

	return timelines;
}

// ─── 主函数 ──────────────────────────────────────────────────────────────────

/**
 * 给定 DemoProject 和时间戳，精确计算该时刻的完整视觉状态。
 * 所有渲染场景（编辑器预览、全屏播放、Remotion、网页嵌入）均调用此函数。
 */
export function computeFrameState(project: DemoProject, timeMs: number): DemoFrameState {
	const timelines = computeStepTimelines(project);

	if (timelines.length === 0) {
		throw new Error("computeFrameState: project has no steps");
	}

	// 1. 查找当前所在的 Step
	let currentTl = timelines[0];
	for (const tl of timelines) {
		if (timeMs >= tl.globalStart && timeMs < tl.globalEnd) {
			currentTl = tl;
			break;
		}
	}
	// 最后一帧或超出范围：使用最后一个 step
	if (timeMs >= timelines[timelines.length - 1].globalEnd) {
		currentTl = timelines[timelines.length - 1];
	}

	const localTime = Math.max(0, timeMs - currentTl.globalStart);
	const step = currentTl.step;

	// 2. 光标状态（per-marker 显示窗口：每个标记仅在自己的活跃区间内显示）
	let cursorVisible = false;
	const firstMarkerEntry = currentTl.cursorMarkers[0];
	const defaultPos = firstMarkerEntry ? firstMarkerEntry.from : step.cursor.startPosition;
	let cursorPosition: Point = defaultPos;

	for (let i = 0; i < currentTl.cursorMarkers.length; i++) {
		const marker = currentTl.cursorMarkers[i];
		const next = currentTl.cursorMarkers[i + 1];
		// 显示窗口：从 (移动前 CURSOR_SHOW_DELAY_MS) 到 (点击后 HOLD_AFTER_CLICK_MS)
		// 若紧邻的下一个 marker 距离很近（同一组），延伸窗口至下一 marker 的起点，避免闪烁
		const visibleStart = marker.moveStart - PLAYBACK_TIMING.CURSOR_SHOW_DELAY_MS;
		let visibleEnd = marker.clickEnd + PLAYBACK_TIMING.HOLD_AFTER_CLICK_MS;
		if (next) {
			const gap = next.moveStart - visibleEnd;
			// 间隔 ≤ HOLD_BETWEEN_MS + CURSOR_SHOW_DELAY_MS 视为同一连续序列
			if (gap <= PLAYBACK_TIMING.HOLD_BETWEEN_MS + PLAYBACK_TIMING.CURSOR_SHOW_DELAY_MS) {
				visibleEnd = next.moveStart;
			}
		}

		if (localTime >= visibleStart && localTime < visibleEnd) {
			cursorVisible = true;
			if (localTime < marker.moveStart) {
				cursorPosition = marker.from;
			} else if (localTime < marker.moveEnd) {
				cursorPosition = interpolateCursorPosition(
					marker.from,
					marker.to,
					step.cursor,
					localTime - marker.moveStart,
				);
			} else {
				cursorPosition = marker.to;
			}
			break;
		}
	}

	// 3. 点击效果（播放两次动画循环）
	let clickEffect: DemoFrameState["clickEffect"] = null;
	for (const marker of currentTl.cursorMarkers) {
		if (localTime >= marker.clickStart && localTime < marker.clickEnd) {
			const rawProgress = (localTime - marker.clickStart) / PLAYBACK_TIMING.CLICK_EFFECT_MS;
			// 将总时长按两个周期循环：前半段 0→1，后半段 0→1
			const cycleProgress = (rawProgress * 2) % 1;
			clickEffect = {
				type: step.cursor.clickEffect,
				position: marker.to,
				progress: Math.min(1, Math.max(0, cycleProgress)),
			};
			break;
		}
	}

	// 4. 高亮区域透明度
	const highlights: DemoFrameState["highlights"] = [];
	for (const h of currentTl.highlights) {
		let opacity = 0;
		if (localTime >= h.fadeInStart && localTime < h.fullAt) {
			opacity = (localTime - h.fadeInStart) / PLAYBACK_TIMING.HIGHLIGHT_FADE_MS;
		} else if (localTime >= h.fullAt && localTime < h.fadeOutStart) {
			opacity = 1;
		} else if (localTime >= h.fadeOutStart && localTime < h.fadeOutEnd) {
			opacity = 1 - (localTime - h.fadeOutStart) / PLAYBACK_TIMING.HIGHLIGHT_FADE_MS;
		}
		opacity = Math.min(1, Math.max(0, opacity));
		if (opacity > 0) {
			highlights.push({ hotspot: h.hotspot, opacity });
		}
	}

	// 4.5. 缩放区域
	let zoom: DemoFrameState["zoom"] = null;
	for (const z of currentTl.zoomRegions) {
		if (localTime >= z.zoomInStart && localTime < z.zoomInEnd) {
			// 缩放进场
			const progress = (localTime - z.zoomInStart) / PLAYBACK_TIMING.ZOOM_IN_MS;
			zoom = { region: z.hotspot, progress: Math.min(1, Math.max(0, progress)) };
			break;
		}
		if (localTime >= z.zoomInEnd && localTime < z.zoomOutStart) {
			// 缩放保持
			zoom = { region: z.hotspot, progress: 1 };
			break;
		}
		if (localTime >= z.zoomOutStart && localTime < z.zoomOutEnd) {
			// 缩放退场
			const progress = 1 - (localTime - z.zoomOutStart) / PLAYBACK_TIMING.ZOOM_OUT_MS;
			zoom = { region: z.hotspot, progress: Math.min(1, Math.max(0, progress)) };
			break;
		}
	}

	// 5. 转场
	let transition: DemoFrameState["transition"] = null;
	const transEnd = currentTl.transitionStart + currentTl.transitionDuration;
	if (localTime >= currentTl.transitionStart && localTime < transEnd) {
		const progress = (localTime - currentTl.transitionStart) / currentTl.transitionDuration;
		const prevId =
			currentTl.stepIndex > 0 ? timelines[currentTl.stepIndex - 1].step.screenshotId : null;
		transition = {
			type: step.transition.type,
			progress: Math.min(1, Math.max(0, progress)),
			prevScreenshotId: prevId,
		};
	}

	// 6. 字幕
	const visibleSubtitles = step.subtitles.filter(
		(sub) => localTime >= sub.start && localTime <= sub.end,
	);

	// 7. Tooltip
	let tooltip: DemoFrameState["tooltip"] = null;
	for (const marker of currentTl.cursorMarkers) {
		if (
			marker.hotspot.tooltip &&
			localTime >= marker.clickStart &&
			localTime < marker.clickEnd + PLAYBACK_TIMING.HOLD_AFTER_CLICK_MS
		) {
			tooltip = {
				text: marker.hotspot.tooltip,
				x: marker.to.x,
				y: marker.to.y,
			};
			break;
		}
	}

	return {
		stepIndex: currentTl.stepIndex,
		step,
		screenshotId: step.screenshotId,
		prevScreenshotId:
			currentTl.stepIndex > 0 ? timelines[currentTl.stepIndex - 1].step.screenshotId : null,
		cursorVisible,
		cursorPosition,
		clickEffect,
		highlights,
		zoom,
		transition,
		visibleSubtitles,
		tooltip,
	};
}

/**
 * 计算项目所有步骤的总时长（ms），用于 Remotion durationInFrames。
 */
export function computeTotalDurationMs(project: DemoProject): number {
	const timelines = computeStepTimelines(project);
	if (timelines.length === 0) return 0;
	return timelines[timelines.length - 1].globalEnd;
}
