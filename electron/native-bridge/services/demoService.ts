import fs from "node:fs/promises";
import path from "node:path";
import { app, BrowserWindow, dialog } from "electron";
import { exportDemoVideo } from "../../../src/lib/demobuilder/remotionExporter";
import {
	DEFAULT_PROJECT_SETTINGS,
	DEMO_PROJECT_VERSION,
	type DemoProject,
} from "../../../src/lib/demobuilder/types";
import type {
	DemoProjectCreateResult,
	DemoProjectDeleteResult,
	DemoProjectListItem,
	DemoProjectListResult,
	DemoProjectLoadResult,
	DemoProjectSaveResult,
	DemoScreenshotDeleteResult,
	DemoScreenshotImportResult,
} from "../../../src/native/contracts";

/** Root directory for all demo projects. */
function getDemosRoot(): string {
	return path.join(app.getPath("userData"), "demos");
}

/** Resolve a project directory from its ID. */
function getProjectDir(projectId: string): string {
	return path.join(getDemosRoot(), projectId);
}

/** Resolve the assets sub-directory inside a project. */
function getAssetsDir(projectId: string): string {
	return path.join(getProjectDir(projectId), "assets");
}

/** Resolve the project.json file path. */
function getProjectFilePath(projectId: string): string {
	return path.join(getProjectDir(projectId), "project.json");
}

/** Read and parse an image file to get its dimensions. */
async function getImageDimensions(imagePath: string): Promise<{ width: number; height: number }> {
	const data = await fs.readFile(imagePath);
	// Parse BMP/PNG/JPEG headers for dimensions without decoding the full image.
	// For a simpler initial approach, use a basic heuristic from file headers.
	const buffer = data;

	// PNG: width at offset 16 (4 bytes BE), height at offset 20
	if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
		return {
			width: buffer.readUInt32BE(16),
			height: buffer.readUInt32BE(20),
		};
	}

	// JPEG: find SOF0 marker (0xFFC0) and read dimensions
	if (buffer[0] === 0xff && buffer[1] === 0xd8) {
		let offset = 2;
		while (offset < buffer.length - 1) {
			if (buffer[offset] !== 0xff) {
				offset++;
				continue;
			}
			const marker = buffer[offset + 1];
			// SOF0 or SOF2
			if (marker === 0xc0 || marker === 0xc2) {
				return {
					height: buffer.readUInt16BE(offset + 5),
					width: buffer.readUInt16BE(offset + 7),
				};
			}
			// Skip to next marker (length excludes the marker bytes)
			const segLen = buffer.readUInt16BE(offset + 2);
			offset += 2 + segLen;
		}
	}

	// Fallback for unsupported formats
	return { width: 0, height: 0 };
}

export interface DemoServiceContext {
	/** Callback to open the DemoBuilder editor window. */
	openDemoEditorWindow: (projectId?: string) => void;
	/** Get the current editor BrowserWindow, if any. */
	getDemoEditorWindow: () => BrowserWindow | null;
}

export class DemoService {
	constructor(private readonly context: DemoServiceContext) {}

