/**
 * 图文编辑器 — 右侧属性面板
 *
 * 对齐视频编辑器的 editor-inspector-shell 暗色质感。
 * 根据选中元素类型显示不同内容：
 *   - 无选中 → 步骤属性 + 元素列表
 *   - 鼠标标注 → 标签、浮动说明、动画、删除
 *   - 高亮区域 → 标签、样式、颜色、删除
 */

import {
	Circle,
	Link2,
	Loader2,
	MousePointerClick,
	Play,
	Plus,
	Square,
	Trash2,
	Unlink,
	Volume2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import type { Hotspot, Screenshot, Step, Subtitle } from "@/lib/demobuilder/types";
import {
	createDefaultSubtitle,
	isCursorMarker,
	isZoomRegion,
	ZOOM_LEVEL_OPTIONS,
	ZOOM_LEVEL_SCALES,
} from "@/lib/demobuilder/types";
import { cn } from "@/lib/utils";
import { useSubtitleTTS } from "./useSubtitleTTS";

// ─── 高亮颜色预设 ───────────────────────────────────────────────────────────
const HIGHLIGHT_COLORS = [
	"#34B27B",
	"#FF6B00",
	"#E91E63",
	"#00BCD4",
	"#9B59B6",
	"#FFD700",
	"#FF0000",
	"#4facfe",
	"#f78ca0",
	"#a18cd1",
];

interface PropertiesPanelProps {
	step: Step | null;
	hotspot: Hotspot | null;
	screenshot: Screenshot | null;
	onUpdateStep: (stepId: string, updates: Partial<Step>) => void;
	onUpdateHotspot: (hotspotId: string, updates: Partial<Hotspot>) => void;
	onRemoveHotspot: (hotspotId: string) => void;
	onSelectHotspot: (hotspotId: string | null) => void;
}

// ─── 主组件 ─────────────────────────────────────────────────────────────────

export function PropertiesPanel({
	step,
	hotspot,
	screenshot,
	onUpdateStep,
	onUpdateHotspot,
	onRemoveHotspot,
	onSelectHotspot,
}: PropertiesPanelProps) {
	const t = useScopedT("demobuilder");

	// 空状态：没有选中步骤
	if (!step) {
		return (
			<div className="editor-inspector-shell h-full flex items-center justify-center border-l border-white/[0.07]">
				<p className="text-xs text-slate-500">{t("properties.selectStepHint")}</p>
			</div>
		);
	}

	return (
		<div className="editor-inspector-shell h-full overflow-y-auto custom-scrollbar border-l border-white/[0.07] bg-[#0a0b0d]">
			{/* 根据选中元素显示不同面板 */}
			{hotspot ? (
				isZoomRegion(hotspot) ? (
					<ZoomRegionPanel
						hotspot={hotspot}
						onUpdateHotspot={onUpdateHotspot}
						onRemoveHotspot={onRemoveHotspot}
					/>
				) : isCursorMarker(hotspot) ? (
					<CursorMarkerPanel
						hotspot={hotspot}
						onUpdateHotspot={onUpdateHotspot}
						onRemoveHotspot={onRemoveHotspot}
					/>
				) : (
					<HighlightAreaPanel
						hotspot={hotspot}
						onUpdateHotspot={onUpdateHotspot}
						onRemoveHotspot={onRemoveHotspot}
					/>
				)
			) : (
				<StepInfoPanel
					step={step}
					screenshot={screenshot}
					onUpdateStep={onUpdateStep}
					onSelectHotspot={onSelectHotspot}
				/>
			)}
		</div>
	);
}

// ─── 步骤属性面板（未选中任何元素时） ──────────────────────────────────────────

function StepInfoPanel({
	step,
	screenshot,
	onUpdateStep,
	onSelectHotspot,
}: {
	step: Step;
	screenshot: Screenshot | null;
	onUpdateStep: (stepId: string, updates: Partial<Step>) => void;
	onSelectHotspot: (hotspotId: string | null) => void;
}) {
	const t = useScopedT("demobuilder");
	const cursorMarkers = step.hotspots.filter(isCursorMarker);
	const zoomRegions = step.hotspots.filter(isZoomRegion);
	const highlights = step.hotspots.filter((h) => !isCursorMarker(h) && !isZoomRegion(h));

	return (
		<>
			{/* 步骤信息 */}
			<Section title={t("properties.stepSection")}>
				<Field label={t("properties.title")}>
					<input
						type="text"
						value={step.title}
						onChange={(e) => onUpdateStep(step.id, { title: e.target.value })}
						className="input-field"
					/>
				</Field>
				<Field label={t("properties.description")}>
					<textarea
						value={step.description}
						onChange={(e) => onUpdateStep(step.id, { description: e.target.value })}
						rows={2}
						className="input-field resize-none"
					/>
				</Field>
				{screenshot && (
					<p className="text-[10px] text-slate-600 mt-1">
						{screenshot.originalName} ({screenshot.width}×{screenshot.height})
					</p>
				)}
			</Section>

			{/* 光标动画设置 */}
			<Section title={t("properties.cursorSection")}>
				<Field label={t("properties.cursorStyle")}>
					<select
						value={step.cursor.type}
						onChange={(e) =>
							onUpdateStep(step.id, {
								cursor: { ...step.cursor, type: e.target.value as Step["cursor"]["type"] },
							})
						}
						className="input-field"
					>
						<option value="default">{t("properties.cursorStyleOptions.default")}</option>
						<option value="hand">{t("properties.cursorStyleOptions.hand")}</option>
						<option value="mac">{t("properties.cursorStyleOptions.mac")}</option>
						<option value="windows">{t("properties.cursorStyleOptions.windows")}</option>
						<option value="custom">{t("properties.cursorStyleOptions.custom")}</option>
					</select>
				</Field>
				<Field label={t("properties.clickEffect")}>
					<select
						value={step.cursor.clickEffect}
						onChange={(e) =>
							onUpdateStep(step.id, {
								cursor: {
									...step.cursor,
									clickEffect: e.target.value as Step["cursor"]["clickEffect"],
								},
							})
						}
						className="input-field"
					>
						<option value="none">{t("properties.clickEffectOptions.none")}</option>
						<option value="ripple">{t("properties.clickEffectOptions.ripple")}</option>
						<option value="zoom">{t("properties.clickEffectOptions.zoom")}</option>
						<option value="flash">{t("properties.clickEffectOptions.flash")}</option>
					</select>
				</Field>
			</Section>

			{/* 字幕 */}
			<SubtitleSection step={step} onUpdateStep={onUpdateStep} />

			{/* 转场特效设置 */}
			<Section title={t("properties.transitionSection")}>
				<Field label={t("properties.transitionType")}>
					<div className="grid grid-cols-4 gap-1.5">
						{(
							[
								"none",
								"fade",
								"slide-left",
								"slide-right",
								"slide-up",
								"zoom",
								"dissolve",
								"wipe",
							] as const
						).map((type) => (
							<button
								key={type}
								type="button"
								onClick={() =>
									onUpdateStep(step.id, {
										transition: { ...step.transition, type },
									})
								}
								className={cn(
									"py-1.5 text-[10px] font-semibold rounded-lg border transition-all duration-150",
									step.transition.type === type
										? "border-[#34B27B]/70 bg-[#34B27B]/15 text-[#34B27B]"
										: "border-white/[0.06] bg-white/[0.035] text-slate-400 hover:bg-white/[0.075] hover:text-slate-200",
								)}
							>
								{t(`properties.transitionTypeOptions.${type}`)}
							</button>
						))}
					</div>
				</Field>
				{step.transition.type !== "none" && (
					<Field label={t("properties.transitionDuration")}>
						<input
							type="number"
							min={100}
							max={2000}
							step={100}
							value={step.transition.duration}
							onChange={(e) =>
								onUpdateStep(step.id, {
									transition: {
										...step.transition,
										duration: Math.max(100, Math.min(2000, Number.parseInt(e.target.value) || 500)),
									},
								})
							}
							className="input-field"
						/>
					</Field>
				)}
			</Section>

			{/* 元素列表 */}
			<Section title={t("properties.elementList")}>
				{step.hotspots.length === 0 && (
					<p className="text-[10px] text-slate-600">{t("properties.noElements")}</p>
				)}
				{/* 鼠标标注列表 */}
				{cursorMarkers.map((h, idx) => (
					<button
						key={h.id}
						type="button"
						onClick={() => onSelectHotspot(h.id)}
						className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border border-white/[0.06] bg-white/[0.025] hover:bg-white/[0.06] hover:border-white/10 transition-all text-left"
					>
						<MousePointerClick className="w-3.5 h-3.5 text-[#34B27B] shrink-0" />
						<div className="min-w-0 flex-1">
							<p className="text-[11px] text-slate-300 truncate">
								{h.label || `${t("properties.cursorMarkerTitle")} ${idx + 1}`}
							</p>
							<p className="text-[9px] text-slate-600">
								X: {h.x.toFixed(1)}% Y: {h.y.toFixed(1)}%
							</p>
						</div>
					</button>
				))}
				{/* 高亮区域列表 */}
				{highlights.map((h, idx) => (
					<button
						key={h.id}
						type="button"
						onClick={() => onSelectHotspot(h.id)}
						className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border border-white/[0.06] bg-white/[0.025] hover:bg-white/[0.06] hover:border-white/10 transition-all text-left"
					>
						<Square
							className="w-3.5 h-3.5 shrink-0"
							style={{ color: h.highlightColor || "#34B27B" }}
						/>
						<div className="min-w-0 flex-1">
							<p className="text-[11px] text-slate-300 truncate">
								{h.label || `${t("properties.highlightAreaTitle")} ${idx + 1}`}
							</p>
							<p className="text-[9px] text-slate-600">
								{h.width.toFixed(1)}% × {h.height.toFixed(1)}%
							</p>
						</div>
					</button>
				))}
				{/* 缩放区域列表 */}
				{zoomRegions.map((h, idx) => (
					<button
						key={h.id}
						type="button"
						onClick={() => onSelectHotspot(h.id)}
						className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border border-white/[0.06] bg-white/[0.025] hover:bg-white/[0.06] hover:border-white/10 transition-all text-left"
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="#3B82F6"
							strokeWidth="2"
							className="shrink-0"
						>
							<circle cx="11" cy="11" r="7" />
							<line x1="16.5" y1="16.5" x2="21" y2="21" />
						</svg>
						<div className="min-w-0 flex-1">
							<p className="text-[11px] text-slate-300 truncate">
								{h.label || `${t("properties.zoomRegionTitle") ?? "Zoom"} ${idx + 1}`}
							</p>
							<p className="text-[9px] text-slate-600">
								{ZOOM_LEVEL_SCALES[h.zoomLevel ?? 3]}× · {h.width.toFixed(1)}% ×{" "}
								{h.height.toFixed(1)}%
							</p>
						</div>
					</button>
				))}
			</Section>
		</>
	);
}

// ─── 鼠标标注属性面板 ────────────────────────────────────────────────────────

function CursorMarkerPanel({
	hotspot,
	onUpdateHotspot,
	onRemoveHotspot,
}: {
	hotspot: Hotspot;
	onUpdateHotspot: (hotspotId: string, updates: Partial<Hotspot>) => void;
	onRemoveHotspot: (hotspotId: string) => void;
}) {
	const t = useScopedT("demobuilder");

	return (
		<>
			{/* 标题栏 */}
			<div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.07]">
				<MousePointerClick className="w-4 h-4 text-[#34B27B]" />
				<span className="text-sm font-semibold text-slate-100">
					{t("properties.cursorMarkerTitle")}
				</span>
			</div>

			{/* 文字说明 */}
			<Section title={t("properties.label")}>
				<input
					type="text"
					value={hotspot.label}
					onChange={(e) => onUpdateHotspot(hotspot.id, { label: e.target.value })}
					placeholder={t("properties.labelPlaceholder")}
					className="input-field"
				/>
			</Section>

			{/* 浮动说明 */}
			<Section title={t("properties.tooltipLabel")}>
				<textarea
					value={hotspot.tooltip ?? ""}
					onChange={(e) => onUpdateHotspot(hotspot.id, { tooltip: e.target.value })}
					rows={3}
					placeholder={t("properties.tooltipPlaceholder")}
					className="input-field resize-none"
				/>
				<p className="text-[9px] text-slate-600 mt-1">{t("properties.tooltipHint")}</p>
			</Section>

			{/* 点击动画 */}
			<Section title={t("properties.clickAnimation")}>
				<select
					value={hotspot.clickAnimation}
					onChange={(e) =>
						onUpdateHotspot(hotspot.id, {
							clickAnimation: e.target.value as Hotspot["clickAnimation"],
						})
					}
					className="input-field"
				>
					<option value="ripple">{t("properties.clickEffectOptions.ripple")}</option>
					<option value="zoom">{t("properties.clickEffectOptions.zoom")}</option>
					<option value="flash">{t("properties.clickEffectOptions.flash")}</option>
					<option value="none">{t("properties.clickEffectOptions.none")}</option>
				</select>
			</Section>

			{/* 位置信息（只读） */}
			<Section title={t("properties.positionInfo")}>
				<div className="grid grid-cols-2 gap-2">
					<InfoChip label="X" value={`${hotspot.x.toFixed(1)}%`} />
					<InfoChip label="Y" value={`${hotspot.y.toFixed(1)}%`} />
				</div>
			</Section>

			{/* 删除按钮 */}
			<div className="px-3 py-3">
				<button
					type="button"
					onClick={() => onRemoveHotspot(hotspot.id)}
					className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium text-red-400 bg-red-950/30 border border-red-900/50 rounded-lg hover:bg-red-950/50 transition-colors"
				>
					<Trash2 className="w-3.5 h-3.5" />
					{t("properties.deleteMarker")}
				</button>
			</div>
		</>
	);
}

