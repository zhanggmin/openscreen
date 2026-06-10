import { useEffect, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { nativeBridgeClient } from "@/native/client";
import type { DemoProjectListItem } from "@/native/contracts";

interface DemoDashboardProps {
	onCreateProject: (name?: string) => Promise<void>;
	onOpenProject: (projectId: string) => Promise<void>;
}

export function DemoDashboard({ onCreateProject, onOpenProject }: DemoDashboardProps) {
	const t = useScopedT("demobuilder");
	const [projects, setProjects] = useState<DemoProjectListItem[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		async function loadProjects() {
			const result = await nativeBridgeClient.demo.listProjects();
			if (result.success && result.projects) {
				setProjects(result.projects);
			}
			setIsLoading(false);
		}
		loadProjects();
	}, []);

	return (
		<div className="h-screen flex flex-col bg-[#09090b] text-zinc-100">
			{/* Header */}
			<div className="h-12 flex items-center justify-between px-6 border-b border-zinc-800 shrink-0">
				<h1 className="text-sm font-semibold text-zinc-200">{t("dashboard.title")}</h1>
				<button
					type="button"
					onClick={() => onCreateProject()}
					className="px-3 py-1.5 text-xs font-medium bg-[#34B27B] text-white rounded hover:bg-[#2a8f63] transition-colors"
				>
					+ {t("dashboard.newProject")}
				</button>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-auto p-6">
				{isLoading ? (
					<div className="flex items-center justify-center h-64">
						<div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#34B27B]" />
					</div>
				) : projects.length === 0 ? (
					<div className="flex flex-col items-center justify-center h-64 text-zinc-500">
						<p className="text-sm mb-3">{t("dashboard.emptyTitle")}</p>
						<button
							type="button"
							onClick={() => onCreateProject()}
							className="px-4 py-2 text-sm font-medium bg-[#34B27B] text-white rounded hover:bg-[#2a8f63] transition-colors"
						>
							{t("dashboard.emptyAction")}
						</button>
					</div>
				) : (
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
						{projects.map((project) => (
							<button
								type="button"
								key={project.id}
								onClick={() => onOpenProject(project.id)}
								className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-600 transition-colors text-left"
							>
								<h3 className="text-sm font-medium text-zinc-200 truncate">{project.name}</h3>
								<div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
									<span>{t("dashboard.stepCount", { count: project.stepCount })}</span>
									<span>{t("dashboard.imageCount", { count: project.screenshotCount })}</span>
								</div>
								<p className="mt-1 text-xs text-zinc-600">
									{new Date(project.updatedAt).toLocaleDateString()}
								</p>
							</button>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
