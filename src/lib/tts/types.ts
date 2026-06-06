export type TTSEngineType = "web-speech" | "aliyun";

export type AliyunTTSModel =
	| "cosyvoice-v3-flash"
	| "cosyvoice-v3-plus"
	| "qwen3-tts-flash"
	| "qwen3-tts-instruct-flash"
	| "qwen-tts"
	| "MiniMax/speech-2.8-hd";

export interface TTSSettings {
	voice: string;
	rate: number;
	pitch: number;
	volume: number;
	lang: string;
}

export interface AliyunTTSSettings {
	apiKey: string;
	model: AliyunTTSModel;
}

export interface TTSVoice {
	name: string;
	lang: string;
	default: boolean;
	voiceURI: string;
}

export interface CaptionAudioSegment {
	id: string;
	startMs: number;
	endMs: number;
	content: string;
	audioBuffer: AudioBuffer | null;
	blobUrl: string | null;
}

export interface TTSEngine {
	name: string;
	isAvailable(): boolean;
	getVoices(): Promise<TTSVoice[]>;
	synthesize(text: string, settings: TTSSettings): Promise<AudioBuffer>;
	speak(text: string, settings: TTSSettings): Promise<void>;
	cancel(): void;
}

export interface TTSToAudioOptions {
	ttsVolume?: number;
	originalVolume?: number;
}
