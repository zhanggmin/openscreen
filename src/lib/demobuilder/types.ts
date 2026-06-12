/**
 * DemoBuilder Core Type Definitions
 *
 * All demo project content is stored as a unified JSON structure (DemoProject).
 * Every output (interactive tutorial, PDF, MP4) is generated from this single
 * source of truth.  The Editor owns all editing capabilities; video export is
 * handled by DemoVideoExporter (PixiJS + WebCodecs pipeline).
 *
 * Coordinate system: positions and sizes are stored as percentages (0–100)
 * relative to the screenshot dimensions, making them resolution-independent.
 */

// ─── Versioning ──────────────────────────────────────────────────────────────

/** Current DemoProject schema version — bump when introducing breaking changes. */
export const DEMO_PROJECT_VERSION = 1;

// ─── Shared primitives ───────────────────────────────────────────────────────

/** A point in percentage-based coordinate space (0–100). */
export interface Point {
	x: number;
	y: number;
}

// ─── Screenshot ───────────────────────────────────────────────────────────────

export interface Screenshot {
	id: string;
	/** Local file path or blob URL for the image. */
	url: string;
	/** Original pixel width of the image. */
	width: number;
	/** Original pixel height of the image. */
	height: number;
	/** Sort index within the project's screenshot list. */
	order: number;
	/** Original file name from the user's upload. */
	originalName: string;
	/** File size in bytes. */
	fileSize: number;
}

// ─── Hotspot ──────────────────────────────────────────────────────────────────

export type HighlightStyle = "border" | "background" | "pulse";

/** 高亮区域形状：矩形、圆形、椭圆 */
export type HighlightShape = "rect" | "circle" | "ellipse";

export type ClickAnimation = "ripple" | "zoom" | "flash" | "none";

/** 缩放倍率级别（与视频编辑器对齐） */
export type ZoomLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** 缩放倍率 → 实际 scale 值映射 */
export const ZOOM_LEVEL_SCALES: Record<ZoomLevel, number> = {
	1: 1.25,
	2: 1.5,
	3: 1.8,
	4: 2.2,
	5: 3.5,
	6: 5.0,
};

/** 缩放级别选项（UI 展示用） */
export const ZOOM_LEVEL_OPTIONS: Array<{ level: ZoomLevel; label: string; scale: number }> = [
	{ level: 1, label: "1.25×", scale: 1.25 },
	{ level: 2, label: "1.5×", scale: 1.5 },
	{ level: 3, label: "1.8×", scale: 1.8 },
	{ level: 4, label: "2.2×", scale: 2.2 },
	{ level: 5, label: "3.5×", scale: 3.5 },
	{ level: 6, label: "5×", scale: 5.0 },
];

export const DEFAULT_ZOOM_LEVEL: ZoomLevel = 3;

export interface Hotspot {
	id: string;
	/** The step this hotspot belongs to. */
	stepId: string;
	/** X position as percentage of the screenshot width (0–100). */
	x: number;
	/** Y position as percentage of the screenshot height (0–100). */
	y: number;
	/** Width as percentage of the screenshot width (0–100). */
	width: number;
	/** Height as percentage of the screenshot height (0–100). */
	height: number;
	/** User-facing label / description for the hotspot. */
	label: string;
	/** Visual highlight style when the hotspot is active. */
	highlightStyle: HighlightStyle;
	/** Animation played when the hotspot is clicked. */
	clickAnimation: ClickAnimation;
	/** Position the cursor moves to before clicking; null = center of hotspot. */
	mouseTarget: Point | null;
	/** 步骤跳转目标；null 表示继续下一步。 */
	jumpToStepId: string | null;
	/** 浮动说明文本，播放时鼠标点击后显示在光标上方。 */
	tooltip?: string;
	/** 高亮区域自定义颜色（十六进制），为空时使用默认绿色。 */
	highlightColor?: string;
	/** 高亮区域形状：矩形、圆形、椭圆。默认矩形。 */
	shape?: HighlightShape;
	/** 高亮显示时长（毫秒），默认 1000。播放时高亮显示后自动消失。 */
	highlightDuration?: number;
	/**
	 * 缩放倍率级别（1-6，对应 ZOOM_LEVEL_SCALES）。
	 * 非空表示该热点为缩放区域。播放时视图会放大到该区域。
	 */
	zoomLevel?: ZoomLevel;
}

