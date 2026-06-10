# DemoBuilder UI 增强实现方案

## 背景

基于 MotionShot 等同类产品的交互设计截图，对 OpenScreen DemoBuilder 的编辑器界面进行功能补齐和体验升级。本方案聚焦在截图中已验证的核心交互模式，与现有 `development-plan.md` 和 `prd.md` 对齐，给出可直接落地的实现细节。

---

## 一、截图功能清单与现状对比

| # | 截图功能 | 现有 DemoBuilder | 优先级 |
|---|---------|-----------------|--------|
| 1 | 底部缩略图时间线 | ❌ 无 | P0 |
| 2 | 步骤上移/下移/播放按钮 | ❌ 只有删除 | P0 |
| 3 | 富文本批注（Bold/Italic/Underline） | ❌ 纯文本 textarea | P1 |
| 4 | 语音旁白（TTS/录音/上传） | ⚠️ 只有 `voice: null` 占位 | P1 |
| 5 | 高亮形状与颜色自定义 | ⚠️ 只有 border/background/pulse | P1 |
| 6 | 时长与缩放滑块 | ⚠️ 只有光标移动时长 | P1 |
| 7 | 敏感信息打码（Redact） | ❌ 无 | P2 |
| 8 | 热点数字编号（1/2/3...） | ❌ 无 | P1 |
| 9 | 左侧全局图标导航 | ❌ 无 | P2 |
| 10 | 底部播放控制栏（撤销/播放/重做） | ⚠️ Player 有，Editor 无 | P0 |

---

## 二、布局改造方案

### 2.1 目标布局结构

从截图提炼出的标准五区布局：

```
┌────────┬─────────────────────────────┬──────────────┐
│ 图标导航│      左侧面板（步骤/属性）    │   中央画布    │
│ (窄栏) │                             │  (截图+热点)  │
│        │                             │              │
├────────┴─────────────────────────────┴──────────────┤
│              底部控制栏（撤销/播放/重做/统计）         │
├─────────────────────────────────────────────────────┤
│              底部缩略图时间线（步骤缩略图栏）          │
└─────────────────────────────────────────────────────┘
```

### 2.2 与现有布局的差异

现有 DemoEditor 采用 `react-resizable-panels` 三栏布局（步骤面板 | 画布 | 属性面板）。新布局的调整策略：

- **左侧面板改为"双态面板"**：
  - 态 A — Shot 概览：显示步骤列表 + 添加/删除/排序操作
  - 态 B — Step 编辑：显示当前步骤的属性（批注、时长、语音、高亮）
  - 通过点击步骤切换，或通过顶部 Tab 切换
- **属性面板右移或合并**：截图中所有属性都在左侧，因此考虑将右侧属性面板合并到左侧双态面板中，释放横向空间给画布
- **底部新增两行**：控制栏 + 缩略图时间线

---

## 三、分模块实现方案

### 3.1 底部缩略图时间线（P0）

**布局位置**：编辑器底部，独立于 `react-resizable-panels` 三栏区域之外。

**交互细节**：
- 横向滚动条，每个步骤一张缩略图
- 缩略图尺寸：约 `120px × 80px`，圆角 `4px`
- 当前选中步骤高亮：外边框 `2px solid #34B27B`
- 每个缩略图下方显示步骤序号（`Step 1`、`Step 2`...）
- 最后一个位置放一个 `+` 按钮用于添加新步骤
- 支持拖拽排序（复用 `@dnd-kit` 或 `react-beautiful-dnd`）
- 缩略图生成：用 `html2canvas` 对画布区域截图，或直接用截图原图生成缩略图

**组件设计**：
```tsx
// src/components/demo-builder/TimelineStrip.tsx
interface TimelineStripProps {
  steps: Step[];
  screenshots: Screenshot[];
  selectedStepId: string | null;
  onSelectStep: (stepId: string) => void;
  onReorderSteps: (steps: Step[]) => void;
  onAddStep: () => void;
}
```

**数据结构变更**：无需变更，复用现有 `Step` + `Screenshot`。

---

### 3.2 步骤上移/下移/播放按钮（P0）

**布局位置**：左侧面板 — Shot 概览模式 — 每个步骤卡片内部。

