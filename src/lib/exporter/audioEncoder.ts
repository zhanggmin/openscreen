import { WebDemuxer } from "web-demuxer";
import type { SpeedRegion, TrimRegion } from "@/components/video-editor/types";
import type { ExportAudioMuxerCodec, VideoMuxer } from "./muxer";

const AUDIO_BITRATE = 128_000;
const DECODE_BACKPRESSURE_LIMIT = 20;
const MIN_SPEED_REGION_DELTA_MS = 0.0001;
const SEEK_TIMEOUT_MS = 5_000;

/** Minimal TTS region info needed for audio export mixing. */
export interface ExportTTSRegion {
	id: string;
	startMs: number;
	endMs: number;
	blobUrl?: string | null;
	audioData?: string | null;
}

export interface ExportAudioCodec {
	encoderCodec: string;
	muxerCodec: ExportAudioMuxerCodec;
	label: string;
	sampleRate: number;
	numberOfChannels: number;
}

type ExportAudioCodecCandidate = Omit<ExportAudioCodec, "sampleRate" | "numberOfChannels">;

const EXPORT_AUDIO_CODECS: ExportAudioCodecCandidate[] = [
	{ encoderCodec: "mp4a.40.2", muxerCodec: "aac", label: "AAC" },
	{ encoderCodec: "opus", muxerCodec: "opus", label: "Opus" },
];

function averageChannels(sourcePlanes: Float32Array[], frame: number) {
	let mixed = 0;
	for (const plane of sourcePlanes) {
		mixed += plane[frame] ?? 0;
	}
	return mixed / Math.max(1, sourcePlanes.length);
}

function weightedSample(
	sourcePlanes: Float32Array[],
	frame: number,
	weights: Array<[channel: number, weight: number]>,
) {
	let mixed = 0;
	let weightSum = 0;
	for (const [channel, weight] of weights) {
		const sample = sourcePlanes[channel]?.[frame];
		if (typeof sample !== "number") {
			continue;
		}
		mixed += sample * weight;
		weightSum += weight;
	}
	return weightSum > 0 ? mixed / weightSum : averageChannels(sourcePlanes, frame);
}

function getStereoDownmixWeights(sourceChannels: number) {
	const centerWeight = Math.SQRT1_2;
	const surroundWeight = Math.SQRT1_2;
	const lfeWeight = 0.5;

	if (sourceChannels >= 8) {
		// Windows 7.1 order: FL, FR, FC, LFE, BL, BR, SL, SR.
		return {
			left: [
				[0, 1],
				[2, centerWeight],
				[3, lfeWeight],
				[4, surroundWeight],
				[6, surroundWeight],
			] satisfies Array<[number, number]>,
			right: [
				[1, 1],
				[2, centerWeight],
				[3, lfeWeight],
				[5, surroundWeight],
				[7, surroundWeight],
			] satisfies Array<[number, number]>,
		};
	}

	if (sourceChannels >= 6) {
		// Windows 5.1 order: FL, FR, FC, LFE, BL, BR.
		return {
			left: [
				[0, 1],
				[2, centerWeight],
				[3, lfeWeight],
				[4, surroundWeight],
			] satisfies Array<[number, number]>,
			right: [
				[1, 1],
				[2, centerWeight],
				[3, lfeWeight],
				[5, surroundWeight],
			] satisfies Array<[number, number]>,
		};
	}

	if (sourceChannels >= 4) {
		return {
			left: [
				[0, 1],
				[2, surroundWeight],
			] satisfies Array<[number, number]>,
			right: [
				[1, 1],
				[3, surroundWeight],
			] satisfies Array<[number, number]>,
		};
	}

	return {
		left: [
			[0, 1],
			[2, centerWeight],
		] satisfies Array<[number, number]>,
		right: [
			[1, 1],
			[2, centerWeight],
		] satisfies Array<[number, number]>,
	};
}

export function downmixPlanarChannelsForExport(
	sourcePlanes: Float32Array[],
	targetChannels: number,
): Float32Array {
	const frameCount = sourcePlanes[0]?.length ?? 0;
	const output = new Float32Array(frameCount * targetChannels);

	if (targetChannels === 1) {
		for (let frame = 0; frame < frameCount; frame++) {
			output[frame] = averageChannels(sourcePlanes, frame);
		}
		return output;
	}

	if (targetChannels !== 2) {
		throw new Error(`Unsupported target channel count: ${targetChannels}`);
	}

	if (sourcePlanes.length === 1) {
		output.set(sourcePlanes[0], 0);
		output.set(sourcePlanes[0], frameCount);
		return output;
	}

	if (sourcePlanes.length === 2) {
		output.set(sourcePlanes[0], 0);
		output.set(sourcePlanes[1], frameCount);
		return output;
	}

	const weights = getStereoDownmixWeights(sourcePlanes.length);
	for (let frame = 0; frame < frameCount; frame++) {
		output[frame] = weightedSample(sourcePlanes, frame, weights.left);
		output[frameCount + frame] = weightedSample(sourcePlanes, frame, weights.right);
	}
	return output;
}

export class AudioProcessor {
	private cancelled = false;

	static async selectSupportedExportCodec(
		sampleRate: number,
		numberOfChannels: number,
	): Promise<ExportAudioCodec | null> {
		const channelOptions = [numberOfChannels];
		if (numberOfChannels > 2) {
			channelOptions.push(2);
		}

		if (!channelOptions.includes(1)) {
			channelOptions.push(1);
		}

		for (const codec of EXPORT_AUDIO_CODECS) {
			for (const channels of channelOptions) {
				const support = await AudioEncoder.isConfigSupported({
					codec: codec.encoderCodec,
					sampleRate,
					numberOfChannels: channels,
					bitrate: AUDIO_BITRATE,
				});
				if (support.supported) {
					return { ...codec, sampleRate, numberOfChannels: channels };
				}
			}
		}

		return null;
	}

