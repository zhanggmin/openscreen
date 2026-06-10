export const NATIVE_BRIDGE_CHANNEL = "native-bridge:invoke";
export const NATIVE_BRIDGE_VERSION = 1;

export type NativePlatform = "darwin" | "win32" | "linux";
export type CursorProviderKind = "native" | "none";
export type NativeCursorType =
	| "arrow"
	| "text"
	| "pointer"
	| "crosshair"
	| "open-hand"
	| "closed-hand"
	| "resize-ew"
	| "resize-ns"
	| "resize-nesw"
	| "resize-nwse"
	| "move"
	| "not-allowed"
	| "wait"
	| "app-starting"
	| "help"
	| "up-arrow";

export interface CursorTelemetryPoint {
	timeMs: number;
	cx: number;
	cy: number;
}

export interface CursorRecordingSample extends CursorTelemetryPoint {
	assetId?: string | null;
	visible?: boolean;
	cursorType?: NativeCursorType | null;
	interactionType?: "move" | "click" | "mouseup";
}

export interface NativeCursorAsset {
	id: string;
	platform: NativePlatform;
	imageDataUrl: string;
	width: number;
	height: number;
	hotspotX: number;
	hotspotY: number;
	scaleFactor?: number;
	cursorType?: NativeCursorType | null;
}

export interface CursorRecordingData {
	version: number;
	provider: CursorProviderKind;
	samples: CursorRecordingSample[];
	assets: NativeCursorAsset[];
}

export interface CursorCapabilities {
	telemetry: boolean;
	systemAssets: boolean;
	provider: CursorProviderKind;
}

export interface SystemCapabilities {
	bridgeVersion: typeof NATIVE_BRIDGE_VERSION;
	platform: NativePlatform;
	cursor: CursorCapabilities;
	project: {
		currentContext: boolean;
	};
}

export interface ProjectContext {
	currentProjectPath: string | null;
	currentVideoPath: string | null;
}

export interface ProjectPathResult {
	success: boolean;
	path?: string;
	message?: string;
	canceled?: boolean;
	error?: string;
}

export interface ProjectFileResult {
	success: boolean;
	path?: string;
	project?: unknown;
	message?: string;
	canceled?: boolean;
	error?: string;
}

export type NativeBridgeErrorCode =
	| "INVALID_REQUEST"
	| "UNSUPPORTED_ACTION"
	| "NOT_FOUND"
	| "UNAVAILABLE"
	| "INTERNAL_ERROR";

export interface NativeBridgeError {
	code: NativeBridgeErrorCode;
	message: string;
	retryable: boolean;
}

export interface NativeBridgeMeta {
	version: typeof NATIVE_BRIDGE_VERSION;
	requestId: string;
	timestampMs: number;
}

export interface NativeBridgeSuccess<TData> {
	ok: true;
	data: TData;
	meta: NativeBridgeMeta;
}

export interface NativeBridgeFailure {
	ok: false;
	error: NativeBridgeError;
	meta: NativeBridgeMeta;
}

export type NativeBridgeResponse<TData = unknown> =
	| NativeBridgeSuccess<TData>
	| NativeBridgeFailure;

type EmptyPayload = Record<string, never>;

