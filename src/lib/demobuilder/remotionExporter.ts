/**
 * Remotion Exporter — Bundles and renders Demo videos via Remotion.
 *
 * In an Electron environment, the Remotion bundle should be pre-built
 * and shipped with the app to avoid bundling on every export.
 */

import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { getCompositions, renderMedia } from "@remotion/renderer";
import type { DemoProject } from "./types";

export interface RemotionExportOptions {
	project: DemoProject;
	screenshotUrls: Record<string, string>;
	outputPath: string;
	onProgress?: (progress: RemotionExportProgress) => void;
}

export interface RemotionExportProgress {
	/** Overall progress 0-1 */
	progress: number;
	/** Current frame being rendered */
	currentFrame: number;
	/** Total frames */
	totalFrames: number;
}

/**
 * Try to find an existing Chrome/Chromium executable on the system
 * to avoid Remotion downloading its own Chrome Headless Shell.
 */
function findSystemChrome(): string | null {
	if (process.platform === "win32") {
		const candidates = [
			path.join(
				process.env["PROGRAMFILES"] ?? "C:\\Program Files",
				"Google\\Chrome\\Application\\chrome.exe",
			),
			path.join(
				process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)",
				"Google\\Chrome\\Application\\chrome.exe",
			),
			path.join(process.env["LOCALAPPDATA"] ?? "", "Google\\Chrome\\Application\\chrome.exe"),
		];
		for (const p of candidates) {
			if (fs.existsSync(p)) return p;
		}
	} else if (process.platform === "darwin") {
		const macPath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
		if (fs.existsSync(macPath)) return macPath;
	} else {
		for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
			try {
				const { execSync } = require("node:child_process");
				const result = execSync(`which ${name}`, { encoding: "utf-8" }).trim();
				if (result) return result;
			} catch {
				/* not found */
			}
		}
	}
	return null;
}

/**
 * 导出 Demo 项目为 MP4 视频（通过 Remotion 渲染）。
 */
export async function exportDemoVideo(options: RemotionExportOptions): Promise<void> {
	const { project, screenshotUrls, outputPath, onProgress } = options;

	const rootDir = process.cwd();

	// 1. Bundle Remotion entry point
	const entryPoint = path.join(rootDir, "src/remotion/index.ts");
	const bundleLocation = await bundle({
		entryPoint,
		// Enable webpack caching for faster subsequent exports
		enableCaching: true,
		// Configure @/ path alias for Remotion's internal webpack/rspack bundler
		webpackOverride: (config) => ({
			...config,
			resolve: {
				...config.resolve,
				alias: {
					...config.resolve?.alias,
					"@": path.join(rootDir, "src"),
				},
			},
		}),
	});

	const browserExecutable = findSystemChrome();

	// 2. Get composition metadata
	const compositions = await getCompositions(bundleLocation, {
		inputProps: { project, screenshotUrls },
		...(browserExecutable ? { browserExecutable } : {}),
	});

	const composition = compositions.find((c) => c.id === "DemoExport");
	if (!composition) {
		throw new Error("DemoExport composition not found in Remotion bundle");
	}

	const totalFrames = composition.durationInFrames;

	// 3. Render
	await renderMedia({
		composition,
		serveUrl: bundleLocation,
		codec: "h264",
		outputLocation: outputPath,
		inputProps: { project, screenshotUrls },
		...(browserExecutable ? { browserExecutable } : {}),
		onProgress: ({ progress, renderedFrames }) => {
			onProgress?.({
				progress,
				currentFrame: renderedFrames,
				totalFrames,
			});
		},
	});
}