**交互细节**：
- 每个步骤卡片右侧（或底部）放置操作按钮组
- 按钮：`↑`（上移）、`↓`（下移）、`▶`（预览该步骤）、`🗑`（删除）
- 上移/下移：交换 `step.order`，触发 `onReorderSteps`
- 播放按钮：直接打开 `DemoPlayer` 并从该步骤开始播放

**i18n Key 补充**：
```json
"stepPanel": {
  "moveUp": "上移",
  "moveDown": "下移",
  "previewStep": "预览此步骤"
}
```

---

### 3.3 底部播放控制栏（P0）

**布局位置**：缩略图时间线上方，画布下方。

**交互细节**：
- 左侧：撤销 ↺、播放 ▶、重做 ↻（与 `useEditorHistory` 集成）
- 右侧：步骤统计（`{{count}} 个步骤`）、总时长估算（`{{duration}} 秒`）
- 播放按钮：直接唤起 `DemoPlayer` 播放整个项目

**复用点**：OpenScreen 已有 `useEditorHistory` hook，撤销/重做可复用。

---

### 3.4 热点数字编号（P1）

**布局位置**：画布上的热点区域内部或左上角。

**交互细节**：
- 热点按创建顺序或用户自定义显示数字编号
- 编号样式：圆形背景 + 白色文字（`#34B27B` 背景色）
- 在 `Hotspot` 数据结构中新增 `number?: number` 字段
- 播放器中也显示相同的编号

**数据结构变更**：
```typescript
interface Hotspot {
  // ...现有字段
  number?: number;        // 显示编号（如 1, 2, 3）
  showNumber: boolean;    // 是否显示编号
}
```

---

### 3.5 高亮形状与颜色自定义（P1）

**布局位置**：左侧面板 — Step 编辑模式 — HIGHLIGHT 区域。

**交互细节**：
- 形状下拉：`Rectangle`（矩形）、`Circle`（圆形）、`Ring`（圆环）
- 颜色选择器：使用现有 `ColorPicker` 组件（`src/components/ui/color-picker.tsx`）
- 热点数据结构扩展：

```typescript
interface Hotspot {
  // ...现有字段
  highlightStyle: "border" | "background" | "pulse" | "none";
  highlightShape: "rectangle" | "circle" | "ring";
  highlightColor: string;  // 如 "#FF4444"
}
```

- 画布渲染调整：
  - `rectangle`：现有矩形边框/背景
  - `circle`：`border-radius: 50%`，根据宽高计算圆形裁切
  - `ring`：仅边框，无背景，带脉冲动画

---

### 3.6 时长与缩放滑块（P1）

**布局位置**：左侧面板 — Step 编辑模式 — DURATION & ZOOM 区域。

**交互细节**：
- 时长滑块：范围 `0.5s ~ 10s`，步进 `0.5s`，映射到 `step.duration`（毫秒）
- 缩放滑块：范围 `1x ~ 3x`，步进 `0.1x`，控制播放器中该步骤的缩放级别
- 使用现有 `Slider` 组件（`src/components/ui/slider.tsx`）

**数据结构变更**：
```typescript
interface Step {
  // ...现有字段
  duration: number;       // 步骤总时长（ms），默认 2000
  zoomLevel: number;      // 画布缩放倍率，默认 1
}
```

---

### 3.7 富文本批注（P1）

**布局位置**：左侧面板 — Step 编辑模式 — ANNOTATION 区域。

**交互细节**：
- 工具栏：Bold `B`、Italic `I`、Underline `U`、Strikethrough `S`
- 文本输入框：多行 textarea，支持带样式的文本渲染
- 由于 DemoBuilder 的批注最终要渲染到视频/播放器中，推荐采用**极简标记语法**而非完整富文本编辑器：
  - 存储格式：Markdown 子集（`**bold**`、`*italic*`、`~~strikethrough~~`）
  - 渲染时：用轻量级解析器转为 HTML 或 PixiJS 文本样式
  - 避免引入 heavy 的富文本编辑器库（如 Quill/Tiptap）

**数据结构变更**：
```typescript
interface Step {
  // ...现有字段
  annotation: string;     // Markdown 格式批注文本
}
```

