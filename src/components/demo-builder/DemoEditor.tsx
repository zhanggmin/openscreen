import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import {
	type CursorStyle,
	DEFAULT_CURSOR_ANIMATION,
	DEFAULT_PROJECT_SETTINGS,
	DEFAULT_TRANSITION,
	type DemoAppearance,
	type DemoBackground,
	type DemoProject,
	type DemoSound,
	type Hotspot,
	type Screenshot,
	type Step,
} from "@/lib/demobuilder/types";
import { nativeBridgeClient } from "@/native/client";
import { getAspectRatioValue } from "@/utils/aspectRatioUtils";
import { CanvasArea } from "./CanvasArea";
import { DemoDashboard } from "./DemoDashboard";
import { DemoSidebar } from "./DemoSidebar";
import { ExportDialog } from "./ExportDialog";
import { PropertiesPanel } from "./PropertiesPanel";
import { TimelineStrip } from "./TimelineStrip";

// ─── State Reducer ───────────────────────────────────────────────────────────

type DemoAction =
	| { type: "SET_PROJECT"; project: DemoProject }
	| { type: "UPDATE_PROJECT"; updates: Partial<DemoProject> }
	| { type: "ADD_SCREENSHOT"; screenshot: Screenshot }
	| { type: "REMOVE_SCREENSHOT"; screenshotId: string }
	| { type: "ADD_STEP"; step: Step }
	| { type: "REMOVE_STEP"; stepId: string }
	| { type: "UPDATE_STEP"; stepId: string; updates: Partial<Step> }
	| { type: "REORDER_STEPS"; steps: Step[] }
	| { type: "SELECT_STEP"; stepId: string | null }
	| { type: "ADD_HOTSPOT"; stepId: string; hotspot: Hotspot }
	| { type: "UPDATE_HOTSPOT"; stepId: string; hotspotId: string; updates: Partial<Hotspot> }
	| { type: "REMOVE_HOTSPOT"; stepId: string; hotspotId: string }
	| { type: "SELECT_HOTSPOT"; hotspotId: string | null }
	| { type: "UPDATE_SETTINGS"; settings: Partial<DemoProject["settings"]> };

export interface DemoState {
	project: DemoProject | null;
	selectedStepId: string | null;
	selectedHotspotId: string | null;
	isDirty: boolean;
}

/** Ensure old projects get default values for newly-added settings fields. */
function migrateProject(project: DemoProject): DemoProject {
	const defaults = DEFAULT_PROJECT_SETTINGS;
	return {
		...project,
		steps: project.steps.map((step) => ({
			...step,
			subtitleAudioGroups: step.subtitleAudioGroups ?? [],
		})),
		settings: {
			...defaults,
			...project.settings,
			background: project.settings.background ?? defaults.background,
			appearance: project.settings.appearance ?? defaults.appearance,
			sound: project.settings.sound ?? defaults.sound,
			aspectRatio: project.settings.aspectRatio ?? defaults.aspectRatio,
		},
	};
}

