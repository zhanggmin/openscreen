/**
 * DemoBuilder 帧渲染器
 *
 * 基于 Canvas 2D 的帧渲染器，用于图文编辑器视频导出。
 * 每帧合成：背景 → 截图（含圆角/阴影/padding）→ 光标 → 高亮 → 字幕 → 转场。
 *
 * 注意：此渲染器使用纯 Canvas 2D（而非 PixiJS），因为图文编辑器的输入是
 * 静态截图图片，不需要 GPU 加速的视频帧处理。Canvas 2D 足以满足需求且更轻量。
 */

import {
	getLinearGradientPoints,
	getRadialGradientShape,
	parseCssGradient,
	resolveLinearGradientAngle,
} from "@/lib/exporter/gradientParser";
import { classifyWallpaper, resolveImageWallpaperUrl } from "@/lib/wallpaper";
import { getTransitionProgress, type TimelineSegment } from "./demoTimeline";
import type { CursorAnimation, DemoAppearance, DemoBackground, Hotspot, Subtitle } from "./types";

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export interface DemoFrameRendererConfig {
	width: number;
	height: number;
	background: DemoBackground;
	appearance: DemoAppearance;
}

// ─── 光标插值 ──────────────────────────────────────────────────────────────────

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

/** 根据 CursorAnimation 和时间计算光标当前位置（百分比 0-100）。 */
function computeCursorPosition(
	cursor: CursorAnimation,
	elapsedMs: number,
): { x: number; y: number } {
	const duration = cursor.movementDuration;
	if (duration <= 0 || elapsedMs <= 0) return cursor.startPosition;
	if (elapsedMs >= duration) return cursor.endPosition;

	const rawT = elapsedMs / duration;

	switch (cursor.movementType) {
		case "linear":
			return {
				x: lerp(cursor.startPosition.x, cursor.endPosition.x, rawT),
				y: lerp(cursor.startPosition.y, cursor.endPosition.y, rawT),
			};
		case "easing": {
			const t = easeInOut(rawT);
			return {
				x: lerp(cursor.startPosition.x, cursor.endPosition.x, t),
				y: lerp(cursor.startPosition.y, cursor.endPosition.y, t),
			};
		}
		case "bezier": {
			const cp = cursor.bezierControlPoints;
			const t = rawT;
			return {
				x: bezierPoint(
					cursor.startPosition.x,
					cp?.cp1.x ?? cursor.startPosition.x,
					cp?.cp2.x ?? cursor.endPosition.x,
					cursor.endPosition.x,
					t,
				),
				y: bezierPoint(
					cursor.startPosition.y,
					cp?.cp1.y ?? cursor.startPosition.y,
					cp?.cp2.y ?? cursor.endPosition.y,
					cursor.endPosition.y,
					t,
				),
			};
		}
		default:
			return cursor.endPosition;
	}
}

// ─── 渲染器 ───────────────────────────────────────────────────────────────────

export class DemoFrameRenderer {
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private bgCanvas: HTMLCanvasElement | null = null;
	private screenshotCache = new Map<string, HTMLImageElement>();
	private cursorImage: HTMLImageElement | null = null;
	private config: DemoFrameRendererConfig;

	constructor(config: DemoFrameRendererConfig) {
		this.config = config;
		this.canvas = document.createElement("canvas");
		this.canvas.width = config.width;
		this.canvas.height = config.height;
		try {
			if ("colorSpace" in this.canvas) {
				(this.canvas as HTMLCanvasElement & { colorSpace: string }).colorSpace = "srgb";
			}
		} catch {
			// colorSpace not supported
		}
		this.ctx = this.canvas.getContext("2d")!;
	}

	async initialize(): Promise<void> {
		await this.renderBackground();
	}

	/** 预加载截图和光标资源。 */
	async preloadAssets(screenshots: { id: string; url: string }[]): Promise<void> {
		await Promise.all(
			screenshots.map(async (ss) => {
				try {
					const img = await loadImage(ss.url);
					this.screenshotCache.set(ss.id, img);
				} catch (err) {
					console.warn(`[DemoFrameRenderer] Failed to load screenshot ${ss.id}:`, err);
				}
			}),
		);
	}