/** 判断热点是否为鼠标标注（小圆点，有点击动画）。排除缩放区域。 */
export function isCursorMarker(hotspot: Hotspot): boolean {
	return (
		hotspot.zoomLevel == null &&
		hotspot.width <= 3 &&
		hotspot.height <= 3 &&
		hotspot.clickAnimation !== "none"
	);
}

/** 判断热点是否为高亮区域（非缩放、非光标标注）。 */
export function isHighlightArea(hotspot: Hotspot): boolean {
	return hotspot.zoomLevel == null && !isCursorMarker(hotspot);
}

/** 判断热点是否为缩放区域。 */
export function isZoomRegion(hotspot: Hotspot): boolean {
	return hotspot.zoomLevel != null;
}

// ─── Cursor Animation ─────────────────────────────────────────────────────────

export type CursorStyle =
	| "default"
	| "hand"
	| "mac"
	| "windows"
	| "custom"
	| "cross"
	| "text"
	| "open-hand";

export type MovementType = "linear" | "easing" | "bezier";

export type ClickEffect = "ripple" | "zoom" | "flash" | "none";

export interface BezierControlPoints {
	cp1: Point;
	cp2: Point;
}

export interface CursorAnimation {
	/** Cursor visual style. */
	type: CursorStyle;
	/** URL to a custom PNG cursor image (only when type is "custom"). */
	customIconUrl?: string;
	/** Starting position as percentage of the screenshot (0–100). */
	startPosition: Point;
	/** Ending position as percentage of the screenshot (0–100). */
	endPosition: Point;
	/** How the cursor moves from start to end. */
	movementType: MovementType;
	/** GSAP easing function name, e.g. "power2.inOut" (only when movementType is "easing"). */
	easingFunction?: string;
	/** Bezier control points (only when movementType is "bezier"). */
	bezierControlPoints?: BezierControlPoints;
	/** Duration of the cursor movement in milliseconds. */
	movementDuration: number;
	/** Visual effect played when the cursor "clicks". */
	clickEffect: ClickEffect;
	/** Whether to play a click sound effect. */
	clickSound: boolean;
	/** Delay after the cursor reaches the target before the click occurs (ms). */
	delayBeforeClick: number;
}

// ─── Transition ───────────────────────────────────────────────────────────────

export type TransitionType =
	| "fade"
	| "slide-left"
	| "slide-right"
	| "slide-up"
	| "zoom"
	| "dissolve"
	| "wipe"
	| "none";

export interface Transition {
	type: TransitionType;
	/** Duration of the transition in milliseconds. */
	duration: number;
}

// ─── Subtitle ─────────────────────────────────────────────────────────────────

export type SubtitlePosition = "top" | "center" | "bottom";

export interface SubtitleStyle {
	color: string;
	backgroundColor: string;
	opacity: number;
	outlineColor?: string;
	outlineWidth?: number;
}

/** TTS 语音数据，附加在字幕条目上 */
export interface SubtitleAudio {
	/** 音频文件路径或 blob URL */
	url: string;
	/** 语音时长（毫秒） */
	duration: number;
	/** TTS 服务商 */
	provider: VoiceProvider;
	/** 使用的音色 ID */
	voiceId: string;
}

/** 字幕分组语音：多条字幕共享同一段 TTS 音频 */
export interface SubtitleAudioGroup {
	id: string;
	/** 拼接后的完整文本（用于 TTS 合成的原始文本） */
	text: string;
	/** 合成的音频 */
	audio: SubtitleAudio;
}

