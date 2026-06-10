# DemoBuilder 功能梳理与开发计划

## 一、产品定位

DemoBuilder 是 OpenScreen 的扩展功能模块，定位为**图文驱动的产品演示生成平台**。用户上传产品截图，通过可视化标注热点与步骤，自动生成在线交互式教程、PDF 操作手册和带鼠标动画的视频教程。

与现有录屏流程的区别：

| 维度 | 现有录屏编辑 | DemoBuilder |
|------|-------------|-------------|
| 输入源 | 实时屏幕录制 | 静态截图序列 |
| 编辑方式 | 时间轴裁剪/变速 | 步骤+热点标注 |
| 输出 | MP4/GIF | 在线教程 + PDF + MP4 |
| 交互性 | 无 | 在线交互式播放器 |

---

## 二、功能模块梳理

### 2.1 图片管理模块

**功能清单：**

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 上传图片 | 支持单张/批量上传，拖拽上传 | P0 |
| 拖拽排序 | 拖拽调整图片顺序 | P0 |
| 删除图片 | 删除单张图片 | P0 |
| 替换图片 | 替换已有步骤的截图 | P1 |
| 图片缩略图 | 侧栏显示缩略图列表 | P1 |
| 图片裁剪/缩放 | 基础裁剪与缩放适配 | P2 |

**数据结构：**

```typescript
interface Screenshot {
  id: string;
  url: string;       // 本地文件路径或 blob URL
  width: number;
  height: number;
  order: number;      // 排序索引
  originalName: string;
  fileSize: number;
}
```

---

### 2.2 热点标注模块

**功能清单：**

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 框选区域 | 在截图上拖拽框选热点区域 | P0 |
| 拖动区域 | 移动已框选的热点位置 | P0 |
| 调整大小 | 拖拽边角调整热点区域大小 | P0 |
| 删除区域 | 删除热点 | P0 |
| 说明文字 | 为热点添加文字说明 | P0 |
| 高亮样式 | 热点高亮效果（边框/背景/脉冲） | P0 |
| 点击动画 | 热点被点击时的动画效果 | P1 |
| 鼠标目标位置 | 配置鼠标移动到的目标坐标 | P1 |
| 跳转步骤 | 配置点击后跳转到哪个步骤 | P1 |
| 复制区域 | 复制热点到其他步骤 | P2 |

**数据结构：**

```typescript
interface Hotspot {
  id: string;
  stepId: string;
  x: number;          // 相对截图的百分比坐标
  y: number;
  width: number;      // 相对截图的百分比尺寸
  height: number;
  label: string;      // 说明文字
  highlightStyle: "border" | "background" | "pulse";
  clickAnimation: "ripple" | "zoom" | "flash" | "none";
  mouseTarget: { x: number; y: number } | null;  // 鼠标目标位置
  jumpToStepId: string | null;  // 跳转目标步骤ID
}
```

---

### 2.3 步骤管理模块

**功能清单：**

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 新增步骤 | 基于截图创建步骤 | P0 |
| 删除步骤 | 删除步骤及其关联热点 | P0 |
| 拖动排序 | 调整步骤顺序 | P0 |
| 步骤复制 | 复制步骤（含热点和配置） | P1 |
| 步骤分支 | 支持步骤间分支跳转 | P1 |
| 步骤说明 | 每步的标题和描述 | P0 |
| 步骤预览 | 缩略图预览步骤内容 | P1 |

**数据结构：**

```typescript
interface Step {
  id: string;
  screenshotId: string;
  order: number;
  title: string;
  description: string;
  hotspots: Hotspot[];
  cursor: CursorAnimation;    // 鼠标动画配置
  subtitles: Subtitle[];      // 字幕列表
  voice: Voice | null;        // AI语音配置
  transition: Transition;     // 步骤间过渡效果
}

interface Transition {
  type: "fade" | "slide" | "none";
  duration: number;  // ms
}
```

---

### 2.4 鼠标动画系统

**功能清单：**

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 鼠标样式 | 默认箭头/手型/Mac/Windows/自定义PNG | P0 |
| 鼠标移动-线性 | 直线移动到目标 | P0 |
| 鼠标移动-缓动 | 支持多种缓动函数 | P0 |
| 鼠标移动-贝塞尔 | 贝塞尔曲线路径 | P2 |
| 点击波纹 | 点击时的波纹扩散效果 | P1 |
| 点击缩放 | 点击时的缩放效果 | P1 |
| 点击闪光 | 点击时的闪光效果 | P2 |
| 点击音效 | 点击时播放音效 | P1 |

**数据结构：**

