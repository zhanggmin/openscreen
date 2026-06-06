import type { AnnotationRegion } from "@/components/video-editor/types";
import { AliyunEngine } from "./aliyunEngine";
import type {
	AliyunTTSSettings,
	CaptionAudioSegment,
	TTSEngine,
	TTSEngineType,
	TTSSettings,
} from "./types";
import { WebSpeechEngine } from "./webSpeechEngine";

export class TTSManager {
	private engine: TTSEngine;
	private webSpeechEngine: WebSpeechEngine;
	private aliyunEngine: AliyunEngine;
	private currentEngineType: TTSEngineType = "web-speech";
	private aliyunSettings: AliyunTTSSettings | null = null;
	private settings: TTSSettings;
	private segments: CaptionAudioSegment[] = [];
	private previewing: boolean = false;
	private currentAudio: HTMLAudioElement | null = null;

	constructor() {
		this.webSpeechEngine = new WebSpeechEngine();
		this.aliyunEngine = new AliyunEngine();
		this.engine = this.webSpeechEngine;
		this.settings = this.getDefaultSettings();
	}

	private getDefaultSettings(): TTSSettings {
		return {
			voice: "",
			rate: 1.0,
			pitch: 1.0,
			volume: 1.0,
			lang: "en-US",
		};
	}

	setEngineType(engineType: TTSEngineType): void {
		this.currentEngineType = engineType;
		if (engineType === "aliyun") {
			if (this.aliyunSettings) {
				this.aliyunEngine.setAliyunSettings(this.aliyunSettings);
			}
			this.engine = this.aliyunEngine;
		} else {
			this.engine = this.webSpeechEngine;
		}
	}

	getEngineType(): TTSEngineType {
		return this.currentEngineType;
	}

	setAliyunSettings(settings: AliyunTTSSettings): void {
		this.aliyunSettings = settings;
		this.aliyunEngine.setAliyunSettings(settings);
	}

	getAliyunSettings(): AliyunTTSSettings | null {
		return this.aliyunSettings;
	}

	isEngineAvailable(): boolean {
		return this.engine.isAvailable();
	}

	isAliyunApiKeyValidated(): boolean {
		if (this.currentEngineType === "aliyun") {
			return this.aliyunEngine.isApiKeyValidated();
		}
		return false;
	}

	async validateAliyunApiKey(): Promise<{ success: boolean; message: string }> {
		if (this.currentEngineType === "aliyun") {
			return this.aliyunEngine.validateApiKey();
		}
		return { success: false, message: "Not using Aliyun engine" };
	}

	async getVoices() {
		return this.engine.getVoices();
	}

	setSettings(settings: Partial<TTSSettings>): void {
		this.settings = { ...this.settings, ...settings };
	}

	getSettings(): TTSSettings {
		return { ...this.settings };
	}

	async synthesizeFromCaptions(
		regions: AnnotationRegion[],
		onProgress?: (_processed: number, _total: number) => void,
	): Promise<CaptionAudioSegment[]> {
		if (!this.engine.isAvailable()) {
			throw new Error("TTS engine is not available");
		}

		// 创建基础 segments
		const baseSegments = regions
			.filter((r) => r.annotationSource === "auto-caption" && (r.content || r.textContent))
			.map((r, i) => ({
				id: `tts-${i}`,
				startMs: r.startMs,
				endMs: r.endMs || r.startMs + 2000,
				content: r.textContent || r.content,
				audioBuffer: null as AudioBuffer | null,
				blobUrl: null as string | null,
			}));

		this.segments = baseSegments;

		// 对于阿里云引擎，实际合成音频并下载
		if (this.currentEngineType === "aliyun" && this.aliyunEngine) {
			const total = baseSegments.length;
			for (let i = 0; i < baseSegments.length; i++) {
				const segment = baseSegments[i];
				if (segment.content) {
					try {
						// 调用API合成音频
						const audioBuffer = await this.engine.synthesize(segment.content, this.settings);

						// 转换为 blob URL 以便播放
						const wavBlob = this.audioBufferToWav(audioBuffer);
						const blobUrl = URL.createObjectURL(wavBlob);

						// 更新 segment，用实际音频时长设置 endMs
						const actualDurationMs = Math.round(audioBuffer.duration * 1000);
						this.segments[i] = {
							...segment,
							endMs: segment.startMs + actualDurationMs,
							audioBuffer,
							blobUrl,
						};
					} catch (error) {
						console.error(`Failed to synthesize segment ${i}:`, error);
					}
				}

				// 报告进度
				if (onProgress) {
					onProgress(i + 1, total);
				}
			}
		} else {
			// Web Speech API 无法预先捕获音频
			if (onProgress) {
				onProgress(baseSegments.length, baseSegments.length);
			}
		}

		return this.segments;
	}

