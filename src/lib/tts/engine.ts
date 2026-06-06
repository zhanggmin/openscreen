import type { TTSEngine, TTSSettings, TTSVoice } from "./types";

export abstract class BaseTTSEngine implements TTSEngine {
	abstract name: string;
	abstract isAvailable(): boolean;
	abstract getVoices(): Promise<TTSVoice[]>;
	abstract synthesize(text: string, settings: TTSSettings): Promise<AudioBuffer>;
	abstract speak(text: string, settings: TTSSettings): Promise<void>;
	abstract cancel(): void;

	protected sanitizeText(text: string): string {
		return (
			text
				.trim()
				.replace(/\s+/g, " ")
				// biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally stripping control characters
				.replace(/[\u0000-\u0008\u000E-\u001F\u007F]/g, "")
		); // 只删除控制字符
	}
}