```typescript
interface CursorAnimation {
  type: "default" | "hand" | "mac" | "windows" | "custom";
  customIconUrl?: string;
  startPosition: { x: number; y: number };  // 起始位置（百分比）
  endPosition: { x: number; y: number };    // 结束位置（百分比）
  movementType: "linear" | "easing" | "bezier";
  easingFunction?: string;     // GSAP缓动函数名，如 "power2.inOut"
  bezierControlPoints?: { cp1: Point; cp2: Point };
  movementDuration: number;    // 移动耗时（ms）
  clickEffect: "ripple" | "zoom" | "flash" | "none";
  clickSound: boolean;
  delayBeforeClick: number;    // 移动到位后等待时间（ms）
}
```

> **与现有光标系统的复用**：OpenScreen 已有完整的光标渲染系统（`src/lib/cursor/`、`src/assets/cursors/`）和光标遥测数据结构，可在 DemoBuilder 中复用渲染层，仅新增动画配置层。

---

### 2.5 字幕系统

**功能清单：**

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 字幕内容 | 编辑字幕文本 | P0 |
| 出现/消失时间 | 配置字幕时间窗口 | P0 |
| 字体选择 | 选择字体 | P1 |
| 字号调整 | 调整字号大小 | P1 |
| 位置配置 | 字幕在画面中的位置 | P0 |
| 字幕样式 | 颜色/背景/描边 | P1 |

**数据结构：**

```typescript
interface Subtitle {
  id: string;
  text: string;
  start: number;       // 相对步骤开始的毫秒数
  end: number;         // 相对步骤开始的毫秒数
  fontFamily: string;
  fontSize: number;
  position: "top" | "center" | "bottom";
  style: SubtitleStyle;
}

interface SubtitleStyle {
  color: string;
  backgroundColor: string;
  opacity: number;
  outlineColor?: string;
  outlineWidth?: number;
}
```

---

### 2.6 AI 语音模块

**功能清单：**

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 输入文本 | 输入要转为语音的文本 | P0 |
| 生成语音 | 调用 TTS API 生成语音 | P0 |
| 试听 | 预览生成的语音 | P0 |
| 重新生成 | 不满意重新生成 | P1 |
| 语速控制 | 调整语速 | P1 |
| 音色选择 | 选择不同的音色 | P1 |

**数据结构：**

```typescript
interface Voice {
  id: string;
  text: string;
  audioUrl: string;     // 生成的音频文件路径
  duration: number;     // 音频时长（ms）
  provider: "aliyun" | "openai" | "local";
  voiceId: string;      // 音色ID
  speed: number;        // 语速倍率
}
```

> **与现有 TTS 的复用**：OpenScreen 已集成阿里云 TTS（`src/lib/tts/`），可直接复用 TTS 服务层和音色配置。

---

### 2.7 在线教程播放器

**功能清单：**

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 播放器页面 | `/demo/{id}` 路由渲染 | P0 |
| 自动播放 | 按步骤自动播放 | P0 |
| 手动播放 | 用户控制播放进度 | P0 |
| 上一步/下一步 | 手动切换步骤 | P0 |
| 全屏模式 | 全屏播放 | P1 |
| 目录导航 | 侧栏步骤目录 | P1 |
| 播放逻辑 | 截图→鼠标移动→热点高亮→点击→说明→下一步 | P0 |

**播放逻辑流程：**

```
显示当前截图
  ↓
鼠标从起始位置移动到热点（带动画）
  ↓
热点区域高亮
  ↓
鼠标点击效果 + 音效
  ↓
显示说明文字/字幕
  ↓
播放语音（如有）
  ↓
过渡动画切换到下一步骤
```

---

### 2.8 PDF 导出模块

**功能清单：**

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 封面 | 项目名称 + 首张截图 | P1 |
| 目录 | 自动生成步骤目录 | P1 |
| 步骤截图 | 每步配截图 + 热点标注 | P1 |
| 说明文字 | 步骤标题 + 描述 | P1 |
| 页码 | 自动编页 | P1 |
| 自定义模板 | PDF 样式模板 | P2 |

**技术方案**：使用 `jspdf` + `html2canvas` 或直接在 Canvas 渲染后导出 PDF。

---

### 2.9 视频生成模块

**功能清单：**

| 功能 | 描述 | 优先级 |
|------|------|--------|
| Remotion 集成 | 基于 Remotion 框架渲染视频 | P0 |
| 视频预览 | Remotion Player 实时预览 | P0 |
| 1080P 导出 | 1920×1080 MP4 | P0 |
| 2K 导出 | 2560×1440 MP4 | P1 |
| 4K 导出 | 3840×2160 MP4 | P2 |
| WebM 导出 | WebM 格式 | P2 |
| 渲染流程 | 截图→鼠标→热点→点击→音效→字幕→语音→切换 | P0 |

