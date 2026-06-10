import {
	type CursorCapabilities,
	type CursorRecordingData,
	type CursorTelemetryPoint,
	type DemoProjectCreateResult,
	type DemoProjectDeleteResult,
	type DemoProjectListResult,
	type DemoProjectLoadResult,
	type DemoProjectSaveResult,
	type DemoScreenshotDeleteResult,
	type DemoScreenshotImportResult,
	NATIVE_BRIDGE_CHANNEL,
	type NativeBridgeRequest,
	type NativeBridgeResponse,
	type NativePlatform,
	type ProjectContext,
	type ProjectFileResult,
	type ProjectPathResult,
	type SystemCapabilities,
} from "./contracts";

function createRequestId() {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}

	return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getElectronBridge() {
	if (!window.electronAPI?.invokeNativeBridge) {
		throw new Error(
			`Native bridge unavailable. Expected ${NATIVE_BRIDGE_CHANNEL} transport in preload.`,
		);
	}

	return window.electronAPI.invokeNativeBridge;
}

export async function invokeNativeBridge<TData = unknown>(
	request: NativeBridgeRequest,
): Promise<NativeBridgeResponse<TData>> {
	const invoke = getElectronBridge();
	return invoke({
		...request,
		requestId: request.requestId ?? createRequestId(),
	});
}

export async function requireNativeBridgeData<TData>(request: NativeBridgeRequest): Promise<TData> {
	const response = await invokeNativeBridge<TData>(request);
	if (!response.ok) {
		throw new Error(response.error.message);
	}

	return response.data;
}

export const nativeBridgeClient = {
	rawInvoke: invokeNativeBridge,
	system: {
		getPlatform: () =>
			requireNativeBridgeData<NativePlatform>({
				domain: "system",
				action: "getPlatform",
			}),
		getAssetBasePath: () =>
			requireNativeBridgeData<string | null>({
				domain: "system",
				action: "getAssetBasePath",
			}),
		getCapabilities: () =>
			requireNativeBridgeData<SystemCapabilities>({
				domain: "system",
				action: "getCapabilities",
			}),
	},
	project: {
		getCurrentContext: () =>
			requireNativeBridgeData<ProjectContext>({
				domain: "project",
				action: "getCurrentContext",
			}),
		saveProjectFile: (projectData: unknown, suggestedName?: string, existingProjectPath?: string) =>
			requireNativeBridgeData<ProjectFileResult>({
				domain: "project",
				action: "saveProjectFile",
				payload: {
					projectData,
					suggestedName,
					existingProjectPath,
				},
			}),
		loadProjectFile: (projectFolder?: string) =>
			requireNativeBridgeData<ProjectFileResult>({
				domain: "project",
				action: "loadProjectFile",
				payload: { projectFolder },
			}),
		loadCurrentProjectFile: () =>
			requireNativeBridgeData<ProjectFileResult>({
				domain: "project",
				action: "loadCurrentProjectFile",
			}),
		loadProjectFileFromPath: (path: string) =>
			requireNativeBridgeData<ProjectFileResult>({
				domain: "project",
				action: "loadProjectFileFromPath",
				payload: { path },
			}),
		setCurrentVideoPath: (path: string) =>
			requireNativeBridgeData<ProjectPathResult>({
				domain: "project",
				action: "setCurrentVideoPath",
				payload: { path },
			}),
		getCurrentVideoPath: () =>
			requireNativeBridgeData<ProjectPathResult>({
				domain: "project",
				action: "getCurrentVideoPath",
			}),
		clearCurrentVideoPath: () =>
			requireNativeBridgeData<ProjectPathResult>({
				domain: "project",
				action: "clearCurrentVideoPath",
			}),
	},
	cursor: {
		getCapabilities: () =>
			requireNativeBridgeData<CursorCapabilities>({
				domain: "cursor",
				action: "getCapabilities",
			}),
		getRecordingData: (videoPath?: string) =>
			requireNativeBridgeData<CursorRecordingData>({
				domain: "cursor",
				action: "getRecordingData",
				payload: videoPath ? { videoPath } : {},
			}),
		getTelemetry: (videoPath?: string) =>
			requireNativeBridgeData<CursorTelemetryPoint[]>({
				domain: "cursor",
				action: "getTelemetry",
				payload: videoPath ? { videoPath } : {},
			}),
	},
	demo: {
		createProject: (name?: string) =>
			requireNativeBridgeData<DemoProjectCreateResult>({
				domain: "demo",
				action: "createProject",
				payload: name ? { name } : {},
			}),
		listProjects: () =>
			requireNativeBridgeData<DemoProjectListResult>({
				domain: "demo",
				action: "listProjects",
			}),
		loadProject: (projectId: string) =>
			requireNativeBridgeData<DemoProjectLoadResult>({
				domain: "demo",
				action: "loadProject",
				payload: { projectId },
			}),
		saveProject: (projectData: unknown) =>
			requireNativeBridgeData<DemoProjectSaveResult>({
				domain: "demo",
				action: "saveProject",
				payload: { projectData },
			}),
		deleteProject: (projectId: string) =>
			requireNativeBridgeData<DemoProjectDeleteResult>({
				domain: "demo",
				action: "deleteProject",
				payload: { projectId },
			}),
		importScreenshot: (projectId: string, filePath: string) =>
			requireNativeBridgeData<DemoScreenshotImportResult>({
				domain: "demo",
				action: "importScreenshot",
				payload: { projectId, filePath },
			}),
		pickAndImportScreenshots: (projectId: string) =>
			requireNativeBridgeData<DemoScreenshotImportResult[]>({
				domain: "demo",
				action: "pickAndImportScreenshots",
				payload: { projectId },
			}),
		deleteScreenshot: (projectId: string, screenshotId: string, fileName: string) =>
			requireNativeBridgeData<DemoScreenshotDeleteResult>({
				domain: "demo",
				action: "deleteScreenshot",
				payload: { projectId, screenshotId, fileName },
			}),
		openDemoEditor: (projectId?: string) =>
			requireNativeBridgeData<{ opened: boolean }>({
				domain: "demo",
				action: "openDemoEditor",
				payload: projectId ? { projectId } : {},
			}),
		exportProject: (projectId: string, format: "video" | "gif" | "pdf") =>
			requireNativeBridgeData<import("./contracts").DemoExportResult>({
				domain: "demo",
				action: "exportProject",
				payload: { projectId, format },
			}),
	},
};
