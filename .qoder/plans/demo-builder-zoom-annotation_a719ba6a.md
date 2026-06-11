# DemoBuilder 缩放标注功能

## 任务 1: 类型定义扩展

在 [types.ts](file:///d:/nodewww/openscreen/src/lib/demobuilder/types.ts) 中：

- 新增 `ZoomScale` 类型（与视频编辑器对齐: 1.25x / 1.5x / 1.8x / 2.2x / 3.5x / 5x）
- `Hotspot` 接口新增字段：
  - `zoomScale?: number` — 非空表示该热点为缩放区域
  - `zoomEasing?: string` — 缩放动画缓动（默认 "power2.inOut"）
- 新增 `isZoomRegion(hotspot)` 判断函数
- 新增 `ZOOM_SCALE_OPTIONS` 常量

## 任务 2: CanvasArea — 标注工具栏扩展

在 [CanvasArea.tsx](file:///d:/nodewww/openscreen/src/components/demo-builder/CanvasArea.tsx) 中：

- `annotationMode` 类型扩展为 `"cursor" | "highlight" | "zoom" | null`
- `AnnotationToolbar` 新增「缩放」按钮，图标使用放大镜 SVG
- 点击事件处理扩展：zoom 模式下拖拽绘制矩形区域，创建带 `zoomScale` 的热点
- 缩放区域渲染：编辑器模式下用蓝色虚线矩形 + 放大镜图标区分于高亮区域

## 任务 3: 播放引擎 — 缩放时序计算

在 [demoPlaybackEngine.ts](file:///d:/nodewww/openscreen/src/lib/demobuilder/demoPlaybackEngine.ts) 中：

- 新增播放时序常量：`ZOOM_IN_MS: 400` / `ZOOM_HOLD_MS: 800` / `ZOOM_OUT_MS: 400`
- `DemoFrameState` 新增 `zoom` 字段：`{ region: Hotspot; progress: number } | null`
- `computeFrameState` 中计算缩放状态：
  - 所有非光标、非缩放的热点仍按原有逻辑处理（高亮）
  - 缩放区域依次播放：淡入(0→1) → 保持(1) → 淡出(1→0)
  - 缩放区域内可叠加光标标注

## 任务 4: DemoFrameView — 缩放渲染

在 [DemoFrameView.tsx](file:///d:/nodewww/openscreen/src/components/demo-builder/DemoFrameView.tsx) 中：

- 新增 `ZoomTransform` 组件：
  - 接收当前 `state.zoom`，计算 CSS `transform: scale()` + `transform-origin`
  - 使用 `transition` 实现平滑缩放动画
- 截图渲染包裹在 ZoomTransform 中
- 叠加层（高亮、光标、点击效果）也在 ZoomTransform 内部，自动跟随缩放

## 任务 5: PropertiesPanel — 缩放属性编辑

在 [PropertiesPanel.tsx](file:///d:/nodewww/openscreen/src/components/demo-builder/PropertiesPanel.tsx) 中：

- 新增 `ZoomRegionPanel` 子组件：
  - 缩放倍率选择器（6个预设+自定义滑块）
  - 显示位置信息（只读）
  - 删除按钮

## 任务 6: 热点共存修复

- 确保 `annotationMode === "cursor"` 时点击热点区域也能放置光标标注（检查事件冒泡）
- 确保缩放区域上也能添加光标标注
- `isCursorMarker()` 函数完善：排除 `zoomScale` 非空的热点

## 任务 7: i18n 翻译

在 [zh-CN](file:///d:/nodewww/openscreen/src/i18n/locales/zh-CN/demobuilder.json) 和 [en](file:///d:/nodewww/openscreen/src/i18n/locales/en/demobuilder.json) 中：

- `toolbar.zoomAnnotation` / `toolbar.zoomAnnotationTitle`
- `properties.zoomRegionTitle` / `properties.zoomScale`
- `canvas.drawZoomRegion` 提示文案