	/** 预加载光标图片。 */
	async preloadCursor(cursorUrl?: string): Promise<void> {
		if (cursorUrl) {
			try {
				this.cursorImage = await loadImage(cursorUrl);
			} catch {
				this.cursorImage = null;
			}
		}
	}

	/**
	 * 渲染一帧。
	 *
	 * @param segment         当前所在的 TimelineSegment
	 * @param globalTimeMs    全局时间（ms）
	 * @param nextSegment     下一个 Segment（转场时需要）
	 */
	renderFrame(
		segment: TimelineSegment,
		globalTimeMs: number,
		nextSegment: TimelineSegment | null,
	): void {
		const { ctx, config } = this;
		const { width, height } = config;

		// 1. 绘制背景
		ctx.clearRect(0, 0, width, height);
		if (this.bgCanvas) {
			ctx.drawImage(this.bgCanvas, 0, 0, width, height);
		}

		// 2. 检查是否在转场阶段
		const transitionProgress = getTransitionProgress(segment, globalTimeMs);

		if (transitionProgress !== null && nextSegment) {
			// 转场中：渲染当前截图和下一张截图的混合
			this.renderTransitionFrame(segment, nextSegment, transitionProgress);
		} else {
			// 正常帧：渲染当前截图 + 光标 + 高亮 + 字幕
			const screenshot = this.screenshotCache.get(segment.screenshotId);
			if (screenshot) {
				this.drawScreenshot(screenshot);
			}
			this.drawCursorAnimation(segment, globalTimeMs);
			this.drawHotspotHighlights(segment, globalTimeMs);
			this.drawSubtitles(segment.step.subtitles, globalTimeMs - segment.startTimeMs);
		}
	}

	getCanvas(): HTMLCanvasElement {
		return this.canvas;
	}

	destroy(): void {
		this.screenshotCache.clear();
		this.bgCanvas = null;
		this.cursorImage = null;
	}

	// ─── 背景渲染 ──────────────────────────────────────────────────────────────

	private async renderBackground(): Promise<void> {
		const { width, height, background } = this.config;
		const bgCanvas = document.createElement("canvas");
		bgCanvas.width = width;
		bgCanvas.height = height;
		const bgCtx = bgCanvas.getContext("2d")!;

		const classified = classifyWallpaper(background.value);

		if (classified.kind === "color") {
			bgCtx.fillStyle = classified.value;
			bgCtx.fillRect(0, 0, width, height);
		} else if (classified.kind === "gradient") {
			const parsed = parseCssGradient(classified.value);
			if (parsed) {
				const gradient =
					parsed.type === "linear"
						? (() => {
								const pts = getLinearGradientPoints(
									resolveLinearGradientAngle(parsed.descriptor),
									width,
									height,
								);
								return bgCtx.createLinearGradient(pts.x0, pts.y0, pts.x1, pts.y1);
							})()
						: (() => {
								const shape = getRadialGradientShape(parsed.descriptor, width, height);
								return bgCtx.createRadialGradient(
									shape.cx,
									shape.cy,
									0,
									shape.cx,
									shape.cy,
									shape.radius,
								);
							})();
				for (const stop of parsed.stops) {
					gradient.addColorStop(stop.offset, stop.color);
				}
				bgCtx.fillStyle = gradient;
				bgCtx.fillRect(0, 0, width, height);
			} else {
				bgCtx.fillStyle = "#09090b";
				bgCtx.fillRect(0, 0, width, height);
			}
		} else {
			// 图片壁纸
			const imageUrl = resolveImageWallpaperUrl(classified.path);
			try {
				const img = await loadImage(imageUrl);
				const imgAspect = img.width / img.height;
				const canvasAspect = width / height;
				let drawW: number;
				let drawH: number;
				let drawX: number;
				let drawY: number;
				if (imgAspect > canvasAspect) {
					drawH = height;
					drawW = drawH * imgAspect;
					drawX = (width - drawW) / 2;
					drawY = 0;
				} else {
					drawW = width;
					drawH = drawW / imgAspect;
					drawX = 0;
					drawY = (height - drawH) / 2;
				}
				bgCtx.drawImage(img, drawX, drawY, drawW, drawH);
			} catch {
				bgCtx.fillStyle = "#09090b";
				bgCtx.fillRect(0, 0, width, height);
			}
		}

		this.bgCanvas = bgCanvas;
	}

