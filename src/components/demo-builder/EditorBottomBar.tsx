import { useScopedT } from "@/contexts/I18nContext";

interface EditorBottomBarProps {
	stepCount: number;
	totalDurationMs: number;
	onPlay: () => void;
	canUndo?: boolean;
	canRedo?: boolean;
	onUndo?: () => void;
	onRedo?: () => void;
}

export function EditorBottomBar({
	stepCount,
	totalDurationMs,
	onPlay,
	canUndo,
	canRedo,
	onUndo,
	onRedo,
}: EditorBottomBarProps) {
	const t = useScopedT("demobuilder");

	const totalSeconds = Math.round(totalDurationMs / 1000);

	return (
		<div className="h-10 shrink-0 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between px-4">
			{/* Left: Undo / Play / Redo */}
			<div className="flex items-center gap-2">
				{onUndo && (
					<button
						type="button"
						onClick={onUndo}
						disabled={!canUndo}
						className="p-1.5 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
						title={t("bottomBar.undo")}
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
						>
							<path d="M3 7v6h6" />
							<path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13" />
						</svg>
					</button>
				)}
				<button
					type="button"
					onClick={onPlay}
					className="p-1.5 text-zinc-100 hover:text-white bg-[#34B27B] hover:bg-[#2a8f63] rounded transition-colors"
					title={t("bottomBar.play")}
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
						<polygon points="5 3 19 12 5 21 5 3" />
					</svg>
				</button>
				{onRedo && (
					<button
						type="button"
						onClick={onRedo}
						disabled={!canRedo}
						className="p-1.5 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
						title={t("bottomBar.redo")}
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
						>
							<path d="M21 7v6h-6" />
							<path d="M3 17a9 9 0 019-9 9 9 0 016 2.3L21 13" />
						</svg>
					</button>
				)}
			</div>

			{/* Right: Stats */}
			<div className="flex items-center gap-3 text-xs text-zinc-500">
				<span className="flex items-center gap-1">
					<svg
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
					>
						<rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
						<line x1="8" y1="21" x2="16" y2="21" />
						<line x1="12" y1="17" x2="12" y2="21" />
					</svg>
					{t("bottomBar.stepCount", { count: stepCount })}
				</span>
				<span className="flex items-center gap-1">
					<svg
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
					>
						<circle cx="12" cy="12" r="10" />
						<polyline points="12 6 12 12 16 14" />
					</svg>
					{t("bottomBar.duration", { seconds: totalSeconds })}
				</span>
			</div>
		</div>
	);
}
