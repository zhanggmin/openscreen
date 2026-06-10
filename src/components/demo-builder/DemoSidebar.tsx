import { Download, Palette, SlidersHorizontal, Volume2 } from "lucide-react";
import { type ComponentType, useCallback, useMemo, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useScopedT } from "@/contexts/I18nContext";
import type {
	DemoAppearance,
	DemoBackground,
	DemoSound,
	ProjectSettings,
} from "@/lib/demobuilder/types";
import { cn } from "@/lib/utils";
import { resolveImageWallpaperUrl, WALLPAPER_PATHS } from "@/lib/wallpaper";

type SidebarMode = "background" | "settings" | "sound" | "export";

interface DemoSidebarProps {
	settings: ProjectSettings;
	onUpdateBackground: (bg: DemoBackground) => void;
	onUpdateAppearance: (appearance: Partial<DemoAppearance>) => void;
	onUpdateSound: (sound: Partial<DemoSound>) => void;
	onUpdateAspectRatio: (ratio: string) => void;
	onExport: (format: "mp4" | "pdf") => void;
}

const GRADIENTS = [
	"linear-gradient(120deg, #d4fc79 0%, #96e6a1 100%)",
	"radial-gradient(circle farthest-corner at 3.2% 49.6%, rgba(80,12,139,0.87) 0%, rgba(161,10,144,0.72) 83.6%)",
	"linear-gradient(107.7deg, rgba(235,230,44,0.55) 8.4%, rgba(252,152,15,1) 90.3%)",
	"linear-gradient(91deg, rgba(72,154,78,1) 5.2%, rgba(251,206,70,1) 95.9%)",
	"radial-gradient(circle farthest-corner at 10% 20%, rgba(2,37,78,1) 0%, rgba(4,56,126,1) 19.7%, rgba(85,245,221,1) 100.2%)",
	"linear-gradient(109.6deg, rgba(15,2,2,1) 11.2%, rgba(36,163,190,1) 91.1%)",
	"linear-gradient(135deg, #FBC8B4, #2447B1)",
	"linear-gradient(109.6deg, #F635A6, #36D860)",
	"linear-gradient(45deg, #ff9a9e 0%, #fad0c4 99%)",
	"linear-gradient(to top, #a18cd1 0%, #fbc2eb 100%)",
	"linear-gradient(120deg, #84fab0 0%, #8fd3f4 100%)",
	"linear-gradient(to right, #4facfe 0%, #00f2fe 100%)",
	"linear-gradient(to top, #48c6ef 0%, #6f86d6 100%)",
	"linear-gradient(to right, #0acffe 0%, #495aff 100%)",
	"linear-gradient(to top, #30cfd0 0%, #330867 100%)",
	"linear-gradient(to top, #c471f5 0%, #fa71cd 100%)",
	"linear-gradient(to right, #f78ca0 0%, #f9748f 19%, #fd868c 60%, #fe9a8b 100%)",
	"linear-gradient(to top, #fcc5e4 0%, #fda34b 15%, #ff7882 35%, #c8699e 52%, #7046aa 71%, #0c1db8 87%, #020f75 100%)",
];

const COLORS = [
	"#FF0000",
	"#FFD700",
	"#00FF00",
	"#FFFFFF",
	"#0000FF",
	"#FF6B00",
	"#9B59B6",
	"#E91E63",
	"#00BCD4",
	"#FF5722",
	"#8BC34A",
	"#FFC107",
	"#34B27B",
	"#000000",
	"#607D8B",
	"#795548",
	"#1a1a2e",
	"#16213e",
	"#0f3460",
	"#533483",
];

const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "4:5", "16:10"];

const MENU_ITEMS: {
	id: SidebarMode;
	labelKey: string;
	icon: ComponentType<{ className?: string }>;
}[] = [
	{ id: "background", labelKey: "sidebar.background", icon: Palette },
	{ id: "settings", labelKey: "sidebar.settings", icon: SlidersHorizontal },
	{ id: "sound", labelKey: "sidebar.sound", icon: Volume2 },
	{ id: "export", labelKey: "sidebar.export", icon: Download },
];

