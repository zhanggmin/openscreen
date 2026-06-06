import { BaseTTSEngine } from "./engine";
import type { AliyunTTSModel, AliyunTTSSettings, TTSSettings, TTSVoice } from "./types";

// ===== CosyVoice v3 Flash 音色列表 =====
// 官方文档：https://help.aliyun.com/zh/model-studio/cosyvoice-voice-list
const COSYVOICE_V3_FLASH_VOICES: TTSVoice[] = [
	// 社交陪伴
	{ name: "龙安洋 (阳光大男孩)", lang: "zh-CN", default: true, voiceURI: "longanyang" },
	{ name: "龙安欢V3 (欢脱元气女)", lang: "zh-CN", default: false, voiceURI: "longanhuan_v3" },
	{ name: "龙安欢 (欢脱元气女)", lang: "zh-CN", default: false, voiceURI: "longanhuan" },
	// 童声
	{ name: "龙呼呼 (天真烂漫女童)", lang: "zh-CN", default: false, voiceURI: "longhuhu_v3" },
	{ name: "龙泡泡 (飞天泡泡音)", lang: "zh-CN", default: false, voiceURI: "longpaopao_v3" },
	{ name: "龙杰力豆 (阳光顽皮男)", lang: "zh-CN", default: false, voiceURI: "longjielidou_v3" },
	{ name: "龙仙 (豪放可爱女)", lang: "zh-CN", default: false, voiceURI: "longxian_v3" },
	{ name: "龙铃 (稚气呆板女)", lang: "zh-CN", default: false, voiceURI: "longling_v3" },
	{ name: "龙闪闪 (戏剧化童声)", lang: "zh-CN", default: false, voiceURI: "longshanshan_v3" },
	{ name: "龙牛牛 (阳光男童声)", lang: "zh-CN", default: false, voiceURI: "longniuniu_v3" },
	// 语音助手
	{ name: "龙小淳 (知性积极女)", lang: "zh-CN", default: false, voiceURI: "longxiaochun_v3" },
	{ name: "龙小夏 (沉稳权威女)", lang: "zh-CN", default: false, voiceURI: "longxiaoxia_v3" },
	{ name: "YUMI (正经青年女)", lang: "zh-CN", default: false, voiceURI: "longyumi_v3" },
	{ name: "龙安昀 (居家暖男)", lang: "zh-CN", default: false, voiceURI: "longanyun_v3" },
	{ name: "龙安温 (优雅知性女)", lang: "zh-CN", default: false, voiceURI: "longanwen_v3" },
	{ name: "龙安莉 (利落从容女)", lang: "zh-CN", default: false, voiceURI: "longanli_v3" },
	{ name: "龙安朗 (清爽利落男)", lang: "zh-CN", default: false, voiceURI: "longanlang_v3" },
	{ name: "龙应沐 (优雅知性女)", lang: "zh-CN", default: false, voiceURI: "longyingmu_v3" },
	// 社交陪伴
	{ name: "龙安台 (嗲甜台湾女)", lang: "zh-CN", default: false, voiceURI: "longantai_v3" },
	{ name: "龙华 (元气甜美女)", lang: "zh-CN", default: false, voiceURI: "longhua_v3" },
	{ name: "龙橙 (智慧青年男)", lang: "zh-CN", default: false, voiceURI: "longcheng_v3" },
	{ name: "龙泽 (温暖元气男)", lang: "zh-CN", default: false, voiceURI: "longze_v3" },
	{ name: "龙哲 (呆板大暖男)", lang: "zh-CN", default: false, voiceURI: "longzhe_v3" },
	{ name: "龙颜 (温暖春风女)", lang: "zh-CN", default: false, voiceURI: "longyan_v3" },
	{ name: "龙星 (温婉邻家女)", lang: "zh-CN", default: false, voiceURI: "longxing_v3" },
	{ name: "龙天 (磁性理智男)", lang: "zh-CN", default: false, voiceURI: "longtian_v3" },
	{ name: "龙婉 (细腻柔声女)", lang: "zh-CN", default: false, voiceURI: "longwan_v3" },
	{ name: "龙嫱 (浪漫风情女)", lang: "zh-CN", default: false, voiceURI: "longqiang_v3" },
	{ name: "龙菲菲 (甜美娇气女)", lang: "zh-CN", default: false, voiceURI: "longfeifei_v3" },
	{ name: "龙浩 (多情忧郁男)", lang: "zh-CN", default: false, voiceURI: "longhao_v3" },
	{ name: "龙安柔 (温柔闺蜜女)", lang: "zh-CN", default: false, voiceURI: "longanrou_v3" },
	{ name: "龙寒 (温暖痴情男)", lang: "zh-CN", default: false, voiceURI: "longhan_v3" },
	{ name: "龙安智 (睿智轻熟男)", lang: "zh-CN", default: false, voiceURI: "longanzhi_v3" },
	{ name: "龙安灵 (思维灵动女)", lang: "zh-CN", default: false, voiceURI: "longanling_v3" },
	{ name: "龙安雅 (高雅气质女)", lang: "zh-CN", default: false, voiceURI: "longanya_v3" },
	{ name: "龙安亲 (亲和活泼女)", lang: "zh-CN", default: false, voiceURI: "longanqin_v3" },
	// 有声书
	{ name: "龙妙 (抑扬顿挫女)", lang: "zh-CN", default: false, voiceURI: "longmiao_v3" },
	{ name: "龙三叔 (沉稳质感男)", lang: "zh-CN", default: false, voiceURI: "longsanshu_v3" },
	{ name: "龙媛 (温暖治愈女)", lang: "zh-CN", default: false, voiceURI: "longyuan_v3" },
	{ name: "龙悦 (温暖磁性女)", lang: "zh-CN", default: false, voiceURI: "longyue_v3" },
	{ name: "龙修 (博才说书男)", lang: "zh-CN", default: false, voiceURI: "longxiu_v3" },
	{ name: "龙楠 (睿智青年男)", lang: "zh-CN", default: false, voiceURI: "longnan_v3" },
	{ name: "龙婉君 (细腻柔声女)", lang: "zh-CN", default: false, voiceURI: "longwanjun_v3" },
	{ name: "龙逸尘 (洒脱活力男)", lang: "zh-CN", default: false, voiceURI: "longyichen_v3" },
	{ name: "龙老伯 (沧桑岁月爷)", lang: "zh-CN", default: false, voiceURI: "longlaobo_v3" },
	{ name: "龙老姨 (烟火从容阿姨)", lang: "zh-CN", default: false, voiceURI: "longlaoyi_v3" },
	// 客服
	{ name: "龙应笑 (清甜推销女)", lang: "zh-CN", default: false, voiceURI: "longyingxiao_v3" },
	{ name: "龙应询 (年轻青涩男)", lang: "zh-CN", default: false, voiceURI: "longyingxun_v3" },
	{ name: "龙应静 (低调冷静女)", lang: "zh-CN", default: false, voiceURI: "longyingjing_v3" },
	{ name: "龙应聆 (温和共情女)", lang: "zh-CN", default: false, voiceURI: "longyingling_v3" },
	{ name: "龙应桃 (温柔淡定女)", lang: "zh-CN", default: false, voiceURI: "longyingtao_v3" },
	// 新闻播报
	{ name: "龙硕 (博才干练男)", lang: "zh-CN", default: false, voiceURI: "longshuo_v3" },
	{ name: "龙书 (沉稳青年男)", lang: "zh-CN", default: false, voiceURI: "longshu_v3" },
	{ name: "Bella3.0 (精准干练女)", lang: "zh-CN", default: false, voiceURI: "loongbella_v3" },
	// 短视频配音
	{ name: "龙机器 (呆萌机器人)", lang: "zh-CN", default: false, voiceURI: "longjiqi_v3" },
	{ name: "龙猴哥 (经典猴哥)", lang: "zh-CN", default: false, voiceURI: "longhouge_v3" },
	{ name: "龙黛玉 (娇率才女音)", lang: "zh-CN", default: false, voiceURI: "longdaiyu_v3" },
	// 直播带货
	{ name: "龙安燃 (活泼质感女)", lang: "zh-CN", default: false, voiceURI: "longanran_v3" },
	{ name: "龙安宣 (经典直播女)", lang: "zh-CN", default: false, voiceURI: "longanxuan_v3" },
	// 诗词朗诵
	{ name: "龙飞 (热血磁性男)", lang: "zh-CN", default: false, voiceURI: "longfei_v3" },
	// 方言
	{ name: "龙嘉欣 (粤语女)", lang: "zh-CN", default: false, voiceURI: "longjiaxin_v3" },
	{ name: "龙嘉怡 (粤语女)", lang: "zh-CN", default: false, voiceURI: "longjiayi_v3" },
	{ name: "龙安粤 (粤语男)", lang: "zh-CN", default: false, voiceURI: "longanyue_v3" },
	{ name: "龙老铁 (东北话男)", lang: "zh-CN", default: false, voiceURI: "longlaotie_v3" },
	{ name: "龙陕哥 (陕西话男)", lang: "zh-CN", default: false, voiceURI: "longshange_v3" },
	{ name: "龙安闽 (闽南话女)", lang: "zh-CN", default: false, voiceURI: "longanmin_v3" },
];