**渲染层调整**：
- 播放器/导出时：解析 Markdown 标记，生成带样式的文本节点
- 画布预览：如果复杂度可控，用 HTML 叠加层渲染；否则纯文本 fallback

---

### 3.8 语音旁白（P1）

**布局位置**：左侧面板 — Step 编辑模式 — VOICE OVER 区域。

**交互细节**：
- 音色选择器：下拉选择已有 TTS 音色（复用 `src/lib/tts/` 的音色列表）
- 语言选择：`ZH` / `EN` 等（复用 i18n locale）
- `Add` 按钮：为该步骤生成语音（调用阿里云 TTS）
- `Record your voice`：唤起系统麦克风录制（复用现有录制逻辑）
- `Upload voice over`：文件选择器上传音频

**数据结构变更**：扩展现有 `Voice` 接口：
```typescript
interface Voice {
  id: string;
  text: string;
  audioUrl: string;
  duration: number;
  provider: "aliyun" | "openai" | "local" | "recorded" | "uploaded";
  voiceId: string;
  speed: number;
  language: string;       // 新增：语言代码
}
```

**复用点**：
- TTS 生成：直接调用 `src/lib/tts/aliyunEngine.ts`
- 录音：复用 `useScreenRecorder` 中的麦克风捕获逻辑
- 音频播放：使用原生 `<audio>` 或 Web Audio API

---

### 3.9 敏感信息打码（P2）

**布局位置**：左侧面板 — Shot 概览模式 — ADD 区域下方。

**交互细节**：
- 开关：`Redact sensitive information`
- 开启后，在画布上框选敏感区域，自动生成模糊/色块覆盖
- 打码区域也是一种特殊的 `Hotspot`，但不参与点击交互

**数据结构变更**：
```typescript
interface RedactionArea {
  id: string;
  stepId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  style: "blur" | "pixelate" | "solid";  // 模糊/像素化/纯色块
  color?: string;  // solid 模式下的颜色
}

// 在 Step 中新增
interface Step {
  // ...现有字段
  redactions: RedactionArea[];
}
```

**渲染层**：
- 画布：在截图上层叠加 `backdrop-filter: blur(8px)` 或像素化滤镜
- 导出/视频：用 PixiJS 滤镜实现同样的打码效果

---

### 3.10 左侧全局图标导航（P2）

**布局位置**：编辑器最左侧，一个极窄的垂直图标栏（约 `48px` 宽）。

**交互细节**：
- 图标：设置（⚙️）、音频（🎵）、下载（⬇️）、分享（🔗）、图片（🖼️）
- 点击后展开对应的面板或弹窗
- 设置：项目全局设置（画布尺寸、默认光标、默认过渡）
- 音频：背景音乐上传/选择（项目级，非步骤级）
- 下载/分享：导出入口（复用 `ExportDialog`）
- 图片：截图资源管理器（查看所有未使用的截图）

**组件设计**：
```tsx
// src/components/demo-builder/SidebarNav.tsx
interface SidebarNavProps {
  onOpenSettings: () => void;
  onOpenAudio: () => void;
  onOpenExport: () => void;
  onOpenShare: () => void;
  onOpenImages: () => void;
}
```

---

## 四、左侧面板"双态"重构方案

现有 `StepPanel` + `PropertiesPanel` 分离在左右两侧。新方案合并为左侧单一面板，内部切换两种模式：

### 状态管理

```tsx
// 在 DemoEditor 的 state 中新增
type LeftPanelMode = "shot-overview" | "step-edit";

interface DemoState {
  // ...现有字段
  leftPanelMode: LeftPanelMode;
}
```

### 模式切换逻辑

- **默认**：`shot-overview`（显示所有步骤列表）
- **点击某个步骤**：切换到 `step-edit`，并选中该步骤
- **点击"返回"或关闭按钮**：回到 `shot-overview`
- **顶部保留 Tab 切换**（可选）：`[步骤列表] [当前步骤属性]`

### 组件拆分

