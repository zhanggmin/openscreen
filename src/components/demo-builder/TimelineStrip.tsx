import { useCallback, useRef, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import type { Screenshot, Step } from "@/lib/demobuilder/types";
import DemoPlaybackControls from "./DemoPlaybackControls";

/** 空操作回调，用于播放控件 props 缺省值 */
// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional noop fallback
const noop = () => {};

interface TimelineStripProps {
	steps: Step[];
	screenshots: Screenshot[];
	selectedStepId: string | null;
	onSelectStep: (stepId: string) => void;
	onReorderSteps: (steps: Step[]) => void;
	onRemoveStep: (stepId: string) => void;
	onImportScreenshots: () => void;
	/** 播放状态 */
	isPlaying?: boolean;
	/** 当前步骤索引 */
	stepIndex?: number;
	/** 当前步骤标题 */
	stepTitle?: string;
	/** 切换播放 */
	onTogglePlay?: () => void;
	/** 停止播放 */
	onStopPlayback?: () => void;
}

interface ContextMenu {
	x: number;
	y: number;
	stepId: string;
}

export function TimelineStrip({
	steps,
	screenshots,
	selectedStepId,
	onSelectStep,
	onReorderSteps,
	onRemoveStep,
	onImportScreenshots,
	isPlaying,
	stepIndex,
	stepTitle,
	onTogglePlay,
	onStopPlayback,
}: TimelineStripProps) {
	const t = useScopedT("demobuilder");
	const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
	const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
	const dragSourceIndex = useRef<number | null>(null);

	function getScreenshotUrl(screenshotId: string): string | undefined {
		return screenshots.find((s) => s.id === screenshotId)?.url;
	}

	// ─── Drag & Drop ────────────────────────────────────────────────────────

	const handleDragStart = useCallback((index: number) => {
		dragSourceIndex.current = index;
	}, []);

	const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
		e.preventDefault();
		setDragOverIndex(index);
	}, []);

	const handleDrop = useCallback(
		(targetIndex: number) => {
			const sourceIndex = dragSourceIndex.current;
			if (sourceIndex === null || sourceIndex === targetIndex) {
				setDragOverIndex(null);
				return;
			}
			const newSteps = [...steps];
			const [moved] = newSteps.splice(sourceIndex, 1);
			newSteps.splice(targetIndex, 0, moved);
			const reordered = newSteps.map((s, i) => ({ ...s, order: i }));
			onReorderSteps(reordered);
			setDragOverIndex(null);
			dragSourceIndex.current = null;
		},
		[steps, onReorderSteps],
	);

	const handleDragEnd = useCallback(() => {
		setDragOverIndex(null);
		dragSourceIndex.current = null;
	}, []);

	// ─── Context Menu ───────────────────────────────────────────────────────

	const handleContextMenu = useCallback((e: React.MouseEvent, stepId: string) => {
		e.preventDefault();
		setContextMenu({ x: e.clientX, y: e.clientY, stepId });
	}, []);

	const closeContextMenu = useCallback(() => setContextMenu(null), []);

	return (
		<div
			className="h-44 shrink-0 bg-zinc-950 border-t border-zinc-800 flex flex-col"
			onClick={closeContextMenu}
		>
			{/* Header bar */}
			<div className="px-3 py-1.5 border-b border-zinc-800 shrink-0 flex items-center gap-3">
				<span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider shrink-0">
					{t("timeline.title")}
				</span>

				{/* 播放控件胶囊 */}
				<DemoPlaybackControls
					isPlaying={isPlaying ?? false}
					stepIndex={stepIndex ?? 0}
					totalSteps={steps.length}
					stepTitle={stepTitle ?? ""}
					onTogglePlay={onTogglePlay ?? noop}
					onStop={onStopPlayback ?? noop}
				/>

				<div className="flex items-center gap-2 ml-auto shrink-0">
					<span className="text-[10px] text-zinc-600">
						{t("timeline.stepCount", { count: steps.length })}
					</span>
					<button
						type="button"
						onClick={onImportScreenshots}
						className="px-2 py-0.5 text-[10px] font-medium text-zinc-400 bg-zinc-800 rounded hover:bg-zinc-700 transition-colors"
					>
						+ {t("timeline.importImages")}
					</button>
				</div>
			</div>

			{/* Thumbnails */}
			<div className="flex-1 flex items-center gap-2 px-3 overflow-x-auto">
				{steps.map((step, index) => {
					const screenshotUrl = getScreenshotUrl(step.screenshotId);
					const isSelected = step.id === selectedStepId;
					const isDragOver = dragOverIndex === index;
					return (
						<div
							key={step.id}
							draggable
							onDragStart={() => handleDragStart(index)}
							onDragOver={(e) => handleDragOver(e, index)}
							onDrop={() => handleDrop(index)}
							onDragEnd={handleDragEnd}
							onContextMenu={(e) => handleContextMenu(e, step.id)}
							className={`shrink-0 flex flex-col items-center gap-1 cursor-grab active:cursor-grabbing ${
								isSelected ? "opacity-100" : "opacity-70 hover:opacity-100"
							}`}
						>
							<button
								type="button"
								onClick={() => onSelectStep(step.id)}
								className={`relative w-[140px] h-[90px] rounded border-2 overflow-hidden bg-zinc-900 flex items-center justify-center transition-colors ${
									isDragOver
										? "border-blue-500 border-dashed"
										: isSelected
											? "border-[#34B27B]"
											: "border-zinc-700 hover:border-zinc-500"
								}`}
							>
								{screenshotUrl ? (
									<img
										src={screenshotUrl}
										alt={step.title}
										className="w-full h-full object-cover"
										draggable={false}
									/>
								) : (
									<span className="text-[9px] text-zinc-600">{t("timeline.noImage")}</span>
								)}
							</button>
							<span
								className={`text-[10px] ${
									isSelected ? "text-[#34B27B] font-medium" : "text-zinc-500"
								}`}
							>
								{t("timeline.stepLabel", { number: index + 1 })}
							</span>
						</div>
					);
				})}

				{/* Add step / import button */}
				<button
					type="button"
					onClick={onImportScreenshots}
					className="shrink-0 w-[140px] h-[90px] rounded border-2 border-dashed border-zinc-700 hover:border-zinc-500 flex flex-col items-center justify-center gap-1 transition-colors"
				>
					<span className="text-lg text-zinc-600">+</span>
					<span className="text-[9px] text-zinc-600">{t("timeline.addStep")}</span>
				</button>
			</div>

			{/* Context menu */}
			{contextMenu && (
				<div
					className="fixed z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[160px]"
					style={{ left: contextMenu.x, top: contextMenu.y }}
					onClick={(e) => e.stopPropagation()}
				>
					<ContextMenuItem
						icon="🗑"
						label={t("timeline.deleteStep")}
						danger
						onClick={() => {
							onRemoveStep(contextMenu.stepId);
							closeContextMenu();
						}}
					/>
				</div>
			)}
		</div>
	);
}

// ─── Context Menu Item ────────────────────────────────────────────────────────

function ContextMenuItem({
	icon,
	label,
	danger,
	onClick,
}: {
	icon: string;
	label: string;
	danger?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
				danger ? "text-red-400 hover:bg-red-950/30" : "text-zinc-300 hover:bg-zinc-800"
			}`}
		>
			<span className="text-sm">{icon}</span>
			{label}
		</button>
	);
}
