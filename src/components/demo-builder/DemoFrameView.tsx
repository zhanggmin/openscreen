/**
 * DemoFrameView — 纯展示 React 组件
 *
 * 接收 DemoFrameState（由 computeFrameState 计算），渲染完整的 Demo 帧画面。
 * 所有动画状态通过内联 style 驱动（不依赖 CSS @keyframes / transition），
 * 确保在 Remotion headless Chrome 渲染中也能正确工作。
 *
 * 被以下场景复用：
 *   - 编辑器预览 (CanvasArea)     — rAF 驱动
 *   - 全屏播放 (DemoPlayer)       — rAF 驱动
 *   - Remotion Composition        — useCurrentFrame() 驱动
 *   - 网页嵌入 (DemoWebPlayer)    — rAF 驱动
 */

import React, { useMemo } from "react";
import cursorCrossUrl from "@/assets/cursors/Cursor=Cross.svg";
import cursorDefaultUrl from "@/assets/cursors/Cursor=Default.svg";
import cursorOpenHandUrl from "@/assets/cursors/Cursor=Hand-(Open).svg";
import cursorHandUrl from "@/assets/cursors/Cursor=Hand-(Pointing).svg";
import cursorTextUrl from "@/assets/cursors/Cursor=Text-Cursor.svg";
import { getAssetPath } from "@/lib/assetPath";
import { getCursorTheme } from "@/lib/cursor/cursorThemes";
import type { DemoFrameState } from "@/lib/demobuilder/demoPlaybackEngine";
import type {
	CursorStyle,
	DemoAppearance,
	DemoBackground,
	Hotspot,
	Screenshot,
	Subtitle,
	TransitionType,
} from "@/lib/demobuilder/types";
import { ZOOM_LEVEL_SCALES } from "@/lib/demobuilder/types";
import { resolveImageWallpaperUrl } from "@/lib/wallpaper";

// ─── 常量 ────────────────────────────────────────────────────────────────────

const CURSOR_IMAGE_MAP: Record<string, string> = {
	default: cursorDefaultUrl,
	hand: cursorHandUrl,
	cross: cursorCrossUrl,
	text: cursorTextUrl,
	"open-hand": cursorOpenHandUrl,
	mac: cursorDefaultUrl,
	windows: cursorDefaultUrl,
	custom: cursorDefaultUrl,
};

// ─── Props ───────────────────────────────────────────────────────────────────

export interface DemoFrameViewProps {
	/** 当前帧的完整视觉状态（由 computeFrameState 计算） */
	state: DemoFrameState;
	/** 画布宽度（px） */
	width: number;
	/** 画布高度（px） */
	height: number;
	/** 背景配置 */
	background: DemoBackground;
	/** 外观配置（圆角、阴影、内边距、模糊） */
	appearance: DemoAppearance;
	/** 截图 URL 映射：id → url */
	screenshots: Map<string, string>;
	/** 截图原始尺寸列表（用于计算显示尺寸，保持宽高比） */
	screenshotList?: Screenshot[];
	/** 光标样式 */
	cursorType?: CursorStyle;
	/** 光标主题 ID（优先于 cursorType，支持点击/移动双状态） */
	cursorTheme?: string;
	/**
	 * 跳过截图/背景/内边距渲染，仅渲染叠加层（高亮、光标、点击效果等）。
	 * 用于编辑器预览 (CanvasArea)，父级已渲染截图，叠加层直接覆盖其上。
	 */
	skipChrome?: boolean;
}

// ─── 辅助函数 ────────────────────────────────────────────────────────────────

function getBackgroundStyle(bg: DemoBackground): React.CSSProperties {
	if (!bg) return { backgroundColor: "#09090b" };
	if (bg.type === "wallpaper") {
		const url = resolveImageWallpaperUrl(bg.value);
		return {
			backgroundImage: `url(${url})`,
			backgroundSize: "cover",
			backgroundPosition: "center",
		};
	}
	if (bg.type === "gradient") {
		return { background: bg.value };
	}
	return { backgroundColor: bg.value };
}