export interface Subtitle {
	id: string;
	/** Subtitle text content. */
	text: string;
	/** Start time relative to the step beginning, in milliseconds. */
	start: number;
	/** End time relative to the step beginning, in milliseconds. */
	end: number;
	fontFamily: string;
	fontSize: number;
	/** Vertical position of the subtitle on the canvas. */
	position: SubtitlePosition;
	style: SubtitleStyle;
	/**
	 * 绑定的热点 ID（可选）。
	 * 播放时字幕显示期间同步触发对应 hotspot 的动作（高亮/光标/点击）。
	 */
	hotspotId?: string | null;
	/**
	 * TTS 语音数据（可选）。
	 * 有语音时 end - start 应等于 audio.duration，字幕时长跟随语音。
	 */
	audio?: SubtitleAudio | null;
	/**
	 * 所属分组 ID（可选）。
	 * 同一组字幕共享一段 TTS 音频（完整句子），系统按字符比例分配时长。
	 */
	groupId?: string | null;
}

// ─── Voice (TTS) ──────────────────────────────────────────────────────────────

export type VoiceProvider = "aliyun" | "openai" | "local";

export interface Voice {
	id: string;
	/** The text that was synthesized. */
	text: string;
	/** Path to the generated audio file. */
	audioUrl: string;
	/** Duration of the generated audio in milliseconds. */
	duration: number;
	/** TTS provider used for generation. */
	provider: VoiceProvider;
	/** Voice/timbre identifier within the provider. */
	voiceId: string;
	/** Playback speed multiplier (1.0 = normal). */
	speed: number;
}

// ─── Step ─────────────────────────────────────────────────────────────────────

export interface Step {
	id: string;
	/** Reference to the Screenshot displayed in this step. */
	screenshotId: string;
	/** Sort index within the project's step list. */
	order: number;
	/** Short title for the step (shown in step list / tutorial navigation). */
	title: string;
	/** Detailed description / instructions for this step. */
	description: string;
	/** Hotspot annotations on this step's screenshot. */
	hotspots: Hotspot[];
	/** Cursor animation configuration for this step. */
	cursor: CursorAnimation;
	/** Subtitle overlays for this step. */
	subtitles: Subtitle[];
	/** 字幕分组语音数据（多条字幕共享一段 TTS 音频） */
	subtitleAudioGroups: SubtitleAudioGroup[];
	/** AI-generated voice narration for this step. */
	voice: Voice | null;
	/** Transition effect when moving to the next step. */
	transition: Transition;
}

// ─── Export Settings ──────────────────────────────────────────────────────────

export type VideoResolution = "1080p" | "2k" | "4k";

export type VideoFormat = "mp4" | "webm";

export interface ExportSettings {
	videoResolution: VideoResolution;
	videoFormat: VideoFormat;
	videoFps: number;
	/** PDF template identifier (for future template system). */
	pdfTemplate: string;
}

// ─── Project Settings ─────────────────────────────────────────────────────────

/** Background configuration for the canvas. */
export type DemoBackgroundType = "color" | "gradient" | "wallpaper";

export interface DemoBackground {
	type: DemoBackgroundType;
	/** CSS color, gradient string, or wallpaper path. */
	value: string;
}

/** Appearance settings for the screenshot in the canvas. */
export interface DemoAppearance {
	/** Blur intensity behind the screenshot (0–1, 0 = off). */
	blurIntensity: number;
	/** Border radius of the screenshot in pixels. */
	borderRadius: number;
	/** Padding around the screenshot in pixels. */
	padding: number;
	/** Shadow intensity (0–1). */
	shadowIntensity: number;
}

