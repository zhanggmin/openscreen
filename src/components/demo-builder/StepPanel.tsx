import { useScopedT } from "@/contexts/I18nContext";
import type { DemoProject, Step } from "@/lib/demobuilder/types";

interface StepPanelProps {
	project: DemoProject | null;
	selectedStepId: string | null;
	onSelectStep: (stepId: string | null) => void;
	onAddStep: (screenshotId: string) => void;
	onRemoveStep: (stepId: string) => void;
	onReorderSteps: (steps: Step[]) => void;
	onImportScreenshots: () => void;
	onPreviewStep?: (stepId: string) => void;
}

export function StepPanel({
	project,
	selectedStepId,
	onSelectStep,
	onAddStep,
	onRemoveStep,
	onReorderSteps,
	onImportScreenshots,
	onPreviewStep,
}: StepPanelProps) {
	const t = useScopedT("demobuilder");
	if (!project) return null;

	const steps = project.steps;
	const screenshots = project.screenshots;

	function handleMoveUp(stepId: string) {
		const index = steps.findIndex((s) => s.id === stepId);
		if (index <= 0) return;
		const newSteps = [...steps];
		const temp = newSteps[index];
		newSteps[index] = newSteps[index - 1];
		newSteps[index - 1] = temp;
		// Re-assign order values
		const reordered = newSteps.map((s, i) => ({ ...s, order: i }));
		onReorderSteps(reordered);
	}

	function handleMoveDown(stepId: string) {
		const index = steps.findIndex((s) => s.id === stepId);
		if (index === -1 || index >= steps.length - 1) return;
		const newSteps = [...steps];
		const temp = newSteps[index];
		newSteps[index] = newSteps[index + 1];
		newSteps[index + 1] = temp;
		// Re-assign order values
		const reordered = newSteps.map((s, i) => ({ ...s, order: i }));
		onReorderSteps(reordered);
	}

	return (
		<div className="h-full flex flex-col bg-zinc-950 border-r border-zinc-800">
			{/* Panel header */}
			<div className="p-3 border-b border-zinc-800 shrink-0">
				<h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
					{t("stepPanel.title")}
				</h2>
			</div>

			{/* Import screenshots button */}
			<div className="p-2 border-b border-zinc-800 shrink-0">
				<button
					type="button"
					onClick={onImportScreenshots}
					className="w-full px-2 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-900 border border-zinc-700 rounded hover:bg-zinc-800 transition-colors"
				>
					+ {t("stepPanel.importScreenshots")}
				</button>
			</div>

			{/* Step list */}
			<div className="flex-1 overflow-auto">
				{steps.map((step, index) => {
					const isFirst = index === 0;
					const isLast = index === steps.length - 1;
					return (
						<div
							key={step.id}
							className={`w-full text-left px-3 py-2 border-b border-zinc-900 transition-colors ${
								selectedStepId === step.id
									? "bg-zinc-800 border-l-2 border-l-[#34B27B]"
									: "hover:bg-zinc-900"
							}`}
						>
							<button
								type="button"
								onClick={() => onSelectStep(step.id)}
								className="w-full text-left"
							>
								<div className="flex items-center justify-between">
									<span className="text-xs font-medium text-zinc-300 truncate">
										{index + 1}. {step.title}
									</span>
								</div>
								<p className="text-[10px] text-zinc-600 mt-0.5 truncate">{step.description}</p>
							</button>

							{/* Action buttons */}
							<div className="flex items-center gap-1 mt-1.5">
								<button
									type="button"
									onClick={() => handleMoveUp(step.id)}
									disabled={isFirst}
									className="p-1 text-zinc-600 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
									title={t("stepPanel.moveUp")}
								>
									<svg
										width="12"
										height="12"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
									>
										<path d="M18 15l-6-6-6 6" />
									</svg>
								</button>
								<button
									type="button"
									onClick={() => handleMoveDown(step.id)}
									disabled={isLast}
									className="p-1 text-zinc-600 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
									title={t("stepPanel.moveDown")}
								>
									<svg
										width="12"
										height="12"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
									>
										<path d="M6 9l6 6 6-6" />
									</svg>
								</button>
								{onPreviewStep && (
									<button
										type="button"
										onClick={() => onPreviewStep(step.id)}
										className="p-1 text-zinc-600 hover:text-[#34B27B] transition-colors"
										title={t("stepPanel.previewStep")}
									>
										<svg
											width="12"
											height="12"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2"
										>
											<polygon points="5 3 19 12 5 21 5 3" />
										</svg>
									</button>
								)}
								<div className="flex-1" />
								<button
									type="button"
									onClick={() => onRemoveStep(step.id)}
									className="p-1 text-zinc-600 hover:text-red-400 transition-colors"
									title={t("stepPanel.removeStep")}
								>
									<svg
										width="12"
										height="12"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
									>
										<path d="M18 6L6 18M6 6l12 12" />
									</svg>
								</button>
							</div>
						</div>
					);
				})}
			</div>

			{/* Unused screenshots — can be promoted to steps */}
			{screenshots.length > steps.length && (
				<>
					<div className="p-2 border-t border-zinc-800 shrink-0">
						<h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">
							{t("stepPanel.unusedScreenshots")}
						</h3>
					</div>
					<div className="overflow-auto max-h-40">
						{screenshots
							.filter((s) => !steps.some((st) => st.screenshotId === s.id))
							.map((screenshot) => (
								<button
									type="button"
									key={screenshot.id}
									onClick={() => onAddStep(screenshot.id)}
									className="w-full text-left px-3 py-1.5 hover:bg-zinc-900 transition-colors"
								>
									<span className="text-[10px] text-zinc-400 truncate">
										{screenshot.originalName}
									</span>
									<span className="text-[10px] text-[#34B27B] ml-1">
										+ {t("stepPanel.addStep")}
									</span>
								</button>
							))}
					</div>
				</>
			)}
		</div>
	);
}