/** 计算截图在 padded 区域内的最大适配尺寸（保持宽高比） */
function computeDisplaySize(
	naturalW: number,
	naturalH: number,
	canvasW: number,
	canvasH: number,
	padding: number,
): { width: number; height: number } {
	const pad = padding * 2;
	const availW = canvasW - pad;
	const availH = canvasH - pad;
	if (naturalW <= 0 || naturalH <= 0 || availW <= 0 || availH <= 0) {
		return { width: Math.max(0, availW), height: Math.max(0, availH) };
	}
	const scale = Math.min(availW / naturalW, availH / naturalH);
	return {
		width: Math.round(naturalW * scale),
		height: Math.round(naturalH * scale),
	};
}

// ─── 子组件：高亮遮罩 ────────────────────────────────────────────────────────

function HighlightOverlay({ hotspot, opacity }: { hotspot: Hotspot; opacity: number }) {
	const color = hotspot.highlightColor || "#34B27B";
	const shape = hotspot.shape ?? "rect";

	const cutoutPath = useMemo(() => {
		const x = hotspot.x;
		const y = hotspot.y;
		const w = hotspot.width;
		const h = hotspot.height;
		const fullRect = "M0 0H100V100H0Z";
		if (shape === "circle" || shape === "ellipse") {
			const cx = x + w / 2;
			const cy = y + h / 2;
			const rx = w / 2;
			const ry = h / 2;
			return `${fullRect} M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
		}
		return `${fullRect} M${x} ${y}H${x + w}V${y + h}H${x}Z`;
	}, [hotspot.x, hotspot.y, hotspot.width, hotspot.height, shape]);

	if (opacity <= 0) return null;

	return (
		<>
			{/* SVG 遮罩层：区域内透明，区域外半透明遮罩 */}
			<svg
				style={{
					position: "absolute",
					inset: 0,
					width: "100%",
					height: "100%",
					pointerEvents: "none",
					opacity,
					zIndex: 10,
				}}
				viewBox="0 0 100 100"
				preserveAspectRatio="none"
			>
				<path d={cutoutPath} fill="rgba(0,0,0,0.55)" fillRule="evenodd" />
			</svg>

			{/* 高亮区域形状描边 */}
			<div
				style={{
					position: "absolute",
					left: `${hotspot.x}%`,
					top: `${hotspot.y}%`,
					width: `${hotspot.width}%`,
					height: `${hotspot.height}%`,
					opacity,
					pointerEvents: "none",
					zIndex: 11,
				}}
			>
				<svg
					viewBox="0 0 100 100"
					preserveAspectRatio="none"
					style={{ width: "100%", height: "100%", overflow: "visible" }}
				>
					{shape === "rect" && (
						<rect
							x="0"
							y="0"
							width="100"
							height="100"
							fill="none"
							stroke={color}
							strokeWidth="2"
							vectorEffect="non-scaling-stroke"
						/>
					)}
					{(shape === "circle" || shape === "ellipse") && (
						<ellipse
							cx="50"
							cy="50"
							rx="50"
							ry="50"
							fill="none"
							stroke={color}
							strokeWidth="2"
							vectorEffect="non-scaling-stroke"
						/>
					)}
				</svg>
				{hotspot.label && opacity > 0.5 && (
					<span
						style={{
							position: "absolute",
							top: -24,
							left: 0,
							fontSize: 10,
							background: "rgba(24,24,27,0.9)",
							color: "#e4e4e7",
							padding: "2px 6px",
							borderRadius: 4,
							whiteSpace: "nowrap",
							backdropFilter: "blur(4px)",
						}}
					>
						{hotspot.label}
					</span>
				)}
			</div>
		</>
	);
}

// ─── 子组件：点击效果 ────────────────────────────────────────────────────────

function ClickEffectOverlay({
	type,
	x,
	y,
	progress,
}: {
	type: string;
	x: number;
	y: number;
	progress: number;
}) {
	// 基础容器 80px，比之前的 44px 更显眼
	const size = 80;
	const half = size / 2;

	return (
		<div
			style={{
				position: "absolute",
				left: `${x}%`,
				top: `${y}%`,
				width: size,
				height: size,
				marginLeft: -half,
				marginTop: -half,
				pointerEvents: "none",
				zIndex: 45,
			}}
		>
			{type === "ripple" && (
				<>
					{/* 外圈涟漪 */}
					<div
						style={{
							position: "absolute",
							inset: 0,
							borderRadius: "50%",
							border: "3px solid rgba(52,178,123,0.8)",
							transform: `scale(${0.3 + progress * 2.0})`,
							opacity: 1 - progress,
						}}
					/>
					{/* 内圈填充 */}
					<div
						style={{
							position: "absolute",
							inset: 0,
							borderRadius: "50%",
							background: "rgba(52,178,123,0.45)",
							transform: `scale(${0.2 + progress * 1.2})`,
							opacity: Math.max(0, 1 - progress * 1.5),
						}}
					/>
					{/* 中心点 */}
					<div
						style={{
							position: "absolute",
							left: "50%",
							top: "50%",
							width: 10,
							height: 10,
							marginLeft: -5,
							marginTop: -5,
							borderRadius: "50%",
							background: "rgba(52,178,123,0.9)",
							opacity: Math.max(0, 1 - progress * 2),
						}}
					/>
				</>
			)}
			{type === "zoom" && (
				<>
					{/* 缩放脉冲圆 */}
					<div
						style={{
							position: "absolute",
							inset: 0,
							borderRadius: "50%",
							background: "rgba(52,178,123,0.4)",
							transform: `scale(${0.6 + Math.sin(progress * Math.PI) * 0.8})`,
							opacity: 0.4 + Math.sin(progress * Math.PI) * 0.6,
						}}
					/>
					{/* 外圈光环 */}
					<div
						style={{
							position: "absolute",
							inset: -4,
							borderRadius: "50%",
							border: "2.5px solid rgba(52,178,123,0.7)",
							transform: `scale(${0.5 + Math.sin(progress * Math.PI) * 0.7})`,
							opacity: Math.sin(progress * Math.PI),
						}}
					/>
					{/* 中心实心点 */}
					<div
						style={{
							position: "absolute",
							left: "50%",
							top: "50%",
							width: 8,
							height: 8,
							marginLeft: -4,
							marginTop: -4,
							borderRadius: "50%",
							background: "rgba(52,178,123,0.85)",
							opacity: 1 - progress * 0.6,
						}}
					/>
				</>
			)}
			{type === "flash" && (
				<>
					{/* 白色闪光 */}
					<div
						style={{
							position: "absolute",
							inset: 0,
							borderRadius: "50%",
							background:
								"radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.3) 60%, transparent 100%)",
							transform: `scale(${0.8 + progress * 0.6})`,
							opacity: 1 - progress,
						}}
					/>
					{/* 彩色外环 */}
					<div
						style={{
							position: "absolute",
							inset: -6,
							borderRadius: "50%",
							border: "3px solid rgba(255,220,80,0.7)",
							transform: `scale(${0.5 + progress * 1.5})`,
							opacity: Math.max(0, 1 - progress * 1.2),
						}}
					/>
				</>
			)}
		</div>
	);
}

// ─── 子组件：浮动说明气泡 ────────────────────────────────────────────────────

function TooltipOverlay({ text, x, y }: { text: string; x: number; y: number }) {
	return (
		<div
			style={{
				position: "absolute",
				left: `${x}%`,
				top: `${y}%`,
				transform: "translate(-50%, -130%)",
				pointerEvents: "none",
				zIndex: 55,
			}}
		>
			<div
				style={{
					padding: "6px 10px",
					borderRadius: 8,
					background: "rgba(24,24,27,0.95)",
					color: "white",
					fontSize: 11,
					fontWeight: 500,
					boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
					backdropFilter: "blur(4px)",
					border: "1px solid rgba(255,255,255,0.1)",
					whiteSpace: "nowrap",
					maxWidth: 200,
					overflow: "hidden",
					textOverflow: "ellipsis",
				}}
			>
				{text}
			</div>
			{/* 小三角箭头 */}
			<div
				style={{
					width: 0,
					height: 0,
					margin: "0 auto",
					borderLeft: "5px solid transparent",
					borderRight: "5px solid transparent",
					borderTop: "5px solid rgba(24,24,27,0.95)",
				}}
			/>
		</div>
	);
}

// ─── 子组件：光标 ────────────────────────────────────────────────────────────

function CursorOverlay({
	x,
	y,
	cursorType,
	cursorTheme,
	isClicking,
}: {
	x: number;
	y: number;
	cursorType?: CursorStyle;
	cursorTheme?: string;
	isClicking: boolean;
}) {
	// 解析光标主题：如果设置了非默认主题，使用主题的 arrow/pointer 图片
	const theme = getCursorTheme(cursorTheme);
	let cursorSrc: string;
	if (theme) {
		// 主题模式：点击时显示 pointer，移动时显示 arrow
		const asset = isClicking
			? (theme.assets.pointer ?? theme.assets.arrow)
			: (theme.assets.arrow ?? theme.assets.pointer);
		cursorSrc = asset ? getAssetPath(asset.assetPath) : cursorDefaultUrl;
	} else {
		// 回退到旧版 CursorStyle 映射
		cursorSrc = CURSOR_IMAGE_MAP[cursorType ?? "default"] ?? cursorDefaultUrl;
	}

	return (
		<div
			style={{
				position: "absolute",
				left: `${x}%`,
				top: `${y}%`,
				width: 32,
				height: 32,
				marginLeft: -4,
				marginTop: -2,
				pointerEvents: "none",
				zIndex: 50,
			}}
		>
			<img
				src={cursorSrc}
				alt="cursor"
				style={{
					width: "100%",
					height: "100%",
					filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
				}}
				draggable={false}
			/>
		</div>
	);
}

// ─── 子组件：字幕 ────────────────────────────────────────────────────────────

function SubtitleOverlay({ subtitle }: { subtitle: Subtitle }) {
	const posStyle: React.CSSProperties = {
		position: "absolute",
		left: 0,
		right: 0,
		display: "flex",
		justifyContent: "center",
		pointerEvents: "none",
		padding: "0 16px",
		zIndex: 40,
	};

	if (subtitle.position === "top") posStyle.top = "5%";
	else if (subtitle.position === "center") posStyle.top = "45%";
	else posStyle.bottom = "5%";

	return (
		<div style={posStyle}>
			<span
				style={{
					padding: "6px 12px",
					borderRadius: 4,
					textAlign: "center",
					fontSize: subtitle.fontSize,
					fontFamily: subtitle.fontFamily,
					color: subtitle.style.color,
					backgroundColor: subtitle.style.backgroundColor,
					opacity: subtitle.style.opacity,
				}}
			>
				{subtitle.text}
			</span>
		</div>
	);
}

// ─── 子组件：转场动画层 ──────────────────────────────────────────────────────

function TransitionLayer({
	type,
	progress,
	prevUrl,
	currentUrl,
	borderRadius,
	imgWidth,
	imgHeight,
}: {
	type: TransitionType;
	progress: number;
	prevUrl: string | null;
	currentUrl: string | null;
	borderRadius: number;
	imgWidth: number;
	imgHeight: number;
}) {
	if (type === "none") return null;

	const base: React.CSSProperties = {
		position: "absolute",
		left: 0,
		top: 0,
		width: imgWidth,
		height: imgHeight,
		borderRadius,
		overflow: "hidden",
		pointerEvents: "none",
		zIndex: 60,
	};

	const renderImg = (url: string | null, extra: React.CSSProperties = {}, zIndex = 60) => (
		<div style={{ ...base, zIndex, ...extra }}>
			{url && (
				<img
					src={url}
					alt=""
					style={{ width: "100%", height: "100%", objectFit: "cover" }}
					draggable={false}
				/>
			)}
		</div>
	);

	// ── 滑动 ──
	if (type === "slide-left" || type === "slide-right" || type === "slide-up") {
		let exitTransform = "";
		let enterTransform = "";
		if (type === "slide-left") {
			exitTransform = `translateX(${-progress * 100}%)`;
			enterTransform = `translateX(${(1 - progress) * 100}%)`;
		} else if (type === "slide-right") {
			exitTransform = `translateX(${progress * 100}%)`;
			enterTransform = `translateX(${-(1 - progress) * 100}%)`;
		} else {
			exitTransform = `translateY(${-progress * 100}%)`;
			enterTransform = `translateY(${(1 - progress) * 100}%)`;
		}
		return (
			<>
				{prevUrl && prevUrl !== currentUrl && renderImg(prevUrl, { transform: exitTransform })}
				{renderImg(currentUrl, { transform: enterTransform }, 61)}
			</>
		);
	}

	// ── 缩放 ──
	if (type === "zoom") {
		const exitScale = 1 - progress * 0.5;
		const enterScale = 0.5 + progress * 0.5;
		return (
			<>
				{prevUrl &&
					prevUrl !== currentUrl &&
					renderImg(prevUrl, { transform: `scale(${exitScale})`, opacity: 1 - progress })}
				{renderImg(currentUrl, { transform: `scale(${enterScale})`, opacity: progress }, 61)}
			</>
		);
	}

	// ── 溶解（交叉淡入淡出） ──
	if (type === "dissolve") {
		return (
			<>
				{prevUrl && prevUrl !== currentUrl && renderImg(prevUrl, { opacity: 1 - progress })}
				{renderImg(currentUrl, { opacity: progress }, 61)}
			</>
		);
	}

	// ── 擦除 ──
	if (type === "wipe") {
		return (
			<>
				{prevUrl && prevUrl !== currentUrl && renderImg(prevUrl)}
				{renderImg(currentUrl, { clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)` }, 61)}
			</>
		);
	}

	// ── 默认：淡入黑色遮罩 (fade) ──
	return (
		<div
			style={{
				position: "absolute",
				inset: 0,
				background: "black",
				pointerEvents: "none",
				opacity: progress,
				zIndex: 60,
			}}
		/>
	);
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────