```
LeftPanel
├── ShotOverviewMode
│   ├── ShotHeader（标题 + 导航箭头）
│   ├── AddSection（Step + 按钮）
│   ├── StepList（步骤列表卡片）
│   ├── RedactToggle（敏感信息开关）
│   └── MoreActions（复制/删除 Shot）
└── StepEditMode
    ├── StepHeader（Step N + 返回/删除）
    ├── PositionEdit（Edit position 按钮）
    ├── AnnotationSection（富文本批注）
    ├── DurationZoomSection（时长/缩放滑块）
    ├── VoiceOverSection（语音旁白）
    └── HighlightSection（高亮形状/颜色）
```

---

## 五、数据结构总变更

```typescript
// === 新增/扩展的接口 ===

interface Hotspot {
  id: string;
  stepId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  number?: number;
  showNumber: boolean;
  highlightStyle: "border" | "background" | "pulse" | "none";
  highlightShape: "rectangle" | "circle" | "ring";
  highlightColor: string;
  clickAnimation: "ripple" | "zoom" | "flash" | "none";
  mouseTarget: { x: number; y: number } | null;
  jumpToStepId: string | null;
}

interface RedactionArea {
  id: string;
  stepId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  style: "blur" | "pixelate" | "solid";
  color?: string;
}

interface Step {
  id: string;
  screenshotId: string;
  order: number;
  title: string;
  description: string;
  annotation: string;        // 富文本批注（Markdown 子集）
  duration: number;          // 步骤总时长 ms，默认 2000
  zoomLevel: number;         // 画布缩放倍率，默认 1
  hotspots: Hotspot[];
  redactions: RedactionArea[];
  cursor: CursorAnimation;
  subtitles: Subtitle[];
  voice: Voice | null;
  transition: Transition;
}

interface Voice {
  id: string;
  text: string;
  audioUrl: string;
  duration: number;
  provider: "aliyun" | "openai" | "local" | "recorded" | "uploaded";
  voiceId: string;
  speed: number;
  language: string;
}

// ProjectSettings 扩展
interface ProjectSettings {
  canvasWidth: number;
  canvasHeight: number;
  defaultCursorType: CursorAnimation["type"];
  defaultTransition: Transition;
  defaultHighlightStyle: Hotspot["highlightStyle"];
  backgroundMusic?: string;  // 背景音乐文件路径
}
```

---

## 六、开发顺序建议

按依赖关系和用户体验影响排序：

### Phase A：基础交互补齐（1 周）
1. 底部缩略图时间线 `TimelineStrip`
2. 步骤上移/下移/播放按钮
3. 底部播放控制栏（撤销/播放/重做 + 统计）
4. 左侧面板双态重构（合并 StepPanel + PropertiesPanel）

### Phase B：热点与步骤增强（1 周）
5. 热点数字编号
6. 高亮形状扩展（circle/ring）+ 颜色选择器
7. 时长与缩放滑块
8. 敏感信息打码（RedactionArea）

### Phase C：多媒体与批注（1-2 周）
9. 富文本批注（极简 Markdown）
10. 语音旁白集成（复用 TTS + 录音 + 上传）

### Phase D：全局导航与 polish（1 周）
11. 左侧全局图标导航 `SidebarNav`
12. 设置面板、音频面板、图片资源管理器
13. 整体 UI 风格统一（参考截图的圆角、间距、阴影）

---

## 七、技术注意事项

1. **缩略图性能**：大图生成缩略图时不要阻塞主线程，可用 `OffscreenCanvas` 或 `requestIdleCallback`
2. **双态面板状态**：`leftPanelMode` 应存入 URL query 或 localStorage，刷新后恢复
3. **Markdown 解析安全**：富文本批注渲染时禁用 HTML 标签，只允许 `**`、`*`、`~~`、`<br>`
4. **语音文件存储**：录音和上传的音频文件统一存入项目目录 `assets/audio/`，通过 Native Bridge 读写
5. **热点多态渲染**：`rectangle`/`circle`/`ring` 在 CanvasArea 和 Player 中需保持一致的渲染逻辑，建议抽取为共享的 `renderHotspotShape` 工具函数
6. **i18n 持续维护**：每新增一个 UI 文案，同步添加到 `zh-CN/demobuilder.json` 和 `en/demobuilder.json`
