# Remotion 统一渲染架构重构

## 架构目标

```
DemoProject (JSON)
    |
computeFrameState(project, timeMs)  <-- 纯函数，唯一时序事实来源
    |
DemoFrameView (React 组件)           <-- 纯展示，接收 state 输出 DOM
    |
    +-- 编辑器预览 (CanvasArea)      -- rAF 驱动 timeMs
    +-- 全屏播放 (DemoPlayer)        -- rAF 驱动 timeMs
    +-- Remotion Composition         -- useCurrentFrame() 驱动 timeMs → MP4 导出
    +-- 网页嵌入 (DemoWebPlayer)     -- rAF 驱动 timeMs
```

---

## Task 1: 创建 `demoPlaybackEngine.ts` 纯函数时序引擎

**文件**: `src/lib/demobuilder/demoPlaybackEngine.ts` (新建)

从 `CanvasArea.tsx` (第 77-86 行) 的播放常量和 `demoTimeline.ts` 的时间线逻辑中抽取统一的时序计算。

**核心导出**:

```typescript
// 统一时序常量（替代 CanvasArea 中的硬编码常量）
export const PLAYBACK_TIMING = {
  INITIAL_DELAY_MS: 400,
  CURSOR_MOVE_MS: 800,
  CLICK_EFFECT_MS: 250,
  HOLD_AFTER_CLICK_MS: 700,
  HOLD_BETWEEN_MS: 200,
  FINAL_HOLD_MS: 600,
  TRANSITION_MS: 500,
  HIGHLIGHT_FADE_MS: 400,
  DEFAULT_HIGHLIGHT_DURATION_MS: 1000,
};

// 帧状态接口
export interface DemoFrameState {
  stepIndex: number;
  step: Step;
  screenshotId: string;
  prevScreenshotId: string | null;
  cursorVisible: boolean;
  cursorPosition: Point;           // 百分比坐标
  clickEffect: { type: ClickEffect; position: Point; progress: number } | null;
  highlights: Array<{ hotspot: Hotspot; opacity: number }>;
  transition: { type: TransitionType; progress: number; prevScreenshotId: string | null } | null;
  visibleSubtitles: Subtitle[];
  tooltip: { text: string; x: number; y: number } | null;
}

// 纯函数：project + timeMs → 完整视觉状态
export function computeFrameState(project: DemoProject, timeMs: number): DemoFrameState;

// 计算总时长（Remotion durationInFrames 需要）
export function computeTotalDurationMs(project: DemoProject): number;

// 计算单个 Step 的时间线（内部使用）
function computeStepTimeline(step: Step, startTimeMs: number): StepTimeline;
```

**时序逻辑**（精确复刻 CanvasArea 的播放序列）:
1. 计算每个 Step 的全局起止时间
2. 每个 Step 内部按阶段划分：初始延迟 → 高亮串行显示 → 光标移动 → 点击效果 → 点击后停留 → 转场
3. 高亮区域串行时序：淡入(HIGHLIGHT_FADE_MS) + 显示(highlightDuration) + 淡出(HIGHLIGHT_FADE_MS)，前一个完成后下一个才开始
4. 光标插值：支持 linear / easing / bezier 三种 movementType

**验证**: 用 DemoPlayer 的现有测试用例（3-5 个 step 的 project）手动校验 timeMs=0/500/2000/5000 时的状态输出是否匹配预期。

---

## Task 2: 创建 `DemoFrameView.tsx` React 渲染组件

**文件**: `src/components/demo-builder/DemoFrameView.tsx` (新建)

从 `CanvasArea.tsx` 中提取所有播放相关视觉组件，重构为纯展示组件。

**核心结构**:
```tsx
interface DemoFrameViewProps {
  state: DemoFrameState;
  width: number;
  height: number;
  background: DemoBackground;
  appearance: DemoAppearance;
  screenshots: Map<string, string>;  // id → url
  cursorType?: CursorStyle;
}

function DemoFrameView(props: DemoFrameViewProps) {
  return (
    <div style={{ width, height, position: "relative", overflow: "hidden" }}>
      <BackgroundLayer />
      <ScreenshotLayer />
      {state.highlights.map(h => <HighlightOverlay key={...} />)}
      {state.clickEffect && <ClickEffectOverlay />}
      {state.cursorVisible && <CursorOverlay />}
      {state.visibleSubtitles.map(s => <SubtitleOverlay key={...} />)}
      {state.transition && <TransitionLayer />}
      {state.tooltip && <TooltipOverlay />}
    </div>
  );
}
```

