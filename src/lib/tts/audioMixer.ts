import type { CaptionAudioSegment, TTSToAudioOptions } from "./types";

export class AudioMixer {
	private audioContext: AudioContext | null = null;

	async mixAudio(
		originalAudioUrl: string,
		ttsSegments: CaptionAudioSegment[],
		options: TTSToAudioOptions = {},
	): Promise<Blob> {
		const ttsVolume = options.ttsVolume ?? 0.8;
		const originalVolume = options.originalVolume ?? 0.5;

		this.audioContext = new (
			window.AudioContext ||
			(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
		)();

		try {
			let originalBuffer: AudioBuffer | null = null;
			if (originalAudioUrl) {
				originalBuffer = await this.fetchAndDecodeAudio(originalAudioUrl);
			}

			const totalDuration = Math.max(
				originalBuffer?.duration || 0,
				...ttsSegments.map((s) => s.endMs / 1000),
			);

			const offlineContext = new OfflineAudioContext(2, Math.ceil(totalDuration * 48000), 48000);

			if (originalBuffer) {
				const resampledBuffer = await this.resampleBuffer(
					originalBuffer,
					offlineContext.sampleRate,
				);
				const originalSource = offlineContext.createBufferSource();
				originalSource.buffer = resampledBuffer;
				const originalGain = offlineContext.createGain();
				originalGain.gain.value = originalVolume;
				originalSource.connect(originalGain);
				originalGain.connect(offlineContext.destination);
				originalSource.start(0);
			}

			for (const segment of ttsSegments) {
				if (!segment.audioBuffer) continue;

				const resampledBuffer = await this.resampleBuffer(
					segment.audioBuffer,
					offlineContext.sampleRate,
				);
				const source = offlineContext.createBufferSource();
				source.buffer = resampledBuffer;
				const gain = offlineContext.createGain();
				gain.gain.value = ttsVolume;
				source.connect(gain);
				gain.connect(offlineContext.destination);
				source.start(segment.startMs / 1000);
			}

			const renderedBuffer = await offlineContext.startRendering();
			const wavBlob = this.audioBufferToWav(renderedBuffer);
			return wavBlob;
		} finally {
			this.cleanup();
		}
	}

	private async fetchAndDecodeAudio(url: string): Promise<AudioBuffer> {
		if (!this.audioContext) {
			throw new Error("AudioContext not initialized");
		}

		const response = await fetch(url);
		const arrayBuffer = await response.arrayBuffer();
		return this.audioContext.decodeAudioData(arrayBuffer);
	}

	private async resampleBuffer(
		buffer: AudioBuffer,
		targetSampleRate: number,
	): Promise<AudioBuffer> {
		if (buffer.sampleRate === targetSampleRate) {
			return buffer;
		}

		const offlineContext = new OfflineAudioContext(
			buffer.numberOfChannels,
			Math.ceil(buffer.duration * targetSampleRate),
			targetSampleRate,
		);

		const source = offlineContext.createBufferSource();
		source.buffer = buffer;
		source.connect(offlineContext.destination);
		source.start(0);

		return offlineContext.startRendering();
	}

	private audioBufferToWav(buffer: AudioBuffer): Blob {
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

		this.writeString(view, 0, "RIFF");
		view.setUint32(4, 36 + dataLength, true);
		this.writeString(view, 8, "WAVE");
		this.writeString(view, 12, "fmt ");
		view.setUint32(16, 16, true);
		view.setUint16(20, format, true);
		view.setUint16(22, numChannels, true);
		view.setUint32(24, sampleRate, true);
		view.setUint32(28, sampleRate * blockAlign, true);
		view.setUint16(32, blockAlign, true);
		view.setUint16(34, bitDepth, true);
		this.writeString(view, 36, "data");
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

	private writeString(view: DataView, offset: number, string: string): void {
		for (let i = 0; i < string.length; i++) {
			view.setUint8(offset + i, string.charCodeAt(i));
		}
	}

	private cleanup(): void {
		if (this.audioContext) {
			this.audioContext.close();
			this.audioContext = null;
		}
	}
}