// ─── 高亮区域属性面板 ────────────────────────────────────────────────────────

function HighlightAreaPanel({
	hotspot,
	onUpdateHotspot,
	onRemoveHotspot,
}: {
	hotspot: Hotspot;
	onUpdateHotspot: (hotspotId: string, updates: Partial<Hotspot>) => void;
	onRemoveHotspot: (hotspotId: string) => void;
}) {
	const t = useScopedT("demobuilder");
	const currentColor = hotspot.highlightColor || "#34B27B";

	return (
		<>
			{/* 标题栏 */}
			<div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.07]">
				<Square className="w-4 h-4" style={{ color: currentColor }} />
				<span className="text-sm font-semibold text-slate-100">
					{t("properties.highlightAreaTitle")}
				</span>
			</div>

			{/* 文字说明 */}
			<Section title={t("properties.label")}>
				<input
					type="text"
					value={hotspot.label}
					onChange={(e) => onUpdateHotspot(hotspot.id, { label: e.target.value })}
					placeholder={t("properties.labelPlaceholder")}
					className="input-field"
				/>
			</Section>

			{/* 高亮形状 */}
			<Section title={t("properties.highlightShape")}>
				<div className="flex gap-1.5">
					{(["rect", "circle", "ellipse"] as const).map((shape) => (
						<button
							key={shape}
							type="button"
							onClick={() => onUpdateHotspot(hotspot.id, { shape })}
							className={cn(
								"flex-1 py-1.5 text-[10px] font-semibold rounded-lg border transition-all duration-150 flex items-center justify-center gap-1",
								(hotspot.shape ?? "rect") === shape
									? "border-[#34B27B]/70 bg-[#34B27B]/15 text-[#34B27B]"
									: "border-white/[0.06] bg-white/[0.035] text-slate-400 hover:bg-white/[0.075] hover:text-slate-200",
							)}
						>
							{shape === "rect" && <Square className="w-3 h-3" />}
							{shape === "circle" && <Circle className="w-3 h-3" />}
							{shape === "ellipse" && <Circle className="w-3.5 h-2.5" />}
							{t(`properties.highlightShapeOptions.${shape}`)}
						</button>
					))}
				</div>
			</Section>

			{/* 高亮颜色 */}
			<Section title={t("properties.highlightColor")}>
				<div className="grid grid-cols-5 gap-2">
					{HIGHLIGHT_COLORS.map((color) => (
						<button
							key={color}
							type="button"
							onClick={() => onUpdateHotspot(hotspot.id, { highlightColor: color })}
							className={cn(
								"w-full aspect-square rounded-lg border cursor-pointer transition-all duration-150",
								currentColor === color
									? "border-white ring-1 ring-white/40 scale-110"
									: "border-white/10 hover:border-white/30",
							)}
							style={{ backgroundColor: color }}
						/>
					))}
				</div>
			</Section>

			{/* 高亮显示时长 */}
			<Section title={t("properties.highlightDuration")}>
				<Field label={`${((hotspot.highlightDuration ?? 1000) / 1000).toFixed(1)}s`}>
					<input
						type="range"
						min={200}
						max={5000}
						step={100}
						value={hotspot.highlightDuration ?? 1000}
						onChange={(e) =>
							onUpdateHotspot(hotspot.id, {
								highlightDuration: Number.parseInt(e.target.value, 10),
							})
						}
						className="w-full accent-[#34B27B]"
					/>
				</Field>
			</Section>

			{/* 位置 / 尺寸信息（只读） */}
			<Section title={t("properties.positionInfo")}>
				<div className="grid grid-cols-2 gap-2">
					<InfoChip label="X" value={`${hotspot.x.toFixed(1)}%`} />
					<InfoChip label="Y" value={`${hotspot.y.toFixed(1)}%`} />
					<InfoChip label="W" value={`${hotspot.width.toFixed(1)}%`} />
					<InfoChip label="H" value={`${hotspot.height.toFixed(1)}%`} />
				</div>
			</Section>

			{/* 删除按钮 */}
			<div className="px-3 py-3">
				<button
					type="button"
					onClick={() => onRemoveHotspot(hotspot.id)}
					className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium text-red-400 bg-red-950/30 border border-red-900/50 rounded-lg hover:bg-red-950/50 transition-colors"
				>
					<Trash2 className="w-3.5 h-3.5" />
					{t("properties.deleteHighlight")}
				</button>
			</div>
		</>
	);
}

