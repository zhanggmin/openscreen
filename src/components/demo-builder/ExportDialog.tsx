import { useRef, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import {
	DemoVideoExporter,
	resolutionToBitrate,
	resolutionToSize,
} from "@/lib/demobuilder/demoVideoExporter";
import type { DemoProject } from "@/lib/demobuilder/types";
import type { ExportProgress } from "@/lib/exporter/types";
import { nativeBridgeClient } from "@/native/client";

interface ExportDialogProps {
	project: DemoProject;
	onClose: () => void;
}

type ExportFormat = "video" | "gif" | "pdf";
type ExportStatus =
	| { type: "idle" }
	| { type: "exporting"; progress: ExportProgress }
	| { type: "success"; path: string }
	| { type: "error"; message: string };

export function ExportDialog({ project, onClose }: ExportDialogProps) {
	const t = useScopedT("demobuilder");
	const [format, setFormat] = useState<ExportFormat>("video");
	const [status, setStatus] = useState<ExportStatus>({ type: "idle" });
	const exporterRef = useRef<DemoVideoExporter | null>(null);

	const isExporting = status.type === "exporting";

	async function handleExport() {
		if (format === "pdf" || format === "gif") {
			// PDF/GIF: delegated to main process (placeholder)
			setStatus({
				type: "exporting",
				progress: { currentFrame: 0, totalFrames: 1, percentage: 0, estimatedTimeRemaining: 0 },
			});
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

		// Video export: run in renderer via DemoVideoExporter
		const resolution = project.settings.exportSettings.videoResolution;
		const { width, height } = resolutionToSize(resolution);
		const fps = project.settings.exportSettings.videoFps;
		const bitrate = resolutionToBitrate(resolution);

		// Show save dialog first
		const fileName = `${project.name || "demo"}.mp4`;
		const pickResult = await window.electronAPI?.pickExportSavePath(fileName);
		if (!pickResult?.success || !pickResult.path) return; // User cancelled
		const savePath = pickResult.path;

		setStatus({
			type: "exporting",
			progress: { currentFrame: 0, totalFrames: 1, percentage: 0, estimatedTimeRemaining: 0 },
		});

		const exporter = new DemoVideoExporter({
			project,
			width,
			height,
			frameRate: fps,
			bitrate,
			onProgress: (progress) => {
				setStatus({ type: "exporting", progress });
			},
		});
		exporterRef.current = exporter;

		try {
			const result = await exporter.export();
			if (result.success && result.blob) {
				const arrayBuffer = await result.blob.arrayBuffer();
				await window.electronAPI?.writeExportToPath(arrayBuffer, savePath);
				setStatus({ type: "success", path: savePath });
			} else {
				setStatus({ type: "error", message: result.error ?? "Export failed" });
			}
		} catch (err) {
			setStatus({ type: "error", message: err instanceof Error ? err.message : String(err) });
		} finally {
			exporterRef.current = null;
		}
	}

	function handleCancel() {
		if (exporterRef.current) {
			exporterRef.current.cancel();
			exporterRef.current = null;
		}
		setStatus({ type: "idle" });
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
								{Math.round(status.progress.percentage)}%
							</span>
						</div>
						<div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
							<div
								className="h-full bg-[#34B27B] transition-all duration-200"
								style={{ width: `${status.progress.percentage}%` }}
							/>
						</div>
						<div className="flex justify-between mt-1">
							<span className="text-[10px] text-zinc-600">
								{status.progress.currentFrame} / {status.progress.totalFrames} frames
							</span>
							{status.progress.phase && (
								<span className="text-[10px] text-zinc-600">{status.progress.phase}</span>
							)}
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
