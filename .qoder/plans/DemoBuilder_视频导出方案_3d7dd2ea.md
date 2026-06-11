# DemoBuilder 视频导出实现方案

## 架构概览

```
DemoProject (截图 + Steps + Hotspots + Voices)
        |
  DemoVideoExporter (新模块)
    1. 计算时序：每个 Step 的持续时长 = cursor.movementDuration + delayBeforeClick + transition.duration
    2. 预加载所有截图为 HTMLImageElement
    3. 逐帧生成：根据当前时间戳确定所在 Step，将截图绘制到 PixiJS Sprite
    4. 叠加光标动画、Hotspot 高亮、字幕、转场效果
        |
  FrameRenderer (复用 - 仅复用背景渲染 + 阴影合成)
    - 背景渲染 (wallpaper/color/gradient)
    - 阴影、圆角合成
        |
  VideoExporter 编码管线 (复用核心)
    - VideoEncoder (WebCodecs)
    - VideoMuxer (mediabunny MP4)
    - AudioProcessor (TTS + 背景音乐 + 点击音效)
```

## 关键设计决策

### 1. 不复用 FrameRenderer 的视频帧渲染路径
现有 `FrameRenderer.renderFrame()` 签名是 `(videoFrame: VideoFrame, timestamp, webcamFrame?)` —— 它期望输入是 `VideoFrame`（来自 WebCodecs 解码的视频帧）。图文编辑器的输入是**静态截图图片**，不是视频帧。

**方案**: 新建 `DemoVideoExporter` 类，自包含 PixiJS 渲染逻辑，直接操作 Canvas 2D + PixiJS，复用 `FrameRenderer` 的背景渲染思路（`setupBackground` 中的壁纸/渐变/纯色逻辑）和 `VideoMuxer`/`AudioProcessor` 编码管线。

### 2. 帧生成策略
- 每个 Step 的截图作为 PixiJS `Sprite`，在 Step 切换时替换 Texture
- 光标动画：根据 `CursorAnimation` 配置，在截图上叠加光标 SVG/PNG
- 转场效果：fade/dissolve 用 Canvas globalAlpha 混合；slide/wipe 用 Canvas drawImage 偏移裁剪
- 字幕：在指定时间窗口内绘制文本叠加层

### 3. 音频合成策略
复用 `AudioProcessor` 的 TTS 渲染能力：
- 背景音乐：`sound.backgroundMusicPath` -> 解码后混合
- 点击音效：`/sounds/click.mp3` 在光标点击时刻播放
- TTS 旁白：`Step.voice.audioUrl` 映射为 `ExportTTSRegion`

---

## Task 1: 创建 DemoVideoExporter 核心类

**文件**: `src/lib/demobuilder/demoVideoExporter.ts` (新建)

核心接口设计：

```typescript
export interface DemoVideoExporterConfig {
  project: DemoProject;
  width: number;           // 输出宽度 (e.g. 1920)
  height: number;          // 输出高度 (e.g. 1080)
  frameRate: number;       // 帧率 (e.g. 30)
  bitrate: number;         // 码率 (e.g. 8_000_000)
  onProgress?: (progress: ExportProgress) => void;
}

export class DemoVideoExporter {
  constructor(config: DemoVideoExporterConfig);
  async export(): Promise<ExportResult>;
  cancel(): void;
}
```

导出流程：
1. `computeTimeline()` - 将 Steps 转为时间线，计算每个 Step 的起止时间戳
2. `preloadAssets()` - 预加载所有截图、光标图标、音效文件
3. `initializeRenderer()` - 创建 PixiJS Application + 背景 Canvas
4. `encodeLoop()` - 逐帧渲染 + WebCodecs 编码
5. `processAudio()` - 复用 AudioProcessor 处理音频
6. `finalize()` - VideoMuxer 输出 MP4 Blob

## Task 2: 实现时间线计算模块

**文件**: `src/lib/demobuilder/demoTimeline.ts` (新建)

将 DemoProject.steps 转换为线性时间线：

```typescript
interface TimelineSegment {
  stepId: string;
  stepIndex: number;
  screenshotId: string;
  startTimeMs: number;     // Step 在全局时间线的起始时间
  endTimeMs: number;       // Step 在全局时间线的结束时间
  cursorStartMs: number;   // 光标动画开始时间
  cursorEndMs: number;     // 光标动画结束时间
  clickTimeMs: number;     // 光标点击时刻
  transitionStartMs: number;  // 转场开始时间
  transitionEndMs: number;    // 转场结束时间
}

function computeTimeline(project: DemoProject): {
  segments: TimelineSegment[];
  totalDurationMs: number;
  totalFrames: number;
}
```