export function DemoSidebar({
	settings,
	onUpdateBackground,
	onUpdateAppearance,
	onUpdateSound,
	onUpdateAspectRatio,
	onExport,
}: DemoSidebarProps) {
	const t = useScopedT("demobuilder");
	const [mode, setMode] = useState<SidebarMode>("background");

	const wallpaperUrls = useMemo(() => WALLPAPER_PATHS.map(resolveImageWallpaperUrl), []);

	return (
		<div className="editor-inspector-shell h-full flex shrink-0 w-[330px]">
			{/* Icon rail — matches video editor's settings-mode-rail */}
			<div className="settings-mode-rail flex w-11 shrink-0 flex-col items-center gap-1 border-r border-white/[0.07] bg-black/20 px-1 py-2.5">
				{MENU_ITEMS.map((item) => {
					const Icon = item.icon;
					const isActive = mode === item.id;
					return (
						<button
							key={item.id}
							type="button"
							title={t(item.labelKey)}
							onClick={() => setMode(item.id)}
							className={cn(
								"flex h-8 w-8 items-center justify-center rounded-lg border transition-all",
								isActive
									? "border-[#34B27B]/50 bg-[#34B27B]/15 text-[#34B27B] shadow-[0_0_0_1px_rgba(52,178,123,0.12)]"
									: "border-transparent text-slate-500 hover:border-white/10 hover:bg-white/[0.06] hover:text-slate-200",
							)}
						>
							<Icon className="h-4 w-4" />
						</button>
					);
				})}
			</div>

			{/* Settings panel — matches video editor's inspector panel */}
			<div className="flex-1 overflow-y-auto custom-scrollbar p-3 pb-0">
				<div className="mb-3 flex items-center justify-between px-1">
					<span className="text-sm font-semibold text-slate-100">{t(`sidebar.${mode}`)}</span>
				</div>

				{mode === "background" && (
					<BackgroundPanel
						settings={settings}
						wallpaperUrls={wallpaperUrls}
						onUpdateBackground={onUpdateBackground}
						onUpdateAspectRatio={onUpdateAspectRatio}
					/>
				)}
				{mode === "settings" && (
					<SettingsPanel settings={settings} onUpdateAppearance={onUpdateAppearance} />
				)}
				{mode === "sound" && <SoundPanel settings={settings} onUpdateSound={onUpdateSound} />}
				{mode === "export" && <ExportPanel onExport={onExport} />}
			</div>
		</div>
	);
}

// ─── Background Panel ─────────────────────────────────────────────────────────