// ─── 缩放区域属性面板 ─────────────────────────────────────────────────────

function ZoomRegionPanel({
	hotspot,
	onUpdateHotspot,
	onRemoveHotspot,
}: {
	hotspot: Hotspot;
	onUpdateHotspot: (hotspotId: string, updates: Partial<Hotspot>) => void;
	onRemoveHotspot: (hotspotId: string) => void;
}) {
	const t = useScopedT("demobuilder");
	const currentLevel = hotspot.zoomLevel ?? 3;

	return (
		<>
			{/* 缩放区域标题 */}
			<Section title={t("properties.zoomRegionTitle") ?? "Zoom Region"}>
				<Field label={t("properties.zoomScale") ?? "Scale"}>
					<div className="grid grid-cols-3 gap-1.5">
						{ZOOM_LEVEL_OPTIONS.map((opt) => (
							<button
								key={opt.level}
								type="button"
								onClick={() => onUpdateHotspot(hotspot.id, { zoomLevel: opt.level })}
								className={cn(
									"px-1.5 py-1 rounded text-[10px] font-medium border transition-colors",
									currentLevel === opt.level
										? "border-[#3B82F6]/70 bg-[#3B82F6]/15 text-[#3B82F6]"
										: "border-white/[0.06] bg-white/[0.035] text-slate-400 hover:bg-white/[0.075] hover:text-slate-200",
								)}
							>
								{opt.label}
							</button>
						))}
					</div>
				</Field>
				{/* 当前缩放倍率提示 */}
				<p className="text-[9px] text-slate-500 mt-1">{ZOOM_LEVEL_SCALES[currentLevel]}× zoom</p>
			</Section>

			{/* 位置 / 尺寸信息（只读） */}
			<Section title={t("properties.positionInfo")}>
				<div className="grid grid-cols-2 gap-2">
					<InfoChip label="X" value={`${hotspot.x.toFixed(1)}%`} />
					<InfoChip label="Y" value={`${hotspot.y.toFixed(1)}%`} />
					<InfoChip label="W" value={`${hotspot.width.toFixed(1)}%`} />
					<InfoChip label="H" value={`${hotspot.height.toFixed(1)}%`} />
				</div>
			</Section>

			{/* 删除按钮 */}
			<div className="px-3 py-3">
				<button
					type="button"
					onClick={() => onRemoveHotspot(hotspot.id)}
					className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium text-red-400 bg-red-950/30 border border-red-900/50 rounded-lg hover:bg-red-950/50 transition-colors"
				>
					<Trash2 className="w-3.5 h-3.5" />
					{t("properties.deleteZoomRegion") ?? "Delete Zoom Region"}
				</button>
			</div>
		</>
	);
}