	async createProject(name?: string): Promise<DemoProjectCreateResult> {
		try {
			const projectId = crypto.randomUUID();
			const projectDir = getProjectDir(projectId);
			const assetsDir = getAssetsDir(projectId);

			await fs.mkdir(projectDir, { recursive: true });
			await fs.mkdir(assetsDir, { recursive: true });

			const now = Date.now();
			const project: DemoProject = {
				version: DEMO_PROJECT_VERSION,
				id: projectId,
				name: name || "Untitled Demo",
				description: "",
				createdAt: now,
				updatedAt: now,
				screenshots: [],
				steps: [],
				settings: { ...DEFAULT_PROJECT_SETTINGS },
			};

			await fs.writeFile(
				getProjectFilePath(projectId),
				JSON.stringify(project, null, "\t"),
				"utf-8",
			);

			return { success: true, project, projectId };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to create project",
			};
		}
	}

	async listProjects(): Promise<DemoProjectListResult> {
		try {
			const demosRoot = getDemosRoot();
			await fs.mkdir(demosRoot, { recursive: true });

			const entries = await fs.readdir(demosRoot, { withFileTypes: true });
			const projects: DemoProjectListItem[] = [];

			for (const entry of entries) {
				if (!entry.isDirectory()) continue;
				try {
					const content = await fs.readFile(getProjectFilePath(entry.name), "utf-8");
					const project: DemoProject = JSON.parse(content);
					projects.push({
						id: project.id,
						name: project.name,
						updatedAt: project.updatedAt,
						screenshotCount: project.screenshots.length,
						stepCount: project.steps.length,
					});
				} catch {
					// Skip corrupted project directories
				}
			}

			// Sort by most recently updated
			projects.sort((a, b) => b.updatedAt - a.updatedAt);

			return { success: true, projects };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to list projects",
			};
		}
	}

	async loadProject(projectId: string): Promise<DemoProjectLoadResult> {
		try {
			const content = await fs.readFile(getProjectFilePath(projectId), "utf-8");
			const project: DemoProject = JSON.parse(content);
			return { success: true, project };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to load project",
			};
		}
	}

	async saveProject(projectData: unknown): Promise<DemoProjectSaveResult> {
		try {
			const project = projectData as DemoProject;
			if (!project?.id) {
				return { success: false, error: "Invalid project data: missing id" };
			}

			project.updatedAt = Date.now();
			await fs.writeFile(
				getProjectFilePath(project.id),
				JSON.stringify(project, null, "\t"),
				"utf-8",
			);
			return { success: true };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to save project",
			};
		}
	}

	async deleteProject(projectId: string): Promise<DemoProjectDeleteResult> {
		try {
			const projectDir = getProjectDir(projectId);
			await fs.rm(projectDir, { recursive: true, force: true });
			return { success: true };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to delete project",
			};
		}
	}

	async importScreenshot(projectId: string, filePath: string): Promise<DemoScreenshotImportResult> {
		try {
			const assetsDir = getAssetsDir(projectId);
			await fs.mkdir(assetsDir, { recursive: true });

			const fileName = path.basename(filePath);
			const ext = path.extname(fileName).toLowerCase();
			const supportedExts = [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"];
			if (!supportedExts.includes(ext)) {
				return { success: false, error: `Unsupported image format: ${ext}` };
			}

			// Generate unique filename to avoid collisions
			const screenshotId = crypto.randomUUID();
			const destName = `${screenshotId}${ext}`;
			const destPath = path.join(assetsDir, destName);

			// Copy file to project assets
			await fs.copyFile(filePath, destPath);

			// Get dimensions
			const { width, height } = await getImageDimensions(destPath);
			const stat = await fs.stat(destPath);

			return {
				success: true,
				screenshot: {
					id: screenshotId,
					fileName,
					filePath: destPath,
					width,
					height,
					fileSize: stat.size,
				},
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to import screenshot",
			};
		}
	}

	async pickAndImportScreenshots(projectId: string): Promise<DemoScreenshotImportResult[]> {
		const win = this.context.getDemoEditorWindow() ?? BrowserWindow.getFocusedWindow();
		if (!win) return [];

		const result = await dialog.showOpenDialog(win, {
			title: "Import Screenshots",
			properties: ["openFile", "multiSelections"],
			filters: [
				{
					name: "Images",
					extensions: ["png", "jpg", "jpeg", "webp", "bmp", "gif"],
				},
			],
		});

		if (result.canceled || result.filePaths.length === 0) return [];

		const results: DemoScreenshotImportResult[] = [];
		for (const filePath of result.filePaths) {
			results.push(await this.importScreenshot(projectId, filePath));
		}
		return results;
	}

	async deleteScreenshot(
		projectId: string,
		_screenshotId: string,
		fileName: string,
	): Promise<DemoScreenshotDeleteResult> {
		try {
			const assetsDir = getAssetsDir(projectId);
			// Find file by name in assets dir — the file may be named {id}.{ext}
			const entries = await fs.readdir(assetsDir);
			const match = entries.find((entry) => entry.includes(fileName) || entry === fileName);
			if (match) {
				await fs.unlink(path.join(assetsDir, match));
			}
			return { success: true };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to delete screenshot",
			};
		}
	}

	openDemoEditor(projectId?: string): void {
		this.context.openDemoEditorWindow(projectId);
	}

	/**
	 * Server-side export for formats that require main-process resources (PDF, GIF).
	 * Video (MP4) export is handled via Remotion rendering in the main process.
	 */
	async exportProject(
		projectId: string,
		format: "video" | "gif" | "pdf",
	): Promise<{ success: boolean; filePath?: string; error?: string }> {
		try {
			if (format === "video") {
				// Load project from disk
				const content = await fs.readFile(getProjectFilePath(projectId), "utf-8");
				const project: DemoProject = JSON.parse(content);

				// Convert screenshots to data URLs (Remotion headless Chrome can't load file:// URLs)
				const screenshotUrls: Record<string, string> = {};
				for (const screenshot of project.screenshots) {
					try {
						const filePath = screenshot.url.replace(/^file:\/\/\/?/, "");
						const buffer = await fs.readFile(filePath);
						const ext = path.extname(filePath).slice(1).toLowerCase();
						const mime = ext === "jpg" ? "jpeg" : ext || "png";
						screenshotUrls[screenshot.id] =
							`data:image/${mime};base64,${buffer.toString("base64")}`;
					} catch {
						screenshotUrls[screenshot.id] = screenshot.url;
					}
				}

				// Convert wallpaper background to data URL if applicable
				if (project.settings.background?.type === "wallpaper") {
					const wpPath = project.settings.background.value;
					try {
						const resolvedPath = path.join(app.getAppPath(), "public", wpPath.replace(/^\//, ""));
						const buffer = await fs.readFile(resolvedPath);
						const ext = path.extname(resolvedPath).slice(1).toLowerCase();
						const mime = ext === "jpg" ? "jpeg" : ext || "png";
						project.settings.background = {
							type: "wallpaper",
							value: `data:image/${mime};base64,${buffer.toString("base64")}`,
						};
					} catch {
						// wallpaper file not found, keep original path
					}
				}

				// Convert cursor theme PNGs to data URLs (publicDir served as /public/* by Remotion,
				// but getAssetPath returns /cursors/* — so inline them to avoid 404).
				const cursorAssetUrls: Record<string, string> = {};
				const themeId = project.settings.cursorTheme;
				if (themeId && themeId !== "default") {
					// Theme assets live at public/cursors/<themeId>/{arrow,pointer}.png
					const themeDir = path.join(app.getAppPath(), "public", "cursors", themeId);
					for (const variant of ["arrow", "pointer"]) {
						const filePath = path.join(themeDir, `${variant}.png`);
						try {
							const buffer = await fs.readFile(filePath);
							const assetPath = `cursors/${themeId}/${variant}.png`;
							cursorAssetUrls[assetPath] = `data:image/png;base64,${buffer.toString("base64")}`;
						} catch {
							// asset missing, fall through to default cursor
						}
					}
				}

				// 读取点击音效 → data URL
				let clickSoundUrl: string | null = null;
				if (project.settings.sound?.clickSoundEnabled !== false) {
					try {
						const clickPath = path.join(app.getAppPath(), "public", "sounds", "click.mp3");
						const buffer = await fs.readFile(clickPath);
						clickSoundUrl = `data:audio/mpeg;base64,${buffer.toString("base64")}`;
					} catch {
						// click sound missing, skip
					}
				}

				// 读取背景音乐 → data URL（如果配置了）
				let bgmUrl: string | null = null;
				const bgmPath = project.settings.sound?.backgroundMusicPath;
				if (bgmPath) {
					try {
						const resolved = bgmPath.startsWith("/")
							? path.join(app.getAppPath(), "public", bgmPath.replace(/^\//, ""))
							: bgmPath;
						const buffer = await fs.readFile(resolved);
						const ext = path.extname(resolved).slice(1).toLowerCase();
						const mime = ext === "mp3" ? "mpeg" : ext || "mpeg";
						bgmUrl = `data:audio/${mime};base64,${buffer.toString("base64")}`;
					} catch {
						// BGM file not found, skip
					}
				}

				// Ask user for save path
				const win = this.context.getDemoEditorWindow() ?? BrowserWindow.getFocusedWindow();
				const defaultName = `${project.name || "demo"}.mp4`;
				const saveResult = await dialog.showSaveDialog(win!, {
					title: "Export Demo Video",
					defaultPath: defaultName,
					filters: [{ name: "MP4 Video", extensions: ["mp4"] }],
				});
				if (saveResult.canceled || !saveResult.filePath) {
					return { success: false, error: "Export cancelled." };
				}

				await exportDemoVideo({
					project,
					screenshotUrls,
					cursorAssetUrls,
					clickSoundUrl,
					bgmUrl,
					outputPath: saveResult.filePath,
					onProgress: (p) => {
						// Forward progress to renderer for UI update
						const editor = this.context.getDemoEditorWindow();
						if (editor && !editor.isDestroyed()) {
							editor.webContents.send("demo:export-progress", p);
						}
					},
				});

				return { success: true, filePath: saveResult.filePath };
			}

			if (format === "pdf") {
				// PDF export placeholder — would generate a PDF manual from project data
				// TODO: Generate PDF using a PDF generation library (e.g. pdfkit, puppeteer)
				return {
					success: false,
					error: "PDF export not yet implemented.",
				};
			}

			if (format === "gif") {
				// GIF export placeholder — will reuse GifExporter from src/lib/exporter/
				return {
					success: false,
					error: "GIF export not yet implemented.",
				};
			}

			return {
				success: false,
				error: `Unsupported export format: ${format}`,
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Export failed",
			};
		}
	}
}