**从 CanvasArea.tsx 提取的子组件** (保持 CSS 动画一致性):

| CanvasArea 原始组件 | DemoFrameView 子组件 | 改动说明 |
|---|---|---|
| `PlaybackHighlight` (第 734-822 行) | `HighlightOverlay` | 接收 `opacity` prop 替代 `isActive` |
| `PlaybackClickEffect` (第 824-850 行) | `ClickEffectOverlay` | 接收 `progress` 控制动画阶段 |
| `PlaybackTooltip` (第 853-872 行) | `TooltipOverlay` | 无变化 |
| `TransitionLayer` (第 1319-1527 行) | `TransitionLayer` | 接收 `progress` 替代 CSS animation |
| 光标 div (第 656-681 行) | `CursorOverlay` | 接收精确 position |
| 字幕 div (DemoPlayer 第 286-310 行) | `SubtitleOverlay` | 统一实现 |

**关键设计**: 转场动画不依赖 CSS `@keyframes`（Remotion 中不可用），改用内联 `style` + `progress` 值驱动：
```tsx
// 例：fade 转场
<div style={{ opacity: 1 - progress }}>旧截图</div>
<div style={{ opacity: progress }}>新截图</div>
```

同样，光标位置使用 `style.transform` 直接设置，不依赖 CSS transition。

**CSS**: 将 `index.css` 中第 339-394 行的 `@keyframes demo-*` 保留（编辑器预览仍可使用），但 DemoFrameView 内部不依赖它们。

---

## Task 3: 重构 CanvasArea.tsx 播放模式

**文件**: `src/components/demo-builder/CanvasArea.tsx` (修改)

**改动范围**: 播放模式部分 (~200 行)，编辑模式完全不变。

**具体改动**:
1. 导入 `computeFrameState`, `PLAYBACK_TIMING` 替代硬编码常量
2. 导入 `DemoFrameView` 组件
3. 播放模式改为：`requestAnimationFrame` 循环 → 计算 timeMs → `computeFrameState` → 传给 `<DemoFrameView />`
4. 删除以下内联组件（已移入 DemoFrameView）：
   - `PlaybackHighlight` (第 734-822 行)
   - `PlaybackClickEffect` (第 824-850 行)
   - `PlaybackTooltip` (第 853-872 行)
   - `TransitionLayer` (第 1319-1527 行)
5. 保留编辑器特有组件（HotspotOverlay、AnnotationToolbar、缩放手柄等）

**播放引擎改造示例**:
```typescript
// 替换原有的 setTimeout 链
const startTimeRef = useRef<number>(0);
const rafRef = useRef<number>(0);

useEffect(() => {
  if (!isPlaying || !step) return;
  startTimeRef.current = performance.now();
  
  function tick() {
    const elapsed = performance.now() - startTimeRef.current;
    const state = computeFrameState(project, globalTimeMs);
    setFrameState(state);
    
    if (elapsed < stepDuration) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      onStepPlaybackDone();
    }
  }
  rafRef.current = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(rafRef.current);
}, [isPlaying, step]);
```

**播放区域 JSX**:
```tsx
{isPlaying && frameState && (
  <DemoFrameView
    state={frameState}
    width={canvasWidth}
    height={canvasHeight}
    background={background}
    appearance={appearance}
    screenshots={screenshotMap}
    cursorType={cursorType}
  />
)}
```

---

## Task 4: 重构 DemoPlayer.tsx

**文件**: `src/components/demo-builder/DemoPlayer.tsx` (修改)

**改动范围**: 渲染部分 (~150 行)，保留顶栏/底栏控件。

1. 使用 `computeFrameState` + `DemoFrameView` 替代内联渲染
2. 删除 `PlayerHighlight` (第 388-427 行) 和 `PlayerClickEffect` (第 431-456 行)
3. 保留键盘导航、进度点、播放/暂停控制
4. `requestAnimationFrame` 驱动，替代 setTimeout 链

