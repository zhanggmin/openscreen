/**
 * 字幕 TTS 语音生成 Hook
 *
 * 复用视频编辑器的 localStorage 配置（API Key / Model），
 * 提供分组生成和单条生成两种模式。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Subtitle, SubtitleAudio, SubtitleAudioGroup } from "@/lib/demobuilder/types";
import { AliyunEngine } from "@/lib/tts/aliyunEngine";
import type { AliyunTTSModel, AliyunTTSSettings, TTSSettings, TTSVoice } from "@/lib/tts/types";

// 与视频编辑器共享 localStorage key
const STORAGE_KEY_API = "openscreen-aliyun-tts-apikey";
const STORAGE_KEY_MODEL = "openscreen-aliyun-tts-model";

function loadAliyunSettings(): AliyunTTSSettings {
	try {
		return {
			apiKey: localStorage.getItem(STORAGE_KEY_API) || "",
			model: (localStorage.getItem(STORAGE_KEY_MODEL) as AliyunTTSModel) || "cosyvoice-v3-flash",
		};
	} catch {
		return { apiKey: "", model: "cosyvoice-v3-flash" };
	}
}

function getDefaultTTSSettings(): TTSSettings {
	return { voice: "", rate: 1.0, pitch: 1.0, volume: 1.0, lang: "zh-CN" };
}

/** 将 Blob 转换为 base64 data URL（可持久化到项目 JSON） */
function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => resolve(reader.result as string);
		reader.onerror = () => reject(new Error("Failed to convert blob to data URL"));
		reader.readAsDataURL(blob);
	});
}

/** 将 AudioBuffer 转换为 WAV Blob */
function audioBufferToWav(buffer: AudioBuffer): Blob {
	const numChannels = buffer.numberOfChannels;
	const sampleRate = buffer.sampleRate;
	const bitDepth = 16;
	const bytesPerSample = bitDepth / 8;
	const blockAlign = numChannels * bytesPerSample;
	const dataLength = buffer.length * blockAlign;
	const bufferLength = 44 + dataLength;
	const arrayBuffer = new ArrayBuffer(bufferLength);
	const view = new DataView(arrayBuffer);

	const writeStr = (offset: number, s: string) => {
		for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
	};

	writeStr(0, "RIFF");
	view.setUint32(4, 36 + dataLength, true);
	writeStr(8, "WAVE");
	writeStr(12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true); // PCM
	view.setUint16(22, numChannels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * blockAlign, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, bitDepth, true);
	writeStr(36, "data");
	view.setUint32(40, dataLength, true);

	const channels: Float32Array[] = [];
	for (let i = 0; i < numChannels; i++) channels.push(buffer.getChannelData(i));

	let offset = 44;
	for (let i = 0; i < buffer.length; i++) {
		for (let ch = 0; ch < numChannels; ch++) {
			const sample = Math.max(-1, Math.min(1, channels[ch][i]));
			view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
			offset += 2;
		}
	}

	return new Blob([arrayBuffer], { type: "audio/wav" });
}

export interface UseSubtitleTTSReturn {
	/** 引擎是否可用（已配置 API Key） */
	isAvailable: boolean;
	/** 是否正在生成 */
	isGenerating: boolean;
	/** 可用音色列表 */
	voices: TTSVoice[];
	/** 当前选中的音色 */
	selectedVoice: string;
	setSelectedVoice: (voice: string) => void;
	/** 为一组字幕生成语音（拼接文本 → 一次 TTS → 按比例分配时长） */
	generateForGroup: (
		groupId: string,
		subtitles: Subtitle[],
	) => Promise<{ audioGroup: SubtitleAudioGroup; updatedSubtitles: Subtitle[] } | null>;
	/** 为单条字幕生成语音 */
	generateForSingle: (subtitle: Subtitle) => Promise<{ audio: SubtitleAudio } | null>;
	/** 试听音频 URL */
	previewAudio: (url: string) => void;
	/** 停止试听 */
	stopPreview: () => void;
	/** 是否正在试听 */
	isPreviewing: boolean;
}

