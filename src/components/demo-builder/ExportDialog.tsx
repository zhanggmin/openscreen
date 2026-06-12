import { useEffect, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import type { DemoProject } from "@/lib/demobuilder/types";
import { nativeBridgeClient } from "@/native/client";

interface ExportDialogProps {
	project: DemoProject;
	onClose: () => void;
}

type ExportFormat = "video" | "gif" | "pdf";
type ExportStatus =
	| { type: "idle" }
	| { type: "exporting"; progress: number; currentFrame: number; totalFrames: number }
	| { type: "success"; path: string }
	| { type: "error"; message: string };

export function ExportDialog({ project, onClose }: ExportDialogProps) {
	const t = useScopedT("demobuilder");
	const [format, setFormat] = useState<ExportFormat>("video");
	const [status, setStatus] = useState<ExportStatus>({ type: "idle" });

	const isExporting = status.type === "exporting";

	// Subscribe to export progress events from main process
	useEffect(() => {
		if (!isExporting) return;
		const api = window.electronAPI;
		if (!api?.onDemoExportProgress) {
			console.warn("[ExportDialog] electronAPI.onDemoExportProgress not available");
			return;
		}
		console.log("[ExportDialog] Subscribed to demo:export-progress");
		const unsubscribe = api.onDemoExportProgress((payload) => {
			console.log(
				`[ExportDialog] progress=${(payload.progress * 100).toFixed(1)}% (${payload.currentFrame}/${payload.totalFrames})`,
			);
			setStatus((prev) =>
				prev.type === "exporting"
					? {
							type: "exporting",
							progress: payload.progress,
							currentFrame: payload.currentFrame,
							totalFrames: payload.totalFrames,
						}
					: prev,
			);
		});
		return () => {
			console.log("[ExportDialog] Unsubscribed from demo:export-progress");
			unsubscribe?.();
		};
	}, [isExporting]);

	async function handleExport() {
		if (format === "pdf" || format === "gif") {
			// PDF/GIF: delegated to main process (placeholder)
			setStatus({ type: "exporting", progress: 0, currentFrame: 0, totalFrames: 1 });
			try {
				const res = await nativeBridgeClient.demo.exportProject(project.id, format);
				if (res.success && res.filePath) {
					setStatus({ type: "success", path: res.filePath });
				} else {
					setStatus({ type: "error", message: res.error ?? "Unknown error" });
				}
			} catch (err) {
				setStatus({ type: "error", message: err instanceof Error ? err.message : String(err) });
			}
			return;
		}

		setStatus({ type: "exporting", progress: 0, currentFrame: 0, totalFrames: 1 });

		// Delegate video export to main process via IPC
		try {
			const result = await nativeBridgeClient.demo.exportProject(project.id, format);
			if (result.success && result.filePath) {
				setStatus({ type: "success", path: result.filePath });
			} else {
				setStatus({ type: "error", message: result.error ?? "Export failed" });
			}
		} catch (err) {
			setStatus({ type: "error", message: err instanceof Error ? err.message : String(err) });
		}
	}

	function handleCancel() {
		setStatus({ type: "idle" });
	}

	function handleOpenFolder(filePath: string) {
		window.electronAPI?.revealInFolder(filePath);
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
			<div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl w-96 p-5">
				<h2 className="text-sm font-semibold text-zinc-200 mb-4">{t("export.title")}</h2>

				{/* Format selection */}
				{status.type === "idle" && (
					<div className="space-y-3 mb-4">
						<label className="flex items-center gap-2 cursor-pointer">
							<input
								type="radio"
								name="format"
								value="video"
								checked={format === "video"}
								onChange={() => setFormat("video")}
								className="accent-[#34B27B]"
							/>
							<span className="text-xs text-zinc-300">{t("export.formatVideo")}</span>
						</label>
						<label className="flex items-center gap-2 cursor-pointer">
							<input
								type="radio"
								name="format"
								value="gif"
								checked={format === "gif"}
								onChange={() => setFormat("gif")}
								className="accent-[#34B27B]"
							/>
							<span className="text-xs text-zinc-300">{t("export.formatGif")}</span>
						</label>
						<label className="flex items-center gap-2 cursor-pointer">
							<input
								type="radio"
								name="format"
								value="pdf"
								checked={format === "pdf"}
								onChange={() => setFormat("pdf")}
								className="accent-[#34B27B]"
							/>
							<span className="text-xs text-zinc-300">{t("export.formatPdf")}</span>
						</label>
					</div>
				)}

				{/* Progress bar */}
				{status.type === "exporting" && (
					<div className="mb-4">
						<div className="flex items-center justify-between mb-1">
							<span className="text-[11px] text-zinc-400">{t("export.exporting")}</span>
							<span className="text-[11px] font-mono text-zinc-500">
								{Math.round(status.progress * 100)}%
							</span>
						</div>
						<div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
							<div
								className="h-full bg-[#34B27B] transition-all duration-200"
								style={{ width: `${status.progress * 100}%` }}
							/>
						</div>
						<div className="flex justify-between mt-1">
							<span className="text-[10px] text-zinc-600">
								{status.currentFrame} / {status.totalFrames} frames
							</span>
						</div>
					</div>
				)}

				{/* Status message */}
				{(status.type === "success" || status.type === "error") && (
					<div
						className={`text-[11px] mb-3 p-2 rounded ${
							status.type === "success"
								? "bg-green-950/40 text-green-400 border border-green-900/50"
								: "bg-red-950/40 text-red-400 border border-red-900/50"
						}`}
					>
						{status.type === "success"
							? t("export.resultSuccess", { path: status.path })
							: t("export.resultError", { error: status.message })}
					</div>
				)}

				<div className="flex justify-end gap-2">
					{isExporting ? (
						<button
							type="button"
							onClick={handleCancel}
							className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
						>
							{t("export.cancel")}
						</button>
					) : status.type === "success" ? (
						<>
							<button
								type="button"
								onClick={onClose}
								className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
							>
								{t("export.cancel")}
							</button>
							<button
								type="button"
								onClick={() => handleOpenFolder(status.path)}
								className="px-3 py-1.5 text-xs font-medium bg-[#34B27B] text-white rounded hover:bg-[#2a8f63] transition-colors"
							>
								{t("export.openFolder")}
							</button>
						</>
					) : (
						<>
							<button
								type="button"
								onClick={onClose}
								className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
							>
								{t("export.cancel")}
							</button>
							<button
								type="button"
								onClick={handleExport}
								className="px-3 py-1.5 text-xs font-medium bg-[#34B27B] text-white rounded hover:bg-[#2a8f63] transition-colors"
							>
								{t("export.export")}
							</button>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