**视频渲染流程：**

```
[步骤N开始]
  显示截图 + 渲染热点区域（静态）
  ↓
  鼠标从起点移动到热点（带缓动动画）
  ↓
  热点高亮动画
  ↓
  鼠标点击效果 + 音效
  ↓
  显示字幕（按时间轴）
  ↓
  播放语音音频
  ↓
[过渡到步骤N+1]
```

> **与现有导出系统的关系**：现有 `src/lib/exporter/` 已有 PixiJS 帧渲染 + MP4 编码管线。DemoBuilder 可选择：(1) 复用 PixiJS 帧渲染管线；(2) 采用 Remotion 方案（PRD 推荐）。Remotion 的优势是声明式视频合成，更适合图文教程的场景。

---

## 三、技术架构设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    Electron 主进程                        │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ 窗口管理      │  │ Native Bridge│  │ 文件系统服务   │  │
│  │ (新窗口类型)  │  │ (扩展契约)   │  │ (图片/项目)   │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↕ IPC
┌─────────────────────────────────────────────────────────┐
│                    渲染进程 (React)                       │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ Dashboard   │  │ Editor       │  │ Preview        │  │
│  │ (项目列表)   │  │ (标注编辑器)  │  │ (Remotion)     │  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ 画布层       │  │ 属性面板     │  │ 步骤面板       │  │
│  │ (Pixi.js)   │  │ (右侧栏)     │  │ (左侧栏)       │  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │             DemoBuilder Project JSON                 │ │
│  │  (统一数据模型，所有输出均从此 JSON 生成)              │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 3.2 核心数据模型

```typescript
// 项目根数据结构 —— 所有内容统一存储为 JSON
interface DemoProject {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  screenshots: Screenshot[];
  steps: Step[];
  settings: ProjectSettings;
}

interface ProjectSettings {
  canvasWidth: number;        // 画布默认宽度
  canvasHeight: number;       // 画布默认高度
  defaultCursorType: CursorAnimation["type"];
  defaultTransition: Transition;
  defaultHighlightStyle: Hotspot["highlightStyle"];
  exportSettings: ExportSettings;
}

interface ExportSettings {
  videoResolution: "1080p" | "2k" | "4k";
  videoFormat: "mp4" | "webm";
  videoFps: number;
  pdfTemplate: string;
}
```

### 3.3 窗口路由扩展

在现有 `windowType` 路由体系中新增：

| `windowType` | 组件 | 描述 |
|---|---|---|
| `demo-dashboard` | `DemoDashboard` | 项目列表与创建 |
| `demo-editor` | `DemoEditor` | 主编辑器（画布+步骤+属性） |
| `demo-preview` | `DemoPreview` | Remotion 实时预览 |

> **方案选型**：Dashboard 也可以作为现有编辑器的一个 Tab/模式而非独立窗口，减少窗口管理复杂度。建议初期将 Dashboard 作为 `demo-editor` 窗口的初始视图。

### 3.4 可复用的现有模块

| 现有模块 | 路径 | 复用方式 |
|---------|------|---------|
| 光标渲染 | `src/lib/cursor/` | 直接复用渲染层，新增动画配置 |
| 光标资源 | `src/assets/cursors/` | 直接复用 SVG 光标资源 |
| TTS 服务 | `src/lib/tts/` | 复用阿里云 TTS 集成 |
| 导出管线 | `src/lib/exporter/` | 复用 FrameRenderer 思路 |
| Native Bridge | `src/native/` | 扩展契约，新增 DemoBridge |
| UI 组件库 | `src/components/ui/` | 直接复用 Radix + Tailwind 组件 |
| i18n | `src/i18n/` | 扩展命名空间 `demo` |
| PixiJS 画布 | 视频 Editor 中的画布 | 参考架构，为 Demo 创建独立画布实例 |

---

## 四、分阶段开发计划

### Phase 1：基础编辑能力（预计 3-4 周）

> **目标**：完成项目管理、图片上传、热点标注、步骤管理、基础在线教程播放

#### Task 1.1：项目基础设施

- [ ] 定义 DemoProject 核心数据类型（`src/lib/demobuilder/types.ts`）
- [ ] 创建 DemoBridge Native Bridge 契约（`src/native/contracts.ts` 扩展）
- [ ] 创建项目文件读写服务（Electron 主进程侧）
- [ ] 新增 `demo-editor` 窗口类型（`electron/windows.ts` + `src/App.tsx`）
- [ ] 创建 DemoEditor 基础布局（三栏：步骤列表 | 画布 | 属性面板）

