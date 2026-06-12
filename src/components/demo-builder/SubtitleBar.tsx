import React from "react";
import type { Subtitle } from "@/lib/demobuilder/types";

/** 字幕条高度（px），用于计算截图 padding 避让 */
export const SUBTITLE_BAR_HEIGHT = 56;

/**
 * SubtitleBar — 固定在容器底部的字幕渲染组件。
 * 在 CanvasArea（画布底层）和 DemoPlayer（播放容器底层）中复用。
 */
export const SubtitleBar = React.memo(function SubtitleBar({ subtitle }: { subtitle: Subtitle }) {
	if (!subtitle.text) return null;

	return (
		<div
			style={{
				position: "absolute",
				left: 0,
				right: 0,
				bottom: 0,
				height: SUBTITLE_BAR_HEIGHT,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				pointerEvents: "none",
				zIndex: 50,
				padding: "0 24px",
			}}
		>
			<span
				style={{
					padding: "8px 16px",
					borderRadius: 6,
					textAlign: "center",
					maxWidth: "80%",
					fontSize: subtitle.fontSize,
					fontFamily: subtitle.fontFamily,
					lineHeight: 1.4,
					color: subtitle.style.color,
					backgroundColor: subtitle.style.backgroundColor,
					opacity: subtitle.style.opacity,
					textShadow:
						subtitle.style.outlineWidth && subtitle.style.outlineColor
							? `0 0 ${subtitle.style.outlineWidth}px ${subtitle.style.outlineColor}`
							: undefined,
				}}
			>
				{subtitle.text}
			</span>
		</div>
	);
});