// ===== CosyVoice v3 Plus 音色列表 =====
const COSYVOICE_V3_PLUS_VOICES: TTSVoice[] = [
	{ name: "龙安洋 (阳光大男孩)", lang: "zh-CN", default: true, voiceURI: "longanyang" },
	{ name: "龙安欢 (欢脱元气女)", lang: "zh-CN", default: false, voiceURI: "longanhuan" },
];

// ===== Qwen-TTS 基础版音色列表（仅 4 个） =====
// 官方文档：https://help.aliyun.com/zh/model-studio/qwen-tts-voice-list
// qwen-tts 模型只支持这 4 个音色
const QWEN_TTS_BASE_VOICES: TTSVoice[] = [
	{ name: "Cherry 芊悦 (阳光积极女)", lang: "zh-CN", default: true, voiceURI: "Cherry" },
	{ name: "Serena 苏瑶 (温柔女)", lang: "zh-CN", default: false, voiceURI: "Serena" },
	{ name: "Ethan 晨煦 (阳光男)", lang: "zh-CN", default: false, voiceURI: "Ethan" },
	{ name: "Chelsie 千雪 (二次元女)", lang: "zh-CN", default: false, voiceURI: "Chelsie" },
];

// ===== Qwen3-TTS 扩展音色列表（支持全部音色） =====
// 适用于 qwen3-tts-flash / qwen3-tts-instruct-flash
const QWEN3_TTS_VOICES: TTSVoice[] = [
	{ name: "Cherry 芊悦 (阳光积极女)", lang: "zh-CN", default: true, voiceURI: "Cherry" },
	{ name: "Serena 苏瑶 (温柔女)", lang: "zh-CN", default: false, voiceURI: "Serena" },
	{ name: "Ethan 晨煦 (阳光男)", lang: "zh-CN", default: false, voiceURI: "Ethan" },
	{ name: "Chelsie 千雪 (二次元女)", lang: "zh-CN", default: false, voiceURI: "Chelsie" },
	{ name: "Momo 茉兔 (搞怪女)", lang: "zh-CN", default: false, voiceURI: "Momo" },
	{ name: "Vivian 十三 (可爱女)", lang: "zh-CN", default: false, voiceURI: "Vivian" },
	{ name: "Moon 月白 (帅气男)", lang: "zh-CN", default: false, voiceURI: "Moon" },
	{ name: "Maia 四月 (知性女)", lang: "zh-CN", default: false, voiceURI: "Maia" },
	{ name: "Kai 凯 (温暖男)", lang: "zh-CN", default: false, voiceURI: "Kai" },
	{ name: "Nofish 不吃鱼 (设计师男)", lang: "zh-CN", default: false, voiceURI: "Nofish" },
	{ name: "Bella 萌宝 (萝莉女)", lang: "zh-CN", default: false, voiceURI: "Bella" },
	{ name: "Jennifer 詹妮弗 (品牌女)", lang: "zh-CN", default: false, voiceURI: "Jennifer" },
	{ name: "Ryan 甜茶 (戏剧男)", lang: "zh-CN", default: false, voiceURI: "Ryan" },
	{ name: "Katerina 卡捷琳娜 (御姐女)", lang: "zh-CN", default: false, voiceURI: "Katerina" },
	{ name: "Aiden 艾登 (美语男)", lang: "zh-CN", default: false, voiceURI: "Aiden" },
	{ name: "Eldric Sage 沧明子 (睿智老者)", lang: "zh-CN", default: false, voiceURI: "Eldric Sage" },
	{ name: "Mia 乖小妹 (温顺女)", lang: "zh-CN", default: false, voiceURI: "Mia" },
	{ name: "Mochi 沙小弥 (童真男)", lang: "zh-CN", default: false, voiceURI: "Mochi" },
	{ name: "Bellona 燕铮莺 (洪亮女)", lang: "zh-CN", default: false, voiceURI: "Bellona" },
	{ name: "Vincent 田叔 (沙哑男)", lang: "zh-CN", default: false, voiceURI: "Vincent" },
	{ name: "Bunny 萌小姬 (萌萝莉)", lang: "zh-CN", default: false, voiceURI: "Bunny" },
	{ name: "Neil 阿闻 (播音男)", lang: "zh-CN", default: false, voiceURI: "Neil" },
	{ name: "Elias 墨讲师 (学术女)", lang: "zh-CN", default: false, voiceURI: "Elias" },
	{ name: "Arthur 徐大爷 (质朴男)", lang: "zh-CN", default: false, voiceURI: "Arthur" },
	{ name: "Nini 邻家妹妹 (软糯女)", lang: "zh-CN", default: false, voiceURI: "Nini" },
	{ name: "Seren 小婉 (助眠女)", lang: "zh-CN", default: false, voiceURI: "Seren" },
	{ name: "Pip 顽屁小孩 (童真男)", lang: "zh-CN", default: false, voiceURI: "Pip" },
	{ name: "Stella 少女阿月 (甜美女)", lang: "zh-CN", default: false, voiceURI: "Stella" },
	// 方言音色
	{ name: "Jada 上海-阿珍 (上海话)", lang: "zh-CN", default: false, voiceURI: "Jada" },
	{ name: "Dylan 北京-晓东 (北京话)", lang: "zh-CN", default: false, voiceURI: "Dylan" },
	{ name: "Marcus 陕西-秦川 (陕西话)", lang: "zh-CN", default: false, voiceURI: "Marcus" },
	{ name: "Roy 闽南-阿杰 (闽南语)", lang: "zh-CN", default: false, voiceURI: "Roy" },
	{ name: "Peter 天津-李彼得 (天津话)", lang: "zh-CN", default: false, voiceURI: "Peter" },
	{ name: "Sunny 四川-晴儿 (四川话)", lang: "zh-CN", default: false, voiceURI: "Sunny" },
	{ name: "Eric 四川-程川 (四川话)", lang: "zh-CN", default: false, voiceURI: "Eric" },
	{ name: "Rocky 粤语-阿强 (粤语)", lang: "zh-CN", default: false, voiceURI: "Rocky" },
	{ name: "Kiki 粤语-阿清 (粤语)", lang: "zh-CN", default: false, voiceURI: "Kiki" },
];