/** Sound settings for the project. */
export interface DemoSound {
	/** Play click sound on cursor clicks. */
	clickSoundEnabled: boolean;
	/** Background music file path or null for none. */
	backgroundMusicPath: string | null;
	/** Background music volume (0–1). */
	backgroundMusicVolume: number;
}

export interface ProjectSettings {
	/** Default canvas width in pixels. */
	canvasWidth: number;
	/** Default canvas height in pixels. */
	canvasHeight: number;
	/** Canvas aspect ratio (e.g. "16:9", "9:16", "1:1", "4:3"). */
	aspectRatio: string;
	/** Canvas background. */
	background: DemoBackground;
	/** Screenshot appearance effects. */
	appearance: DemoAppearance;
	/** Sound settings. */
	sound: DemoSound;
	/** Default cursor visual style for new steps. */
	defaultCursorType: CursorStyle;
	/**
	 * 光标主题 ID（对应 cursorThemes.ts 中的主题）。
	 * 设置后，播放时移动状态显示 arrow 图片，点击状态显示 pointer 图片。
	 * 未设置或为 "default" 时使用内置 SVG 光标。
	 */
	cursorTheme?: string;
	/** Default transition between steps. */
	defaultTransition: Transition;
	/** Default hotspot highlight style. */
	defaultHighlightStyle: HighlightStyle;
	exportSettings: ExportSettings;
}

// ─── DemoProject (root) ───────────────────────────────────────────────────────

export interface DemoProject {
	/** Schema version for forward-compatible migration. */
	version: typeof DEMO_PROJECT_VERSION;
	id: string;
	name: string;
	description: string;
	createdAt: number;
	updatedAt: number;
	/** All screenshots available in this project. */
	screenshots: Screenshot[];
	/** Ordered list of tutorial steps. */
	steps: Step[];
	/** Project-level defaults and export configuration. */
	settings: ProjectSettings;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

/** Sensible defaults for a new DemoProject. */
export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
	canvasWidth: 1280,
	canvasHeight: 720,
	aspectRatio: "16:9",
	background: { type: "wallpaper", value: "/wallpapers/wallpaper1.jpg" },
	appearance: {
		blurIntensity: 0,
		borderRadius: 12,
		padding: 40,
		shadowIntensity: 0.3,
	},
	sound: {
		clickSoundEnabled: true,
		backgroundMusicPath: null,
		backgroundMusicVolume: 0.5,
	},
	defaultCursorType: "default",
	cursorTheme: "default",
	defaultTransition: { type: "fade", duration: 500 },
	defaultHighlightStyle: "border",
	exportSettings: {
		videoResolution: "1080p",
		videoFormat: "mp4",
		videoFps: 30,
		pdfTemplate: "default",
	},
};

/** Default cursor animation for a new step. */
export const DEFAULT_CURSOR_ANIMATION: CursorAnimation = {
	type: "default",
	startPosition: { x: 50, y: 50 },
	endPosition: { x: 50, y: 50 },
	movementType: "easing",
	easingFunction: "power2.inOut",
	movementDuration: 500,
	clickEffect: "ripple",
	clickSound: true,
	delayBeforeClick: 200,
};

/** Default transition for a new step. */
export const DEFAULT_TRANSITION: Transition = {
	type: "fade",
	duration: 500,
};

/** Default subtitle style. */
export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
	color: "#ffffff",
	backgroundColor: "rgba(0, 0, 0, 0.7)",
	opacity: 1,
	outlineColor: "#000000",
	outlineWidth: 0,
};

/** 创建一条带默认值的空字幕 */
export function createDefaultSubtitle(startMs = 0, durationMs = 3000): Subtitle {
	return {
		id: crypto.randomUUID(),
		text: "",
		start: startMs,
		end: startMs + durationMs,
		fontFamily: "system-ui",
		fontSize: 16,
		position: "bottom",
		style: { ...DEFAULT_SUBTITLE_STYLE },
		hotspotId: null,
		audio: null,
		groupId: null,
	};
}