export function DemoFrameView({
	state,
	width,
	height,
	background,
	appearance,
	screenshots,
	screenshotList,
	cursorType,
	cursorTheme,
	skipChrome,
}: DemoFrameViewProps) {
	const bgStyle = useMemo(() => getBackgroundStyle(background), [background]);

	const shadowStyle = useMemo(
		() =>
			appearance.shadowIntensity > 0
				? `0 25px 60px rgba(0,0,0,${appearance.shadowIntensity}), 0 10px 25px rgba(0,0,0,${appearance.shadowIntensity * 0.6})`
				: undefined,
		[appearance.shadowIntensity],
	);

	const blurFilter = useMemo(
		() => (appearance.blurIntensity > 0 ? `blur(${appearance.blurIntensity * 20}px)` : undefined),
		[appearance.blurIntensity],
	);

	// 计算截图显示尺寸（保持宽高比）
	const imgSize = useMemo(() => {
		const shot = screenshotList?.find((s) => s.id === state.screenshotId);
		if (shot && shot.width > 0 && shot.height > 0) {
			return computeDisplaySize(shot.width, shot.height, width, height, appearance.padding);
		}
		// 回退：填满 padded 区域
		const pad = appearance.padding * 2;
		return { width: width - pad, height: height - pad };
	}, [screenshotList, state.screenshotId, width, height, appearance.padding]);

	const currentUrl = screenshots.get(state.screenshotId) ?? null;
	const prevUrl = state.prevScreenshotId ? (screenshots.get(state.prevScreenshotId) ?? null) : null;
	const transitionPrevUrl = state.transition?.prevScreenshotId
		? (screenshots.get(state.transition.prevScreenshotId) ?? null)
		: prevUrl;

	// ── 叠加层内容（高亮、点击效果、光标、字幕、转场、tooltip） ──
	// 缩放：参考视频编辑器，焦点(区域中心) clamp 到安全范围 [1/(2s), 1-1/(2s)]
	// 避免缩放后画布边缘露白；偏移按 progress 渐进保证进场流畅
	const zoomScale = state.zoom
		? 1 + (ZOOM_LEVEL_SCALES[state.zoom.region.zoomLevel ?? 3] - 1) * state.zoom.progress
		: 1;
	const zoomLayerStyle: React.CSSProperties | undefined = (() => {
		const z = state.zoom;
		if (!z || z.progress <= 0) return undefined;
		const w = imgSize.width;
		const h = imgSize.height;
		if (w <= 0 || h <= 0) return undefined;
		const targetScale = ZOOM_LEVEL_SCALES[z.region.zoomLevel ?? 3];
		// clamp 焦点到安全范围
		const rawCx = (z.region.x + z.region.width / 2) / 100;
		const rawCy = (z.region.y + z.region.height / 2) / 100;
		const margin = Math.min(0.5, 1 / (2 * targetScale));
		const focusCx = Math.max(margin, Math.min(1 - margin, rawCx));
		const focusCy = Math.max(margin, Math.min(1 - margin, rawCy));
		// 最终偏移按 target scale 计算，再按 progress 渐进
		const finalTx = w / 2 - focusCx * w * targetScale;
		const finalTy = h / 2 - focusCy * h * targetScale;
		const tx = finalTx * z.progress;
		const ty = finalTy * z.progress;
		return {
			transform: `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${zoomScale})`,
			transformOrigin: "0 0",
		};
	})();

	const overlays = (
		<div
			style={{
				position: "absolute",
				inset: 0,
				pointerEvents: "none",
			}}
		>
			{/* 高亮区域 */}
			{state.highlights.map((h) => (
				<HighlightOverlay key={h.hotspot.id} hotspot={h.hotspot} opacity={h.opacity} />
			))}

			{/* 点击效果 */}
			{state.clickEffect && (
				<ClickEffectOverlay
					type={state.clickEffect.type}
					x={state.clickEffect.position.x}
					y={state.clickEffect.position.y}
					progress={state.clickEffect.progress}
				/>
			)}

			{/* 光标 */}
			{state.cursorVisible && (
				<CursorOverlay
					x={state.cursorPosition.x}
					y={state.cursorPosition.y}
					cursorType={cursorType}
					cursorTheme={cursorTheme}
					isClicking={state.clickEffect !== null}
				/>
			)}

			{/* 字幕 */}
			{state.visibleSubtitles.map((sub) => (
				<SubtitleOverlay key={sub.id} subtitle={sub} />
			))}

			{/* 转场 */}
			{state.transition && (
				<TransitionLayer
					type={state.transition.type}
					progress={state.transition.progress}
					prevUrl={transitionPrevUrl}
					currentUrl={currentUrl}
					borderRadius={appearance.borderRadius}
					imgWidth={skipChrome ? width : imgSize.width}
					imgHeight={skipChrome ? height : imgSize.height}
				/>
			)}

			{/* 浮动说明 */}
			{state.tooltip && (
				<TooltipOverlay text={state.tooltip.text} x={state.tooltip.x} y={state.tooltip.y} />
			)}
		</div>
	);

	// ── skipChrome 模式：仅渲染叠加层，直接覆盖在父级截图上 ──
	if (skipChrome) {
		return (
			<div
				style={{
					position: "absolute",
					inset: 0,
					pointerEvents: "none",
					overflow: "hidden",
				}}
			>
				{overlays}
			</div>
		);
	}

	// ── 完整模式：背景 + 内边距 + 截图 + 叠加层 ──
	return (
		<div style={{ width, height, position: "relative", overflow: "hidden" }}>
			{/* 背景层 */}
			<div
				style={{
					position: "absolute",
					inset: 0,
					...bgStyle,
					filter: blurFilter,
				}}
			/>

			{/* 内边距容器：居中显示截图 */}
			<div
				style={{
					position: "absolute",
					inset: 0,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					padding: appearance.padding,
				}}
			>
				{/* 截图容器：尺寸匹配图片宽高比，所有覆盖层相对于此定位 */}
				<div
					style={{
						position: "relative",
						width: imgSize.width,
						height: imgSize.height,
						borderRadius: appearance.borderRadius,
						boxShadow: shadowStyle,
						overflow: "hidden",
					}}
				>
					{/* Zoom layer：仅放大内部内容，外层容器尺寸保持不变 */}
					<div
						style={{
							position: "absolute",
							inset: 0,
							...(zoomLayerStyle ?? {}),
						}}
					>
						{/* 截图 */}
						{currentUrl && (
							<img
								src={currentUrl}
								alt=""
								style={{
									width: "100%",
									height: "100%",
									objectFit: "cover",
									userSelect: "none",
								}}
								draggable={false}
							/>
						)}

						{overlays}
					</div>
				</div>
			</div>
		</div>
	);
}
