import { BaseTTSEngine } from "./engine";
import type { TTSSettings, TTSVoice } from "./types";

export class WebSpeechEngine extends BaseTTSEngine {
	name = "web-speech";
	private voicesCache: SpeechSynthesisVoice[] = [];
	private voicesLoaded = false;

	/**
	 * Lazily access `window.speechSynthesis` so that instantiation in
	 * non-browser environments (Node/test runners) does not throw a
	 * ReferenceError.
	 */
	private getSynthesis(): SpeechSynthesis | null {
		if (typeof window === "undefined") return null;
		return window.speechSynthesis ?? null;
	}

	isAvailable(): boolean {
		return typeof window !== "undefined" && "speechSynthesis" in window;
	}

	private async waitForVoicesLoaded(): Promise<void> {
		const synthesis = this.getSynthesis();
		if (!synthesis) return;

		if (this.voicesLoaded) return;

		const voices = synthesis.getVoices();
		if (voices.length > 0) {
			this.voicesCache = voices;
			this.voicesLoaded = true;
			return;
		}

		return new Promise((resolve) => {
			const handler = () => {
				this.voicesCache = synthesis.getVoices();
				this.voicesLoaded = true;
				synthesis.removeEventListener("voiceschanged", handler);
				resolve();
			};
			synthesis.addEventListener("voiceschanged", handler);
			this.voicesCache = synthesis.getVoices();
			if (this.voicesCache.length > 0) {
				synthesis.removeEventListener("voiceschanged", handler);
				this.voicesLoaded = true;
				resolve();
			}
		});
	}

	async getVoices(): Promise<TTSVoice[]> {
		await this.waitForVoicesLoaded();
		return this.voicesCache.map((voice) => ({
			name: voice.name,
			lang: voice.lang,
			default: voice.default,
			voiceURI: voice.voiceURI,
		}));
	}

	private findVoiceByName(voiceName: string): SpeechSynthesisVoice | null {
		const match = this.voicesCache.find((v) => v.name === voiceName || v.voiceURI === voiceName);
		return match || null;
	}

	async synthesize(text: string, _settings: TTSSettings): Promise<AudioBuffer> {
		const sanitizedText = this.sanitizeText(text);
		if (!sanitizedText) {
			throw new Error("Cannot synthesize empty text");
		}

		if (typeof window === "undefined") {
			throw new Error("WebSpeechEngine is not available in this environment");
		}

		await this.waitForVoicesLoaded();

		// 由于无法直接从 Web Speech API 捕获音频，我们创建一个空的 AudioBuffer
		// 实际的播放将通过 speechSynthesis 直接进行
		const AudioCtx =
			window.AudioContext ||
			(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
		const audioContext = new AudioCtx();
		try {
			const buffer = audioContext.createBuffer(
				1,
				audioContext.sampleRate * 0.1,
				audioContext.sampleRate,
			);
			return buffer;
		} finally {
			audioContext.close();
		}
	}

	async speak(text: string, settings: TTSSettings): Promise<void> {
		const sanitizedText = this.sanitizeText(text);
		if (!sanitizedText) {
			console.warn("TTS: No text to speak");
			return;
		}

		const synthesis = this.getSynthesis();
		if (!synthesis) {
			console.warn("TTS: speechSynthesis not available");
			return;
		}

		await this.waitForVoicesLoaded();

		return new Promise((resolve, reject) => {
			const utterance = new SpeechSynthesisUtterance(sanitizedText);

			utterance.rate = settings.rate;
			utterance.pitch = settings.pitch;
			utterance.volume = settings.volume;
			utterance.lang = settings.lang;

			const voice = this.findVoiceByName(settings.voice);
			if (voice) {
				utterance.voice = voice;
			}

			utterance.onend = () => {
				console.log("TTS finished speaking:", sanitizedText);
				resolve();
			};

			utterance.onerror = (event) => {
				console.error("TTS speech synthesis error:", event);
				reject(new Error(`Speech synthesis error: ${event.error}`));
			};

			utterance.onstart = () => {
				console.log("TTS started speaking:", sanitizedText);
			};

			// 确保我们能播放语音
			try {
				synthesis.speak(utterance);
			} catch (error) {
				console.error("TTS failed to speak:", error);
				reject(error);
			}
		});
	}

	cancel(): void {
		this.getSynthesis()?.cancel();
	}
}
