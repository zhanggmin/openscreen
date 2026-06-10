/**
 * 图文编辑器 — 播放控件胶囊
 *
 * 嵌入式胶囊形播放控件，显示在时间轴标题行中。
 * 包含播放/停止按钮、步骤进度、当前步骤标题。
 */
import { Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScopedT } from "@/contexts/I18nContext";
import { cn } from "@/lib/utils";

interface DemoPlaybackControlsProps {
	/** 是否正在播放 */
	isPlaying: boolean;
	/** 当前步骤索引（从 0 开始） */
	stepIndex: number;
	/** 步骤总数 */
	totalSteps: number;
	/** 当前步骤标题 */
	stepTitle: string;
	/** 切换播放/暂停 */
	onTogglePlay: () => void;
	/** 停止播放 */
	onStop: () => void;
}

export default function DemoPlaybackControls({
	isPlaying,
	stepIndex,
	totalSteps,
	stepTitle,
	onTogglePlay,
	onStop,
}: DemoPlaybackControlsProps) {
	const t = useScopedT("demobuilder");

	if (totalSteps === 0) return null;

	return (
		<div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-zinc-800/80 border border-zinc-700/60 transition-all duration-200 hover:bg-zinc-800 hover:border-zinc-600">
			{/* 播放/停止按钮 */}
			{isPlaying ? (
				<Button
					onClick={onStop}
					size="icon"
					className="w-7 h-7 rounded-full bg-white/10 text-white hover:bg-white/20 border border-white/10 transition-all duration-200 shadow-none"
					aria-label={t("playbackControls.stopAll")}
				>
					<Square className="w-3.5 h-3.5 fill-current" />
				</Button>
			) : (
				<Button
					onClick={onTogglePlay}
					size="icon"
					className={cn(
						"w-7 h-7 rounded-full transition-all duration-200 border border-white/10",
						"bg-white text-black hover:bg-white/90 hover:scale-105 shadow-[0_0_15px_rgba(255,255,255,0.3)]",
					)}
					aria-label={t("playbackControls.playAll")}
				>
					<Play className="w-3.5 h-3.5 fill-current ml-0.5" />
				</Button>
			)}

			{/* 步骤进度 */}
			<span className="text-[10px] font-medium text-slate-400 tabular-nums shrink-0">
				{t("playbackControls.stepOf", {
					current: stepIndex + 1,
					total: totalSteps,
				})}
			</span>

			{/* 分隔线 */}
			<div className="w-px h-3.5 bg-white/10 shrink-0" />

			{/* 当前步骤标题 */}
			<span className="text-[11px] font-medium text-slate-300 truncate min-w-0 flex-1">
				{stepTitle || "—"}
			</span>

			{/* 播放中的脉冲指示灯 */}
			{isPlaying && (
				<div className="flex items-center gap-1.5 shrink-0">
					<div className="w-1.5 h-1.5 rounded-full bg-[#34B27B] animate-pulse" />
					<span className="text-[9px] font-medium text-[#34B27B]">{t("canvas.playing")}</span>
				</div>
			)}
		</div>
	);
}