// ===== MiniMax 音色列表 =====
const MINIMAX_VOICES: TTSVoice[] = [
	{ name: "青涩男声", lang: "zh-CN", default: true, voiceURI: "male-qn-qingse" },
	{ name: "少女声", lang: "zh-CN", default: false, voiceURI: "female-shaonv" },
	{ name: "精英男声", lang: "zh-CN", default: false, voiceURI: "male-qn-jingying" },
	{ name: "御姐声", lang: "zh-CN", default: false, voiceURI: "female-yujie" },
	{ name: "霸道男声", lang: "zh-CN", default: false, voiceURI: "male-qn-badao" },
	{ name: "成熟女声", lang: "zh-CN", default: false, voiceURI: "female-chengshu" },
];

const MODEL_VOICES: Record<AliyunTTSModel, TTSVoice[]> = {
	"cosyvoice-v3-flash": COSYVOICE_V3_FLASH_VOICES,
	"cosyvoice-v3-plus": COSYVOICE_V3_PLUS_VOICES,
	"qwen3-tts-flash": QWEN3_TTS_VOICES,
	"qwen3-tts-instruct-flash": QWEN3_TTS_VOICES,
	"qwen-tts": QWEN_TTS_BASE_VOICES,
	"MiniMax/speech-2.8-hd": MINIMAX_VOICES,
};