	// ─── 截图绘制 ──────────────────────────────────────────────────────────────

	private drawScreenshot(img: HTMLImageElement): void {
		const { ctx, config } = this;
		const { width, height, appearance } = config;
		const { borderRadius, padding, shadowIntensity } = appearance;

		// 计算截图在画布中的显示区域（考虑 padding）
		const paddingPx = padding;
		const availW = width - paddingPx * 2;
		const availH = height - paddingPx * 2;

		const imgAspect = img.width / img.height;
		const availAspect = availW / availH;

		let drawW: number;
		let drawH: number;

		if (imgAspect > availAspect) {
			drawW = availW;
			drawH = drawW / imgAspect;
		} else {
			drawH = availH;
			drawW = drawH * imgAspect;
		}

		const drawX = (width - drawW) / 2;
		const drawY = (height - drawH) / 2;

		// 阴影
		if (shadowIntensity > 0) {
			ctx.save();
			const blur1 = 48 * shadowIntensity;
			const offsetY = 12 * shadowIntensity;
			ctx.shadowColor = `rgba(0, 0, 0, ${0.7 * shadowIntensity})`;
			ctx.shadowBlur = blur1;
			ctx.shadowOffsetX = 0;
			ctx.shadowOffsetY = offsetY;
			this.drawRoundedImage(img, drawX, drawY, drawW, drawH, borderRadius);
			ctx.restore();
		}

		// 截图本体
		this.drawRoundedImage(img, drawX, drawY, drawW, drawH, borderRadius);
	}

	private drawRoundedImage(
		img: HTMLImageElement,
		x: number,
		y: number,
		w: number,
		h: number,
		radius: number,
	): void {
		const { ctx } = this;
		ctx.save();
		ctx.beginPath();
		ctx.roundRect(x, y, w, h, radius);
		ctx.clip();
		ctx.drawImage(img, x, y, w, h);
		ctx.restore();
	}

	// ─── 光标动画 ──────────────────────────────────────────────────────────────

	private drawCursorAnimation(segment: TimelineSegment, globalTimeMs: number): void {
		const { ctx } = this;
		const cursor = segment.step.cursor;
		const elapsed = globalTimeMs - segment.cursorStartMs;

		if (elapsed < 0) return;

		// 计算截图显示区域以映射百分比坐标
		const screenshot = this.screenshotCache.get(segment.screenshotId);
		if (!screenshot) return;

		const screenshotRect = this.computeScreenshotRect(screenshot);
		if (!screenshotRect) return;

		const pos = computeCursorPosition(cursor, elapsed);
		const canvasX = screenshotRect.x + (pos.x / 100) * screenshotRect.w;
		const canvasY = screenshotRect.y + (pos.y / 100) * screenshotRect.h;

		// 绘制光标
		const cursorSize = 24;
		if (this.cursorImage) {
			ctx.drawImage(
				this.cursorImage,
				canvasX - cursorSize / 2,
				canvasY - cursorSize / 2,
				cursorSize,
				cursorSize,
			);
		} else {
			// 默认箭头光标
			this.drawDefaultCursor(canvasX, canvasY, cursorSize);
		}

		// 点击效果
		const timeSinceClick = globalTimeMs - segment.clickTimeMs;
		if (timeSinceClick >= 0 && timeSinceClick < 500) {
			this.drawClickEffect(cursor.clickEffect, canvasX, canvasY, timeSinceClick);
		}
	}

	private drawDefaultCursor(x: number, y: number, size: number): void {
		const { ctx } = this;
		ctx.save();
		ctx.fillStyle = "#ffffff";
		ctx.strokeStyle = "#000000";
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.moveTo(x, y);
		ctx.lineTo(x, y + size);
		ctx.lineTo(x + size * 0.35, y + size * 0.75);
		ctx.lineTo(x + size * 0.55, y + size * 1.1);
		ctx.lineTo(x + size * 0.7, y + size * 0.95);
		ctx.lineTo(x + size * 0.5, y + size * 0.65);
		ctx.lineTo(x + size * 0.75, y + size * 0.6);
		ctx.closePath();
		ctx.fill();
		ctx.stroke();
		ctx.restore();
	}

