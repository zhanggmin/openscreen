import {
	CheckCircle,
	Mic,
	Pause,
	Play,
	PlusCircle,
	Speaker,
	Trash2,
	Volume2,
	VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useScopedT } from "@/contexts/I18nContext";
import { TTSManager } from "@/lib/tts";
import type {
	AliyunTTSModel,
	AliyunTTSSettings,
	CaptionAudioSegment,
	TTSEngineType,
	TTSSettings,
	TTSVoice,
} from "@/lib/tts/types";
import type { AnnotationRegion } from "./types";

// localStorage 持久化 key
const STORAGE_KEY_API = "openscreen-aliyun-tts-apikey";
const STORAGE_KEY_MODEL = "openscreen-aliyun-tts-model";
const STORAGE_KEY_ENGINE = "openscreen-tts-engine";

function loadPersistedSettings(): { apiKey: string; model: AliyunTTSModel; engine: TTSEngineType } {
	try {
		return {
			apiKey: localStorage.getItem(STORAGE_KEY_API) || "",
			model: (localStorage.getItem(STORAGE_KEY_MODEL) as AliyunTTSModel) || "cosyvoice-v3-flash",
			engine: (localStorage.getItem(STORAGE_KEY_ENGINE) as TTSEngineType) || "web-speech",
		};
	} catch {
		return { apiKey: "", model: "cosyvoice-v3-flash", engine: "web-speech" };
	}
}

function persistSetting(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		// ignore storage errors
	}
}

interface TTSSettingsPanelProps {
	annotations: AnnotationRegion[];
	onTTSAudioGenerated?: (audioBlob: Blob) => void;
	videoDurationMs?: number;
	onTTSSegmentsAdded?: (segments: CaptionAudioSegment[]) => void;
	onTTSSettingsChange?: (settings: TTSSettings) => void;
	muteOriginalAudio?: boolean;
	onMuteOriginalAudioChange?: (mute: boolean) => void;
}

