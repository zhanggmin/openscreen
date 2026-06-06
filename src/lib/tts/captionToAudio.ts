import type { AnnotationRegion } from "@/components/video-editor/types";
import type { CaptionAudioSegment, TTSEngine, TTSSettings } from "./types";

export async function captionRegionsToAudioSegments(
	regions: AnnotationRegion[],
	engine: TTSEngine,
	settings: TTSSettings,
	onProgress?: (processed: number, total: number) => void,
): Promise<CaptionAudioSegment[]> {
	const captionRegions = regions.filter(
		(r) => r.annotationSource === "auto-caption" && r.content?.trim(),
	);

	const segments: CaptionAudioSegment[] = [];

	for (let i = 0; i < captionRegions.length; i++) {
		const region = captionRegions[i];
		try {
			const audioBuffer = await engine.synthesize(region.content, settings);
			const adjustedBuffer = await adjustAudioDuration(audioBuffer, region.endMs - region.startMs);

			segments.push({
				id: region.id,
				startMs: region.startMs,
				endMs: region.endMs,
				content: region.content,
				audioBuffer: adjustedBuffer,
				blobUrl: null,
			});
		} catch (err) {
			console.error(`Failed to synthesize caption "${region.content}":`, err);
			segments.push({
				id: region.id,
				startMs: region.startMs,
				endMs: region.endMs,
				content: region.content,
				audioBuffer: null,
				blobUrl: null,
			});
		}
		onProgress?.(i + 1, captionRegions.length);
	}

	return segments;
}

async function adjustAudioDuration(
	buffer: AudioBuffer,
	targetDurationMs: number,
): Promise<AudioBuffer> {
	const targetDuration = targetDurationMs / 1000;
	const currentDuration = buffer.duration;

	if (Math.abs(currentDuration - targetDuration) < 0.1) {
		return buffer;
	}

	const offlineContext = new OfflineAudioContext(
		buffer.numberOfChannels,
		Math.ceil(targetDuration * buffer.sampleRate),
		buffer.sampleRate,
	);

	const offlineSource = offlineContext.createBufferSource();
	offlineSource.buffer = buffer;

	const playbackRate = currentDuration / targetDuration;
	offlineSource.playbackRate.value = Math.max(0.5, Math.min(2, playbackRate));

	offlineSource.connect(offlineContext.destination);
	offlineSource.start(0);

	return offlineContext.startRendering();
}

export async function createAudioBlobFromSegments(
	segments: CaptionAudioSegment[],
	totalDurationMs: number,
	sampleRate: number = 48000,
): Promise<Blob> {
	const offlineContext = new OfflineAudioContext(
		2,
		Math.ceil((totalDurationMs / 1000) * sampleRate),
		sampleRate,
	);

	for (const segment of segments) {
		if (!segment.audioBuffer) continue;

		const source = offlineContext.createBufferSource();
		source.buffer = segment.audioBuffer;

		const gainNode = offlineContext.createGain();
		gainNode.gain.value = 1.0;

		source.connect(gainNode);
		gainNode.connect(offlineContext.destination);

		const startTime = segment.startMs / 1000;
		source.start(startTime);
	}

	const renderedBuffer = await offlineContext.startRendering();

	const wavBlob = audioBufferToWav(renderedBuffer);
	return wavBlob;
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
	const numChannels = buffer.numberOfChannels;
	const sampleRate = buffer.sampleRate;
	const format = 1;
	const bitDepth = 16;

	const bytesPerSample = bitDepth / 8;
	const blockAlign = numChannels * bytesPerSample;

	const dataLength = buffer.length * blockAlign;
	const bufferLength = 44 + dataLength;
	const arrayBuffer = new ArrayBuffer(bufferLength);
	const view = new DataView(arrayBuffer);

	writeString(view, 0, "RIFF");
	view.setUint32(4, 36 + dataLength, true);
	writeString(view, 8, "WAVE");
	writeString(view, 12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, format, true);
	view.setUint16(22, numChannels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * blockAlign, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, bitDepth, true);
	writeString(view, 36, "data");
	view.setUint32(40, dataLength, true);

	const channels = [];
	for (let i = 0; i < numChannels; i++) {
		channels.push(buffer.getChannelData(i));
	}

	let offset = 44;
	for (let i = 0; i < buffer.length; i++) {
		for (let channel = 0; channel < numChannels; channel++) {
			const sample = Math.max(-1, Math.min(1, channels[channel][i]));
			const value = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
			view.setInt16(offset, value, true);
			offset += 2;
		}
	}

	return new Blob([arrayBuffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, string: string): void {
	for (let i = 0; i < string.length; i++) {
		view.setUint8(offset + i, string.charCodeAt(i));
	}
}