/** 判断是否为 Qwen-TTS 系列模型（使用多模态接口） */
function isQwenTTSModel(model: string): boolean {
	return model.startsWith("qwen");
}

/** 判断是否为 MiniMax 模型 */
function isMiniMaxModel(model: string): boolean {
	return model.startsWith("MiniMax");
}

export class AliyunEngine extends BaseTTSEngine {
	name = "aliyun";
	private aliyunSettings: AliyunTTSSettings | null = null;
	private currentAbortController: AbortController | null = null;
	private audioElement: HTMLAudioElement | null = null;
	private validatedVoices: TTSVoice[] = [];
	private apiKeyValidated: boolean = false;

	/** CosyVoice 系列使用的接口地址 */
	private static readonly COSYVOICE_API_URL =
		"https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer";
	/** Qwen-TTS / MiniMax 使用的多模态接口地址 */
	private static readonly MULTIMODAL_API_URL =
		"https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";

	setAliyunSettings(settings: AliyunTTSSettings): void {
		// 仅当 API Key 发生变化时才重置验证状态和缓存的音色列表
		if (this.aliyunSettings?.apiKey !== settings.apiKey) {
			this.apiKeyValidated = false;
			this.validatedVoices = [];
		}
		this.aliyunSettings = settings;
	}

	isAvailable(): boolean {
		return !!this.aliyunSettings?.apiKey;
	}