---

## Task 5: 安装 Remotion + 创建 Composition

**安装**:
```bash
npm install remotion @remotion/cli @remotion/renderer @remotion/bundler
```

**新建文件**:

### 5a. `src/remotion/DemoComposition.tsx`
```tsx
import { useCurrentFrame, useVideoConfig } from "remotion";
import { computeFrameState } from "@/lib/demobuilder/demoPlaybackEngine";
import { DemoFrameView } from "@/components/demo-builder/DemoFrameView";

export function DemoComposition({ project, screenshotUrls }: RemotionInputProps) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const timeMs = (frame / fps) * 1000;
  const state = computeFrameState(project, timeMs);
  return <DemoFrameView state={state} width={width} height={height} ... />;
}
```

### 5b. `src/remotion/Root.tsx`
```tsx
import { Composition } from "remotion";
import { computeTotalDurationMs } from "@/lib/demobuilder/demoPlaybackEngine";

export function RemotionRoot() {
  return (
    <Composition
      id="DemoExport"
      component={DemoComposition}
      fps={30}
      width={1920}
      height={1080}
      durationInFrames={300}
      defaultProps={{ project: null, screenshotUrls: {} }}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.ceil(computeTotalDurationMs(props.project) / 1000 * props.project.settings.exportSettings.videoFps),
        fps: props.project.settings.exportSettings.videoFps,
        width: resolutionToWidth(props.project.settings.exportSettings.videoResolution),
        height: resolutionToHeight(props.project.settings.exportSettings.videoResolution),
      })}
    />
  );
}
```

### 5c. `src/remotion/index.ts`
```tsx
import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";
registerRoot(RemotionRoot);
```

### 5d. Remotion 音频处理

在 `DemoComposition` 中使用 Remotion 的 `<Audio>` 组件添加音频轨道：
- TTS 旁白：`<Audio src={step.voice.audioUrl} startFrom={voiceStartFrame} />`
- 点击音效：`<Audio src="/sounds/click.mp3" startFrom={clickFrame} volume={0.5} />`
- 背景音乐：`<Audio src={sound.backgroundMusicPath} volume={sound.backgroundMusicVolume} />`

---

## Task 6: Remotion 导出管线

**文件**: `src/lib/demobuilder/remotionExporter.ts` (新建)

```typescript
import { bundle } from "@remotion/bundler";
import { renderMedia, getCompositions } from "@remotion/renderer";

export async function exportDemoVideo(
  project: DemoProject,
  screenshotUrls: Record<string, string>,
  outputPath: string,
  onProgress?: (progress: number) => void,
): Promise<void> {
  // 1. Bundle Remotion 入口
  const bundleLocation = await bundle({
    entryPoint: path.resolve("src/remotion/index.ts"),
    // 或预打包好的路径
  });

  // 2. 获取 composition 元数据
  const compositions = await getCompositions(bundleLocation, {
    inputProps: { project, screenshotUrls },
  });
  const composition = compositions.find(c => c.id === "DemoExport");

  // 3. 渲染
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation: outputPath,
    inputProps: { project, screenshotUrls },
    onProgress: ({ progress }) => onProgress?.(progress),
  });
}
```

**Electron 集成考虑**: Remotion bundle 在应用安装时预打包一次（放在 app resources 目录），避免每次导出重新 bundle。

---

## Task 7: 修改 ExportDialog.tsx

**文件**: `src/components/demo-builder/ExportDialog.tsx` (修改)

替换 `DemoVideoExporter` (Canvas 2D + WebCodecs) 为 Remotion 导出:

```typescript
async function handleExport() {
  // 1. 选择保存路径
  const pickResult = await window.electronAPI?.pickExportSavePath(fileName);
  
  // 2. 通过 IPC 调用主进程执行 Remotion 渲染
  const result = await window.electronAPI?.invokeNativeBridge({
    action: "demo:renderVideo",
    payload: { projectId: project.id, outputPath: pickResult.path },
  });
}
```

**主进程侧** (demoService.ts): 接收 IPC → 加载 project JSON → 调用 `exportDemoVideo()`。

