/**
 * DemoBuilder 视频导出器
 *
 * 将图文项目（截图序列 + 步骤 + 光标动画 + 音频）导出为 MP4 视频。
 * 复用现有编码管线：VideoEncoder (WebCodecs) + VideoMuxer (mediabunny) + AudioProcessor。
 *
 * 导出流程：
 *   1. computeDemoTimeline() — 计算时间线
 *   2. DemoFrameRenderer — 逐帧渲染到 Canvas
 *   3. VideoEncoder — Canvas → VideoFrame → 编码
 *   4. AudioProcessor — TTS/背景音乐混合 → 编码
 *   5. VideoMuxer — 封装为 MP4 Blob
 */

import {
	AudioProcessor,
	type ExportAudioCodec,
	type ExportTTSRegion,
} from "@/lib/exporter/audioEncoder";
import { VideoMuxer } from "@/lib/exporter/muxer";
import type { ExportProgress, ExportResult } from "@/lib/exporter/types";
import { DemoFrameRenderer } from "./demoFrameRenderer";
import { computeDemoTimeline, findSegmentAtTime, type TimelineSegment } from "./demoTimeline";
import type { DemoProject, VideoResolution } from "./types";

// ─── 常量 ─────────────────────────────────────────────────────────────────────

const ENCODER_STALL_TIMEOUT_MS = 15_000;
const ENCODER_FLUSH_TIMEOUT_MS = 20_000;

const RESOLUTION_MAP: Record<VideoResolution, { width: number; height: number }> = {
	"1080p": { width: 1920, height: 1080 },
	"2k": { width: 2560, height: 1440 },
	"4k": { width: 3840, height: 2160 },
};

const BITRATE_MAP: Record<VideoResolution, number> = {
	"1080p": 8_000_000,
	"2k": 16_000_000,
	"4k": 32_000_000,
};

// ─── 配置 ─────────────────────────────────────────────────────────────────────

export interface DemoVideoExporterConfig {
	project: DemoProject;
	width: number;
	height: number;
	frameRate: number;
	bitrate: number;
	onProgress?: (progress: ExportProgress) => void;
}

// ─── 导出器 ───────────────────────────────────────────────────────────────────

export class DemoVideoExporter {
	private config: DemoVideoExporterConfig;
	private renderer: DemoFrameRenderer | null = null;
	private encoder: VideoEncoder | null = null;
	private muxer: VideoMuxer | null = null;
	private audioProcessor: AudioProcessor | null = null;
	private cancelled = false;
	private encodeQueue = 0;
	private readonly MAX_ENCODE_QUEUE = 120;
	private muxingPromises: Promise<void>[] = [];
	private chunkCount = 0;
	private lastEncoderOutputAt = 0;
	private fatalEncoderError: Error | null = null;
	private videoDescription: Uint8Array | undefined;
	private videoColorSpace: VideoColorSpaceInit | undefined;

	constructor(config: DemoVideoExporterConfig) {
		this.config = config;
	}