#### Task 1.2：图片管理

- [ ] 图片上传组件（拖拽 + 点击上传）
- [ ] 图片缩略图列表（左侧步骤面板集成）
- [ ] 图片拖拽排序（集成 react-rnd 或 dnd-kit）
- [ ] 图片删除与替换
- [ ] 图片本地存储（通过 IPC 写入用户数据目录）

#### Task 1.3：热点标注

- [ ] PixiJS 画布组件（截图显示 + 热点渲染）
- [ ] 热点框选交互（拖拽创建矩形区域）
- [ ] 热点拖动与调整大小
- [ ] 热点高亮样式渲染（边框/背景/脉冲）
- [ ] 热点属性编辑面板（右侧栏）
- [ ] 热点删除

#### Task 1.4：步骤管理

- [ ] 步骤列表组件（左侧面板）
- [ ] 步骤增删与排序
- [ ] 步骤标题/描述编辑
- [ ] 步骤与截图关联
- [ ] 步骤缩略图预览

#### Task 1.5：在线教程播放器

- [ ] 步骤播放控制器（自动/手动切换）
- [ ] 热点高亮动画
- [ ] 步骤间切换过渡
- [ ] 上一步/下一步导航
- [ ] 播放器布局与样式

---

### Phase 2：动画与多媒体（预计 3-4 周）

> **目标**：完成鼠标动画、字幕、音效、Remotion 预览集成

#### Task 2.1：鼠标动画系统

- [ ] 鼠标样式选择器（复用 `src/assets/cursors/`）
- [ ] 鼠标起止位置配置（画布上可视化设置）
- [ ] 线性移动动画
- [ ] 缓动移动动画（集成 GSAP 缓动函数）
- [ ] 点击效果实现（波纹/缩放/闪光）
- [ ] 点击音效（mouse-click.mp3 集成）
- [ ] 鼠标动画预览（画布内实时预览）

#### Task 2.2：字幕系统

- [ ] 字幕编辑面板
- [ ] 字幕时间轴配置
- [ ] 字幕位置选择（上/中/下）
- [ ] 字幕样式配置（字体/字号/颜色/背景）
- [ ] 字幕渲染（画布叠加层）

#### Task 2.3：音效系统

- [ ] 音效资源管理
- [ ] 步骤音效配置（点击/切换/提示）
- [ ] 音效预览播放

#### Task 2.4：Remotion 集成

- [ ] 安装与配置 Remotion（`@remotion/cli`, `@remotion/player`）
- [ ] 定义 Remotion 组件树（Demo -> Step -> Screenshot + Cursor + Hotspot + Subtitle）
- [ ] 集成 Remotion Player 到 Preview 面板
- [ ] 实时预览联动（Editor 修改 → Player 同步刷新）
- [ ] 时间轴控制器

---

### Phase 3：AI 与导出（预计 3-4 周）

> **目标**：完成 AI 语音、PDF 导出、MP4 导出

#### Task 3.1：AI 语音

- [ ] 语音文本编辑
- [ ] 复用阿里云 TTS 服务（`src/lib/tts/`）
- [ ] 语音生成与缓存
- [ ] 语音试听播放
- [ ] 音色选择器
- [ ] 语速控制
- [ ] 语音与步骤时间轴对齐

#### Task 3.2：PDF 导出

- [ ] 引入 `jspdf` + `html2canvas`
- [ ] 封面页生成
- [ ] 目录页生成
- [ ] 步骤页生成（截图 + 热点标注 + 说明）
- [ ] 页码自动编号
- [ ] PDF 导出触发与下载

#### Task 3.3：MP4 视频导出

- [ ] Remotion 渲染配置（分辨率/帧率/格式）
- [ ] 1080P MP4 导出
- [ ] 2K MP4 导出
- [ ] 4K MP4 导出
- [ ] WebM 导出
- [ ] 导出进度反馈
- [ ] 导出文件保存对话框

---

### Phase 4：AI 增强与高级功能（预计 4-5 周）

> **目标**：AI 自动生成步骤说明、自动配音、自动字幕、Figma/URL/录屏导入

#### Task 4.1：AI 自动生成步骤说明

- [ ] 截图内容识别（OCR 或多模态 LLM）
- [ ] 热点区域自动建议
- [ ] 步骤说明自动生成
- [ ] 步骤标题自动生成

#### Task 4.2：AI 自动配音

- [ ] 基于步骤说明自动生成配音文本
- [ ] 批量 TTS 生成
- [ ] 语音时长自动匹配步骤时长

#### Task 4.3：AI 自动字幕

