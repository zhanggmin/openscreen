# DemoBuilder UI 重构方案

## 目标布局

参考视频编辑器 `VideoEditor.tsx` 的布局，重构 DemoEditor 的页面结构：

```
+-----------------------------------------------------------+
| Header (项目标题 + 保存状态)                                  |
+--------+---------------------------+----------------------+
| Left   | Canvas                    | Right Properties     |
| Sidebar| (画布区域)                 | Panel                |
| (330px)| +-----------------------+ | (属性面板 280px)      |
|        | | Playback Controls     | |                      |
+--------+---------------------------+----------------------+
| Bottom Timeline (时间轴)                                     |
+-----------------------------------------------------------+
```

---

## Task 1: 创建画布播放控件组件

**文件**: `src/components/demo-builder/DemoPlaybackControls.tsx` (新建)

参考视频编辑器的 `PlaybackControls.tsx`（胶囊形控件条），为图文编辑器创建简化版：
- 居中圆角胶囊，`bg-black/60 backdrop-blur-md border-white/10`
- Play/Pause 按钮（圆形，白色/深色切换）
- 当前步骤标题文本（如 "步骤 3/8 — Step Title"）
- Stop 按钮（播放时显示）
- 步骤进度指示（如 "3/8"）
- 默认加载时间轴中的第一个步骤内容

**Props**: `isPlaying`, `stepIndex`, `totalSteps`, `stepTitle`, `onTogglePlay`, `onStop`

---

## Task 2: 重写右侧属性面板 PropertiesPanel

**文件**: `src/components/demo-builder/PropertiesPanel.tsx` (重写)

对齐视频编辑器的 `editor-inspector-shell` 样式（与左侧 DemoSidebar 相同的暗色质感）。根据选中元素类型显示不同内容：

**A) 无选中时 — 默认显示当前画布中的步骤信息和元素列表:**
- 步骤标题可以输入修改
- 步骤描述 textarea
- 光标动画设置（样式、移动类型、持续时间、点击效果、声音）
- 字幕设置（文本、位置、字号）
- 元素列表（鼠标标注、矩形高亮区域）标题、类型文字说明 ，点击后定位到当前元素

**B) 选中鼠标标注 (cursor marker) 时:**
- 类型标识图标 + "鼠标标注" 标题
- 文字说明输入（label 字段）
- 浮动说明输入（tooltip，跟随鼠标点击显示的说明文字）
- 点击动画选择（ripple/zoom/flash）
- 位置坐标显示（只读）
- 删除标注按钮

**C) 选中高亮区域 (highlight) 时:**
- 类型标识 + "高亮区域" 标题
- 文字说明输入（label）
- 高亮样式选择（border/background/pulse）
- 高亮颜色选择器（新增 `highlightColor` 字段，带预设色板）
- 边框颜色/背景色
- 位置/尺寸显示（只读）
- 删除高亮按钮

使用项目已有的 UI 组件（Slider, Switch, Select, Button 等），样式对齐 `editor-inspector-shell`。

---

## Task 3: 扩展 Hotspot 类型以支持浮动说明和颜色

**文件**: `src/lib/demobuilder/types.ts` (修改)

在 `Hotspot` 接口中添加：
- `tooltip?: string` — 浮动说明文本（播放时鼠标点击时显示）
- `highlightColor?: string` — 高亮区域自定义颜色

---

## Task 4: 重构 DemoEditor 布局

**文件**: `src/components/demo-builder/DemoEditor.tsx` (修改)

1. **移除** header 中的播放按钮
2. **新增** 中间区域三栏 grid 布局（参考 `editor-main-deck` CSS）:
   ```
   grid-template-columns: minmax(0, 1fr) clamp(260px, 18vw, 300px)
   ```
   - 左侧：CanvasArea（flex column）+ DemoPlaybackControls 在底部
   - 右侧：PropertiesPanel
3. **传递新 props** 给 PropertiesPanel（selectedHotspot, step, 回调等）
4. **传递** `onTogglePlay` 和 `onStop` 给 DemoPlaybackControls

布局结构：
```tsx
<div className="h-screen flex flex-col bg-[#09090b]">
  {/* Header */}
  <div className="h-11 flex items-center justify-between px-4 border-b ...">
    <h1>项目标题</h1>
    <span>保存状态</span>
  </div>

  {/* Workspace */}
  <div className="flex-1 min-h-0 flex">
    {/* Left Sidebar */}
    <DemoSidebar ... />

    {/* Main area */}
    <div className="demo-workspace flex-1 min-h-0 flex flex-col p-3 gap-3">
      {/* Canvas deck: canvas + properties */}
      <div className="demo-main-deck flex-1 min-h-0" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 280px' }}>
        {/* Canvas column */}
        <div className="flex flex-col min-h-0">
          <div className="flex-1 min-h-0">
            <CanvasArea ... />
          </div>
          {/* Playback controls below canvas */}
          <DemoPlaybackControls ... />
        </div>
        {/* Right properties panel */}
        <PropertiesPanel ... />
      </div>
      {/* Timeline */}
      <TimelineStrip ... />
    </div>
  </div>
</div>
```

---

## Task 5: 实现浮动说明 Tooltip 渲染

**文件**: `src/components/demo-builder/CanvasArea.tsx` (修改)

在播放阶段的 click effect 附近，如果 hotspot 有 `tooltip` 字段，在光标点击位置上方显示浮动文本：
- 淡入动画
- 半透明背景气泡
- 播放结束后自动消失

---

## Task 6: 实现高亮颜色渲染

**文件**: `src/components/demo-builder/CanvasArea.tsx` + `PropertiesPanel.tsx`

- CanvasArea 中 PlaybackHighlight 和 HotspotOverlay 使用 `hotspot.highlightColor`（如果存在）替代默认绿色
- PropertiesPanel 中提供颜色预设选择器

---

## Task 7: 添加 i18n 键

**文件**: `src/i18n/locales/zh-CN/demobuilder.json` 和 `en/demobuilder.json`

新增键：
- `properties.tooltipLabel` — "浮动说明"
- `properties.tooltipPlaceholder` — "播放时跟随鼠标显示的说明文字..."
- `properties.highlightColor` — "高亮颜色"
- `properties.cursorMarkerTitle` — "鼠标标注"
- `properties.highlightAreaTitle` — "高亮区域"
- `properties.deleteMarker` — "删除标注"
- `properties.deleteHighlight` — "删除高亮"
- `properties.positionInfo` — "位置"
- `properties.sizeInfo` — "尺寸"
- `playbackControls.stepOf` — "步骤 {{current}}/{{total}}"
- `playbackControls.playAll` — "播放全部"
- `playbackControls.stopAll` — "停止"

---

## Task 8: 验证

- 运行 `npx tsc --noEmit` 确认无新增 TypeScript 错误
- 运行 `npx biome check --write` 修复格式
- 运行 `npm run i18n:check` 确认 i18n 完整