function demoReducer(state: DemoState, action: DemoAction): DemoState {
	switch (action.type) {
		case "SET_PROJECT":
			return {
				...state,
				project: migrateProject(action.project),
				isDirty: false,
				selectedStepId: null,
				selectedHotspotId: null,
			};
		case "UPDATE_PROJECT":
			if (!state.project) return state;
			return {
				...state,
				project: { ...state.project, ...action.updates, updatedAt: Date.now() },
				isDirty: true,
			};
		case "ADD_SCREENSHOT":
			if (!state.project) return state;
			return {
				...state,
				project: {
					...state.project,
					screenshots: [...state.project.screenshots, action.screenshot],
					updatedAt: Date.now(),
				},
				isDirty: true,
			};
		case "REMOVE_SCREENSHOT":
			if (!state.project) return state;
			return {
				...state,
				project: {
					...state.project,
					screenshots: state.project.screenshots.filter((s) => s.id !== action.screenshotId),
					updatedAt: Date.now(),
				},
				isDirty: true,
			};
		case "ADD_STEP": {
			if (!state.project) return state;
			// 自动设置步骤编号和顺序
			const nextOrder = state.project.steps.length;
			const numberedStep = {
				...action.step,
				order: nextOrder,
				title: `Step ${nextOrder + 1}`,
			};
			return {
				...state,
				project: {
					...state.project,
					steps: [...state.project.steps, numberedStep],
					updatedAt: Date.now(),
				},
				selectedStepId: numberedStep.id,
				isDirty: true,
			};
		}
		case "REMOVE_STEP":
			if (!state.project) return state;
			return {
				...state,
				project: {
					...state.project,
					steps: state.project.steps.filter((s) => s.id !== action.stepId),
					updatedAt: Date.now(),
				},
				selectedStepId: state.selectedStepId === action.stepId ? null : state.selectedStepId,
				isDirty: true,
			};
		case "UPDATE_STEP":
			if (!state.project) return state;
			return {
				...state,
				project: {
					...state.project,
					steps: state.project.steps.map((s) =>
						s.id === action.stepId ? { ...s, ...action.updates } : s,
					),
					updatedAt: Date.now(),
				},
				isDirty: true,
			};
		case "REORDER_STEPS":
			if (!state.project) return state;
			return {
				...state,
				project: { ...state.project, steps: action.steps, updatedAt: Date.now() },
				isDirty: true,
			};
		case "SELECT_STEP":
			return { ...state, selectedStepId: action.stepId, selectedHotspotId: null };
		case "ADD_HOTSPOT": {
			if (!state.project) return state;
			return {
				...state,
				project: {
					...state.project,
					steps: state.project.steps.map((s) =>
						s.id === action.stepId ? { ...s, hotspots: [...s.hotspots, action.hotspot] } : s,
					),
					updatedAt: Date.now(),
				},
				selectedHotspotId: action.hotspot.id,
				isDirty: true,
			};
		}
		case "UPDATE_HOTSPOT": {
			if (!state.project) return state;
			return {
				...state,
				project: {
					...state.project,
					steps: state.project.steps.map((s) =>
						s.id === action.stepId
							? {
									...s,
									hotspots: s.hotspots.map((h) =>
										h.id === action.hotspotId ? { ...h, ...action.updates } : h,
									),
								}
							: s,
					),
					updatedAt: Date.now(),
				},
				isDirty: true,
			};
		}
		case "REMOVE_HOTSPOT": {
			if (!state.project) return state;
			return {
				...state,
				project: {
					...state.project,
					steps: state.project.steps.map((s) =>
						s.id === action.stepId
							? { ...s, hotspots: s.hotspots.filter((h) => h.id !== action.hotspotId) }
							: s,
					),
					updatedAt: Date.now(),
				},
				selectedHotspotId:
					state.selectedHotspotId === action.hotspotId ? null : state.selectedHotspotId,
				isDirty: true,
			};
		}
		case "SELECT_HOTSPOT":
			return { ...state, selectedHotspotId: action.hotspotId };
		case "UPDATE_SETTINGS":
			if (!state.project) return state;
			return {
				...state,
				project: {
					...state.project,
					settings: { ...state.project.settings, ...action.settings },
					updatedAt: Date.now(),
				},
				isDirty: true,
			};
		default:
			return state;
	}
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DemoEditor() {
	const t = useScopedT("demobuilder");
	const [state, dispatch] = useReducer(demoReducer, {
		project: null,
		selectedStepId: null,
		selectedHotspotId: null,
		isDirty: false,
	});
	const [isLoading, setIsLoading] = useState(true);
	const [isPlaying, setIsPlaying] = useState(false);
	const [showExport, setShowExport] = useState(false);
	const [annotationMode, setAnnotationMode] = useState<"cursor" | "highlight" | "zoom" | null>(
		null,
	);

	const projectIdFromUrl = new URLSearchParams(window.location.search).get("projectId");

	useEffect(() => {
		async function loadInitialProject() {
			if (projectIdFromUrl) {
				const result = await nativeBridgeClient.demo.loadProject(projectIdFromUrl);
				if (result.success && result.project) {
					dispatch({ type: "SET_PROJECT", project: result.project as DemoProject });
				}
			}
			setIsLoading(false);
		}
		loadInitialProject();
	}, [projectIdFromUrl]);

	useEffect(() => {
		if (!state.isDirty || !state.project) return;
		const timer = setTimeout(() => {
			nativeBridgeClient.demo.saveProject(state.project).catch(() => {
				// Silent save failure — will retry on next change
			});
		}, 2000);
		return () => clearTimeout(timer);
	}, [state.isDirty, state.project]);

	const handleCreateProject = useCallback(async (name?: string) => {
		const result = await nativeBridgeClient.demo.createProject(name);
		if (result.success && result.project) {
			dispatch({ type: "SET_PROJECT", project: result.project as DemoProject });
		}
	}, []);

	const handleOpenProject = useCallback(async (projectId: string) => {
		const result = await nativeBridgeClient.demo.loadProject(projectId);
		if (result.success && result.project) {
			dispatch({ type: "SET_PROJECT", project: result.project as DemoProject });
		}
	}, []);

	const handleAddStep = useCallback(async (screenshotId: string) => {
		// 不依赖 state.project 避免闭包过期问题
		const stepId = crypto.randomUUID();
		const newStep: Step = {
			id: stepId,
			screenshotId,
			order: 0, // reducer 会追加到末尾
			title: `Step`,
			description: "",
			hotspots: [],
			cursor: { ...DEFAULT_CURSOR_ANIMATION },
			subtitles: [],
			subtitleAudioGroups: [],
			voice: null,
			transition: { ...DEFAULT_TRANSITION },
		};
		dispatch({ type: "ADD_STEP", step: newStep });
	}, []);

	const handleImportScreenshots = useCallback(async () => {
		if (!state.project) return;
		try {
			const results = await nativeBridgeClient.demo.pickAndImportScreenshots(state.project.id);
			for (const result of results) {
				if (result.success && result.screenshot) {
					const screenshot: Screenshot = {
						id: result.screenshot.id,
						url: result.screenshot.filePath,
						width: result.screenshot.width,
						height: result.screenshot.height,
						order: state.project.screenshots.length,
						originalName: result.screenshot.fileName,
						fileSize: result.screenshot.fileSize,
					};
					dispatch({ type: "ADD_SCREENSHOT", screenshot });
					// 自动添加为步骤
					handleAddStep(screenshot.id);
				}
			}
		} catch (err) {
			console.error("[DemoEditor] 导入截图失败:", err);
		}
	}, [state.project, handleAddStep]);

	const selectedStep = state.project?.steps.find((s) => s.id === state.selectedStepId) ?? null;
	const selectedScreenshot = selectedStep
		? (state.project?.screenshots.find((s) => s.id === selectedStep.screenshotId) ?? null)
		: null;

	// Fallback settings
	const settings = state.project?.settings ?? DEFAULT_PROJECT_SETTINGS;

	// Compute fixed-pixel canvas dimensions from aspect ratio.
	// Base resolution: 1280 on the longer axis (landscape) or 720 on the shorter (portrait).
	const { canvasWidth, canvasHeight } = useMemo(() => {
		const BASE = 1280;
		const ratio = getAspectRatioValue(settings.aspectRatio as never);
		const w = Math.round(ratio >= 1 ? BASE : BASE * ratio);
		const h = Math.round(ratio >= 1 ? BASE / ratio : BASE);
		return { canvasWidth: w, canvasHeight: h };
	}, [settings.aspectRatio]);

	// Stable callbacks for CanvasArea (prevent unnecessary re-renders via React.memo)
	const handleSelectHotspot = useCallback(
		(hotspotId: string | null) => dispatch({ type: "SELECT_HOTSPOT", hotspotId }),
		[],
	);

	const handleAddHotspot = useCallback(
		(hotspot: Hotspot) => {
			if (selectedStep) {
				dispatch({ type: "ADD_HOTSPOT", stepId: selectedStep.id, hotspot });
			}
		},
		[selectedStep],
	);

	const handleUpdateHotspot = useCallback(
		(hotspotId: string, updates: Partial<Hotspot>) => {
			if (selectedStep) {
				dispatch({ type: "UPDATE_HOTSPOT", stepId: selectedStep.id, hotspotId, updates });
			}
		},
		[selectedStep],
	);

	const handleAddCursorMarker = useCallback(
		(position: { x: number; y: number }) => {
			if (!selectedStep) return;
			const hotspot: Hotspot = {
				id: crypto.randomUUID(),
				stepId: selectedStep.id,
				x: position.x,
				y: position.y,
				width: 1.5,
				height: 1.5,
				label: "",
				highlightStyle: "border",
				clickAnimation: "ripple",
				mouseTarget: position,
				jumpToStepId: null,
			};
			dispatch({ type: "ADD_HOTSPOT", stepId: selectedStep.id, hotspot });
		},
		[selectedStep],
	);

	// Stable callbacks for DemoSidebar
	const handleUpdateBackground = useCallback(
		(bg: DemoBackground) => dispatch({ type: "UPDATE_SETTINGS", settings: { background: bg } }),
		[],
	);

	const handleUpdateAppearance = useCallback(
		(appearance: Partial<DemoAppearance>) =>
			dispatch({
				type: "UPDATE_SETTINGS",
				settings: { appearance: { ...settings.appearance, ...appearance } },
			}),
		[settings.appearance],
	);

	const handleUpdateSound = useCallback(
		(sound: Partial<DemoSound>) =>
			dispatch({
				type: "UPDATE_SETTINGS",
				settings: { sound: { ...settings.sound, ...sound } },
			}),
		[settings.sound],
	);

	const handleUpdateAspectRatio = useCallback(
		(ratio: string) => dispatch({ type: "UPDATE_SETTINGS", settings: { aspectRatio: ratio } }),
		[],
	);

	const handleUpdateCursorType = useCallback(
		(cursorType: CursorStyle) =>
			dispatch({ type: "UPDATE_SETTINGS", settings: { defaultCursorType: cursorType } }),
		[],
	);

	const handleUpdateCursorTheme = useCallback(
		(themeId: string) => dispatch({ type: "UPDATE_SETTINGS", settings: { cursorTheme: themeId } }),
		[],
	);

	const handleExport = useCallback((format: "mp4" | "pdf") => {
		if (format === "mp4") setShowExport(true);
	}, []);

	// Stable callbacks for TimelineStrip
	const handleSelectStep = useCallback(
		(stepId: string | null) => dispatch({ type: "SELECT_STEP", stepId }),
		[],
	);

	const handleReorderSteps = useCallback(
		(steps: Step[]) => dispatch({ type: "REORDER_STEPS", steps }),
		[],
	);

	const handleRemoveStep = useCallback(
		(stepId: string) => dispatch({ type: "REMOVE_STEP", stepId }),
		[],
	);

	// Inline playback handlers
	const handlePlayStep = useCallback(() => {
		if (!state.project || state.project.steps.length === 0) return;
		const steps = state.project.steps;
		const currentIdx = state.selectedStepId
			? steps.findIndex((s) => s.id === state.selectedStepId)
			: -1;
		// 如果在最后一步，从第一步开始播放
		if (currentIdx >= steps.length - 1) {
			dispatch({ type: "SELECT_STEP", stepId: steps[0].id });
		} else if (!state.selectedStepId) {
			dispatch({ type: "SELECT_STEP", stepId: steps[0].id });
		}
		setAnnotationMode(null);
		setIsPlaying(true);
	}, [state.project, state.selectedStepId]);

	const handleStopPlayback = useCallback(() => {
		setIsPlaying(false);
	}, []);

	const handleStepPlaybackDone = useCallback(() => {
		if (!state.project) return;
		const steps = state.project.steps;
		const currentIdx = steps.findIndex((s) => s.id === state.selectedStepId);
		if (currentIdx >= 0 && currentIdx < steps.length - 1) {
			// 进入下一步
			dispatch({ type: "SELECT_STEP", stepId: steps[currentIdx + 1].id });
		} else {
			// 最后一步播放完，回到第一步重新开始
			dispatch({ type: "SELECT_STEP", stepId: steps[0].id });
			setIsPlaying(false);
		}
	}, [state.project, state.selectedStepId]);

	// Show dashboard when no project is loaded
	if (!isLoading && !state.project) {
		return (
			<DemoDashboard onCreateProject={handleCreateProject} onOpenProject={handleOpenProject} />
		);
	}

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-screen bg-[#09090b]">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#34B27B]" />
			</div>
		);
	}

	// 选中的热点对象
	const selectedHotspot =
		selectedStep?.hotspots.find((h) => h.id === state.selectedHotspotId) ?? null;

	// 步骤索引
	const stepIndex = state.project?.steps.findIndex((s) => s.id === state.selectedStepId) ?? -1;

	return (
		<div className="h-screen flex flex-col bg-[#09090b] text-zinc-100">
			{/* 顶部标题栏 */}
			<div className="h-11 flex items-center justify-between px-4 border-b border-zinc-800 shrink-0">
				<div className="flex items-center gap-3">
					<h1 className="text-sm font-medium text-zinc-300">
						{state.project?.name ?? t("editor.defaultTitle")}
					</h1>
				</div>
				<div className="flex items-center gap-3">
					{state.isDirty && (
						<span className="text-xs text-zinc-500">{t("editor.unsavedChanges")}</span>
					)}
				</div>
			</div>

			{/* 主工作区：左侧栏 + 中间画布 + 右侧属性面板 */}
			<div className="flex-1 min-h-0 flex">
				{/* 左侧操作菜单 */}
				<DemoSidebar
					settings={settings}
					onUpdateBackground={handleUpdateBackground}
					onUpdateAppearance={handleUpdateAppearance}
					onUpdateSound={handleUpdateSound}
					onUpdateAspectRatio={handleUpdateAspectRatio}
					onUpdateCursorType={handleUpdateCursorType}
					onUpdateCursorTheme={handleUpdateCursorTheme}
					onExport={handleExport}
				/>

				{/* 中间区域：画布 + 时间轴 */}
				<div className="flex-1 min-w-0 flex flex-col p-3 gap-3">
					{/* 画布 + 属性面板 网格布局 */}
					<div
						className="flex-1 min-h-0"
						style={{
							display: "grid",
							gridTemplateColumns: "minmax(0, 1fr) clamp(260px, 18vw, 300px)",
							gap: "12px",
						}}
					>
						{/* 画布列 */}
						<div className="min-h-0 min-w-0">
							<div className="h-full editor-preview-panel overflow-hidden">
								<CanvasArea
									screenshot={selectedScreenshot}
									step={selectedStep}
									selectedHotspotId={state.selectedHotspotId}
									background={settings.background}
									appearance={settings.appearance}
									canvasWidth={canvasWidth}
									canvasHeight={canvasHeight}
									cursorType={settings.defaultCursorType}
									cursorTheme={settings.cursorTheme}
									onSelectHotspot={handleSelectHotspot}
									onAddHotspot={handleAddHotspot}
									onUpdateHotspot={handleUpdateHotspot}
									annotationMode={annotationMode}
									onSetAnnotationMode={setAnnotationMode}
									onAddCursorMarker={handleAddCursorMarker}
									project={state.project!}
									isPlaying={isPlaying}
									onStepPlaybackDone={handleStepPlaybackDone}
									onStopPlayback={handleStopPlayback}
								/>
							</div>
						</div>

						{/* 右侧属性面板 */}
						<div className="min-h-0 overflow-hidden">
							<PropertiesPanel
								step={selectedStep}
								hotspot={selectedHotspot}
								screenshot={selectedScreenshot}
								onUpdateStep={(stepId, updates) =>
									dispatch({ type: "UPDATE_STEP", stepId, updates })
								}
								onUpdateHotspot={(hotspotId, updates) => handleUpdateHotspot(hotspotId, updates)}
								onRemoveHotspot={(hotspotId) => {
									if (selectedStep) {
										dispatch({
											type: "REMOVE_HOTSPOT",
											stepId: selectedStep.id,
											hotspotId,
										});
									}
								}}
								onSelectHotspot={handleSelectHotspot}
							/>
						</div>
					</div>

					{/* 底部时间轴 */}
					{state.project && (
						<TimelineStrip
							steps={state.project.steps}
							screenshots={state.project.screenshots}
							selectedStepId={state.selectedStepId}
							onSelectStep={handleSelectStep}
							onReorderSteps={handleReorderSteps}
							onRemoveStep={handleRemoveStep}
							onImportScreenshots={handleImportScreenshots}
							isPlaying={isPlaying}
							stepIndex={stepIndex >= 0 ? stepIndex : 0}
							stepTitle={selectedStep?.title ?? ""}
							onTogglePlay={isPlaying ? handleStopPlayback : handlePlayStep}
							onStopPlayback={handleStopPlayback}
						/>
					)}
				</div>
			</div>

			{showExport && state.project && (
				<ExportDialog project={state.project} onClose={() => setShowExport(false)} />
			)}
		</div>
	);
}