- [ ] 基于语音文本自动生成字幕时间轴
- [ ] 字幕自动分段与时间对齐

#### Task 4.4：高级导入

- [ ] Figma 文件导入（通过 Figma API 获取画板截图）
- [ ] 网页 URL 截图导入（Puppeteer/Playwright 截图）
- [ ] 录屏视频自动拆解（关键帧提取 → 步骤生成）
- [ ] 自动热点检测（图像差异分析）

---

## 五、关键技术决策

### 5.1 视频渲染方案：Remotion vs PixiJS 帧渲染

| 维度 | Remotion | PixiJS 帧渲染（现有方案） |
|------|---------|------------------------|
| 优势 | 声明式 React 组件，开发效率高；内置 Player 预览；时间轴管理完善 | 已有成熟管线；帧级精确控制；性能好 |
| 劣势 | 包体积大；Electron 内渲染需额外配置；对动态图片序列支持需自定义 | 需要手动管理时间轴；预览功能需自建 |
| 推荐场景 | 图文教程视频（DemoBuilder） | 录屏编辑视频（现有 Editor） |

**决策**：DemoBuilder 采用 Remotion 方案，与现有 PixiJS 帧渲染管线并行，互不干扰。

### 5.2 数据持久化方案

- 项目数据统一以 JSON 文件存储（`DemoProject` 结构）
- 图片资源存储在项目目录下的 `assets/` 子目录
- 通过 Native Bridge IPC 读写项目文件
- 项目文件路径：`~/OpenScreen/demos/{projectId}/project.json`

### 5.3 编辑器布局方案

采用三栏布局（参考现有 VideoEditor 的 `react-resizable-panels`）：

```
┌──────────┬────────────────────────┬──────────────┐
│          │                        │              │
│  步骤    │      画布区域           │   属性面板    │
│  列表    │   (Pixi.js Canvas)     │   热点属性    │
│  面板    │                        │   字幕属性    │
│  240px   │                        │   语音属性    │
│          │                        │   280px      │
│          ├────────────────────────┤              │
│          │   时间轴 / Remotion    │              │
│          │   Player 预览          │              │
│          │                        │              │
└──────────┴────────────────────────┴──────────────┘
```

### 5.4 与现有功能的集成入口

建议在 LaunchWindow（HUD）中新增"创建图文教程"入口按钮，点击后打开 `demo-editor` 窗口。同时在应用菜单中增加"DemoBuilder"子菜单。

---

## 六、依赖项预估

### 新增 npm 依赖

| 包名 | 用途 | Phase |
|------|------|-------|
| `remotion` | 视频渲染框架 | Phase 2 |
| `@remotion/cli` | Remotion 命令行 | Phase 2 |
| `@remotion/player` | Remotion 预览播放器 | Phase 2 |
| `@remotion/renderer` | Remotion 渲染器 | Phase 3 |
| `jspdf` | PDF 生成 | Phase 3 |
| `html2canvas` | HTML 转 Canvas（PDF 辅助） | Phase 3 |
| `@dnd-kit/core` + `@dnd-kit/sortable` | 拖拽排序 | Phase 1 |

### 已有可直接复用的依赖

| 包名 | 复用场景 |
|------|---------|
| `pixi.js` | 画布渲染 |
| `gsap` | 鼠标缓动动画 |
| `react-rnd` | 热点区域拖拽调整 |
| `react-resizable-panels` | 编辑器三栏布局 |
| `uuid` | ID 生成 |
| `lucide-react` | 图标 |
| `@radix-ui/*` | UI 组件 |
| `sonner` | Toast 通知 |

---

## 七、风险与注意事项

1. **Remotion 在 Electron 中的兼容性**：Remotion 依赖 Chromium 的 OffscreenCanvas 和 WebCodecs，需在 Electron 环境中验证渲染能力，可能需要配置 `--disable-gpu-sandbox` 等标志。

2. **包体积增长**：Remotion + jspdf 将显著增加包体积，建议采用动态导入（lazy load），仅在用户使用 DemoBuilder 时加载。

3. **PixiJS 画布实例管理**：DemoEditor 和 VideoEditor 使用独立的 PixiJS Application 实例，避免状态污染。

4. **项目文件版本管理**：`DemoProject` 数据结构需版本号字段，为后续格式升级预留迁移能力。

5. **PDF 中文字体**：`jspdf` 默认不支持中文，需额外嵌入中文字体文件或使用 `html2canvas` 方案绕过。

6. **AI API 成本**：Phase 4 的 AI 功能依赖外部 API（LLM + TTS），需考虑 API 调用成本与用户配额管理。