export function TTSSettingsPanel({
	annotations,
	onTTSAudioGenerated: _onTTSAudioGenerated,
	videoDurationMs: _videoDurationMs,
	onTTSSegmentsAdded,
	onTTSSettingsChange,
	muteOriginalAudio = false,
	onMuteOriginalAudioChange,
}: TTSSettingsPanelProps) {
	const scopedT = useScopedT("editor");
	const t = useCallback(
		(key: string, vars?: Record<string, string | number>) => scopedT(`tts.${key}`, vars),
		[scopedT],
	);

	const [ttsManager] = useState(() => new TTSManager());
	const persisted = useMemo(() => loadPersistedSettings(), []);
	const [engineType, setEngineType] = useState<TTSEngineType>(persisted.engine);
	const [aliyunSettings, setAliyunSettings] = useState<AliyunTTSSettings>({
		apiKey: persisted.apiKey,
		model: persisted.model,
	});
	const [voices, setVoices] = useState<TTSVoice[]>([]);
	const [settings, setSettings] = useState<TTSSettings>(() => ttsManager.getSettings());
	const settingsRef = useRef(settings);
	settingsRef.current = settings;
	const [isGenerating, setIsGenerating] = useState(false);
	const [generatingProgress, setGeneratingProgress] = useState({ current: 0, total: 0 });
	const [segments, setSegments] = useState<CaptionAudioSegment[]>([]);
	const [isPreviewing, setIsPreviewing] = useState(false);
	const [previewSegmentId, setPreviewSegmentId] = useState<string | null>(null);
	const [apiKeyValidated, setApiKeyValidated] = useState(false);
	const [isValidating, setIsValidating] = useState(false);
	const [validationMessage, setValidationMessage] = useState("");

	const ALIYUN_MODELS: { value: AliyunTTSModel; label: string; description: string }[] = [
		{ value: "cosyvoice-v3-flash", label: "CosyVoice v3 Flash", description: "快速高质量语音合成" },
		{ value: "cosyvoice-v3-plus", label: "CosyVoice v3 Plus", description: "高质量语音合成" },
		{ value: "qwen3-tts-flash", label: "Qwen3-TTS Flash", description: "千问3语音合成" },
		{
			value: "qwen3-tts-instruct-flash",
			label: "Qwen3-TTS Instruct",
			description: "千问3指令控制版",
		},
		{ value: "qwen-tts", label: "Qwen-TTS", description: "千问基础版语音合成" },
		{ value: "MiniMax/speech-2.8-hd", label: "MiniMax Speech", description: "支持情感控制" },
	];

	const captionAnnotations = useMemo(() => {
		return annotations.filter((a) => a.annotationSource === "auto-caption");
	}, [annotations]);

	const loadVoicesForEngine = useCallback(async () => {
		if (!ttsManager.isEngineAvailable()) return;

		try {
			const loadedVoices = await ttsManager.getVoices();
			setVoices(loadedVoices);

			if (loadedVoices.length > 0) {
				const defaultVoice = loadedVoices.find((v) => v.default) || loadedVoices[0];
				// 使用 ref 获取最新的 settings，避免闭包陈旧值
				const currentSettings = settingsRef.current;
				// 检查当前选中的 voice 是否在新音色列表中
				const currentVoiceValid = loadedVoices.some((v) => v.voiceURI === currentSettings.voice);
				if (!currentVoiceValid) {
					const updatedSettings = {
						...currentSettings,
						voice: defaultVoice.voiceURI,
						lang: defaultVoice.lang,
					};
					setSettings(updatedSettings);
					ttsManager.setSettings(updatedSettings);
				}
			}
		} catch (err) {
			console.error("Failed to load voices:", err);
			toast.error(t("failedToLoadVoices"));
		}
	}, [ttsManager, t]);

	const handleEngineChange = useCallback(
		async (newEngineType: TTSEngineType) => {
			setEngineType(newEngineType);
			persistSetting(STORAGE_KEY_ENGINE, newEngineType);
			ttsManager.setEngineType(newEngineType);

			if (newEngineType === "aliyun") {
				ttsManager.setAliyunSettings(aliyunSettings);
				// 如果有持久化的 API Key，自动标记为已验证
				if (aliyunSettings.apiKey) {
					setApiKeyValidated(true);
					setValidationMessage("API Key 已从本地缓存加载");
				}
			}

			await loadVoicesForEngine();
		},
		[ttsManager, aliyunSettings, loadVoicesForEngine],
	);

	const handleAliyunSettingChange = useCallback(
		(key: keyof AliyunTTSSettings, value: string | AliyunTTSModel) => {
			const updatedSettings = { ...aliyunSettings, [key]: value };
			setAliyunSettings(updatedSettings);

			// 持久化
			if (key === "apiKey") {
				persistSetting(STORAGE_KEY_API, value as string);
				setApiKeyValidated(false);
				setValidationMessage("");
			}
			if (key === "model") {
				persistSetting(STORAGE_KEY_MODEL, value as string);
			}

			if (engineType === "aliyun") {
				ttsManager.setAliyunSettings(updatedSettings);
				// 模型改变时重新加载对应模型的音色列表
				if (key === "model") {
					loadVoicesForEngine();
				}
			}
		},
		[aliyunSettings, engineType, ttsManager, loadVoicesForEngine],
	);

	const handleValidateApiKey = async () => {
		if (!aliyunSettings.apiKey) {
			toast.warning("Please enter API Key first");
			return;
		}

		setIsValidating(true);
		setValidationMessage("");

		try {
			const result = await ttsManager.validateAliyunApiKey();

			if (result.success) {
				setApiKeyValidated(true);
				setValidationMessage("API Key validated successfully");
				toast.success("API Key validated successfully");
				// 验证成功后持久化 API Key
				persistSetting(STORAGE_KEY_API, aliyunSettings.apiKey);

				// 重新加载音色列表
				const loadedVoices = await ttsManager.getVoices();
				setVoices(loadedVoices);

				if (loadedVoices.length > 0) {
					const defaultVoice = loadedVoices.find((v) => v.default) || loadedVoices[0];
					const currentSettings = settingsRef.current;
					const currentVoiceValid = loadedVoices.some((v) => v.voiceURI === currentSettings.voice);
					if (!currentVoiceValid) {
						const updatedSettings = {
							...currentSettings,
							voice: defaultVoice.voiceURI,
							lang: defaultVoice.lang,
						};
						setSettings(updatedSettings);
						ttsManager.setSettings(updatedSettings);
					}
				}
			} else {
				setApiKeyValidated(false);
				setValidationMessage(result.message);
				toast.error(result.message);
			}
		} catch (error) {
			setApiKeyValidated(false);
			const errorMsg = error instanceof Error ? error.message : "Validation failed";
			setValidationMessage(errorMsg);
			toast.error(errorMsg);
		} finally {
			setIsValidating(false);
		}
	};

	useEffect(() => {
		// 初始化：如果有持久化的设置，自动配置引擎
		const initEngine = async () => {
			if (persisted.engine === "aliyun" && persisted.apiKey) {
				ttsManager.setEngineType("aliyun");
				ttsManager.setAliyunSettings({
					apiKey: persisted.apiKey,
					model: persisted.model,
				});
				setApiKeyValidated(true);
				setValidationMessage("API Key 已从本地缓存加载");
			} else if (persisted.engine === "aliyun") {
				ttsManager.setEngineType("aliyun");
				ttsManager.setAliyunSettings({
					apiKey: "",
					model: persisted.model,
				});
			}

			if (ttsManager.isEngineAvailable()) {
				try {
					const loadedVoices = await ttsManager.getVoices();
					setVoices(loadedVoices);

					if (loadedVoices.length > 0) {
						const defaultVoice = loadedVoices.find((v) => v.default) || loadedVoices[0];
						const updatedSettings = {
							...settingsRef.current,
							voice: defaultVoice.voiceURI,
							lang: defaultVoice.lang,
						};
						setSettings(updatedSettings);
						ttsManager.setSettings(updatedSettings);
					}
				} catch (err) {
					console.error("Failed to load voices:", err);
					toast.error(t("failedToLoadVoices"));
				}
			}
		};

		initEngine();

		return () => {
			ttsManager.destroy();
		};
	}, [
		ttsManager.isEngineAvailable,
		ttsManager.setSettings,
		ttsManager.getVoices,
		ttsManager.setEngineType,
		ttsManager.destroy,
		persisted.engine,
		ttsManager.setAliyunSettings,
		t,
		persisted.model,
		persisted.apiKey,
	]);

	useEffect(() => {
		if (segments.length === 0) return;

		const previewing = ttsManager.isPreviewing();
		setIsPreviewing(previewing);
	}, [segments, ttsManager.isPreviewing]);

	// Notify parent component when TTS settings change
	useEffect(() => {
		if (onTTSSettingsChange) {
			onTTSSettingsChange(settings);
		}
	}, [settings, onTTSSettingsChange]);

	const handleGenerateAudio = async () => {
		if (captionAnnotations.length === 0) {
			toast.warning(t("noCaptionsFound"));
			return;
		}

		setIsGenerating(true);
		setGeneratingProgress({ current: 0, total: captionAnnotations.length });

		try {
			ttsManager.setSettings(settings);
			const generatedSegments = await ttsManager.synthesizeFromCaptions(
				captionAnnotations,
				(current, total) => {
					setGeneratingProgress({ current, total });
				},
			);

			setSegments(generatedSegments);
			toast.success(t("generationComplete"), {
				description: t("segmentsGenerated", { count: generatedSegments.length }),
			});
		} catch (err) {
			console.error("Failed to generate TTS audio:", err);
			toast.error(t("generationFailed"));
		} finally {
			setIsGenerating(false);
			setGeneratingProgress({ current: 0, total: 0 });
		}
	};

	const handlePreviewSegment = async (segment: CaptionAudioSegment) => {
		if (!segment.content) return;

		setPreviewSegmentId(segment.id);
		try {
			await ttsManager.previewSegment(segment);
		} catch (err) {
			console.error("Failed to preview segment:", err);
		} finally {
			setPreviewSegmentId(null);
		}
	};

	const handlePreviewAll = async () => {
		if (segments.length === 0) return;

		if (ttsManager.isPreviewing()) {
			ttsManager.cancel();
			setIsPreviewing(false);
			return;
		}

		setIsPreviewing(true);
		try {
			await ttsManager.previewAll();
		} catch (err) {
			console.error("Failed to preview all:", err);
		} finally {
			setIsPreviewing(false);
		}
	};

	const handleClear = () => {
		ttsManager.clearSegments();
		setSegments([]);
		toast.success(t("cleared") || "Cleared");
	};

	const handleSettingChange = (key: keyof TTSSettings, value: TTSSettings[keyof TTSSettings]) => {
		const updatedSettings = { ...settings, [key]: value };
		setSettings(updatedSettings);
		ttsManager.setSettings(updatedSettings);
	};

	const handleAddAllToTimeline = () => {
		if (segments.length === 0) return;

		if (onTTSSegmentsAdded) {
			onTTSSegmentsAdded(segments);
			toast.success(t("addedToTimeline") || "Added to timeline");
		}
	};

	const handleAddSegmentToTimeline = (segment: CaptionAudioSegment) => {
		if (onTTSSegmentsAdded) {
			onTTSSegmentsAdded([segment]);
			toast.success(t("segmentAdded") || "Segment added");
		}
	};

	return (
		<div className="min-w-0 flex flex-col h-full overflow-y-auto custom-scrollbar">
			<div className="mb-3">
				{!ttsManager.isEngineAvailable() && (
					<div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
						<p className="text-xs text-yellow-400">{t("engineNotAvailable")}</p>
					</div>
				)}

				<div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
					<p className="text-xs text-blue-400">
						<strong>Note:</strong> TTS preview uses your browser's speech synthesis. Direct audio
						capture for video export is not available with this API.
					</p>
				</div>

				<div className="mb-4 flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-lg">
					<div className="flex items-center gap-2">
						{muteOriginalAudio ? (
							<VolumeX className="w-4 h-4 text-slate-400" />
						) : (
							<Volume2 className="w-4 h-4 text-slate-400" />
						)}
						<Label
							htmlFor="mute-original-audio"
							className="text-xs font-medium text-slate-200 cursor-pointer"
						>
							{t("muteOriginalAudio")}
						</Label>
					</div>
					<Switch
						id="mute-original-audio"
						checked={muteOriginalAudio}
						onCheckedChange={(checked) => onMuteOriginalAudioChange?.(checked)}
					/>
				</div>

				<div className="space-y-4">
					<div>
						<label className="text-xs font-medium text-slate-200 mb-2 block">TTS Engine</label>
						<Select
							value={engineType}
							onValueChange={(value) => handleEngineChange(value as TTSEngineType)}
						>
							<SelectTrigger className="w-full bg-white/5 border-white/10 text-slate-200 h-9 text-xs">
								<SelectValue placeholder="Select engine" />
							</SelectTrigger>
							<SelectContent className="bg-[#1a1a1c] border-white/10 text-slate-200">
								<SelectItem value="web-speech">Web Speech API (Browser)</SelectItem>
								<SelectItem value="aliyun">Aliyun (Alibaba Cloud)</SelectItem>
							</SelectContent>
						</Select>
					</div>

					{engineType === "aliyun" && (
						<div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg space-y-3">
							<p className="text-xs text-blue-400 font-medium">阿里百炼 API 配置</p>
							<div>
								<div className="flex items-center justify-between">
									<Label htmlFor="apiKey" className="text-[10px] text-slate-400">
										API Key
									</Label>
									{apiKeyValidated && (
										<span className="text-[10px] text-green-400 flex items-center gap-1">
											<CheckCircle className="w-3 h-3" />
											已验证
										</span>
									)}
								</div>
								<div className="flex gap-2 mt-1">
									<Input
										id="apiKey"
										type="password"
										value={aliyunSettings.apiKey}
										onChange={(e) => handleAliyunSettingChange("apiKey", e.target.value)}
										className="flex-1 bg-white/5 border-white/10 text-slate-200 h-8 text-xs"
										placeholder="sk-xxx"
									/>
									<Button
										onClick={handleValidateApiKey}
										disabled={!aliyunSettings.apiKey || isValidating}
										size="sm"
										className="h-8 px-3 bg-blue-500 hover:bg-blue-600 text-white text-xs"
									>
										{isValidating ? (
											<div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
										) : (
											<CheckCircle className="w-4 h-4" />
										)}
									</Button>
								</div>
								{validationMessage && (
									<p
										className={`text-[10px] mt-1 ${apiKeyValidated ? "text-green-400" : "text-red-400"}`}
									>
										{validationMessage}
									</p>
								)}
							</div>
							<div>
								<Label htmlFor="model" className="text-[10px] text-slate-400">
									模型选择
								</Label>
								<Select
									value={aliyunSettings.model}
									onValueChange={(value) =>
										handleAliyunSettingChange("model", value as AliyunTTSModel)
									}
								>
									<SelectTrigger className="mt-1 bg-white/5 border-white/10 text-slate-200 h-8 text-xs">
										<SelectValue placeholder="选择模型" />
									</SelectTrigger>
									<SelectContent className="bg-[#1a1a1c] border-white/10 text-slate-200">
										{ALIYUN_MODELS.map((model) => (
											<SelectItem key={model.value} value={model.value}>
												<div>
													<span className="font-medium">{model.label}</span>
													<span className="text-[10px] text-slate-500 ml-2">
														{model.description}
													</span>
												</div>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<p className="text-[10px] text-slate-500">
								获取 API Key:{" "}
								<a
									href="https://help.aliyun.com/zh/model-studio/get-api-key"
									target="_blank"
									rel="noopener noreferrer"
									className="text-blue-400 hover:underline"
								>
									阿里百炼控制台
								</a>
							</p>
						</div>
					)}

					<div>
						<label className="text-xs font-medium text-slate-200 mb-2 block">{t("voice")}</label>
						<Select
							value={settings.voice}
							onValueChange={(value) => handleSettingChange("voice", value)}
							disabled={!ttsManager.isEngineAvailable()}
						>
							<SelectTrigger className="w-full bg-white/5 border-white/10 text-slate-200 h-9 text-xs">
								<SelectValue placeholder={t("selectVoice")} />
							</SelectTrigger>
							<SelectContent className="bg-[#1a1a1c] border-white/10 text-slate-200 max-h-[300px]">
								{voices.map((voice) => (
									<SelectItem key={voice.voiceURI} value={voice.voiceURI}>
										{voice.name}
										<span className="text-[10px] text-slate-500 ml-2">{voice.lang}</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div>
						<label className="text-xs font-medium text-slate-200 mb-2 flex items-center gap-2">
							<Speaker className="w-4 h-4" />
							{t("rate")}: {settings.rate.toFixed(1)}x
						</label>
						<Slider
							value={[settings.rate]}
							onValueChange={([value]) => handleSettingChange("rate", value)}
							min={0.5}
							max={2}
							step={0.1}
							disabled={!ttsManager.isEngineAvailable()}
							className="w-full"
						/>
					</div>

					<div>
						<label className="text-xs font-medium text-slate-200 mb-2 flex items-center gap-2">
							<Volume2 className="w-4 h-4" />
							{t("pitch")}: {settings.pitch.toFixed(1)}
						</label>
						<Slider
							value={[settings.pitch]}
							onValueChange={([value]) => handleSettingChange("pitch", value)}
							min={0.5}
							max={2}
							step={0.1}
							disabled={!ttsManager.isEngineAvailable()}
							className="w-full"
						/>
					</div>

					<div>
						<label className="text-xs font-medium text-slate-200 mb-2 flex items-center gap-2">
							<Volume2 className="w-4 h-4" />
							{t("volume")}: {Math.round(settings.volume * 100)}%
						</label>
						<Slider
							value={[settings.volume]}
							onValueChange={([value]) => handleSettingChange("volume", value)}
							min={0}
							max={1}
							step={0.1}
							disabled={!ttsManager.isEngineAvailable()}
							className="w-full"
						/>
					</div>

					<div className="space-y-2">
						<Button
							onClick={handleGenerateAudio}
							disabled={
								!ttsManager.isEngineAvailable() || isGenerating || captionAnnotations.length === 0
							}
							className="w-full gap-2 bg-[#34B27B] hover:bg-[#2a9e68] text-white transition-all"
						>
							{isGenerating ? (
								<>
									<div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
									{t("generating")}
								</>
							) : (
								<>
									<Mic className="w-4 h-4" />
									{t("generate")}
								</>
							)}
						</Button>

						{isGenerating && generatingProgress.total > 0 && (
							<div className="space-y-1">
								<div className="flex justify-between text-[10px] text-slate-400">
									<span>生成进度</span>
									<span>
										{generatingProgress.current} / {generatingProgress.total}
									</span>
								</div>
								<div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
									<div
										className="h-full bg-[#34B27B] transition-all duration-300"
										style={{
											width: `${(generatingProgress.current / generatingProgress.total) * 100}%`,
										}}
									/>
								</div>
							</div>
						)}

						{engineType === "aliyun" && (
							<p className="text-[10px] text-slate-500 text-center">
								点击后将调用阿里云 API 生成并下载音频
							</p>
						)}

						<Button
							onClick={handlePreviewAll}
							disabled={!ttsManager.isEngineAvailable() || segments.length === 0}
							variant="outline"
							className="w-full gap-2 bg-white/5 text-slate-200 border-white/10 hover:bg-white/10 transition-all"
						>
							{isPreviewing ? (
								<>
									<Pause className="w-4 h-4" />
									{t("previewing")}
								</>
							) : (
								<>
									<Play className="w-4 h-4" />
									{t("previewAll")}
								</>
							)}
						</Button>
					</div>

					{segments.length > 0 && (
						<div className="mt-3 grid grid-cols-2 gap-2">
							<Button
								onClick={handleAddAllToTimeline}
								disabled={!onTTSSegmentsAdded}
								className="w-full gap-2 bg-blue-500 hover:bg-blue-600 text-white transition-all"
							>
								<PlusCircle className="w-4 h-4" />
								{t("addAllToTimeline") || "Add All"}
							</Button>

							<Button
								onClick={handleClear}
								variant="outline"
								className="w-full gap-2 bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20 hover:border-red-500/30 transition-all"
							>
								<Trash2 className="w-4 h-4" />
								{t("clear")}
							</Button>
						</div>
					)}
				</div>

				{segments.length > 0 && (
					<div className="mt-6">
						<h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
							{t("generatedSegments")}
						</h3>
						<div className="space-y-2 max-h-[200px] overflow-y-auto">
							{segments.map((segment) => (
								<div
									key={segment.id}
									className="p-3 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors"
								>
									<div className="flex items-center justify-between gap-2">
										<div className="flex-1 min-w-0">
											<p className="text-xs text-slate-200 truncate">{segment.content}</p>
											<p className="text-[10px] text-slate-500 mt-1">
												{(segment.startMs / 1000).toFixed(1)}s - {(segment.endMs / 1000).toFixed(1)}
												s
											</p>
										</div>
										<div className="flex items-center gap-1">
											{segment.content && (
												<Button
													onClick={() => handlePreviewSegment(segment)}
													variant="ghost"
													size="sm"
													className="h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-white/10"
													disabled={previewSegmentId === segment.id}
												>
													<Play className="w-4 h-4" />
												</Button>
											)}
											<Button
												onClick={() => handleAddSegmentToTimeline(segment)}
												variant="ghost"
												size="sm"
												className="h-8 w-8 p-0 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
												disabled={!onTTSSegmentsAdded}
											>
												<PlusCircle className="w-4 h-4" />
											</Button>
										</div>
									</div>
								</div>
							))}
						</div>
					</div>
				)}

				{captionAnnotations.length > 0 && (
					<div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
						<p className="text-xs text-blue-400">
							{t("captionsAvailable", { count: captionAnnotations.length })}
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