export function useSubtitleTTS(): UseSubtitleTTSReturn {
	const engineRef = useRef<AliyunEngine | null>(null);
	const previewAudioRef = useRef<HTMLAudioElement | null>(null);
	const [isAvailable, setIsAvailable] = useState(false);
	const [isGenerating, setIsGenerating] = useState(false);
	const [voices, setVoices] = useState<TTSVoice[]>([]);
	const [selectedVoice, setSelectedVoice] = useState("");
	const [isPreviewing, setIsPreviewing] = useState(false);

	// 初始化引擎
	useEffect(() => {
		const engine = new AliyunEngine();
		const settings = loadAliyunSettings();
		engine.setAliyunSettings(settings);
		engineRef.current = engine;
		setIsAvailable(engine.isAvailable());

		// 加载音色列表
		if (engine.isAvailable()) {
			engine.getVoices().then((loadedVoices) => {
				setVoices(loadedVoices);
				if (loadedVoices.length > 0) {
					const defaultV = loadedVoices.find((v) => v.default) || loadedVoices[0];
					setSelectedVoice(defaultV.voiceURI);
				}
			});
		}

		return () => {
			engine.cancel();
			engineRef.current = null;
		};
	}, []);

	const buildTTSSettings = useCallback(
		(voiceId?: string): TTSSettings => ({
			...getDefaultTTSSettings(),
			voice: voiceId || selectedVoice,
		}),
		[selectedVoice],
	);

	/** 合成文本并返回 data URL（base64，可持久化）+ duration */
	const synthesizeToUrl = useCallback(
		async (text: string, voiceId?: string): Promise<{ url: string; duration: number }> => {
			const engine = engineRef.current;
			if (!engine || !engine.isAvailable()) {
				throw new Error("TTS 引擎未配置，请在视频编辑器中设置 API Key");
			}

			const settings = buildTTSSettings(voiceId);
			const audioBuffer = await engine.synthesize(text, settings);
			const duration = Math.round(audioBuffer.duration * 1000);
			const blob = audioBufferToWav(audioBuffer);
			// 转为 base64 data URL 以便持久化到项目 JSON
			const url = await blobToDataUrl(blob);

			return { url, duration };
		},
		[buildTTSSettings],
	);

	const generateForGroup = useCallback(
		async (
			groupId: string,
			subtitles: Subtitle[],
		): Promise<{ audioGroup: SubtitleAudioGroup; updatedSubtitles: Subtitle[] } | null> => {
			if (subtitles.length === 0) return null;

			setIsGenerating(true);
			try {
				// 拼接组内所有字幕文本
				const concatText = subtitles.map((s) => s.text).join("，");
				const { url, duration } = await synthesizeToUrl(concatText);

				const voiceId = selectedVoice;
				const audio: SubtitleAudio = {
					url,
					duration,
					provider: "aliyun",
					voiceId,
				};

				const audioGroup: SubtitleAudioGroup = {
					id: groupId,
					text: concatText,
					audio,
				};

				// 按字符比例分配时长
				const totalChars = subtitles.reduce((sum, s) => sum + s.text.length, 0);
				if (totalChars === 0) return null;

				const groupStart = subtitles[0].start;
				let cursor = groupStart;
				const updatedSubtitles = subtitles.map((sub) => {
					const ratio = sub.text.length / totalChars;
					const subDuration = Math.round(duration * ratio);
					const updated: Subtitle = {
						...sub,
						start: cursor,
						end: cursor + subDuration,
						audio: null, // 组字幕不单独存储 audio
					};
					cursor += subDuration;
					return updated;
				});

				return { audioGroup, updatedSubtitles };
			} catch (err) {
				console.error("字幕分组 TTS 生成失败:", err);
				toast.error(err instanceof Error ? err.message : "TTS 生成失败");
				return null;
			} finally {
				setIsGenerating(false);
			}
		},
		[synthesizeToUrl, selectedVoice],
	);

	const generateForSingle = useCallback(
		async (subtitle: Subtitle): Promise<{ audio: SubtitleAudio } | null> => {
			if (!subtitle.text.trim()) return null;

			setIsGenerating(true);
			try {
				const { url, duration } = await synthesizeToUrl(subtitle.text);

				const voiceId = selectedVoice;
				const audio: SubtitleAudio = {
					url,
					duration,
					provider: "aliyun",
					voiceId,
				};

				return { audio };
			} catch (err) {
				console.error("字幕单条 TTS 生成失败:", err);
				toast.error(err instanceof Error ? err.message : "TTS 生成失败");
				return null;
			} finally {
				setIsGenerating(false);
			}
		},
		[synthesizeToUrl, selectedVoice],
	);

	const previewAudio = useCallback((url: string) => {
		// 停止当前试听
		if (previewAudioRef.current) {
			previewAudioRef.current.pause();
			previewAudioRef.current = null;
		}

		const audio = new Audio(url);
		previewAudioRef.current = audio;
		setIsPreviewing(true);

		audio.onended = () => {
			if (previewAudioRef.current === audio) {
				previewAudioRef.current = null;
				setIsPreviewing(false);
			}
		};
		audio.onerror = () => {
			if (previewAudioRef.current === audio) {
				previewAudioRef.current = null;
				setIsPreviewing(false);
			}
		};

		audio.play().catch(() => {
			previewAudioRef.current = null;
			setIsPreviewing(false);
		});
	}, []);

	const stopPreview = useCallback(() => {
		if (previewAudioRef.current) {
			previewAudioRef.current.pause();
			previewAudioRef.current.currentTime = 0;
			previewAudioRef.current = null;
		}
		setIsPreviewing(false);
	}, []);

	return {
		isAvailable,
		isGenerating,
		voices,
		selectedVoice,
		setSelectedVoice,
		generateForGroup,
		generateForSingle,
		previewAudio,
		stopPreview,
		isPreviewing,
	};
}