每个 Step 时间分配：
- `[startTimeMs, startTimeMs + cursor.movementDuration]` — 光标移动阶段
- `[clickTimeMs, clickTimeMs + hotspot.highlightDuration]` — 高亮展示
- `[transitionStartMs, transitionStartMs + transition.duration]` — 转场过渡
- 如果有 TTS voice，Step 时长取 `max(cursorDuration + transitionDuration, voice.duration)`

## Task 3: 实现 PixiJS 帧渲染器

**文件**: `src/lib/demobuilder/demoFrameRenderer.ts` (新建)

复用现有壁纸/渐变渲染逻辑（来自 `frameRenderer.ts` 的 `setupBackground`），但简化视频相关部分：

```typescript
class DemoFrameRenderer {
  async initialize(width, height, background: DemoBackground);
  async renderFrame(segment: TimelineSegment, timeInSegmentMs: number, globalTimeMs: number): Promise<void>;
  getCanvas(): HTMLCanvasElement;
  destroy(): void;
}
```

每帧渲染步骤：
1. **背景层**: 壁纸/纯色/渐变（初始化时渲染一次，后续帧直接复用）
2. **截图层**: 将当前 Step 的截图绘制到 PixiJS Sprite，应用 appearance 设置（圆角、阴影、padding）
3. **光标层**: 根据 CursorAnimation 配置计算光标位置，绘制光标图标
   - linear/easing/bezier 运动插值
   - click 效果（ripple/zoom/flash）
4. **Hotspot 高亮层**: 在点击时刻绘制高亮框（border/background/pulse），支持 highlightDuration 后淡出
5. **字幕层**: 根据 Subtitle 的 start/end 时间绘制文本
6. **转场层**: Step 切换时的过渡效果
   - fade: globalAlpha 渐变混合
   - slide-left/right/up: 两张截图水平/垂直偏移
   - dissolve: 随机像素溶解（简化为 fade）
   - zoom: 截图缩放过渡
   - wipe: 矩形擦除
   - none: 直接切换

## Task 4: 实现编码管线集成

在 `DemoVideoExporter.export()` 中复用：
- **VideoMuxer** (`src/lib/exporter/muxer.ts`) — MP4 封装
- **AudioProcessor** (`src/lib/exporter/audioEncoder.ts`) — 音频编码和混合

编码流程（参照 `videoExporter.ts` 第 532-626 行的 `initializeEncoder`）：

```typescript
// 1. 创建 VideoEncoder + 配置 codec/bitrate/framerate
// 2. 创建 VideoMuxer
// 3. 逐帧：renderFrame() -> canvas -> VideoFrame -> encoder.encode()
// 4. 音频：构建 ExportTTSRegion[] + 背景音乐 -> AudioProcessor.process()
// 5. encoder.flush() -> muxer.finalize() -> Blob
```

音频映射：
```typescript
// 将 DemoProject 的声音数据映射为 AudioProcessor 可消费的格式
const ttsRegions: ExportTTSRegion[] = project.steps
  .filter(s => s.voice?.audioUrl)
  .map(s => ({
    id: s.id,
    startMs: getSegment(s.id).startTimeMs,
    endMs: getSegment(s.id).startTimeMs + (s.voice?.duration ?? 0),
    blobUrl: s.voice?.audioUrl,
  }));
```

## Task 5: 集成到 Electron 主进程

**文件**: `electron/native-bridge/services/demoService.ts` (修改)

替换 `exportProject` 方法中 Remotion 的占位实现：

```typescript
async exportProject(projectId: string, format: "video" | "gif" | "pdf") {
  // ... 读取 project.json ...

  if (format === "video") {
    // 通过 IPC 通知渲染进程执行导出（因为 WebCodecs 只在渲染进程可用）
    // 方案 A: 直接打开隐藏窗口执行导出
    // 方案 B: 将 project 数据发送到现有 editor 窗口的隐藏 webview
    // 方案 C: demoService 返回 project 数据，由渲染进程的 ExportDialog 组件直接执行导出
  }
}
```

**关键发现**: WebCodecs API 只在浏览器渲染进程中可用（不在 Electron 主进程中）。因此导出必须在**渲染进程**执行。

