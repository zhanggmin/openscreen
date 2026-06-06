# 阿里云百炼 TTS 非实时语音合成接口说明

> 本文档整理了 OpenScreen 中使用的阿里云百炼 TTS 非实时语音合成接口调用方式。
> 仅包含**非实时**（Non-realtime）语音合成模型，不适用于实时流式场景。
>
> 官方文档：https://help.aliyun.com/zh/model-studio/developer-reference/api-reference-of-non-real-time-speech-synthesis

---

## 通用说明

- **认证方式**：`Authorization: Bearer <API_KEY>`，API Key 在[阿里百炼控制台](https://help.aliyun.com/zh/model-studio/get-api-key)获取
- **请求方式**：`POST`
- **Content-Type**：`application/json`
- **音频 URL 有效期**：24 小时

---

## 1. CosyVoice（非实时）

### 接口地址

```
https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer
```

> 仅限北京地域。

### 支持的模型

| 模型 | 说明 |
|---|---|
| `cosyvoice-v3-flash` | 快速高质量语音合成（推荐） |
| `cosyvoice-v3-plus` | 高质量语音合成 |

### 请求体结构

```json
{
  "model": "cosyvoice-v3-flash",
  "input": {
    "text": "要合成的文本",
    "voice": "longanyang",
    "format": "wav",
    "sample_rate": 24000
  }
}
```

**注意**：`voice`、`format`、`sample_rate` 必须放在 `input` 内部（不是 `parameters`）。

### 响应格式

- 成功时直接返回二进制音频流（`Content-Type: audio/wav` 或 `application/octet-stream`）
- 非流式模式下，响应中也可能包含音频 URL

### cosyvoice-v3-flash 音色列表（常用）

> 完整音色列表：https://help.aliyun.com/zh/model-studio/cosyvoice-voice-list

| voice 参数 | 名称 | 特质 | 语言 |
|---|---|---|---|
| `longanyang` | 龙安洋 | 阳光大男孩 20~30岁 | 中文(普通话)、英文 |
| `longanhuan_v3` | 龙安欢(V3) | 欢脱元气女 20~30岁 | 中文(普通话+方言)、英文 |
| `longhuhu_v3` | 龙呼呼 | 天真烂漫女童 6~10岁 | 中文(普通话)、英文 |
| `longfei_v3` | 龙飞 | 热血磁性男 30~35岁 | 中文(普通话)、英文 |
| `longxiaochun_v3` | 龙小淳 | 知性积极女 25~30岁 | 中文(普通话)、英文 |
| `longxiaoxia_v3` | 龙小夏 | 沉稳权威女 25~30岁 | 中文(普通话)、英文 |
| `longshuo_v3` | 龙硕 | 博才干练男 25~30岁 | 中文(普通话)、英文 |
| `longshu_v3` | 龙书 | 沉稳青年男 20~25岁 | 中文(普通话)、英文 |
| `longmiao_v3` | 龙妙 | 抑扬顿挫女 25~30岁 | 中文(普通话)、英文 |
| `longyue_v3` | 龙悦 | 温暖磁性女 30~35岁 | 中文(普通话)、英文 |
| `longyuan_v3` | 龙媛 | 温暖治愈女 35~40岁 | 中文(普通话)、英文 |
| `longsanshu_v3` | 龙三叔 | 沉稳质感男 25~45岁 | 中文(普通话)、英文 |
| `longhua_v3` | 龙华 | 元气甜美女 20~25岁 | 中文(普通话)、英文 |
| `longcheng_v3` | 龙橙 | 智慧青年男 20~25岁 | 中文(普通话)、英文 |
| `longze_v3` | 龙泽 | 温暖元气男 25~30岁 | 中文(普通话)、英文 |
| `longwan_v3` | 龙婉 | 细腻柔声女 20~30岁 | 中文(普通话)、英文 |
| `loongbella_v3` | Bella3.0 | 精准干练女 25~30岁 | 中文(普通话)、英文 |
| `longjiqi_v3` | 龙机器 | 呆萌机器人 20~30岁 | 中文(普通话)、英文 |
| `longhouge_v3` | 龙猴哥 | 经典猴哥 20~25岁 | 中文(普通话)、英文 |
| `longanran_v3` | 龙安燃 | 活泼质感女 30~40岁 | 中文(普通话)、英文 |

方言音色：

| voice 参数 | 名称 | 语言 |
|---|---|---|
| `longjiaxin_v3` | 龙嘉欣 | 粤语 |
| `longjiayi_v3` | 龙嘉怡 | 粤语 |
| `longanyue_v3` | 龙安粤 | 粤语 |
| `longlaotie_v3` | 龙老铁 | 东北话 |
| `longshange_v3` | 龙陕哥 | 陕西话 |
| `longanmin_v3` | 龙安闽 | 闽南话 |

出海营销音色（仅北京地域）：

| voice 参数 | 名称 | 语言 |
|---|---|---|
| `loongabby_v3` | loongabby | 美式英语女 |
| `loongandy_v3` | loongandy | 美式英语男 |
| `loongdavid_v3` | loongdavid | 美式英语男 |
| `loongemily_v3` | loongemily | 英式英语女 |
| `loongeric_v3` | loongeric | 英式英语男 |

### cosyvoice-v3-plus 音色列表

| voice 参数 | 名称 | 特质 | 语言 |
|---|---|---|---|
| `longanyang` | 龙安洋 | 阳光大男孩 20~30岁 | 中文(普通话)、英文 |
| `longanhuan` | 龙安欢 | 欢脱元气女 20~30岁 | 中文(普通话)、英文 |

---

## 2. Qwen-TTS（非实时）

### 接口地址

```
https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
```

### 支持的模型

| 模型 | 说明 |
|---|---|
| `qwen3-tts-flash` | 千问3-TTS 快速版（推荐） |
| `qwen3-tts-instruct-flash` | 千问3-TTS 支持指令控制版 |
| `qwen-tts` | 千问-TTS 基础版 |

### 请求体结构

```json
{
  "model": "qwen3-tts-flash",
  "input": {
    "text": "要合成的文本",
    "voice": "Cherry",
    "language_type": "Chinese"
  }
}
```

- `language_type`：建议与文本语种一致，取值 `Chinese` 或 `English`
- 指令控制版 (`qwen3-tts-instruct-flash`) 可额外传 `instructions` 参数

### 响应格式

返回 JSON，音频 URL 在 `output.audio.url` 中：

```json
{
  "output": {
    "audio": {
      "url": "https://xxx/audio.wav",
      "expires_at": 1234567890
    }
  }
}
```

### Qwen-TTS 非实时音色列表

> 完整音色列表：https://help.aliyun.com/zh/model-studio/qwen-tts-voice-list

| voice 参数 | 音色名 | 描述 | 性别 |
|---|---|---|---|
| `Cherry` | 芊悦 | 阳光积极、亲切自然 | 女 |
| `Serena` | 苏瑶 | 温柔小姐姐 | 女 |
| `Ethan` | 晨煦 | 阳光、温暖、活力 | 男 |
| `Chelsie` | 千雪 | 二次元虚拟女友 | 女 |
| `Momo` | 茉兔 | 撒娇搞怪 | 女 |
| `Vivian` | 十三 | 拽拽的、可爱小暴躁 | 女 |
| `Moon` | 月白 | 率性帅气 | 男 |
| `Maia` | 四月 | 知性与温柔 | 女 |
| `Kai` | 凯 | 耳朵的一场SPA | 男 |
| `Nofish` | 不吃鱼 | 不会翘舌音的设计师 | 男 |
| `Bella` | 萌宝 | 小萝莉 | 女 |
| `Jennifer` | 詹妮弗 | 品牌级电影质感美语女声 | 女 |
| `Ryan` | 甜茶 | 戏感炸裂 | 男 |
| `Katerina` | 卡捷琳娜 | 御姐音色 | 女 |
| `Aiden` | 艾登 | 精通厨艺的美语大男孩 | 男 |
| `Eldric Sage` | 沧明子 | 沉稳睿智老者 | 男 |
| `Mia` | 乖小妹 | 温顺如春水 | 女 |
| `Mochi` | 沙小弥 | 聪明伶俐小大人 | 男 |
| `Bellona` | 燕铮莺 | 声音洪亮吐字清晰 | 女 |
| `Vincent` | 田叔 | 沙哑烟嗓 | 男 |
| `Bunny` | 萌小姬 | 萌属性爆棚小萝莉 | 女 |
| `Neil` | 阿闻 | 专业新闻主持人 | 男 |
| `Elias` | 墨讲师 | 严谨学术风 | 女 |
| `Arthur` | 徐大爷 | 质朴嗓音 | 男 |
| `Nini` | 邻家妹妹 | 又软又黏 | 女 |
| `Seren` | 小婉 | 温和舒缓助眠 | 女 |
| `Pip` | 顽屁小孩 | 调皮捣蛋充满童真 | 男 |
| `Stella` | 少女阿月 | 甜到发腻迷糊少女 | 女 |

方言音色：

| voice 参数 | 音色名 | 方言 |
|---|---|---|
| `Jada` | 上海-阿珍 | 上海话 |
| `Dylan` | 北京-晓东 | 北京话 |
| `Marcus` | 陕西-秦川 | 陕西话 |
| `Roy` | 闽南-阿杰 | 闽南语 |
| `Peter` | 天津-李彼得 | 天津话 |
| `Sunny` | 四川-晴儿 | 四川话 |
| `Eric` | 四川-程川 | 四川话 |
| `Rocky` | 粤语-阿强 | 粤语 |
| `Kiki` | 粤语-阿清 | 粤语 |

---

## 3. MiniMax（非实时）

### 接口地址

```
https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
```

> 仅限北京地域。

### 支持的模型

| 模型 | 说明 |
|---|---|
| `MiniMax/speech-2.8-hd` | 高质量版 |

### 请求体结构

```json
{
  "model": "MiniMax/speech-2.8-hd",
  "input": {
    "text": "要合成的文本",
    "voice_setting": {
      "voice_id": "male-qn-qingse",
      "speed": 1,
      "vol": 1,
      "pitch": 0,
      "emotion": "happy"
    },
    "audio_setting": {
      "sample_rate": 32000,
      "bitrate": 128000,
      "format": "mp3",
      "channel": 1
    }
  }
}
```

### MiniMax 音色列表

| voice_id | 描述 |
|---|---|
| `male-qn-qingse` | 青涩男声 |
| `female-shaonv` | 少女声 |
| `male-qn-jingying` | 精英男声 |
| `female-yujie` | 御姐声 |
| `male-qn-badao` | 霸道男声 |
| `female-chengshu` | 成熟女声 |

---

## 关键注意事项

1. **模型与音色必须匹配**：每个模型只支持特定的音色列表，不能混用，否则会返回参数错误
2. **CosyVoice 请求格式**：voice/format/sample_rate 在 `input` 中，不在 `parameters` 中
3. **Qwen-TTS 响应格式**：返回 JSON，需从 `output.audio.url` 获取音频 URL 再下载
4. **CosyVoice 响应格式**：直接返回二进制音频流
5. **音频 URL 有效期**：24 小时，过期需重新调用
6. **地域限制**：CosyVoice 和 MiniMax 仅限北京地域；Qwen-TTS 支持北京和新加坡地域


常见错误码： https://help.aliyun.com/zh/model-studio/error-code(https://help.aliyun.com/zh/model-studio/error-code)