	isApiKeyValidated(): boolean {
		return this.apiKeyValidated;
	}

	async validateApiKey(): Promise<{ success: boolean; message: string }> {
		if (!this.aliyunSettings?.apiKey) {
			return { success: false, message: "Please provide API Key" };
		}

		this.currentAbortController = new AbortController();

		try {
			const testSettings: TTSSettings = {
				voice: "",
				rate: 1.0,
				pitch: 1.0,
				volume: 1.0,
				lang: "zh-CN",
			};
			const response = await this.callTTSApi("test", testSettings);

			if (!response.ok) {
				const errorText = await response.text();
				let message = `API Key validation failed: ${response.status}`;
				try {
					const errorData = JSON.parse(errorText);
					message = errorData.message || message;
				} catch {
					message = errorText || message;
				}
				return { success: false, message };
			}

			this.validatedVoices = this.getDefaultVoices();
			this.apiKeyValidated = true;
			return { success: true, message: "API Key validated successfully" };
		} catch (error) {
			console.error("API Key validation failed:", error);
			return {
				success: false,
				message: error instanceof Error ? error.message : "Validation failed",
			};
		}
	}

	async getVoices(): Promise<TTSVoice[]> {
		if (this.apiKeyValidated && this.validatedVoices.length > 0) {
			return this.validatedVoices;
		}

		if (!this.aliyunSettings?.model) {
			return COSYVOICE_V3_FLASH_VOICES;
		}
		return MODEL_VOICES[this.aliyunSettings.model] || COSYVOICE_V3_FLASH_VOICES;
	}

	private getDefaultVoices(): TTSVoice[] {
		if (!this.aliyunSettings?.model) {
			return COSYVOICE_V3_FLASH_VOICES;
		}
		return MODEL_VOICES[this.aliyunSettings.model] || COSYVOICE_V3_FLASH_VOICES;
	}

	/** 根据模型类型选择对应的 API 地址 */
	private getApiUrl(): string {
		const model = this.aliyunSettings?.model || "cosyvoice-v3-flash";
		if (isQwenTTSModel(model) || isMiniMaxModel(model)) {
			return AliyunEngine.MULTIMODAL_API_URL;
		}
		return AliyunEngine.COSYVOICE_API_URL;
	}

	/** 构建请求体，不同模型的请求结构不同 */
	private buildRequestBody(text: string, settings: TTSSettings): Record<string, unknown> {
		const model = this.aliyunSettings?.model || "cosyvoice-v3-flash";
		const voice = settings.voice || MODEL_VOICES[model]?.[0]?.voiceURI || "longanyang";

		// Qwen-TTS 系列：使用多模态接口
		if (isQwenTTSModel(model)) {
			return {
				model,
				input: {
					text,
					voice,
					language_type: settings.lang === "en-US" ? "English" : "Chinese",
				},
			};
		}

		// MiniMax：使用多模态接口，独立的 voice_setting 和 audio_setting
		if (isMiniMaxModel(model)) {
			return {
				model,
				input: {
					text,
					voice_setting: {
						voice_id: voice,
						speed: settings.rate,
						vol: settings.volume,
						pitch: Math.round((settings.pitch - 1) * 5),
					},
					audio_setting: {
						sample_rate: 24000,
						bitrate: 128000,
						format: "mp3",
						channel: 1,
					},
				},
			};
		}

		// CosyVoice 系列：voice、format、sample_rate 在 input 内部
		// 参考：https://help.aliyun.com/zh/model-studio/developer-reference/api-reference-of-non-real-time-speech-synthesis
		return {
			model,
			input: {
				text,
				voice,
				format: "wav",
				sample_rate: 24000,
			},
		};
	}