	// 将 AudioBuffer 转换为 WAV 格式
	private audioBufferToWav(buffer: AudioBuffer): Blob {
		const numChannels = buffer.numberOfChannels;
		const sampleRate = buffer.sampleRate;
		const format = 1; // PCM
		const bitDepth = 16;

		const bytesPerSample = bitDepth / 8;
		const blockAlign = numChannels * bytesPerSample;

		const dataLength = buffer.length * blockAlign;
		const bufferLength = 44 + dataLength;

		const arrayBuffer = new ArrayBuffer(bufferLength);
		const view = new DataView(arrayBuffer);

		// WAV header
		const writeString = (offset: number, string: string) => {
			for (let i = 0; i < string.length; i++) {
				view.setUint8(offset + i, string.charCodeAt(i));
			}
		};

		writeString(0, "RIFF");
		view.setUint32(4, 36 + dataLength, true);
		writeString(8, "WAVE");
		writeString(12, "fmt ");
		view.setUint32(16, 16, true);
		view.setUint16(20, format, true);
		view.setUint16(22, numChannels, true);
		view.setUint32(24, sampleRate, true);
		view.setUint32(28, sampleRate * blockAlign, true);
		view.setUint16(32, blockAlign, true);
		view.setUint16(34, bitDepth, true);
		writeString(36, "data");
		view.setUint32(40, dataLength, true);

		// 写入音频数据
		const channels: Float32Array[] = [];
		for (let i = 0; i < numChannels; i++) {
			channels.push(buffer.getChannelData(i));
		}

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

	getSegments(): CaptionAudioSegment[] {
		return [...this.segments];
	}

	clearSegments(): void {
		this.segments = [];
	}

	async previewSegment(segment: CaptionAudioSegment): Promise<void> {
		if (!segment.content) return;

		// 先取消任何正在进行的播放
		this.stopCurrentAudio();
		this.engine.cancel();
		// 等待一小会儿，确保取消完成
		await new Promise((resolve) => setTimeout(resolve, 100));

		// 如果已有下载的音频，直接播放
		if (segment.blobUrl) {
			const audio = new Audio(segment.blobUrl);
			this.currentAudio = audio;
			await audio.play();

			// 等待播放完成
			return new Promise((resolve, reject) => {
				audio.onended = () => {
					if (this.currentAudio === audio) this.currentAudio = null;
					resolve();
				};
				audio.onerror = (e) => {
					if (this.currentAudio === audio) this.currentAudio = null;
					reject(e);
				};
			});
		}

		// 否则实时生成并播放
		await this.engine.speak(segment.content, this.settings);
	}

	async previewAll(): Promise<void> {
		if (this.previewing) {
			this.stopCurrentAudio();
			this.engine.cancel();
			this.previewing = false;
			return;
		}

		// 先取消任何正在进行的播放
		this.stopCurrentAudio();
		this.engine.cancel();
		// 等待一小会儿，确保取消完成
		await new Promise((resolve) => setTimeout(resolve, 100));

		this.previewing = true;

		try {
			for (const segment of this.segments) {
				if (!this.previewing) break;

				if (segment.content) {
					// 如果已有下载的音频，直接播放
					if (segment.blobUrl) {
						const audio = new Audio(segment.blobUrl);
						this.currentAudio = audio;
						await audio.play();
						// 等待这个片段播放完成
						await new Promise((resolve) => {
							audio.onended = () => {
								if (this.currentAudio === audio) this.currentAudio = null;
								resolve(undefined);
							};
							audio.onerror = () => {
								if (this.currentAudio === audio) this.currentAudio = null;
								resolve(undefined);
							};
						});
					} else {
						// 否则实时生成并播放
						await this.engine.speak(segment.content, this.settings);
					}
				}
			}
		} finally {
			this.previewing = false;
		}
	}

	cancel(): void {
		this.stopCurrentAudio();
		this.engine.cancel();
		this.previewing = false;
	}

	private stopCurrentAudio(): void {
		if (this.currentAudio) {
			this.currentAudio.pause();
			this.currentAudio.currentTime = 0;
			this.currentAudio = null;
		}
	}

	destroy(): void {
		this.clearSegments();
		this.engine.cancel();
	}

	isPreviewing(): boolean {
		return this.previewing;
	}
}