	static async selectSupportedExportCodecForSource(
		demuxer: WebDemuxer,
	): Promise<ExportAudioCodec | null> {
		let audioConfig: AudioDecoderConfig;
		try {
			audioConfig = await demuxer.getDecoderConfig("audio");
		} catch {
			return null;
		}

		const codecCheck = await AudioDecoder.isConfigSupported(audioConfig);
		if (!codecCheck.supported) {
			console.warn("[AudioProcessor] Audio codec not supported:", audioConfig.codec);
			return null;
		}

		return AudioProcessor.selectSupportedExportCodec(
			audioConfig.sampleRate || 48000,
			audioConfig.numberOfChannels || 2,
		);
	}

	/**
	 * Two modes: no speed regions uses the fast WebCodecs trim-only pipeline; speed
	 * regions use the pitch-preserving rendered timeline pipeline.
	 *
	 * When TTS regions with audio are present, they are mixed on top of the
	 * original audio (or used alone when the original audio is muted).
	 */
	async process(
		demuxer: WebDemuxer | null,
		muxer: VideoMuxer,
		videoUrl: string,
		trimRegions: TrimRegion[] | undefined,
		speedRegions: SpeedRegion[] | undefined,
		validatedDurationSec: number,
		exportCodec: ExportAudioCodec,
		ttsRegions?: ExportTTSRegion[],
		muteOriginalAudio?: boolean,
	): Promise<void> {
		const sortedTrims = trimRegions ? [...trimRegions].sort((a, b) => a.startMs - b.startMs) : [];
		const sortedSpeedRegions = speedRegions
			? [...speedRegions]
					.filter((region) => region.endMs - region.startMs > MIN_SPEED_REGION_DELTA_MS)
					.sort((a, b) => a.startMs - b.startMs)
			: [];

		const ttsWithAudio = (ttsRegions ?? []).filter((r) => r.blobUrl || r.audioData);

		// Case: original audio muted + TTS audio present → TTS-only export
		if (muteOriginalAudio && ttsWithAudio.length > 0) {
			console.log("[AudioProcessor] Original audio muted, rendering TTS-only audio track...");
			const ttsBuffer = await this.renderTTSAudioBuffer(ttsWithAudio, validatedDurationSec);
			if (!this.cancelled && ttsBuffer) {
				await this.encodeAndMuxAudioBuffer(ttsBuffer, muxer, exportCodec);
			}
			return;
		}

		// Case: original audio muted + no TTS → no audio at all
		if (muteOriginalAudio) {
			return;
		}

		// Speed edits need timeline playback to preserve pitch.
		if (sortedSpeedRegions.length > 0) {
			const renderedAudioBlob = await this.renderPitchPreservedTimelineAudio(
				videoUrl,
				sortedTrims,
				sortedSpeedRegions,
				validatedDurationSec,
			);
			if (this.cancelled) return;

			if (ttsWithAudio.length > 0 && renderedAudioBlob.size > 0) {
				console.log("[AudioProcessor] Mixing TTS audio with speed-adjusted original...");
				const mixedBlob = await this.mixBlobWithTTS(
					renderedAudioBlob,
					ttsWithAudio,
					validatedDurationSec,
				);
				if (!this.cancelled && mixedBlob && mixedBlob.size > 0) {
					await this.muxRenderedAudioBlob(mixedBlob, muxer, exportCodec);
				}
				return;
			}

			if (renderedAudioBlob.size > 0) {
				await this.muxRenderedAudioBlob(renderedAudioBlob, muxer, exportCodec);
			}
			return;
		}

		// No speed edits: demux/decode/encode with trim timestamp remap. The +0.5s mirrors
		// streamingDecoder.decodeAll's read window so both paths read the same distance past
		// the validated duration boundary.
		const readEndSec = validatedDurationSec + 0.5;

		if (ttsWithAudio.length > 0) {
			// Decode original audio, mix with TTS, then encode
			console.log("[AudioProcessor] Mixing TTS audio with original audio...");
			if (!demuxer) {
				// No original audio source: render TTS only
				const ttsBuffer = await this.renderTTSAudioBuffer(ttsWithAudio, validatedDurationSec);
				if (!this.cancelled && ttsBuffer) {
					await this.encodeAndMuxAudioBuffer(ttsBuffer, muxer, exportCodec);
				}
				return;
			}
			await this.processTrimOnlyWithTTS(
				demuxer,
				muxer,
				sortedTrims,
				readEndSec,
				exportCodec,
				ttsWithAudio,
				validatedDurationSec,
			);
			return;
		}

		if (!demuxer) return;
		await this.processTrimOnlyAudio(demuxer, muxer, sortedTrims, readEndSec, exportCodec);
	}