function BackgroundPanel({
	settings,
	wallpaperUrls,
	onUpdateBackground,
	onUpdateAspectRatio,
}: {
	settings: ProjectSettings;
	wallpaperUrls: string[];
	onUpdateBackground: (bg: DemoBackground) => void;
	onUpdateAspectRatio: (ratio: string) => void;
}) {
	const t = useScopedT("demobuilder");
	const [tab, setTab] = useState<"wallpaper" | "color" | "gradient">("wallpaper");
	const current = settings.background ?? { type: "color" as const, value: "#09090b" };

	return (
		<div className="px-1 space-y-3">
			{/* Aspect ratio */}
			<div>
				<label className="text-[10px] font-medium text-slate-400 block mb-1.5">
					{t("sidebar.aspectRatio")}
				</label>
				<div className="flex flex-wrap gap-1.5">
					{ASPECT_RATIOS.map((ratio) => (
						<button
							key={ratio}
							type="button"
							onClick={() => onUpdateAspectRatio(ratio)}
							className={cn(
								"px-2.5 py-1 text-[10px] font-semibold rounded-lg border transition-all duration-150",
								settings.aspectRatio === ratio
									? "border-[#34B27B]/70 bg-[#34B27B] text-white shadow-[0_8px_20px_rgba(52,178,123,0.18)]"
									: "border-white/[0.06] bg-white/[0.035] text-slate-400 hover:bg-white/[0.075] hover:border-white/15 hover:text-slate-200",
							)}
						>
							{ratio}
						</button>
					))}
				</div>
			</div>

			{/* Tabs */}
			<div className="grid w-full grid-cols-3 gap-0.5 rounded-lg border border-white/[0.06] bg-white/[0.035] p-0.5">
				{(["wallpaper", "color", "gradient"] as const).map((id) => (
					<button
						key={id}
						type="button"
						onClick={() => setTab(id)}
						className={cn(
							"py-1.5 text-[11px] font-semibold rounded-md transition-all duration-150",
							tab === id
								? "bg-[#34B27B]/15 text-[#34B27B] border border-[#34B27B]/25"
								: "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200 border border-transparent",
						)}
					>
						{t(`sidebar.bgTab.${id}`)}
					</button>
				))}
			</div>

			{tab === "wallpaper" && (
				<div className="grid grid-cols-4 gap-1.5">
					{WALLPAPER_PATHS.map((path, i) => {
						const url = wallpaperUrls[i] ?? path;
						const isSelected = current.type === "wallpaper" && current.value === path;
						return (
							<div
								key={path}
								role="button"
								onClick={() => onUpdateBackground({ type: "wallpaper", value: path })}
								className={cn(
									"aspect-square w-full rounded-lg border overflow-hidden cursor-pointer transition-all duration-150 shadow-sm",
									isSelected
										? "border-[#34B27B] ring-1 ring-[#34B27B]/30"
										: "border-white/10 hover:border-[#34B27B]/40 opacity-80 hover:opacity-100 bg-white/5",
								)}
								style={{
									backgroundImage: `url(${url})`,
									backgroundSize: "cover",
									backgroundPosition: "center",
								}}
							/>
						);
					})}
				</div>
			)}

			{tab === "color" && (
				<div className="grid grid-cols-5 gap-2">
					{COLORS.map((color) => {
						const isSelected = current.type === "color" && current.value === color;
						return (
							<div
								key={color}
								role="button"
								onClick={() => onUpdateBackground({ type: "color", value: color })}
								className={cn(
									"w-full aspect-square rounded-lg border cursor-pointer transition-all duration-150 shadow-sm",
									isSelected
										? "border-[#34B27B] ring-1 ring-[#34B27B]/30 scale-110"
										: "border-white/10 hover:border-[#34B27B]/40",
								)}
								style={{ backgroundColor: color }}
							/>
						);
					})}
				</div>
			)}

			{tab === "gradient" && (
				<div className="grid grid-cols-4 gap-1.5">
					{GRADIENTS.map((g) => {
						const isSelected = current.type === "gradient" && current.value === g;
						return (
							<div
								key={g}
								role="button"
								onClick={() => onUpdateBackground({ type: "gradient", value: g })}
								className={cn(
									"aspect-square w-full rounded-lg border overflow-hidden cursor-pointer transition-all duration-150 shadow-sm",
									isSelected
										? "border-[#34B27B] ring-1 ring-[#34B27B]/30"
										: "border-white/10 hover:border-[#34B27B]/40 opacity-80 hover:opacity-100 bg-white/5",
								)}
								style={{ background: g }}
							/>
						);
					})}
				</div>
			)}
		</div>
	);
}

// ─── Settings Panel (Appearance) ─────────────────────────────────────────────

function SettingsPanel({
	settings,
	onUpdateAppearance,
}: {
	settings: ProjectSettings;
	onUpdateAppearance: (appearance: Partial<DemoAppearance>) => void;
}) {
	const t = useScopedT("demobuilder");
	const { appearance } = settings;

	return (
		<div className="px-1 space-y-2">
			<div className="p-2 rounded-lg editor-control-surface">
				<div className="flex items-center justify-between mb-1">
					<div className="text-[10px] font-medium text-slate-300">{t("sidebar.blurBg")}</div>
					<span className="text-[10px] text-slate-500 font-mono">
						{appearance.blurIntensity === 0
							? t("sidebar.off")
							: appearance.blurIntensity.toFixed(2)}
					</span>
				</div>
				<Slider
					value={[appearance.blurIntensity]}
					onValueChange={(values) => onUpdateAppearance({ blurIntensity: values[0] })}
					min={0}
					max={1}
					step={0.01}
					className="w-full"
				/>
			</div>

			<div className="p-2 rounded-lg editor-control-surface">
				<div className="flex items-center justify-between mb-1">
					<div className="text-[10px] font-medium text-slate-300">{t("sidebar.roundness")}</div>
					<span className="text-[10px] text-slate-500 font-mono">{appearance.borderRadius}px</span>
				</div>
				<Slider
					value={[appearance.borderRadius]}
					onValueChange={(values) => onUpdateAppearance({ borderRadius: values[0] })}
					min={0}
					max={48}
					step={1}
					className="w-full"
				/>
			</div>

			<div className="p-2 rounded-lg editor-control-surface">
				<div className="flex items-center justify-between mb-1">
					<div className="text-[10px] font-medium text-slate-300">{t("sidebar.padding")}</div>
					<span className="text-[10px] text-slate-500 font-mono">{appearance.padding}px</span>
				</div>
				<Slider
					value={[appearance.padding]}
					onValueChange={(values) => onUpdateAppearance({ padding: values[0] })}
					min={0}
					max={120}
					step={1}
					className="w-full"
				/>
			</div>

			<div className="p-2 rounded-lg editor-control-surface">
				<div className="flex items-center justify-between mb-1">
					<div className="text-[10px] font-medium text-slate-300">{t("sidebar.shadow")}</div>
					<span className="text-[10px] text-slate-500 font-mono">
						{Math.round(appearance.shadowIntensity * 100)}%
					</span>
				</div>
				<Slider
					value={[appearance.shadowIntensity]}
					onValueChange={(values) => onUpdateAppearance({ shadowIntensity: values[0] })}
					min={0}
					max={1}
					step={0.01}
					className="w-full"
				/>
			</div>
		</div>
	);
}