---

## Task 8: 创建网页嵌入播放器

**文件**: `src/components/demo-builder/DemoWebPlayer.tsx` (新建)

轻量级独立播放器，可嵌入任何网页:

```tsx
export function DemoWebPlayer({ project }: { project: DemoProject }) {
  const [timeMs, setTimeMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // rAF 驱动
  useEffect(() => {
    if (!isPlaying) return;
    let lastTime = performance.now();
    function tick() {
      const now = performance.now();
      setTimeMs(t => t + (now - lastTime));
      lastTime = now;
      rafId = requestAnimationFrame(tick);
    }
    let rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying]);

  const state = computeFrameState(project, timeMs);
  const totalMs = computeTotalDurationMs(project);

  return (
    <div>
      <DemoFrameView state={state} ... />
      <div className="controls">
        <button onClick={() => setIsPlaying(!isPlaying)}>Play/Pause</button>
        <input type="range" min={0} max={totalMs} value={timeMs}
               onChange={e => setTimeMs(Number(e.target.value))} />
      </div>
    </div>
  );
}
```

---

## Task 9: 清理旧代码

| 文件 | 操作 |
|---|---|
| `src/lib/demobuilder/demoFrameRenderer.ts` | **删除** - Canvas 2D 帧渲染器 |
| `src/lib/demobuilder/demoVideoExporter.ts` | **删除** - WebCodecs 导出类 |
| `src/lib/demobuilder/demoTimeline.ts` | **删除** - 被 demoPlaybackEngine.ts 替代 |
| `electron/native-bridge/services/demoService.ts` | **修改** - 添加 `demo:renderVideo` IPC handler |
| `src/index.css` | **保留** `@keyframes demo-*` - 编辑器预览仍可使用 |

---

## Task 10: 验证

1. **编译检查**: `npx tsc --noEmit` 无新增错误
2. **编辑器预览测试**: 播放模式下画面应与重构前一致（光标移动、高亮串行显示、转场效果）
3. **全屏播放测试**: DemoPlayer 播放效果应与 CanvasArea 内联播放一致
4. **Remotion 导出测试**: 通过 Remotion Studio (`npx remotion studio`) 预览 Composition，确认与编辑器预览像素级一致
5. **视频导出测试**: 导出 MP4 文件，逐帧对比关键帧与预览画面

---

## 文件变更总览

| 文件路径 | 操作 | 说明 |
|---|---|---|
| `src/lib/demobuilder/demoPlaybackEngine.ts` | **新建** | 纯函数时序引擎 |
| `src/components/demo-builder/DemoFrameView.tsx` | **新建** | React 帧渲染组件 |
| `src/remotion/DemoComposition.tsx` | **新建** | Remotion Composition |
| `src/remotion/Root.tsx` | **新建** | Remotion Root |
| `src/remotion/index.ts` | **新建** | Remotion 入口 |
| `src/lib/demobuilder/remotionExporter.ts` | **新建** | Remotion 导出封装 |
| `src/components/demo-builder/DemoWebPlayer.tsx` | **新建** | 网页嵌入播放器 |
| `src/components/demo-builder/CanvasArea.tsx` | 修改 | 播放模式改用 DemoFrameView |
| `src/components/demo-builder/DemoPlayer.tsx` | 修改 | 改用 DemoFrameView |
| `src/components/demo-builder/ExportDialog.tsx` | 修改 | 改用 Remotion 导出 |
| `electron/native-bridge/services/demoService.ts` | 修改 | 添加 Remotion 渲染 IPC |
| `package.json` | 修改 | 添加 remotion 依赖 |
| `src/lib/demobuilder/demoFrameRenderer.ts` | **删除** | |
| `src/lib/demobuilder/demoVideoExporter.ts` | **删除** | |
| `src/lib/demobuilder/demoTimeline.ts` | **删除** | |

## 实施顺序

Task 1-2 是基础（纯函数 + 渲染组件），后续所有任务依赖它们。
Task 3-4 是改造现有预览（验证基础层正确性）。
Task 5-7 是 Remotion 集成（新增导出能力）。
Task 8 是网页播放器（可选，独立任务）。
Task 9-10 是清理和验证。