	private drawClickEffect(effect: string, x: number, y: number, elapsedMs: number): void {
		const { ctx } = this;
		const progress = elapsedMs / 500;

		switch (effect) {
			case "ripple": {
				const radius = 8 + progress * 30;
				const alpha = 1 - progress;
				ctx.save();
				ctx.strokeStyle = `rgba(52, 178, 123, ${alpha})`;
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.arc(x, y, radius, 0, Math.PI * 2);
				ctx.stroke();
				ctx.restore();
				break;
			}
			case "zoom": {
				const scale = 1 + progress * 0.3;
				const alpha = 1 - progress;
				ctx.save();
				ctx.globalAlpha = alpha;
				ctx.fillStyle = "rgba(52, 178, 123, 0.3)";
				ctx.beginPath();
				ctx.arc(x, y, 12 * scale, 0, Math.PI * 2);
				ctx.fill();
				ctx.restore();
				break;
			}
			case "flash": {
				const alpha = Math.max(0, 1 - progress * 2);
				ctx.save();
				ctx.globalAlpha = alpha * 0.5;
				ctx.fillStyle = "#ffffff";
				ctx.beginPath();
				ctx.arc(x, y, 20, 0, Math.PI * 2);
				ctx.fill();
				ctx.restore();
				break;
			}
			default:
				break;
		}
	}

	// ─── Hotspot 高亮 ──────────────────────────────────────────────────────────

	private drawHotspotHighlights(segment: TimelineSegment, globalTimeMs: number): void {
		const timeSinceClick = globalTimeMs - segment.clickTimeMs;
		if (timeSinceClick < 0) return;

		const screenshot = this.screenshotCache.get(segment.screenshotId);
		if (!screenshot) return;
		const rect = this.computeScreenshotRect(screenshot);
		if (!rect) return;

		for (const hotspot of segment.step.hotspots) {
			const highlightDur = hotspot.highlightDuration ?? 1000;
			if (timeSinceClick > highlightDur) continue;

			const fadeIn = Math.min(1, timeSinceClick / 150);
			const fadeOut =
				timeSinceClick > highlightDur - 200 ? (highlightDur - timeSinceClick) / 200 : 1;
			const alpha = fadeIn * fadeOut;

			this.drawHotspot(hotspot, rect, alpha);
		}
	}