// ─── 字幕编辑器（多条字幕管理 + 分组 + TTS） ───────────────────────────────────

/** 组的颜色池，循环使用 */
const GROUP_COLORS = ["#34B27B", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];

function SubtitleSection({
	step,
	onUpdateStep,
}: {
	step: Step;
	onUpdateStep: (stepId: string, updates: Partial<Step>) => void;
}) {
	const t = useScopedT("demobuilder");
	const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
	const subtitles = step.subtitles;
	const audioGroups = step.subtitleAudioGroups ?? [];

	const tts = useSubtitleTTS();

	// 为每个 groupId 分配一个稳定的颜色索引
	const groupIdColorMap = useMemo(() => {
		const map = new Map<string, number>();
		let idx = 0;
		for (const sub of subtitles) {
			if (sub.groupId && !map.has(sub.groupId)) {
				map.set(sub.groupId, idx % GROUP_COLORS.length);
				idx++;
			}
		}
		return map;
	}, [subtitles]);

	const handleAddSubtitle = () => {
		const lastEnd = subtitles.length > 0 ? Math.max(...subtitles.map((s) => s.end)) : 0;
		const newSub = createDefaultSubtitle(lastEnd, 3000);
		onUpdateStep(step.id, { subtitles: [...subtitles, newSub] });
		setSelectedSubId(newSub.id);
	};

	const handleUpdateSubtitle = (subId: string, updates: Partial<Subtitle>) => {
		onUpdateStep(step.id, {
			subtitles: subtitles.map((s) => (s.id === subId ? { ...s, ...updates } : s)),
		});
	};

	const handleRemoveSubtitle = (subId: string) => {
		const sub = subtitles.find((s) => s.id === subId);
		let newGroups = audioGroups;
		// 如果删除的是组内字幕，检查组是否只剩一条，是则清理组
		if (sub?.groupId) {
			const remaining = subtitles.filter((s) => s.groupId === sub.groupId && s.id !== subId);
			if (remaining.length <= 1) {
				newGroups = audioGroups.filter((g) => g.id !== sub.groupId);
				// 清除剩余字幕的 groupId
				const updatedSubs = subtitles
					.filter((s) => s.id !== subId)
					.map((s) => (s.groupId === sub.groupId ? { ...s, groupId: null } : s));
				onUpdateStep(step.id, { subtitles: updatedSubs, subtitleAudioGroups: newGroups });
				if (selectedSubId === subId) setSelectedSubId(null);
				return;
			}
		}
		onUpdateStep(step.id, {
			subtitles: subtitles.filter((s) => s.id !== subId),
			subtitleAudioGroups: newGroups,
		});
		if (selectedSubId === subId) setSelectedSubId(null);
	};

	const handleMoveSubtitle = (subId: string, direction: "up" | "down") => {
		const idx = subtitles.findIndex((s) => s.id === subId);
		if (idx < 0) return;
		const swapIdx = direction === "up" ? idx - 1 : idx + 1;
		if (swapIdx < 0 || swapIdx >= subtitles.length) return;
		const newSubs = [...subtitles];
		[newSubs[idx], newSubs[swapIdx]] = [newSubs[swapIdx], newSubs[idx]];
		onUpdateStep(step.id, { subtitles: newSubs });
	};

	// 将当前字幕与下一条字幕合并为一组
	const handleJoinGroup = (subId: string) => {
		const idx = subtitles.findIndex((s) => s.id === subId);
		if (idx < 0 || idx >= subtitles.length - 1) return;
		const current = subtitles[idx];
		const next = subtitles[idx + 1];
		// 如果当前字幕已在组中，把下一条也拉进同组；否则新建一个组
		const groupId = current.groupId ?? crypto.randomUUID();
		const newSubs = subtitles.map((s) => {
			if (s.id === current.id || s.id === next.id) {
				return { ...s, groupId };
			}
			return s;
		});
		onUpdateStep(step.id, { subtitles: newSubs });
	};

	// 将字幕从组中移除
	const handleSplitFromGroup = (subId: string) => {
		const sub = subtitles.find((s) => s.id === subId);
		if (!sub?.groupId) return;
		const groupId = sub.groupId;
		const remaining = subtitles.filter((s) => s.groupId === groupId && s.id !== subId);
		let newGroups = audioGroups;
		const updatedSubs = subtitles.map((s) => {
			if (s.id === subId) return { ...s, groupId: null };
			// 如果组内只剩一条，也清除它的 groupId 和对应音频组
			if (s.groupId === groupId && remaining.length <= 1) {
				return { ...s, groupId: null };
			}
			return s;
		});
		if (remaining.length <= 1) {
			newGroups = audioGroups.filter((g) => g.id !== groupId);
		}
		onUpdateStep(step.id, { subtitles: updatedSubs, subtitleAudioGroups: newGroups });
	};

	// 为字幕组生成 TTS
	const handleGenerateGroupTTS = async (groupId: string) => {
		const groupSubs = subtitles.filter((s) => s.groupId === groupId);
		if (groupSubs.length === 0) return;

		const result = await tts.generateForGroup(groupId, groupSubs);
		if (!result) return;

		const { audioGroup, updatedSubtitles } = result;
		// 替换对应的字幕（更新 start/end），并更新/添加 audioGroup
		const newSubs = subtitles.map((s) => {
			const updated = updatedSubtitles.find((u) => u.id === s.id);
			return updated ?? s;
		});
		const existingIdx = audioGroups.findIndex((g) => g.id === groupId);
		const newGroups =
			existingIdx >= 0
				? audioGroups.map((g, i) => (i === existingIdx ? audioGroup : g))
				: [...audioGroups, audioGroup];
		onUpdateStep(step.id, { subtitles: newSubs, subtitleAudioGroups: newGroups });
	};

	// 为单条字幕生成 TTS
	const handleGenerateSingleTTS = async (sub: Subtitle) => {
		const result = await tts.generateForSingle(sub);
		if (!result) return;
		const { audio } = result;
		handleUpdateSubtitle(sub.id, {
			audio,
			end: sub.start + audio.duration,
		});
	};

	// 移除字幕组语音
	const handleRemoveGroupAudio = (groupId: string) => {
		onUpdateStep(step.id, {
			subtitleAudioGroups: audioGroups.filter((g) => g.id !== groupId),
		});
	};

	const selectedSub = subtitles.find((s) => s.id === selectedSubId);

	// 收集唯一的分组（保持首次出现顺序）
	const groups = useMemo(() => {
		const seen = new Set<string>();
		const result: { groupId: string; subs: Subtitle[] }[] = [];
		for (const sub of subtitles) {
			if (sub.groupId && !seen.has(sub.groupId)) {
				seen.add(sub.groupId);
				result.push({
					groupId: sub.groupId,
					subs: subtitles.filter((s) => s.groupId === sub.groupId),
				});
			}
		}
		return result;
	}, [subtitles]);

	return (
		<Section title={t("properties.subtitleSection")}>
			{/* 字幕列表 */}
			{subtitles.length === 0 && (
				<p className="text-[10px] text-slate-600">{t("properties.noSubtitles")}</p>
			)}
			{subtitles.map((sub, idx) => {
				const groupColorIdx = sub.groupId ? groupIdColorMap.get(sub.groupId) : undefined;
				const groupColor = groupColorIdx !== undefined ? GROUP_COLORS[groupColorIdx] : undefined;
				const groupInfo = sub.groupId ? groups.find((g) => g.groupId === sub.groupId) : null;
				const groupAudio = sub.groupId ? audioGroups.find((g) => g.id === sub.groupId) : null;

				return (
					<div key={sub.id}>
						<div
							className={cn(
								"flex items-center gap-1.5 px-2 py-1.5 rounded-lg border transition-all",
								selectedSubId === sub.id
									? "border-[#34B27B]/50 bg-[#34B27B]/10"
									: "border-white/[0.06] bg-white/[0.025] hover:bg-white/[0.06]",
							)}
							style={groupColor ? { borderLeft: `3px solid ${groupColor}` } : undefined}
						>
							<button
								type="button"
								onClick={() => setSelectedSubId(selectedSubId === sub.id ? null : sub.id)}
								className="flex-1 min-w-0 text-left"
							>
								<p className="text-[11px] text-slate-300 truncate">
									{sub.text || t("properties.subtitleEmpty")}
								</p>
								<p className="text-[9px] text-slate-600">
									#{idx + 1} · {(sub.start / 1000).toFixed(1)}s - {(sub.end / 1000).toFixed(1)}s
									{groupAudio
										? ` · ${t("properties.subtitleTTSGroup")}`
										: sub.audio
											? ` · ${(sub.audio.duration / 1000).toFixed(1)}s`
											: ""}
								</p>
							</button>
							<div className="flex items-center gap-0.5 shrink-0">
								{/* 分组：链接到下一条字幕 */}
								{idx < subtitles.length - 1 && (
									<button
										type="button"
										title={t("properties.subtitleJoinGroup")}
										onClick={() => handleJoinGroup(sub.id)}
										className="p-0.5 text-slate-600 hover:text-blue-400 transition-colors"
									>
										<Link2 className="w-3 h-3" />
									</button>
								)}
								{sub.groupId && (
									<button
										type="button"
										title={t("properties.subtitleSplitGroup")}
										onClick={() => handleSplitFromGroup(sub.id)}
										className="p-0.5 text-blue-400 hover:text-slate-300 transition-colors"
									>
										<Unlink className="w-3 h-3" />
									</button>
								)}
								<button
									type="button"
									onClick={() => handleMoveSubtitle(sub.id, "up")}
									disabled={idx === 0}
									className="p-0.5 text-slate-600 hover:text-slate-300 disabled:opacity-30 transition-colors"
								>
									<svg
										width="10"
										height="10"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
									>
										<path d="M18 15l-6-6-6 6" />
									</svg>
								</button>
								<button
									type="button"
									onClick={() => handleMoveSubtitle(sub.id, "down")}
									disabled={idx === subtitles.length - 1}
									className="p-0.5 text-slate-600 hover:text-slate-300 disabled:opacity-30 transition-colors"
								>
									<svg
										width="10"
										height="10"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
									>
										<path d="M6 9l6 6 6-6" />
									</svg>
								</button>
								<button
									type="button"
									onClick={() => handleRemoveSubtitle(sub.id)}
									className="p-0.5 text-slate-600 hover:text-red-400 transition-colors"
								>
									<Trash2 className="w-3 h-3" />
								</button>
							</div>
						</div>

						{/* 组操作栏：在第一组成员处显示 */}
						{groupInfo && groupInfo.subs[0]?.id === sub.id && (
							<div
								className="ml-3 mt-1 mb-1 px-2 py-1 rounded border flex items-center gap-2"
								style={{
									borderColor: `${groupColor}33`,
									backgroundColor: `${groupColor}0D`,
								}}
							>
								<Volume2 className="w-3 h-3 shrink-0" style={{ color: groupColor }} />
								<span className="text-[9px] text-slate-400 flex-1">
									{t("properties.subtitleGroupLabel", {
										name: groupInfo.subs.map((s) => s.text.slice(0, 6)).join(" + "),
									})}
								</span>
								{groupAudio ? (
									<div className="flex items-center gap-1">
										<span className="text-[9px] text-slate-500">
											{(groupAudio.audio.duration / 1000).toFixed(1)}s
										</span>
										<button
											type="button"
											onClick={() => tts.previewAudio(groupAudio.audio.url)}
											className="p-0.5 text-slate-400 hover:text-green-400 transition-colors"
										>
											{tts.isPreviewing ? (
												<Loader2 className="w-3 h-3 animate-spin" />
											) : (
												<Play className="w-3 h-3" />
											)}
										</button>
										<button
											type="button"
											onClick={() => handleRemoveGroupAudio(groupInfo.groupId)}
											className="p-0.5 text-red-400 hover:text-red-300 transition-colors"
										>
											<Trash2 className="w-3 h-3" />
										</button>
									</div>
								) : (
									<button
										type="button"
										disabled={tts.isGenerating || !tts.isAvailable}
										onClick={() => handleGenerateGroupTTS(groupInfo.groupId)}
										className="flex items-center gap-1 text-[9px] text-blue-400 hover:text-blue-300 disabled:opacity-40 transition-colors"
									>
										{tts.isGenerating ? (
											<Loader2 className="w-3 h-3 animate-spin" />
										) : (
											<Volume2 className="w-3 h-3" />
										)}
										{t("properties.subtitleTTSGroup")}
									</button>
								)}
							</div>
						)}
					</div>
				);
			})}

			{/* 添加字幕按钮 */}
			<button
				type="button"
				onClick={handleAddSubtitle}
				className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-medium text-[#34B27B] bg-[#34B27B]/10 border border-[#34B27B]/20 rounded-lg hover:bg-[#34B27B]/20 transition-colors"
			>
				<Plus className="w-3.5 h-3.5" />
				{t("properties.addSubtitle")}
			</button>

			{/* 选中字幕的编辑区 */}
			{selectedSub && (
				<div className="mt-2 p-2 rounded-lg border border-white/[0.08] bg-white/[0.02] space-y-2">
					<Field label={t("properties.subtitleText")}>
						<textarea
							value={selectedSub.text}
							onChange={(e) => handleUpdateSubtitle(selectedSub.id, { text: e.target.value })}
							rows={2}
							placeholder={t("properties.subtitlePlaceholder")}
							className="input-field resize-none"
						/>
					</Field>
					<div className="grid grid-cols-2 gap-2">
						<Field label={t("properties.subtitleStartTime")}>
							<input
								type="number"
								min={0}
								step={100}
								value={selectedSub.start}
								onChange={(e) =>
									handleUpdateSubtitle(selectedSub.id, {
										start: Math.max(0, Number.parseInt(e.target.value, 10) || 0),
									})
								}
								className="input-field"
							/>
						</Field>
						<Field label={t("properties.subtitleEndTime")}>
							<input
								type="number"
								min={0}
								step={100}
								value={selectedSub.end}
								onChange={(e) =>
									handleUpdateSubtitle(selectedSub.id, {
										end: Math.max(0, Number.parseInt(e.target.value, 10) || 0),
									})
								}
								className="input-field"
							/>
						</Field>
					</div>
					<Field label={t("properties.subtitleFontSize")}>
						<input
							type="number"
							min={10}
							max={48}
							value={selectedSub.fontSize}
							onChange={(e) =>
								handleUpdateSubtitle(selectedSub.id, {
									fontSize: Math.max(10, Math.min(48, Number.parseInt(e.target.value, 10) || 16)),
								})
							}
							className="input-field"
						/>
					</Field>
					<div className="grid grid-cols-2 gap-2">
						<Field label={t("properties.subtitleTextColor")}>
							<input
								type="color"
								value={selectedSub.style.color}
								onChange={(e) =>
									handleUpdateSubtitle(selectedSub.id, {
										style: { ...selectedSub.style, color: e.target.value },
									})
								}
								className="w-full h-7 rounded cursor-pointer border border-white/10"
							/>
						</Field>
						<Field label={t("properties.subtitleBgColor")}>
							<input
								type="color"
								value={
									selectedSub.style.backgroundColor.startsWith("rgba")
										? "#000000"
										: selectedSub.style.backgroundColor
								}
								onChange={(e) =>
									handleUpdateSubtitle(selectedSub.id, {
										style: { ...selectedSub.style, backgroundColor: e.target.value },
									})
								}
								className="w-full h-7 rounded cursor-pointer border border-white/10"
							/>
						</Field>
					</div>
					<Field label={t("properties.subtitleBindHotspot")}>
						<select
							value={selectedSub.hotspotId ?? ""}
							onChange={(e) =>
								handleUpdateSubtitle(selectedSub.id, {
									hotspotId: e.target.value || null,
								})
							}
							className="input-field"
						>
							<option value="">{t("properties.subtitleNoBind")}</option>
							{(() => {
								const zooms = step.hotspots.filter((h) => isZoomRegion(h));
								const highlights = step.hotspots.filter(
									(h) => !isCursorMarker(h) && !isZoomRegion(h),
								);
								const cursors = step.hotspots.filter((h) => isCursorMarker(h));
								const renderOpts = (list: Hotspot[]) =>
									list.map((h) => (
										<option key={h.id} value={h.id}>
											{h.label || `${h.id.slice(0, 6)}...`}
										</option>
									));
								return (
									<>
										{zooms.length > 0 && (
											<optgroup label={t("properties.subtitleGroupZoom")}>
												{renderOpts(zooms)}
											</optgroup>
										)}
										{highlights.length > 0 && (
											<optgroup label={t("properties.subtitleGroupHighlight")}>
												{renderOpts(highlights)}
											</optgroup>
										)}
										{cursors.length > 0 && (
											<optgroup label={t("properties.subtitleGroupCursor")}>
												{renderOpts(cursors)}
											</optgroup>
										)}
									</>
								);
							})()}
						</select>
					</Field>

					{/* 单条字幕 TTS（仅对未分组的字幕显示） */}
					{!selectedSub.groupId && (
						<div className="flex items-center gap-2">
							{selectedSub.audio ? (
								<div className="flex items-center gap-1.5 text-[9px] text-slate-500">
									<span>TTS: {(selectedSub.audio.duration / 1000).toFixed(1)}s</span>
									<button
										type="button"
										onClick={() => tts.previewAudio(selectedSub.audio!.url)}
										className="text-green-400 hover:text-green-300 transition-colors"
									>
										{tts.isPreviewing ? (
											<Loader2 className="w-3 h-3 animate-spin" />
										) : (
											<Play className="w-3 h-3" />
										)}
									</button>
									<button
										type="button"
										onClick={() => handleUpdateSubtitle(selectedSub.id, { audio: null })}
										className="text-red-400 hover:text-red-300 underline transition-colors"
									>
										{t("properties.subtitleRemoveAudio")}
									</button>
								</div>
							) : (
								<button
									type="button"
									disabled={tts.isGenerating || !tts.isAvailable || !selectedSub.text.trim()}
									onClick={() => handleGenerateSingleTTS(selectedSub)}
									className="flex items-center gap-1 text-[9px] text-blue-400 hover:text-blue-300 disabled:opacity-40 transition-colors"
								>
									{tts.isGenerating ? (
										<Loader2 className="w-3 h-3 animate-spin" />
									) : (
										<Volume2 className="w-3 h-3" />
									)}
									{tts.isAvailable
										? t("properties.subtitleTTSSingle")
										: t("properties.subtitleTTSNoEngine")}
								</button>
							)}
						</div>
					)}

					{/* 分组字幕提示 */}
					{selectedSub.groupId && (
						<p className="text-[9px] text-slate-600 italic">
							{t("properties.subtitleTTSGroupHint")}
						</p>
					)}
				</div>
			)}
		</Section>
	);
}

// ─── 辅助子组件 ──────────────────────────────────────────────────────────────

/** 面板分组区块 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div className="p-3 border-b border-white/[0.07]">
			<h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
				{title}
			</h3>
			<div className="space-y-2">{children}</div>
		</div>
	);
}

/** 字段标签 + 输入容器 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div>
			<label className="text-[10px] text-slate-500 block mb-1">{label}</label>
			{children}
		</div>
	);
}

/** 只读信息标签 */
function InfoChip({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.035] border border-white/[0.06]">
			<span className="text-[9px] font-semibold text-slate-500 uppercase">{label}</span>
			<span className="text-[10px] text-slate-300 font-mono">{value}</span>
		</div>
	);
}
