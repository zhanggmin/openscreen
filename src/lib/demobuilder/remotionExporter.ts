/**
 * Remotion Exporter — Bundles and renders Demo videos via Remotion.
 *
 * In an Electron environment, the Remotion bundle should be pre-built
 * and shipped with the app to avoid bundling on every export.
 */

import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { getCompositions, renderMedia, selectComposition } from "@remotion/renderer";
import type { DemoProject } from "./types";

export interface RemotionExportOptions {
	project: DemoProject;
	screenshotUrls: Record<string, string>;
	cursorAssetUrls?: Record<string, string>;
	/** 点击音效 data URL（主进程注入） */
	clickSoundUrl?: string | null;
	/** 背景音乐 data URL（主进程注入） */
	bgmUrl?: string | null;
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
	const {
		project,
		screenshotUrls,
		cursorAssetUrls,
		clickSoundUrl,
		bgmUrl,
		outputPath,
		onProgress,
	} = options;

	const rootDir = process.cwd();
	const publicDir = path.join(rootDir, "public");

	console.log("[Remotion] Starting export...");
	console.log("[Remotion] Project root:", rootDir);

	// 1. Bundle Remotion entry point
	const entryPoint = path.join(rootDir, "src/remotion/index.ts");
	console.log("[Remotion] Step 1/3: Bundling...");
	const t0 = Date.now();
	const bundleLocation = await bundle({
		entryPoint,
		enableCaching: true,
		// Serve static assets from public/ (currently unused — assets are inlined as data URLs)
		publicDir: fs.existsSync(publicDir) ? publicDir : null,
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
	console.log(`[Remotion] Bundle done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

	const browserExecutable = findSystemChrome();
	console.log("[Remotion] Chrome:", browserExecutable ?? "(will download headless shell)");

	const inputProps = {
		project,
		screenshotUrls,
		cursorAssetUrls: cursorAssetUrls ?? {},
		clickSoundUrl: clickSoundUrl ?? null,
		bgmUrl: bgmUrl ?? null,
	};

	// 2. Get composition metadata — selectComposition 更高效（仅获取一个 composition）
	console.log("[Remotion] Step 2/3: Selecting composition...");
	const t1 = Date.now();
	let composition: Awaited<ReturnType<typeof selectComposition>>;
	try {
		composition = await selectComposition({
			serveUrl: bundleLocation,
			id: "DemoExport",
			inputProps,
			...(browserExecutable ? { browserExecutable } : {}),
		});
	} catch (err) {
		// Fallback to getCompositions if selectComposition fails
		console.warn("[Remotion] selectComposition failed, falling back to getCompositions:", err);
		const compositions = await getCompositions(bundleLocation, {
			inputProps,
			...(browserExecutable ? { browserExecutable } : {}),
		});
		const found = compositions.find((c) => c.id === "DemoExport");
		if (!found) {
			throw new Error("DemoExport composition not found in Remotion bundle");
		}
		composition = found;
	}
	console.log(`[Remotion] selectComposition done in ${((Date.now() - t1) / 1000).toFixed(1)}s`);

	const totalFrames = composition.durationInFrames;
	console.log(
		`[Remotion] Composition: ${totalFrames} frames @ ${composition.fps}fps, ${composition.width}x${composition.height}`,
	);

	// 3. Render — JPEG 截图 + h264 编码
	console.log("[Remotion] Step 3/3: Rendering...");
	const t2 = Date.now();
	let lastLogTime = Date.now();

	await renderMedia({
		composition,
		serveUrl: bundleLocation,
		codec: "h264",
		outputLocation: outputPath,
		inputProps,
		// JPEG 截图大幅加速（每帧从 PNG ~500ms 降到 JPEG ~80-150ms）
		imageFormat: "jpeg",
		jpegQuality: 80,
		// x264 编码预设：veryfast 在速度与画质之间平衡，避免 ultrafast 导致的块状闪动
		x264Preset: "veryfast",
		// 如有 GPU 则启用硬件加速
		hardwareAcceleration: "if-possible",
		// 减少日志打印减少 IPC 开销
		logLevel: "warn",
		// 默认 30s 太紧，data URL 较大时可能超时
		timeoutInMilliseconds: 60000,
		// Chromium：使用 angle（默认 GPU 后端）
		chromiumOptions: {
			gl: "angle",
			ignoreCertificateErrors: true,
			disableWebSecurity: true,
			headless: true,
		},
		...(browserExecutable ? { browserExecutable } : {}),
		onProgress: ({ progress, renderedFrames }) => {
			onProgress?.({
				progress,
				currentFrame: renderedFrames,
				totalFrames,
			});
			// 每 5 秒输出一次进度日志
			if (Date.now() - lastLogTime > 5000) {
				lastLogTime = Date.now();
				const elapsed = ((Date.now() - t2) / 1000).toFixed(0);
				const fps = renderedFrames / Number(elapsed || 1);
				console.log(
					`[Remotion] Progress: ${renderedFrames}/${totalFrames} frames (${(progress * 100).toFixed(1)}%, ${fps.toFixed(1)} fps, elapsed ${elapsed}s)`,
				);
			}
		},
	});
	console.log(`[Remotion] Render done in ${((Date.now() - t2) / 1000).toFixed(1)}s`);
	console.log(`[Remotion] Export complete: ${outputPath}`);
}