	private drawHotspot(
		hotspot: Hotspot,
		screenshotRect: { x: number; y: number; w: number; h: number },
		alpha: number,
	): void {
		const { ctx } = this;
		const color = hotspot.highlightColor ?? "#34B27B";
		const x = screenshotRect.x + (hotspot.x / 100) * screenshotRect.w;
		const y = screenshotRect.y + (hotspot.y / 100) * screenshotRect.h;
		const w = (hotspot.width / 100) * screenshotRect.w;
		const h = (hotspot.height / 100) * screenshotRect.h;

		ctx.save();
		ctx.globalAlpha = alpha;

		switch (hotspot.highlightStyle) {
			case "border":
				ctx.strokeStyle = color;
				ctx.lineWidth = 3;
				if (hotspot.shape === "circle") {
					const r = Math.min(w, h) / 2;
					ctx.beginPath();
					ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2);
					ctx.stroke();
				} else if (hotspot.shape === "ellipse") {
					ctx.beginPath();
					ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
					ctx.stroke();
				} else {
					ctx.strokeRect(x, y, w, h);
				}
				break;
			case "background":
				ctx.fillStyle = `${color}40`;
				if (hotspot.shape === "circle") {
					const r = Math.min(w, h) / 2;
					ctx.beginPath();
					ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2);
					ctx.fill();
				} else if (hotspot.shape === "ellipse") {
					ctx.beginPath();
					ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
					ctx.fill();
				} else {
					ctx.fillRect(x, y, w, h);
				}
				break;
			case "pulse": {
				const pulsePhase = (Date.now() % 1000) / 1000;
				const pulseScale = 1 + pulsePhase * 0.1;
				ctx.strokeStyle = color;
				ctx.lineWidth = 3;
				ctx.globalAlpha = alpha * (1 - pulsePhase * 0.5);
				const pw = w * pulseScale;
				const ph = h * pulseScale;
				ctx.strokeRect(x - (pw - w) / 2, y - (ph - h) / 2, pw, ph);
				break;
			}
		}

		// Tooltip
		if (hotspot.tooltip && alpha > 0.5) {
			this.drawTooltip(hotspot.tooltip, x + w / 2, y - 8, alpha);
		}

		ctx.restore();
	}

	private drawTooltip(text: string, cx: number, bottomY: number, alpha: number): void {
		const { ctx } = this;
		ctx.save();
		ctx.globalAlpha = alpha;
		ctx.font = "13px system-ui, sans-serif";
		const metrics = ctx.measureText(text);
		const pw = metrics.width + 16;
		const ph = 28;
		const tx = cx - pw / 2;
		const ty = bottomY - ph;

		ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
		ctx.beginPath();
		ctx.roundRect(tx, ty, pw, ph, 6);
		ctx.fill();

		ctx.fillStyle = "#ffffff";
		ctx.textBaseline = "middle";
		ctx.textAlign = "center";
		ctx.fillText(text, cx, ty + ph / 2);
		ctx.restore();
	}

	// ─── 字幕 ──────────────────────────────────────────────────────────────────

	private drawSubtitles(subtitles: Subtitle[], segmentTimeMs: number): void {
		for (const sub of subtitles) {
			if (segmentTimeMs >= sub.start && segmentTimeMs <= sub.end) {
				this.drawSubtitle(sub);
			}
		}
	}

	private drawSubtitle(sub: Subtitle): void {
		const { ctx, config } = this;
		const { width, height } = config;
		const { style, position } = sub;

		const fontSize = sub.fontSize || 18;
		ctx.save();
		ctx.font = `${fontSize}px ${sub.fontFamily || "system-ui, sans-serif"}`;
		ctx.textAlign = "center";

		const metrics = ctx.measureText(sub.text);
		const textW = metrics.width + 20;
		const textH = fontSize + 12;

		let textY: number;
		switch (position) {
			case "top":
				textY = height * 0.1;
				break;
			case "center":
				textY = height * 0.5;
				break;
			default:
				textY = height * 0.88;
		}

		const bgX = (width - textW) / 2;
		const bgY = textY - textH / 2;

		// 背景
		ctx.globalAlpha = style.opacity;
		ctx.fillStyle = style.backgroundColor;
		ctx.beginPath();
		ctx.roundRect(bgX, bgY, textW, textH, 6);
		ctx.fill();

		// 文本
		ctx.fillStyle = style.color;
		ctx.textBaseline = "middle";
		ctx.fillText(sub.text, width / 2, textY);

		ctx.restore();
	}

	// ─── 转场 ──────────────────────────────────────────────────────────────────

	private renderTransitionFrame(
		currentSegment: TimelineSegment,
		nextSegment: TimelineSegment,
		progress: number,
	): void {
		const currentImg = this.screenshotCache.get(currentSegment.screenshotId);
		const nextImg = this.screenshotCache.get(nextSegment.screenshotId);

		// 在转场之前仍然需要绘制当前截图 + 光标 + 高亮
		// 但转场效果会混合下一张截图
		const transitionType = currentSegment.step.transition.type;

		switch (transitionType) {
			case "fade":
			case "dissolve":
				this.renderFadeTransition(currentImg, nextImg, progress);
				break;
			case "slide-left":
				this.renderSlideTransition(currentImg, nextImg, progress, "left");
				break;
			case "slide-right":
				this.renderSlideTransition(currentImg, nextImg, progress, "right");
				break;
			case "slide-up":
				this.renderSlideTransition(currentImg, nextImg, progress, "up");
				break;
			case "zoom":
				this.renderZoomTransition(currentImg, nextImg, progress);
				break;
			case "wipe":
				this.renderWipeTransition(currentImg, nextImg, progress);
				break;
			case "none":
				// 直接切换
				if (nextImg) this.drawScreenshot(nextImg);
				break;
			default:
				this.renderFadeTransition(currentImg, nextImg, progress);
		}
	}

	private renderFadeTransition(
		currentImg: HTMLImageElement | undefined,
		nextImg: HTMLImageElement | undefined,
		progress: number,
	): void {
		const { ctx } = this;
		const eased = easeInOut(progress);

		if (currentImg) {
			ctx.save();
			ctx.globalAlpha = 1 - eased;
			this.drawScreenshot(currentImg);
			ctx.restore();
		}
		if (nextImg) {
			ctx.save();
			ctx.globalAlpha = eased;
			this.drawScreenshot(nextImg);
			ctx.restore();
		}
	}

	private renderSlideTransition(
		currentImg: HTMLImageElement | undefined,
		nextImg: HTMLImageElement | undefined,
		progress: number,
		direction: "left" | "right" | "up",
	): void {
		const { ctx, config } = this;
		const { width, height } = config;
		const eased = easeInOut(progress);

		ctx.save();
		if (currentImg) {
			let offsetX = 0;
			let offsetY = 0;
			if (direction === "left") offsetX = -eased * width;
			else if (direction === "right") offsetX = eased * width;
			else if (direction === "up") offsetY = -eased * height;

			ctx.translate(offsetX, offsetY);
			this.drawScreenshot(currentImg);
			ctx.setTransform(1, 0, 0, 1, 0, 0);
		}

		if (nextImg) {
			let offsetX = 0;
			let offsetY = 0;
			if (direction === "left") offsetX = (1 - eased) * width;
			else if (direction === "right") offsetX = -(1 - eased) * width;
			else if (direction === "up") offsetY = (1 - eased) * height;

			ctx.translate(offsetX, offsetY);
			this.drawScreenshot(nextImg);
			ctx.setTransform(1, 0, 0, 1, 0, 0);
		}
		ctx.restore();
	}

	private renderZoomTransition(
		currentImg: HTMLImageElement | undefined,
		nextImg: HTMLImageElement | undefined,
		progress: number,
	): void {
		const { ctx, config } = this;
		const { width, height } = config;
		const eased = easeInOut(progress);

		if (currentImg) {
			const scale = 1 + eased * 0.3;
			ctx.save();
			ctx.globalAlpha = 1 - eased;
			ctx.translate(width / 2, height / 2);
			ctx.scale(scale, scale);
			ctx.translate(-width / 2, -height / 2);
			this.drawScreenshot(currentImg);
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.restore();
		}
		if (nextImg) {
			const scale = 0.7 + eased * 0.3;
			ctx.save();
			ctx.globalAlpha = eased;
			ctx.translate(width / 2, height / 2);
			ctx.scale(scale, scale);
			ctx.translate(-width / 2, -height / 2);
			this.drawScreenshot(nextImg);
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.restore();
		}
	}

	private renderWipeTransition(
		currentImg: HTMLImageElement | undefined,
		nextImg: HTMLImageElement | undefined,
		progress: number,
	): void {
		const { ctx, config } = this;
		const { width, height } = config;
		const eased = easeInOut(progress);
		const wipeX = eased * width;

		// 先绘制下一张截图
		if (nextImg) {
			this.drawScreenshot(nextImg);
		}
		// 用裁剪区域绘制当前截图（从右向左擦除）
		if (currentImg) {
			ctx.save();
			ctx.beginPath();
			ctx.rect(wipeX, 0, width - wipeX, height);
			ctx.clip();
			this.drawScreenshot(currentImg);
			ctx.restore();
		}
	}

	// ─── 工具方法 ──────────────────────────────────────────────────────────────

	/** 计算截图在画布中的显示区域（用于百分比坐标映射）。 */
	private computeScreenshotRect(
		img: HTMLImageElement,
	): { x: number; y: number; w: number; h: number } | null {
		const { width, height, appearance } = this.config;
		const paddingPx = appearance.padding;
		const availW = width - paddingPx * 2;
		const availH = height - paddingPx * 2;

		const imgAspect = img.width / img.height;
		const availAspect = availW / availH;

		let drawW: number;
		let drawH: number;
		if (imgAspect > availAspect) {
			drawW = availW;
			drawH = drawW / imgAspect;
		} else {
			drawH = availH;
			drawW = drawH * imgAspect;
		}

		return {
			x: (width - drawW) / 2,
			y: (height - drawH) / 2,
			w: drawW,
			h: drawH,
		};
	}
}

// ─── 图片加载工具 ─────────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		if (src.startsWith("http") && !src.startsWith(window.location.origin)) {
			img.crossOrigin = "anonymous";
		}
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
		img.src = src;
	});
}