	async synthesize(text: string, settings: TTSSettings): Promise<AudioBuffer> {
		const sanitizedText = this.sanitizeText(text);
		if (!sanitizedText) {
			throw new Error("Cannot synthesize empty text");
		}

		if (!this.isAvailable()) {
			throw new Error("Aliyun TTS not configured. Please provide API Key.");
		}

		this.currentAbortController = new AbortController();

		try {
			const response = await this.callTTSApi(sanitizedText, settings);
			const contentType = response.headers.get("content-type") || "";

			// CosyVoice 模型直接返回二进制音频流
			if (contentType.includes("audio") || contentType.includes("octet-stream")) {
				const arrayBuffer = await response.arrayBuffer();
				return this.decodeAudio(arrayBuffer);
			}

			// 多模态模型（Qwen-TTS / MiniMax）返回 JSON
			const data = await response.json();

			// JSON 响应中包含音频 URL
			if (data.output?.audio?.url) {
				const audioUrl = data.output.audio.url;
				const audioResponse = await fetch(audioUrl, {
					signal: this.currentAbortController.signal,
				});

				if (!audioResponse.ok) {
					throw new Error(`Failed to download audio: ${audioResponse.status}`);
				}

				const arrayBuffer = await audioResponse.arrayBuffer();
				return this.decodeAudio(arrayBuffer);
			}

			// JSON 响应中包含 base64 编码的音频数据
			if (data.output?.audio?.data) {
				const base64Data = data.output.audio.data;
				const binaryString = atob(base64Data);
				const bytes = new Uint8Array(binaryString.length);
				for (let i = 0; i < binaryString.length; i++) {
					bytes[i] = binaryString.charCodeAt(i);
				}

				return this.decodeAudio(bytes.buffer);
			}

			// 检查是否有错误信息
			if (data.message || data.error) {
				throw new Error(`Aliyun TTS API error: ${data.message || JSON.stringify(data.error)}`);
			}

			throw new Error("No audio data in response");
		} catch (error) {
			console.error("Aliyun TTS synthesize failed:", error);
			throw error;
		}
	}

	/** 将 ArrayBuffer 解码为 AudioBuffer */
	private async decodeAudio(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
		const AudioCtx =
			window.AudioContext ||
			(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
		const audioContext = new AudioCtx();
		try {
			return await audioContext.decodeAudioData(arrayBuffer);
		} finally {
			audioContext.close();
		}
	}

	private async callTTSApi(text: string, settings: TTSSettings): Promise<Response> {
		if (!this.aliyunSettings?.apiKey) {
			throw new Error("Aliyun API Key not configured");
		}

		const url = this.getApiUrl();
		const body = this.buildRequestBody(text, settings);

		const response = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.aliyunSettings.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
			signal: this.currentAbortController?.signal,
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Aliyun API error: ${response.status} - ${errorText}`);
		}

		return response;
	}

	async speak(text: string, settings: TTSSettings): Promise<void> {
		const sanitizedText = this.sanitizeText(text);
		if (!sanitizedText) {
			console.warn("TTS: No text to speak");
			return;
		}

		if (!this.isAvailable()) {
			throw new Error("Aliyun TTS not configured. Please provide API Key.");
		}

		this.currentAbortController = new AbortController();

		try {
			const audioBuffer = await this.synthesize(sanitizedText, settings);
			const AudioCtx =
				window.AudioContext ||
				(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
			const audioContext = new AudioCtx();
			const source = audioContext.createBufferSource();
			source.buffer = audioBuffer;
			source.connect(audioContext.destination);

			return new Promise((resolve, reject) => {
				source.onended = () => {
					audioContext.close();
					resolve();
				};
				try {
					source.start();
				} catch (error: unknown) {
					audioContext.close();
					reject(error);
				}
			});
		} catch (error) {
			console.error("Aliyun TTS speak failed:", error);
			throw error;
		}
	}

	cancel(): void {
		if (this.currentAbortController) {
			this.currentAbortController.abort();
			this.currentAbortController = null;
		}
		if (this.audioElement) {
			this.audioElement.pause();
			this.audioElement = null;
		}
	}
}
