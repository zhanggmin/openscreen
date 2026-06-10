/**
 * DemoBuilder Core Type Definitions
 *
 * All demo project content is stored as a unified JSON structure (DemoProject).
 * Every output (interactive tutorial, PDF, MP4) is generated from this single
 * source of truth.  Remotion is only involved at preview/render time — the
 * Editor owns all editing capabilities.
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
}

// ─── Cursor Animation ─────────────────────────────────────────────────────────

export type CursorStyle = "default" | "hand" | "mac" | "windows" | "custom";

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
	startPosition: { x: 10, y: 50 },
	endPosition: { x: 50, y: 50 },
	movementType: "easing",
	easingFunction: "power2.inOut",
	movementDuration: 800,
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