export type NativeBridgeRequest =
	| {
			domain: "system";
			action: "getPlatform";
			payload?: EmptyPayload;
			requestId?: string;
	  }
	| {
			domain: "system";
			action: "getAssetBasePath";
			payload?: EmptyPayload;
			requestId?: string;
	  }
	| {
			domain: "system";
			action: "getCapabilities";
			payload?: EmptyPayload;
			requestId?: string;
	  }
	| {
			domain: "project";
			action: "getCurrentContext";
			payload?: EmptyPayload;
			requestId?: string;
	  }
	| {
			domain: "project";
			action: "saveProjectFile";
			payload: {
				projectData: unknown;
				suggestedName?: string;
				existingProjectPath?: string;
			};
			requestId?: string;
	  }
	| {
			domain: "project";
			action: "loadProjectFile";
			payload?: {
				/** Folder to pre-fill the open dialog with, usually the user's
				 * last-opened project folder from userPreferences. */
				projectFolder?: string;
			};
			requestId?: string;
	  }
	| {
			domain: "project";
			action: "loadCurrentProjectFile";
			payload?: EmptyPayload;
			requestId?: string;
	  }
	| {
			domain: "project";
			action: "loadProjectFileFromPath";
			payload: { path: string };
			requestId?: string;
	  }
	| {
			domain: "project";
			action: "setCurrentVideoPath";
			payload: {
				path: string;
			};
			requestId?: string;
	  }
	| {
			domain: "project";
			action: "getCurrentVideoPath";
			payload?: EmptyPayload;
			requestId?: string;
	  }
	| {
			domain: "project";
			action: "clearCurrentVideoPath";
			payload?: EmptyPayload;
			requestId?: string;
	  }
	| {
			domain: "cursor";
			action: "getCapabilities";
			payload?: EmptyPayload;
			requestId?: string;
	  }
	| {
			domain: "cursor";
			action: "getTelemetry";
			payload?: {
				videoPath?: string;
			};
			requestId?: string;
	  }
	| {
			domain: "cursor";
			action: "getRecordingData";
			payload?: {
				videoPath?: string;
			};
			requestId?: string;
	  }
	| {
			/** DemoBuilder domain — CRUD for demo projects and screenshot assets. */
			domain: "demo";
			action: "createProject";
			payload?: {
				name?: string;
			};
			requestId?: string;
	  }
	| {
			domain: "demo";
			action: "listProjects";
			payload?: EmptyPayload;
			requestId?: string;
	  }
	| {
			domain: "demo";
			action: "loadProject";
			payload: {
				projectId: string;
			};
			requestId?: string;
	  }
	| {
			domain: "demo";
			action: "saveProject";
			payload: {
				projectData: unknown;
			};
			requestId?: string;
	  }
	| {
			domain: "demo";
			action: "deleteProject";
			payload: {
				projectId: string;
			};
			requestId?: string;
	  }
	| {
			/** Import a screenshot file into a demo project's assets directory. */
			domain: "demo";
			action: "importScreenshot";
			payload: {
				projectId: string;
				filePath: string;
			};
			requestId?: string;
	  }
	| {
			/** Open a native file picker for screenshots and import them. */
			domain: "demo";
			action: "pickAndImportScreenshots";
			payload: {
				projectId: string;
			};
			requestId?: string;
	  }
	| {
			/** Delete a screenshot asset file from disk. */
			domain: "demo";
			action: "deleteScreenshot";
			payload: {
				projectId: string;
				screenshotId: string;
				fileName: string;
			};
			requestId?: string;
	  }
	| {
			/** Open the DemoBuilder editor window. */
			domain: "demo";
			action: "openDemoEditor";
			payload?: {
				projectId?: string;
			};
			requestId?: string;
	  }
	| {
			/** Export a demo project to video, gif, or pdf. */
			domain: "demo";
			action: "exportProject";
			payload: {
				projectId: string;
				format: "video" | "gif" | "pdf";
			};
			requestId?: string;
	  };

export type NativeBridgeEventName =
	| "project.contextChanged"
	| "cursor.providerChanged"
	| "cursor.telemetryLoaded"
	| "demo.projectChanged";

// ─── Demo Domain Result Types ────────────────────────────────────────────────

export interface DemoProjectListItem {
	id: string;
	name: string;
	updatedAt: number;
	screenshotCount: number;
	stepCount: number;
}

export interface DemoProjectCreateResult {
	success: boolean;
	project?: unknown;
	projectId?: string;
	error?: string;
}

export interface DemoProjectListResult {
	success: boolean;
	projects?: DemoProjectListItem[];
	error?: string;
}

export interface DemoProjectLoadResult {
	success: boolean;
	project?: unknown;
	error?: string;
}

export interface DemoProjectSaveResult {
	success: boolean;
	error?: string;
}

export interface DemoProjectDeleteResult {
	success: boolean;
	error?: string;
}

export interface DemoScreenshotImportResult {
	success: boolean;
	screenshot?: {
		id: string;
		fileName: string;
		filePath: string;
		width: number;
		height: number;
		fileSize: number;
	};
	error?: string;
}

export interface DemoScreenshotDeleteResult {
	success: boolean;
	error?: string;
}

export interface DemoExportResult {
	success: boolean;
	filePath?: string;
	error?: string;
}

export interface NativeBridgeEvent<TPayload = unknown> {
	name: NativeBridgeEventName;
	payload: TPayload;
	meta: NativeBridgeMeta;
}