**最终方案**: 修改 Native Bridge 的 `exportProject` 处理流程：
1. `demoService.exportProject()` 读取 project JSON 并返回给渲染进程
2. 渲染进程的 `ExportDialog` 组件直接实例化 `DemoVideoExporter` 执行导出
3. 导出完成后通过 IPC 将 Blob 保存到磁盘

## Task 6: 修改 ExportDialog 组件

**文件**: `src/components/demo-builder/ExportDialog.tsx` (修改)

将导出从"发送到主进程"改为"在渲染进程直接执行"：

```typescript
async function handleExport() {
  const exporter = new DemoVideoExporter({
    project,
    width: resolutionToWidth(project.settings.exportSettings.videoResolution),
    height: resolutionToHeight(project.settings.exportSettings.videoResolution),
    frameRate: project.settings.exportSettings.videoFps,
    bitrate: qualityToBitrate(project.settings.exportSettings.videoResolution),
    onProgress: setProgress,
  });

  const result = await exporter.export();
  if (result.success && result.blob) {
    // 通过 IPC 保存到磁盘
    const buffer = await result.blob.arrayBuffer();
    await nativeBridgeClient.demo.saveExportedFile(project.id, buffer, "video.mp4");
  }
}
```

## Task 7: 添加 Native Bridge 保存导出文件接口

**文件**: 
- `src/native/contracts.ts` — 新增 `saveExportedFile` action 类型
- `src/native/client.ts` — 新增 `saveExportedFile` 方法
- `electron/native-bridge/services/demoService.ts` — 实现文件保存逻辑
- `electron/ipc/nativeBridge.ts` — 注册新 action handler

## Task 8: 更新 i18n 文案

**文件**: 
- `src/i18n/locales/zh-CN/demobuilder.json`
- `src/i18n/locales/en/demobuilder.json`

移除 "(via Remotion)" 标注，更新导出相关文案。

## Task 9: 清理 Remotion 占位代码

- 删除 `src/components/demo-builder/remotion/DemoComposition.tsx`
- 移除 `types.ts` 文件顶部关于 Remotion 的注释

---

## 文件变更清单

| 文件路径 | 操作 | 说明 |
|---|---|---|
| `src/lib/demobuilder/demoVideoExporter.ts` | 新建 | 核心导出类 |
| `src/lib/demobuilder/demoTimeline.ts` | 新建 | 时间线计算 |
| `src/lib/demobuilder/demoFrameRenderer.ts` | 新建 | PixiJS 帧渲染 |
| `src/components/demo-builder/ExportDialog.tsx` | 修改 | 渲染进程直接导出 |
| `src/native/contracts.ts` | 修改 | 新增 saveExportedFile action |
| `src/native/client.ts` | 修改 | 新增 saveExportedFile 方法 |
| `electron/native-bridge/services/demoService.ts` | 修改 | 实现文件保存 + 移除 Remotion 占位 |
| `electron/ipc/nativeBridge.ts` | 修改 | 注册新 handler |
| `src/lib/demobuilder/types.ts` | 修改 | 移除 Remotion 注释 |
| `src/i18n/locales/zh-CN/demobuilder.json` | 修改 | 更新文案 |
| `src/i18n/locales/en/demobuilder.json` | 修改 | 更新文案 |
| `src/components/demo-builder/remotion/DemoComposition.tsx` | 删除 | 移除 Remotion 占位 |
| `src/lib/exporter/index.ts` | 修改 | 导出 DemoVideoExporter (可选) |

## 实现优先级

1. **Phase 1 (MVP)**: Task 1-4 + Task 6 — 基本 MP4 导出能力（无转场，只有 fade）
2. **Phase 2**: Task 5 + Task 7 — Electron 集成，文件保存到磁盘
3. **Phase 3**: Task 8-9 — 清理 + 完善所有转场效果
4. **Phase 4 (后续)**: GIF 导出（复用 `GifExporter` 的 gif.js 逻辑）

## 风险与缓解

| 风险 | 缓解措施 |
|---|---|
| WebCodecs 在某些 Electron 版本不可用 | 检查 VideoEncoder.isConfigSupported，降级到 Canvas + MediaRecorder |
| 大量截图导致内存压力 | 按需加载截图（LRU 缓存，只保留当前+前后各 1 张） |
| PixiJS 在离屏渲染时性能不足 | 使用 OffscreenCanvas + WebGL；限制最大分辨率 |
| TTS 音频格式多样 (mp3/wav) | 复用 AudioProcessor 的 decodeAudioData，已支持多格式 |