// ─── Sound Panel ──────────────────────────────────────────────────────────────

function SoundPanel({
	settings,
	onUpdateSound,
}: {
	settings: ProjectSettings;
	onUpdateSound: (sound: Partial<DemoSound>) => void;
}) {
	const t = useScopedT("demobuilder");

	const handleVolumeChange = useCallback(
		(values: number[]) => {
			onUpdateSound({ backgroundMusicVolume: values[0] });
		},
		[onUpdateSound],
	);

	return (
		<div className="px-1 space-y-2">
			{/* Click sound toggle */}
			<div className="flex items-center justify-between p-2.5 rounded-lg editor-control-surface">
				<span className="text-[11px] font-medium text-slate-300">{t("sidebar.clickSound")}</span>
				<Switch
					checked={settings.sound.clickSoundEnabled}
					onCheckedChange={(checked) => onUpdateSound({ clickSoundEnabled: checked })}
				/>
			</div>

			{/* Background music */}
			<div className="p-2.5 rounded-lg editor-control-surface space-y-2">
				<div className="flex items-center justify-between">
					<span className="text-[11px] font-medium text-slate-300">{t("sidebar.bgMusic")}</span>
					<span className="text-[10px] text-slate-500">
						{settings.sound.backgroundMusicPath ? t("sidebar.bgMusicOn") : t("sidebar.bgMusicOff")}
					</span>
				</div>
				<div>
					<div className="flex items-center justify-between mb-1">
						<span className="text-[10px] text-slate-400">{t("sidebar.bgMusicVolume")}</span>
						<span className="text-[10px] text-slate-500 font-mono">
							{Math.round(settings.sound.backgroundMusicVolume * 100)}%
						</span>
					</div>
					<Slider
						value={[settings.sound.backgroundMusicVolume]}
						onValueChange={handleVolumeChange}
						min={0}
						max={1}
						step={0.01}
						className="w-full"
					/>
				</div>
			</div>
		</div>
	);
}

// ─── Export Panel ─────────────────────────────────────────────────────────────

function ExportPanel({ onExport }: { onExport: (format: "mp4" | "pdf") => void }) {
	const t = useScopedT("demobuilder");

	return (
		<div className="px-1 space-y-2">
			<button
				type="button"
				onClick={() => onExport("mp4")}
				className="w-full flex items-center gap-3 p-3 rounded-lg editor-control-surface hover:border-white/15 hover:bg-white/[0.06] transition-all duration-150"
			>
				<Download className="h-5 w-5 text-[#34B27B] shrink-0" />
				<div className="text-left">
					<div className="text-xs font-medium text-slate-200">{t("sidebar.exportMp4")}</div>
					<div className="text-[10px] text-slate-500">{t("sidebar.exportMp4Desc")}</div>
				</div>
			</button>

			<button
				type="button"
				disabled
				className="w-full flex items-center gap-3 p-3 rounded-lg editor-control-surface opacity-40 cursor-not-allowed"
			>
				<Download className="h-5 w-5 text-slate-600 shrink-0" />
				<div className="text-left">
					<div className="text-xs font-medium text-slate-500">{t("sidebar.exportPdf")}</div>
					<div className="text-[10px] text-slate-600">{t("sidebar.exportPdfDesc")}</div>
				</div>
			</button>
		</div>
	);
}