	/** 执行完整导出流程，返回 MP4 Blob。 */
	async export(): Promise<ExportResult> {
		const encoderPreferences = this.getEncoderPreferences();
		let lastError: Error | null = null;

		for (const pref of encoderPreferences) {
			try {
				return await this.exportWithPreference(pref);
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error));
				lastError = err;
				if (this.cancelled) return { success: false, error: "Export cancelled" };
				if (encoderPreferences.length > 1) {
					console.warn(`[DemoVideoExporter] ${pref} attempt failed:`, err);
				}
			} finally {
				this.cleanup();
			}
		}

		return { success: false, error: lastError?.message ?? "Export failed" };
	}

	/** 取消正在进行的导出。 */
	cancel(): void {
		this.cancelled = true;
		if (this.audioProcessor) this.audioProcessor.cancel();
		this.cleanup();
	}

	// ─── 核心导出 ──────────────────────────────────────────────────────────────

	private async exportWithPreference(
		hardwareAcceleration: HardwareAcceleration,
	): Promise<ExportResult> {
		const { project, width, height, frameRate, bitrate } = this.config;

		this.cleanup();
		this.cancelled = false;
		this.fatalEncoderError = null;

		// 1. 计算时间线
		const timeline = computeDemoTimeline(project, frameRate);
		if (timeline.segments.length === 0) {
			return { success: false, error: "No steps in project" };
		}

		// 2. 初始化帧渲染器
		const renderer = new DemoFrameRenderer({
			width,
			height,
			background: project.settings.background,
			appearance: project.settings.appearance,
		});
		this.renderer = renderer;
		await renderer.initialize();

		// 预加载截图资源
		await renderer.preloadAssets(project.screenshots.map((ss) => ({ id: ss.id, url: ss.url })));

		// 预加载光标（如果有自定义光标）
		const cursorType = project.settings.defaultCursorType;
		if (cursorType === "custom") {
			const customUrl = project.steps.find((s) => s.cursor.customIconUrl)?.cursor.customIconUrl;
			await renderer.preloadCursor(customUrl);
		}

		// 3. 初始化编码器
		await this.initializeEncoder(hardwareAcceleration, width, height, frameRate, bitrate);

		// 4. 初始化 Muxer
		const audioExportCodec = await AudioProcessor.selectSupportedExportCodec(48000, 2);
		const hasAudio = Boolean(audioExportCodec);
		const muxer = new VideoMuxer(
			{ width, height, frameRate, bitrate },
			hasAudio,
			audioExportCodec?.muxerCodec,
		);
		this.muxer = muxer;
		await muxer.initialize();

		// 5. 逐帧渲染 + 编码
		const frameDuration = 1_000_000 / frameRate;
		let frameIndex = 0;
		const maxQueue =
			hardwareAcceleration === "prefer-software"
				? Math.min(this.MAX_ENCODE_QUEUE, 32)
				: this.MAX_ENCODE_QUEUE;

		for (let i = 0; i < timeline.totalFrames; i++) {
			if (this.cancelled) break;
			if (this.fatalEncoderError) throw this.fatalEncoderError;

			const globalTimeMs = (i / frameRate) * 1000;
			const segment = findSegmentAtTime(timeline.segments, globalTimeMs);
			if (!segment) continue;

			// 查找下一个 segment（用于转场渲染）
			const nextSegment =
				segment.stepIndex < timeline.segments.length - 1
					? timeline.segments[segment.stepIndex + 1]
					: null;

			// 渲染帧
			renderer.renderFrame(segment, globalTimeMs, nextSegment);

			// 从 Canvas 创建 VideoFrame
			const timestamp = frameIndex * frameDuration;
			const canvas = renderer.getCanvas();
			const exportFrame = new VideoFrame(canvas, {
				timestamp,
				duration: frameDuration,
			});

			// 背压控制
			while (this.encoder && this.encoder.encodeQueueSize >= maxQueue && !this.cancelled) {
				if (Date.now() - this.lastEncoderOutputAt > ENCODER_STALL_TIMEOUT_MS) {
					exportFrame.close();
					throw new Error("Video encoder stopped responding during export.");
				}
				await new Promise((resolve) => setTimeout(resolve, 5));
			}

			if (this.encoder && this.encoder.state === "configured") {
				this.encodeQueue++;
				this.encoder.encode(exportFrame, { keyFrame: frameIndex % 150 === 0 });
			}

			exportFrame.close();
			frameIndex++;

			// 进度回调
			this.config.onProgress?.({
				currentFrame: frameIndex,
				totalFrames: timeline.totalFrames,
				percentage: (frameIndex / timeline.totalFrames) * 100,
				estimatedTimeRemaining: 0,
			});
		}

		if (this.cancelled) {
			return { success: false, error: "Export cancelled" };
		}

		if (this.fatalEncoderError) {
			throw this.fatalEncoderError;
		}

		// 6. Flush encoder
		if (this.encoder && this.encoder.state === "configured") {
			await this.withTimeout(
				this.encoder.flush(),
				ENCODER_FLUSH_TIMEOUT_MS,
				"Video encoder stopped responding while finalizing the export.",
			);
		}

		if (this.fatalEncoderError) {
			throw this.fatalEncoderError;
		}

		await Promise.all(this.muxingPromises);

		// 7. 处理音频
		if (hasAudio && audioExportCodec && !this.cancelled) {
			await this.processAudio(timeline, audioExportCodec, muxer);
		}

		// 8. 完成
		this.config.onProgress?.({
			currentFrame: timeline.totalFrames,
			totalFrames: timeline.totalFrames,
			percentage: 100,
			estimatedTimeRemaining: 0,
			phase: "finalizing",
		});

		const blob = await muxer.finalize();
		return { success: true, blob };
	}

	// ─── 编码器初始化 ──────────────────────────────────────────────────────────

	private async initializeEncoder(
		hardwareAcceleration: HardwareAcceleration,
		width: number,
		height: number,
		frameRate: number,
		bitrate: number,
	): Promise<void> {
		this.encodeQueue = 0;
		this.muxingPromises = [];
		this.chunkCount = 0;
		this.lastEncoderOutputAt = Date.now();
		this.fatalEncoderError = null;

		this.encoder = new VideoEncoder({
			output: (chunk, meta) => {
				this.lastEncoderOutputAt = Date.now();

				if (meta?.decoderConfig?.description && !this.videoDescription) {
					const desc = meta.decoderConfig.description;
					if (desc instanceof ArrayBuffer || desc instanceof SharedArrayBuffer) {
						this.videoDescription = new Uint8Array(desc);
					} else if (ArrayBuffer.isView(desc)) {
						this.videoDescription = new Uint8Array(desc.buffer, desc.byteOffset, desc.byteLength);
					}
				}

				if (meta?.decoderConfig?.colorSpace && !this.videoColorSpace) {
					this.videoColorSpace = meta.decoderConfig.colorSpace;
				}

				const isFirstChunk = this.chunkCount === 0;
				this.chunkCount++;

				const muxingPromise = (async () => {
					try {
						if (isFirstChunk && this.videoDescription) {
							const colorSpace = this.videoColorSpace || {
								primaries: "bt709",
								transfer: "iec61966-2-1",
								matrix: "rgb",
								fullRange: true,
							};
							const metadata: EncodedVideoChunkMetadata = {
								decoderConfig: {
									codec: "avc1.640033",
									codedWidth: width,
									codedHeight: height,
									description: this.videoDescription,
									colorSpace,
								},
							};
							await this.muxer!.addVideoChunk(chunk, metadata);
						} else {
							await this.muxer!.addVideoChunk(chunk, meta);
						}
					} catch (error) {
						console.error("[DemoVideoExporter] Muxing error:", error);
					}
				})();

				this.muxingPromises.push(muxingPromise);
				this.encodeQueue = Math.max(0, this.encodeQueue - 1);
			},
			error: (error) => {
				console.error("[DemoVideoExporter] Encoder error:", error);
				this.fatalEncoderError =
					error instanceof Error ? error : new Error(`Video encoder error: ${String(error)}`);
			},
		});

		const encoderConfig: VideoEncoderConfig = {
			codec: "avc1.640033",
			width,
			height,
			bitrate,
			framerate: frameRate,
			latencyMode: "quality",
			bitrateMode: "variable",
			hardwareAcceleration,
		};

		const support = await VideoEncoder.isConfigSupported(encoderConfig);
		if (!support.supported) {
			throw new Error(
				hardwareAcceleration === "prefer-hardware"
					? "Hardware video encoding is not supported on this system."
					: "Software video encoding is not supported on this system.",
			);
		}

		console.log(
			`[DemoVideoExporter] Using ${hardwareAcceleration === "prefer-hardware" ? "hardware" : "software"} acceleration`,
		);
		this.encoder.configure(encoderConfig);
	}

	// ─── 音频处理 ──────────────────────────────────────────────────────────────

	private async processAudio(
		timeline: { segments: TimelineSegment[]; totalDurationMs: number },
		exportCodec: ExportAudioCodec,
		muxer: VideoMuxer,
	): Promise<void> {
		const { project } = this.config;
		const totalDurationSec = timeline.totalDurationMs / 1000;

		// 构建 TTS regions
		const ttsRegions: ExportTTSRegion[] = [];
		for (const segment of timeline.segments) {
			const voice = segment.step.voice;
			if (voice?.audioUrl && voice.duration > 0) {
				ttsRegions.push({
					id: `tts-${segment.stepId}`,
					startMs: segment.startTimeMs,
					endMs: segment.startTimeMs + voice.duration,
					blobUrl: voice.audioUrl,
				});
			}
		}

		// 点击音效 regions
		if (project.settings.sound.clickSoundEnabled) {
			for (const segment of timeline.segments) {
				if (segment.step.cursor.clickSound) {
					ttsRegions.push({
						id: `click-${segment.stepId}`,
						startMs: segment.clickTimeMs,
						endMs: segment.clickTimeMs + 200,
						blobUrl: "/sounds/click.mp3",
					});
				}
			}
		}

		if (ttsRegions.length === 0 && !project.settings.sound.backgroundMusicPath) {
			return;
		}

		this.audioProcessor = new AudioProcessor();

		// 渲染 TTS + 点击音效混合的 AudioBuffer
		const audioBuffer = await this.renderDemoAudioBuffer(
			ttsRegions,
			project.settings.sound.backgroundMusicPath,
			project.settings.sound.backgroundMusicVolume,
			totalDurationSec,
		);

		if (!this.cancelled && audioBuffer) {
			await this.encodeAndMuxAudioBuffer(audioBuffer, muxer, exportCodec);
		}
	}

	/**
	 * 将所有音频源混合到一个 AudioBuffer 中。
	 */
	private async renderDemoAudioBuffer(
		ttsRegions: ExportTTSRegion[],
		backgroundMusicPath: string | null,
		backgroundMusicVolume: number,
		totalDurationSec: number,
	): Promise<AudioBuffer | null> {
		const sampleRate = 48000;
		const totalSamples = Math.ceil(totalDurationSec * sampleRate);
		if (totalSamples <= 0) return null;

		const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);
		const audioCtx = new AudioContext({ sampleRate });
		let scheduledCount = 0;

		try {
			// 调度 TTS 和点击音效
			for (const region of ttsRegions) {
				if (this.cancelled) break;
				let arrayBuffer: ArrayBuffer | null = null;

				if (region.blobUrl) {
					try {
						const response = await fetch(region.blobUrl);
						if (response.ok) {
							arrayBuffer = await response.arrayBuffer();
						}
					} catch (err) {
						console.warn(`[DemoVideoExporter] Failed to fetch audio for ${region.id}:`, err);
					}
				}

				if (!arrayBuffer || arrayBuffer.byteLength === 0) continue;

				try {
					const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
					const source = offlineCtx.createBufferSource();
					source.buffer = decoded;
					source.connect(offlineCtx.destination);
					source.start(region.startMs / 1000);
					scheduledCount++;
				} catch (err) {
					console.warn(`[DemoVideoExporter] Failed to decode audio for ${region.id}:`, err);
				}
			}

			// 背景音乐
			if (backgroundMusicPath) {
				try {
					const response = await fetch(backgroundMusicPath);
					if (response.ok) {
						const musicBuffer = await audioCtx.decodeAudioData(
							(await response.arrayBuffer()).slice(0),
						);
						const source = offlineCtx.createBufferSource();
						source.buffer = musicBuffer;
						source.loop = true;

						const gainNode = offlineCtx.createGain();
						gainNode.gain.value = backgroundMusicVolume;

						source.connect(gainNode);
						gainNode.connect(offlineCtx.destination);
						source.start(0);
						scheduledCount++;
					}
				} catch (err) {
					console.warn("[DemoVideoExporter] Failed to load background music:", err);
				}
			}

			if (scheduledCount === 0) return null;
			return await offlineCtx.startRendering();
		} finally {
			await audioCtx.close();
		}
	}

	/**
	 * 将 AudioBuffer 编码并写入 Muxer（复用 AudioProcessor 的逻辑模式）。
	 */
	private async encodeAndMuxAudioBuffer(
		audioBuffer: AudioBuffer,
		muxer: VideoMuxer,
		exportCodec: ExportAudioCodec,
	): Promise<void> {
		const encodedChunks: { chunk: EncodedAudioChunk; meta?: EncodedAudioChunkMetadata }[] = [];

		const encoder = new AudioEncoder({
			output: (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => {
				encodedChunks.push({ chunk, meta });
			},
			error: (e: DOMException) => console.error("[DemoVideoExporter] Audio encode error:", e),
		});

		const outputChannels = exportCodec.numberOfChannels || audioBuffer.numberOfChannels;
		const encodeConfig: AudioEncoderConfig = {
			codec: exportCodec.encoderCodec,
			sampleRate: exportCodec.sampleRate || audioBuffer.sampleRate,
			numberOfChannels: outputChannels,
			bitrate: 128_000,
		};

		const support = await AudioEncoder.isConfigSupported(encodeConfig);
		if (!support.supported) {
			console.warn("[DemoVideoExporter] Audio encoding not supported");
			return;
		}

		encoder.configure(encodeConfig);

		const numFrames = audioBuffer.length;
		const frameSize = 1024;

		for (let offset = 0; offset < numFrames; offset += frameSize) {
			if (this.cancelled) break;
			const frames = Math.min(frameSize, numFrames - offset);

			const interleavedData = new Float32Array(frames * outputChannels);
			for (let ch = 0; ch < outputChannels; ch++) {
				const srcCh = Math.min(ch, audioBuffer.numberOfChannels - 1);
				const channelData = audioBuffer.getChannelData(srcCh);
				for (let i = 0; i < frames; i++) {
					interleavedData[i * outputChannels + ch] = channelData[offset + i];
				}
			}

			const audioData = new AudioData({
				format: "f32",
				sampleRate: audioBuffer.sampleRate,
				numberOfFrames: frames,
				numberOfChannels: outputChannels,
				timestamp: (offset / audioBuffer.sampleRate) * 1_000_000,
				data: interleavedData.buffer,
			});

			encoder.encode(audioData);
			audioData.close();
		}

		if (encoder.state === "configured") {
			await encoder.flush();
			encoder.close();
		}

		console.log(`[DemoVideoExporter] Encoded ${encodedChunks.length} audio chunks`);

		for (const { chunk, meta } of encodedChunks) {
			if (this.cancelled) break;
			await muxer.addAudioChunk(chunk, meta);
		}
	}

	// ─── 工具方法 ──────────────────────────────────────────────────────────────

	private getEncoderPreferences(): HardwareAcceleration[] {
		if (typeof navigator !== "undefined" && /\bWindows\b/i.test(navigator.userAgent)) {
			return ["prefer-software", "prefer-hardware"];
		}
		return ["prefer-hardware", "prefer-software"];
	}

	private cleanup(): void {
		if (this.encoder) {
			try {
				if (this.encoder.state === "configured") this.encoder.close();
			} catch (e) {
				console.warn("Error closing encoder:", e);
			}
			this.encoder = null;
		}
		if (this.renderer) {
			this.renderer.destroy();
			this.renderer = null;
		}
		this.audioProcessor = null;
		this.muxer = null;
		this.encodeQueue = 0;
		this.muxingPromises = [];
		this.chunkCount = 0;
		this.videoDescription = undefined;
		this.videoColorSpace = undefined;
		this.lastEncoderOutputAt = 0;
		this.fatalEncoderError = null;
	}

	private withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
			promise.then(
				(value) => {
					window.clearTimeout(timer);
					resolve(value);
				},
				(error) => {
					window.clearTimeout(timer);
					reject(error);
				},
			);
		});
	}
}

// ─── 分辨率/码率工具 ────────────────────────────────────────────────────────

export function resolutionToSize(resolution: VideoResolution): { width: number; height: number } {
	return RESOLUTION_MAP[resolution] ?? RESOLUTION_MAP["1080p"];
}

export function resolutionToBitrate(resolution: VideoResolution): number {
	return BITRATE_MAP[resolution] ?? BITRATE_MAP["1080p"];
}
