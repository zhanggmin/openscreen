import { useState } from "react";
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
	| { type: "success"; path: string }
	| { type: "error"; message: string };

export function ExportDialog({ project, onClose }: ExportDialogProps) {
	const t = useScopedT("demobuilder");
	const [format, setFormat] = useState<ExportFormat>("video");
	const [isExporting, setIsExporting] = useState(false);
	const [status, setStatus] = useState<ExportStatus>({ type: "idle" });

	async function handleExport() {
		setIsExporting(true);
		setStatus({ type: "idle" });
		try {
			const res = await nativeBridgeClient.demo.exportProject(project.id, format);
			if (res.success && res.filePath) {
				setStatus({ type: "success", path: res.filePath });
			} else {
				setStatus({ type: "error", message: res.error ?? "Unknown error" });
			}
		} catch (err) {
			setStatus({ type: "error", message: err instanceof Error ? err.message : String(err) });
		} finally {
			setIsExporting(false);
		}
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
			<div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl w-96 p-5">
				<h2 className="text-sm font-semibold text-zinc-200 mb-4">{t("export.title")}</h2>

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

				{status.type !== "idle" && (
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
						disabled={isExporting}
						className="px-3 py-1.5 text-xs font-medium bg-[#34B27B] text-white rounded hover:bg-[#2a8f63] disabled:opacity-50 transition-colors"
					>
						{isExporting ? t("export.exporting") : t("export.export")}
					</button>
				</div>
			</div>
		</div>
	);
}