	// Trim-only path, used for projects without speed regions.
	private async processTrimOnlyAudio(
		demuxer: WebDemuxer,
		muxer: VideoMuxer,
		sortedTrims: TrimRegion[],
		readEndSec?: number,
		exportCodec?: ExportAudioCodec,
	): Promise<void> {
		let audioConfig: AudioDecoderConfig;
		try {
			audioConfig = await demuxer.getDecoderConfig("audio");
		} catch {
			console.warn("[AudioProcessor] No audio track found, skipping");
			return;
		}

		const codecCheck = await AudioDecoder.isConfigSupported(audioConfig);
		if (!codecCheck.supported) {
			console.warn("[AudioProcessor] Audio codec not supported:", audioConfig.codec);
			return;
		}

		// Phase 1: decode, skipping trimmed regions.
		const decodedFrames: AudioData[] = [];

		const decoder = new AudioDecoder({
			output: (data: AudioData) => decodedFrames.push(data),
			error: (e: DOMException) => console.error("[AudioProcessor] Decode error:", e),
		});
		decoder.configure(audioConfig);

		const safeReadEndSec =
			typeof readEndSec === "number" && Number.isFinite(readEndSec)
				? Math.max(0, readEndSec)
				: undefined;
		const audioStream =
			safeReadEndSec !== undefined
				? demuxer.read("audio", 0, safeReadEndSec)
				: demuxer.read("audio");
		const reader = audioStream.getReader();

		try {
			while (!this.cancelled) {
				const { done, value: chunk } = await reader.read();
				if (done || !chunk) break;

				const timestampMs = chunk.timestamp / 1000;
				if (this.isInTrimRegion(timestampMs, sortedTrims)) continue;

				decoder.decode(chunk);

				while (decoder.decodeQueueSize > DECODE_BACKPRESSURE_LIMIT && !this.cancelled) {
					await new Promise((resolve) => setTimeout(resolve, 1));
				}
			}
		} finally {
			try {
				await reader.cancel();
			} catch {
				/* reader already closed */
			}
		}

		if (decoder.state === "configured") {
			await decoder.flush();
			decoder.close();
		}

		if (this.cancelled || decodedFrames.length === 0) {
			for (const frame of decodedFrames) frame.close();
			return;
		}

		// Phase 2: re-encode with timestamps adjusted for trim gaps.
		const encodedChunks: { chunk: EncodedAudioChunk; meta?: EncodedAudioChunkMetadata }[] = [];

		const encoder = new AudioEncoder({
			output: (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => {
				encodedChunks.push({ chunk, meta });
			},
			error: (e: DOMException) => console.error("[AudioProcessor] Encode error:", e),
		});

		const sampleRate = audioConfig.sampleRate || 48000;
		const channels = audioConfig.numberOfChannels || 2;
		const selectedCodec =
			exportCodec ?? (await AudioProcessor.selectSupportedExportCodec(sampleRate, channels));
		if (!selectedCodec) {
			console.warn("[AudioProcessor] No supported audio export codec, skipping audio");
			for (const frame of decodedFrames) frame.close();
			return;
		}

		const outputSampleRate = selectedCodec.sampleRate || sampleRate;
		const outputChannels = selectedCodec.numberOfChannels || channels;
		const encodeConfig: AudioEncoderConfig = {
			codec: selectedCodec.encoderCodec,
			sampleRate: outputSampleRate,
			numberOfChannels: outputChannels,
			bitrate: AUDIO_BITRATE,
		};

		const encodeSupport = await AudioEncoder.isConfigSupported(encodeConfig);
		if (!encodeSupport.supported) {
			console.warn(
				`[AudioProcessor] ${selectedCodec.label} encoding not supported, skipping audio`,
			);
			for (const frame of decodedFrames) frame.close();
			return;
		}

		encoder.configure(encodeConfig);

		for (const audioData of decodedFrames) {
			if (this.cancelled) {
				audioData.close();
				continue;
			}

			const timestampMs = audioData.timestamp / 1000;
			const trimOffsetMs = this.computeTrimOffset(timestampMs, sortedTrims);
			const adjustedTimestampUs = audioData.timestamp - trimOffsetMs * 1000;

			const adjusted = this.cloneForEncoding(
				audioData,
				Math.max(0, adjustedTimestampUs),
				outputChannels,
			);
			audioData.close();

			encoder.encode(adjusted);
			adjusted.close();
		}

		if (encoder.state === "configured") {
			await encoder.flush();
			encoder.close();
		}

		// Phase 3: flush encoded chunks to muxer.
		for (const { chunk, meta } of encodedChunks) {
			if (this.cancelled) break;
			await muxer.addAudioChunk(chunk, meta);
		}

		console.log(
			`[AudioProcessor] Processed ${decodedFrames.length} audio frames, encoded ${encodedChunks.length} chunks`,
		);
	}

	// Speed-aware path mirroring preview semantics (trim skipping + playbackRate). Relies on
	// browser media playback to preserve pitch and avoid the chipmunk effect.
	private async renderPitchPreservedTimelineAudio(
		videoUrl: string,
		trimRegions: TrimRegion[],
		speedRegions: SpeedRegion[],
		validatedDurationSec: number,
	): Promise<Blob> {
		const media = document.createElement("audio");
		media.src = videoUrl;
		media.preload = "auto";

		const pitchMedia = media as HTMLMediaElement & {
			preservesPitch?: boolean;
			mozPreservesPitch?: boolean;
			webkitPreservesPitch?: boolean;
		};
		pitchMedia.preservesPitch = true;
		pitchMedia.mozPreservesPitch = true;
		pitchMedia.webkitPreservesPitch = true;

		await this.waitForLoadedMetadata(media);
		if (this.cancelled) {
			throw new Error("Export cancelled");
		}

		const audioContext = new AudioContext();
		const sourceNode = audioContext.createMediaElementSource(media);
		const destinationNode = audioContext.createMediaStreamDestination();
		sourceNode.connect(destinationNode);

		let rafId: number | null = null;
		let recorder: MediaRecorder | null = null;
		let recordedBlobPromise: Promise<Blob> | null = null;

		try {
			if (audioContext.state === "suspended") {
				await audioContext.resume();
			}

			// Skip initial trim region(s) before recording so the first rAF frames don't
			// capture trimmed audio. Loops to handle back-to-back/overlapping trims at t=0.
			const effectiveEnd = validatedDurationSec;
			let startPosition = 0;
			for (let i = 0; i <= trimRegions.length; i++) {
				const activeTrim = this.findActiveTrimRegion(startPosition * 1000, trimRegions);
				if (!activeTrim) break;
				startPosition = activeTrim.endMs / 1000;
				if (startPosition >= effectiveEnd) break;
			}

			if (startPosition >= effectiveEnd) {
				// Everything is trimmed; return a silent blob.
				return new Blob([], { type: "audio/webm" });
			}

			await this.seekTo(media, startPosition);

			// Set initial playback rate for the starting position.
			const initialSpeedRegion = this.findActiveSpeedRegion(startPosition * 1000, speedRegions);
			if (initialSpeedRegion) {
				media.playbackRate = initialSpeedRegion.speed;
			}

			// Start recording only after seeking past trims.
			const recording = this.startAudioRecording(destinationNode.stream);
			recorder = recording.recorder;
			recordedBlobPromise = recording.recordedBlobPromise;
			await media.play();

			await new Promise<void>((resolve, reject) => {
				const cleanup = () => {
					if (rafId !== null) {
						cancelAnimationFrame(rafId);
						rafId = null;
					}
					media.removeEventListener("error", onError);
					media.removeEventListener("ended", onEnded);
				};

				const onError = () => {
					cleanup();
					reject(new Error("Failed while rendering speed-adjusted audio timeline"));
				};

				const onEnded = () => {
					cleanup();
					resolve();
				};

				const tick = () => {
					if (this.cancelled) {
						cleanup();
						resolve();
						return;
					}

					// Stop at validated duration; media.duration can be inflated by bad
					// container metadata.
					if (media.currentTime >= validatedDurationSec) {
						media.pause();
						cleanup();
						resolve();
						return;
					}

					const currentTimeMs = media.currentTime * 1000;
					const activeTrimRegion = this.findActiveTrimRegion(currentTimeMs, trimRegions);

					if (activeTrimRegion && !media.paused && !media.ended) {
						const skipToTime = activeTrimRegion.endMs / 1000;
						if (skipToTime >= media.duration || skipToTime >= validatedDurationSec) {
							media.pause();
							cleanup();
							resolve();
							return;
						}
						// Pause recording during the seek so we don't capture silence/noise.
						media.pause();
						if (recorder?.state === "recording") recorder.pause();
						const onSeeked = () => {
							clearTimeout(seekTimer);
							if (this.cancelled) {
								cleanup();
								resolve();
								return;
							}
							if (recorder?.state === "paused") recorder.resume();
							media
								.play()
								.then(() => {
									if (!this.cancelled) rafId = requestAnimationFrame(tick);
								})
								.catch((err) => {
									cleanup();
									reject(
										new Error(
											`Failed to resume playback after trim seek: ${err instanceof Error ? err.message : String(err)}`,
										),
									);
								});
						};
						const seekTimer = window.setTimeout(() => {
							media.removeEventListener("seeked", onSeeked);
							cleanup();
							reject(new Error("Audio seek timed out while skipping trim region"));
						}, SEEK_TIMEOUT_MS);
						media.addEventListener("seeked", onSeeked, { once: true });
						media.currentTime = skipToTime;
						return;
					}

					const activeSpeedRegion = this.findActiveSpeedRegion(currentTimeMs, speedRegions);
					const playbackRate = activeSpeedRegion ? activeSpeedRegion.speed : 1;
					if (Math.abs(media.playbackRate - playbackRate) > 0.0001) {
						media.playbackRate = playbackRate;
					}

					if (!media.paused && !media.ended) {
						rafId = requestAnimationFrame(tick);
					} else {
						cleanup();
						resolve();
					}
				};

				media.addEventListener("error", onError, { once: true });
				media.addEventListener("ended", onEnded, { once: true });
				rafId = requestAnimationFrame(tick);
			});
		} finally {
			if (rafId !== null) {
				cancelAnimationFrame(rafId);
			}
			media.pause();
			if (recorder && recorder.state !== "inactive") {
				recorder.stop();
			}
			destinationNode.stream.getTracks().forEach((track) => track.stop());
			sourceNode.disconnect();
			destinationNode.disconnect();
			await audioContext.close();
			media.src = "";
			media.load();
		}

		if (!recordedBlobPromise) {
			// Either an early return fired or startAudioRecording set this before playback
			// resolved. Reaching here means that broke; fail loud rather than return silence.
			throw new Error("Audio recorder finished without assigning recordedBlobPromise");
		}
		const recordedBlob = await recordedBlobPromise;
		if (this.cancelled) {
			throw new Error("Export cancelled");
		}
		return recordedBlob;
	}

	// Demux the rendered speed-adjusted blob and feed its chunks into the MP4 muxer.
	private async muxRenderedAudioBlob(
		blob: Blob,
		muxer: VideoMuxer,
		exportCodec: ExportAudioCodec,
	): Promise<void> {
		if (this.cancelled) return;

		const file = new File([blob], "speed-audio.webm", { type: blob.type || "audio/webm" });
		const wasmUrl = new URL("./wasm/web-demuxer.wasm", window.location.href).href;
		const demuxer = new WebDemuxer({ wasmFilePath: wasmUrl });

		try {
			await demuxer.load(file);
			await this.processTrimOnlyAudio(demuxer, muxer, [], undefined, exportCodec);
		} finally {
			try {
				demuxer.destroy();
			} catch {
				/* ignore */
			}
		}
	}

	private startAudioRecording(stream: MediaStream): {
		recorder: MediaRecorder;
		recordedBlobPromise: Promise<Blob>;
	} {
		const mimeType = this.getSupportedAudioMimeType();
		const options: MediaRecorderOptions = {
			audioBitsPerSecond: AUDIO_BITRATE,
			...(mimeType ? { mimeType } : {}),
		};

		const recorder = new MediaRecorder(stream, options);
		const chunks: Blob[] = [];

		const recordedBlobPromise = new Promise<Blob>((resolve, reject) => {
			recorder.ondataavailable = (event: BlobEvent) => {
				if (event.data && event.data.size > 0) {
					chunks.push(event.data);
				}
			};
			recorder.onerror = () => {
				reject(new Error("MediaRecorder failed while capturing speed-adjusted audio"));
			};
			recorder.onstop = () => {
				const type = mimeType || chunks[0]?.type || "audio/webm";
				resolve(new Blob(chunks, { type }));
			};
		});

		recorder.start();
		return { recorder, recordedBlobPromise };
	}

	private getSupportedAudioMimeType(): string | undefined {
		const candidates = ["audio/webm;codecs=opus", "audio/webm"];
		for (const candidate of candidates) {
			if (MediaRecorder.isTypeSupported(candidate)) {
				return candidate;
			}
		}
		return undefined;
	}

	private waitForLoadedMetadata(media: HTMLMediaElement): Promise<void> {
		if (Number.isFinite(media.duration) && media.readyState >= HTMLMediaElement.HAVE_METADATA) {
			return Promise.resolve();
		}

		return new Promise<void>((resolve, reject) => {
			const onLoaded = () => {
				cleanup();
				resolve();
			};
			const onError = () => {
				cleanup();
				reject(new Error("Failed to load media metadata for speed-adjusted audio"));
			};
			const cleanup = () => {
				media.removeEventListener("loadedmetadata", onLoaded);
				media.removeEventListener("error", onError);
			};

			media.addEventListener("loadedmetadata", onLoaded);
			media.addEventListener("error", onError, { once: true });
		});
	}

	private seekTo(media: HTMLMediaElement, targetSec: number): Promise<void> {
		if (Math.abs(media.currentTime - targetSec) < 0.0001) {
			return Promise.resolve();
		}

		return new Promise<void>((resolve, reject) => {
			const onSeeked = () => {
				cleanup();
				resolve();
			};
			const onError = () => {
				cleanup();
				reject(new Error("Failed to seek media for speed-adjusted audio"));
			};
			const cleanup = () => {
				media.removeEventListener("seeked", onSeeked);
				media.removeEventListener("error", onError);
			};

			media.addEventListener("seeked", onSeeked, { once: true });
			media.addEventListener("error", onError, { once: true });
			media.currentTime = targetSec;
		});
	}

	private findActiveTrimRegion(
		currentTimeMs: number,
		trimRegions: TrimRegion[],
	): TrimRegion | null {
		return (
			trimRegions.find(
				(region) => currentTimeMs >= region.startMs && currentTimeMs < region.endMs,
			) || null
		);
	}

	private findActiveSpeedRegion(
		currentTimeMs: number,
		speedRegions: SpeedRegion[],
	): SpeedRegion | null {
		return (
			speedRegions.find(
				(region) => currentTimeMs >= region.startMs && currentTimeMs < region.endMs,
			) || null
		);
	}

	private cloneForEncoding(
		src: AudioData,
		newTimestamp: number,
		targetChannels: number,
	): AudioData {
		if (targetChannels !== src.numberOfChannels) {
			return this.downmixWithTimestamp(src, newTimestamp, targetChannels);
		}

		if (!src.format) {
			throw new Error("AudioData format is required for cloning");
		}
		const isPlanar = src.format.includes("planar");
		const numPlanes = isPlanar ? src.numberOfChannels : 1;

		let totalSize = 0;
		for (let planeIndex = 0; planeIndex < numPlanes; planeIndex++) {
			totalSize += src.allocationSize({ planeIndex });
		}

		const buffer = new ArrayBuffer(totalSize);
		let offset = 0;
		for (let planeIndex = 0; planeIndex < numPlanes; planeIndex++) {
			const planeSize = src.allocationSize({ planeIndex });
			src.copyTo(new Uint8Array(buffer, offset, planeSize), { planeIndex });
			offset += planeSize;
		}

		return new AudioData({
			format: src.format,
			sampleRate: src.sampleRate,
			numberOfFrames: src.numberOfFrames,
			numberOfChannels: src.numberOfChannels,
			timestamp: newTimestamp,
			data: buffer,
		});
	}

	private downmixWithTimestamp(
		src: AudioData,
		newTimestamp: number,
		targetChannels: number,
	): AudioData {
		const sourceChannels = src.numberOfChannels;
		const frameCount = src.numberOfFrames;
		if (targetChannels < 1 || targetChannels > 2) {
			throw new Error(`Unsupported target channel count: ${targetChannels}`);
		}

		const sourcePlanes = Array.from({ length: sourceChannels }, () => new Float32Array(frameCount));
		for (let channel = 0; channel < sourceChannels; channel++) {
			src.copyTo(sourcePlanes[channel], {
				format: "f32-planar",
				planeIndex: channel,
			});
		}

		const output = downmixPlanarChannelsForExport(sourcePlanes, targetChannels);

		return new AudioData({
			format: "f32-planar",
			sampleRate: src.sampleRate,
			numberOfFrames: frameCount,
			numberOfChannels: targetChannels,
			timestamp: newTimestamp,
			data: output.buffer instanceof ArrayBuffer ? output.buffer : output.slice().buffer,
		});
	}

	private isInTrimRegion(timestampMs: number, trims: TrimRegion[]): boolean {
		return trims.some((trim) => timestampMs >= trim.startMs && timestampMs < trim.endMs);
	}

	private computeTrimOffset(timestampMs: number, trims: TrimRegion[]): number {
		let offset = 0;
		for (const trim of trims) {
			if (trim.endMs <= timestampMs) {
				offset += trim.endMs - trim.startMs;
			}
		}
		return offset;
	}

	cancel(): void {
		this.cancelled = true;
	}

	// ------------------------------------------------------------------
	// TTS audio rendering and mixing helpers
	// ------------------------------------------------------------------

	/**
	 * Render TTS segments into an AudioBuffer at their specified timestamps.
	 * Returns null if no segments could be scheduled.
	 */
	private async renderTTSAudioBuffer(
		ttsRegions: ExportTTSRegion[],
		totalDurationSec: number,
	): Promise<AudioBuffer | null> {
		console.log(
			`[AudioProcessor] renderTTSAudioBuffer: ${ttsRegions.length} regions, duration=${totalDurationSec.toFixed(2)}s`,
		);

		const sampleRate = 48000;
		const totalSamples = Math.ceil(totalDurationSec * sampleRate);
		if (totalSamples <= 0) {
			console.warn("[AudioProcessor] renderTTSAudioBuffer: invalid duration");
			return null;
		}

		const offlineContext = new OfflineAudioContext(2, totalSamples, sampleRate);
		const audioCtx = new AudioContext({ sampleRate });
		let scheduledCount = 0;

		try {
			for (const region of ttsRegions) {
				if (this.cancelled) break;
				let arrayBuffer: ArrayBuffer | null = null;

				// Prefer audioData (persistent base64) over blobUrl (ephemeral)
				if (region.audioData) {
					try {
						const base64 = region.audioData.includes(",")
							? region.audioData.split(",")[1]
							: region.audioData;
						const binary = atob(base64);
						const bytes = new Uint8Array(binary.length);
						for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
						arrayBuffer = bytes.buffer as ArrayBuffer;
					} catch (err) {
						console.warn(`[AudioProcessor] Failed to decode TTS audioData for ${region.id}:`, err);
					}
				}

				if (!arrayBuffer && region.blobUrl) {
					try {
						const response = await fetch(region.blobUrl);
						if (!response.ok) {
							console.warn(
								`[AudioProcessor] TTS blob fetch failed for ${region.id}: HTTP ${response.status}`,
							);
						} else {
							arrayBuffer = await response.arrayBuffer();
						}
					} catch (err) {
						console.warn(`[AudioProcessor] Failed to fetch TTS blob for ${region.id}:`, err);
					}
				}

				if (!arrayBuffer || arrayBuffer.byteLength === 0) {
					console.warn(
						`[AudioProcessor] No audio data for TTS region ${region.id} (blobUrl=${!!region.blobUrl}, audioData=${!!region.audioData})`,
					);
					continue;
				}

				try {
					const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
					const source = offlineContext.createBufferSource();
					source.buffer = audioBuffer;
					source.connect(offlineContext.destination);
					source.start(region.startMs / 1000);
					scheduledCount++;
				} catch (err) {
					console.warn(`[AudioProcessor] Failed to decode TTS audio for ${region.id}:`, err);
				}
			}

			console.log(
				`[AudioProcessor] renderTTSAudioBuffer: scheduled ${scheduledCount}/${ttsRegions.length} segments`,
			);

			if (scheduledCount === 0) {
				console.warn("[AudioProcessor] No TTS segments were successfully scheduled");
				return null;
			}

			return await offlineContext.startRendering();
		} finally {
			await audioCtx.close();
		}
	}

	/**
	 * Directly encode an AudioBuffer to the muxer using WebCodecs AudioEncoder.
	 * This bypasses the WebDemuxer round-trip for rendered/mixed audio.
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
			error: (e: DOMException) => console.error("[AudioProcessor] TTS encode error:", e),
		});

		const outputChannels = exportCodec.numberOfChannels || audioBuffer.numberOfChannels;

		const encodeConfig: AudioEncoderConfig = {
			codec: exportCodec.encoderCodec,
			sampleRate: exportCodec.sampleRate || audioBuffer.sampleRate,
			numberOfChannels: outputChannels,
			bitrate: AUDIO_BITRATE,
		};

		const support = await AudioEncoder.isConfigSupported(encodeConfig);
		if (!support.supported) {
			console.warn("[AudioProcessor] TTS audio encoding not supported");
			return;
		}

		encoder.configure(encodeConfig);

		const numFrames = audioBuffer.length;
		const frameSize = 1024;

		for (let offset = 0; offset < numFrames; offset += frameSize) {
			if (this.cancelled) break;
			const frames = Math.min(frameSize, numFrames - offset);

			// Build interleaved f32 data for the requested output channels
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

		console.log(`[AudioProcessor] Encoded ${encodedChunks.length} TTS audio chunks`);

		for (const { chunk, meta } of encodedChunks) {
			if (this.cancelled) break;
			await muxer.addAudioChunk(chunk, meta);
		}
	}

	/**
	 * Mix a rendered audio blob (e.g. speed-adjusted original) with TTS segments.
	 * Returns a new blob containing the sum of both audio sources.
	 */
	private async mixBlobWithTTS(
		originalBlob: Blob,
		ttsRegions: ExportTTSRegion[],
		totalDurationSec: number,
	): Promise<Blob> {
		const audioCtx = new AudioContext();
		try {
			const originalArrayBuffer = await originalBlob.arrayBuffer();
			const originalBuffer = await audioCtx.decodeAudioData(originalArrayBuffer);

			const sampleRate = originalBuffer.sampleRate;
			const totalSamples = Math.ceil(totalDurationSec * sampleRate);
			const offlineContext = new OfflineAudioContext(
				originalBuffer.numberOfChannels,
				totalSamples,
				sampleRate,
			);

			// Add original audio
			const origSource = offlineContext.createBufferSource();
			origSource.buffer = originalBuffer;
			origSource.connect(offlineContext.destination);
			origSource.start(0);

			// Add TTS audio
			await this.addTTSToOfflineContext(offlineContext, ttsRegions, audioCtx);

			const renderedBuffer = await offlineContext.startRendering();
			return this.audioBufferToWav(renderedBuffer);
		} finally {
			await audioCtx.close();
		}
	}

	/**
	 * Decode TTS regions and schedule them on an OfflineAudioContext.
	 */
	private async addTTSToOfflineContext(
		offlineContext: OfflineAudioContext,
		ttsRegions: ExportTTSRegion[],
		decodeContext: AudioContext,
	): Promise<void> {
		for (const region of ttsRegions) {
			if (this.cancelled) break;
			let arrayBuffer: ArrayBuffer | null = null;

			// Prefer audioData (persistent base64) over blobUrl (ephemeral)
			if (region.audioData) {
				try {
					const base64 = region.audioData.includes(",")
						? region.audioData.split(",")[1]
						: region.audioData;
					const binary = atob(base64);
					const bytes = new Uint8Array(binary.length);
					for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
					arrayBuffer = bytes.buffer as ArrayBuffer;
				} catch (err) {
					console.warn(`[AudioProcessor] Failed to decode TTS audioData for ${region.id}:`, err);
				}
			}

			if (!arrayBuffer && region.blobUrl) {
				try {
					const response = await fetch(region.blobUrl);
					if (response.ok) {
						arrayBuffer = await response.arrayBuffer();
					}
				} catch (err) {
					console.warn(`[AudioProcessor] Failed to fetch TTS blob for ${region.id}:`, err);
				}
			}

			if (!arrayBuffer || arrayBuffer.byteLength === 0) continue;

			try {
				const audioBuffer = await decodeContext.decodeAudioData(arrayBuffer.slice(0));
				const source = offlineContext.createBufferSource();
				source.buffer = audioBuffer;
				source.connect(offlineContext.destination);
				source.start(region.startMs / 1000);
			} catch (err) {
				console.warn(`[AudioProcessor] Failed to decode TTS audio for ${region.id}:`, err);
			}
		}
	}

	/**
	 * Trim-only path that also mixes TTS audio on top of the original.
	 * Decodes the original audio, mixes TTS segments at their timeline positions,
	 * applies trim adjustments, encodes and muxes the result.
	 */
	private async processTrimOnlyWithTTS(
		demuxer: WebDemuxer,
		muxer: VideoMuxer,
		sortedTrims: TrimRegion[],
		readEndSec: number | undefined,
		exportCodec: ExportAudioCodec,
		ttsRegions: ExportTTSRegion[],
		totalDurationSec: number,
	): Promise<void> {
		let audioConfig: AudioDecoderConfig;
		try {
			audioConfig = await demuxer.getDecoderConfig("audio");
		} catch {
			// No original audio track → fall back to TTS-only
			console.log("[AudioProcessor] No original audio, rendering TTS only");
			const ttsBuffer = await this.renderTTSAudioBuffer(ttsRegions, totalDurationSec);
			if (!this.cancelled && ttsBuffer) {
				await this.encodeAndMuxAudioBuffer(ttsBuffer, muxer, exportCodec);
			}
			return;
		}

		const codecCheck = await AudioDecoder.isConfigSupported(audioConfig);
		if (!codecCheck.supported) {
			// Can't decode original → TTS-only
			const ttsBuffer = await this.renderTTSAudioBuffer(ttsRegions, totalDurationSec);
			if (!this.cancelled && ttsBuffer) {
				await this.encodeAndMuxAudioBuffer(ttsBuffer, muxer, exportCodec);
			}
			return;
		}

		// Phase 1: Decode original audio from source, skipping trimmed regions
		const decodedFrames: AudioData[] = [];

		const decoder = new AudioDecoder({
			output: (data: AudioData) => decodedFrames.push(data),
			error: (e: DOMException) => console.error("[AudioProcessor] Decode error:", e),
		});
		decoder.configure(audioConfig);

		const safeReadEndSec =
			typeof readEndSec === "number" && Number.isFinite(readEndSec)
				? Math.max(0, readEndSec)
				: undefined;
		const audioStream =
			safeReadEndSec !== undefined
				? demuxer.read("audio", 0, safeReadEndSec)
				: demuxer.read("audio");
		const reader = audioStream.getReader();

		try {
			while (!this.cancelled) {
				const { done, value: chunk } = await reader.read();
				if (done || !chunk) break;

				const timestampMs = chunk.timestamp / 1000;
				if (this.isInTrimRegion(timestampMs, sortedTrims)) continue;

				decoder.decode(chunk);

				while (decoder.decodeQueueSize > DECODE_BACKPRESSURE_LIMIT && !this.cancelled) {
					await new Promise((resolve) => setTimeout(resolve, 1));
				}
			}
		} finally {
			try {
				await reader.cancel();
			} catch {
				/* reader already closed */
			}
		}

		if (decoder.state === "configured") {
			await decoder.flush();
			decoder.close();
		}

		if (this.cancelled) {
			for (const frame of decodedFrames) frame.close();
			return;
		}

		// Phase 2: Render original frames + TTS into a single AudioBuffer via OfflineAudioContext
		const sampleRate = audioConfig.sampleRate || 48000;
		const channels = audioConfig.numberOfChannels || 2;
		const outputSampleRate = exportCodec.sampleRate || sampleRate;
		const outputChannels = exportCodec.numberOfChannels || channels;

		// Compute total output duration: original duration minus trim gaps
		const totalTrimGapMs = sortedTrims.reduce((sum, t) => sum + (t.endMs - t.startMs), 0);
		const originalDurationSec = Math.max(
			totalDurationSec,
			decodedFrames.length > 0
				? decodedFrames[decodedFrames.length - 1].timestamp / 1_000_000 +
						decodedFrames[decodedFrames.length - 1].numberOfFrames / sampleRate
				: 0,
		);
		const outputDurationSec = Math.max(
			originalDurationSec - totalTrimGapMs / 1000,
			totalDurationSec - totalTrimGapMs / 1000,
		);

		const totalSamples = Math.ceil(outputDurationSec * outputSampleRate);
		if (totalSamples <= 0) {
			for (const frame of decodedFrames) frame.close();
			return;
		}

		const offlineContext = new OfflineAudioContext(outputChannels, totalSamples, outputSampleRate);

		// Add original audio frames (with trim timestamp adjustment)
		for (const audioData of decodedFrames) {
			if (this.cancelled) {
				audioData.close();
				continue;
			}

			const timestampMs = audioData.timestamp / 1000;
			const trimOffsetMs = this.computeTrimOffset(timestampMs, sortedTrims);
			const adjustedTimestampUs = audioData.timestamp - trimOffsetMs * 1000;

			if (adjustedTimestampUs < 0) {
				audioData.close();
				continue;
			}

			try {
				const numFrames = audioData.numberOfFrames;
				const numChannels = audioData.numberOfChannels;
				const isPlanar = audioData.format?.includes("planar");

				if (isPlanar) {
					const planes: Float32Array[] = [];
					for (let ch = 0; ch < numChannels; ch++) {
						const plane = new Float32Array(numFrames);
						audioData.copyTo(plane, { planeIndex: ch, format: "f32-planar" });
						planes.push(plane);
					}

					const downmixed = downmixPlanarChannelsForExport(planes, outputChannels);
					const buf = offlineContext.createBuffer(outputChannels, numFrames, audioData.sampleRate);
					for (let ch = 0; ch < outputChannels; ch++) {
						const channelSlice = new Float32Array(
							downmixed.subarray(ch * numFrames, (ch + 1) * numFrames),
						);
						buf.copyToChannel(channelSlice, ch);
					}
					const source = offlineContext.createBufferSource();
					source.buffer = buf;
					source.connect(offlineContext.destination);
					source.start(adjustedTimestampUs / 1_000_000);
				} else {
					// Interleaved format
					const interleaved = new Float32Array(numFrames * numChannels);
					audioData.copyTo(interleaved, { planeIndex: 0, format: "f32" });

					const buf = offlineContext.createBuffer(outputChannels, numFrames, audioData.sampleRate);
					for (let ch = 0; ch < outputChannels; ch++) {
						const srcCh = Math.min(ch, numChannels - 1);
						const channelData = new Float32Array(numFrames);
						for (let i = 0; i < numFrames; i++) {
							channelData[i] = interleaved[i * numChannels + srcCh];
						}
						buf.copyToChannel(channelData, ch);
					}
					const source = offlineContext.createBufferSource();
					source.buffer = buf;
					source.connect(offlineContext.destination);
					source.start(adjustedTimestampUs / 1_000_000);
				}
			} catch (err) {
				console.warn("[AudioProcessor] Failed to schedule original audio frame:", err);
			} finally {
				audioData.close();
			}
		}

		// Add TTS audio segments
		const decodeCtx = new AudioContext({ sampleRate: outputSampleRate });
		try {
			await this.addTTSToOfflineContext(offlineContext, ttsRegions, decodeCtx);
		} finally {
			await decodeCtx.close();
		}

		const renderedBuffer = await offlineContext.startRendering();
		const mixedBlob = this.audioBufferToWav(renderedBuffer);

		// Phase 3: Encode and mux the mixed audio
		await this.muxRenderedAudioBlob(mixedBlob, muxer, exportCodec);
	}

	/**
	 * Encode an AudioBuffer to a WAV blob (RIFF/WAVE, 16-bit PCM, proper chunk headers).
	 */
	private audioBufferToWav(buffer: AudioBuffer): Blob {
		const numChannels = buffer.numberOfChannels;
		const sampleRate = buffer.sampleRate;
		const bitDepth = 16;
		const bytesPerSample = bitDepth / 8;
		const blockAlign = numChannels * bytesPerSample;

		const dataLength = buffer.length * blockAlign;
		const bufferLength = 44 + dataLength;
		const arrayBuffer = new ArrayBuffer(bufferLength);
		const view = new DataView(arrayBuffer);

		const writeString = (offset: number, str: string) => {
			for (let i = 0; i < str.length; i++) {
				view.setUint8(offset + i, str.charCodeAt(i));
			}
		};

		writeString(0, "RIFF");
		view.setUint32(4, 36 + dataLength, true);
		writeString(8, "WAVE");
		writeString(12, "fmt ");
		view.setUint32(16, 16, true);
		view.setUint16(20, 1, true); // PCM
		view.setUint16(22, numChannels, true);
		view.setUint32(24, sampleRate, true);
		view.setUint32(28, sampleRate * blockAlign, true);
		view.setUint16(32, blockAlign, true);
		view.setUint16(34, bitDepth, true);
		writeString(36, "data");
		view.setUint32(40, dataLength, true);

		const channels: Float32Array[] = [];
		for (let i = 0; i < numChannels; i++) {
			channels.push(buffer.getChannelData(i));
		}

		let offset = 44;
		for (let i = 0; i < buffer.length; i++) {
			for (let ch = 0; ch < numChannels; ch++) {
				const sample = Math.max(-1, Math.min(1, channels[ch][i]));
				const value = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
				view.setInt16(offset, value, true);
				offset += 2;
			}
		}

		return new Blob([arrayBuffer], { type: "audio/wav" });
	}
}
