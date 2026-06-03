# Video Playback System

## Overview

The video playback system uses Pixi.js to provide GPU-accelerated rendering of the video with real-time effects, zoom/pan animations, and overlays. It sits at the center of the editor UI, rendering every frame to a canvas based on the current time and editor state. This page covers the Pixi.js scene graph, video texture handling, the animation loop, and how it applies effects and zoom regions.

## Core Component: `VideoPlayback`

The `VideoPlayback` component (`src/components/VideoPlayback.tsx`) wraps a Pixi.js `Application` and manages the scene graph. It receives all relevant editor state as props and updates the scene on each frame.

### Props Received

| Prop | Type | Purpose |
|---|---|---|
| `currentTime` | `number` | Current playback position in seconds |
| `videoElement` | `HTMLVideoElement` | Source video element |
| `zoomRegions` | `ZoomRegion[]` | Active zoom regions |
| `trimRegions` | `TrimRegion[]` | Active trim regions |
| `effects` | `EffectsState` | Blur, shadow, scale, etc. |
| `crop` | `CropState` | Crop rectangle and aspect ratio |
| `background` | `BackgroundState` | Background color/gradient/image |
| `annotations` | `Annotation[]` | Text, arrows, images to overlay |

### Scene Graph Structure

The Pixi.js scene is organized into containers for layering:

```
Application.stage
├── BackgroundContainer
│   └── BackgroundSprite (color, gradient, or image)
├── VideoContainer
│   ├── VideoSprite (video texture)
│   └── [filters: blur, drop shadow, etc.]
└── AnnotationContainer
    └── [annotation sprites/texts]
```

## Video Texture Management

### Creating a Texture from the Video Element

The HTML `<video>` element is used as the source for a Pixi.js `Texture`:

```typescript
const videoTexture = PIXI.Texture.from(videoElement);
const videoSprite = new PIXI.Sprite(videoTexture);
```

Pixi.js automatically handles updating the texture as the video plays.

### Handling Video Aspect Ratio and Layout

The `VideoPlayback` component calculates the correct layout for the video on the canvas:

1. Determines the stage size based on the window and aspect ratio
2. Applies padding and scale from effects
3. Centers the video in the available space
4. Applies crop if enabled

## Effect Implementation

Each visual effect is implemented either as a Pixi.js filter, a transform, or a container property.

### Blur

Uses `@pixi/filter-blur` (or `@pixi/filter-gaussian-blur`) applied to the video sprite:

```typescript
import { BlurFilter } from 'pixi.js';

const blurFilter = new BlurFilter(strength);
videoSprite.filters = [blurFilter, ...otherFilters];
```

### Drop Shadow

Uses `@pixi/filter-drop-shadow`:

```typescript
import { DropShadowFilter } from '@pixi/filter-drop-shadow';

const shadowFilter = new DropShadowFilter({
  color: shadowColor,
  blur: shadowBlur,
  offset: { x: shadowOffsetX, y: shadowOffsetY },
});
videoSprite.filters = [...filters, shadowFilter];
```

### Scale, Padding, Corner Radius

- **Scale**: Applied directly to `videoSprite.scale`
- **Padding**: Adjusts the video container position/size to add space
- **Corner Radius**: Implemented via a mask or via `PIXI.Graphics` with rounded rect

## Zoom Animation

### Zoom Region Evaluation

For each frame, the playback system checks whether `currentTime` falls within any `ZoomRegion`. If so, it computes the target scale and focus position.

### Smooth Interpolation with GSAP

Zoom transitions use GSAP (`gsap`) for smooth animation:

```typescript
gsap.to(videoContainer, {
  duration: 0.3,
  pixi: {
    scale: targetScale,
    x: targetX,
    y: targetY,
  },
  ease: 'power2.out',
});
```

### Focus Point Calculation

The zoom can be centered on a specific point (e.g., cursor position from telemetry) or on the center of the video. The system maps the focus point in video coordinates to the appropriate stage coordinates.

## Crop Handling

### Masking the Video

Crop is implemented using a Pixi.js `Graphics` as a mask:

```typescript
const mask = new PIXI.Graphics();
mask.beginFill(0xffffff);
mask.drawRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
mask.endFill();
videoContainer.mask = mask;
```

### Aspect Ratio Presets

When the user selects an aspect ratio preset (e.g., 16:9, 1:1), the crop rectangle is adjusted to match while preserving the selected area as much as possible.

## Annotation Overlays

### Annotation Types

| Type | Rendering |
|---|---|
| Text | `PIXI.Text` object with styled font |
| Arrow/Line | `PIXI.Graphics` path with stroke |
| Image | `PIXI.Sprite` from loaded texture |

### Positioning in Video Space

Annotations are defined in video pixel coordinates. The playback system transforms these coordinates to stage coordinates on each frame, accounting for scale, crop, and padding.

## Animation Loop: `requestAnimationFrame` via Pixi.js Ticker

Pixi.js uses a `Ticker` that fires on each `requestAnimationFrame`. The `VideoPlayback` component subscribes to this ticker to update the scene:

```typescript
app.ticker.add(() => {
  updateZoomForTime(currentTime);
  updateEffects();
  updateAnnotations();
});
```

## Performance Optimizations

| Optimization | Technique |
|---|---|
| Filter reuse | Filters are created once and updated in place rather than recreated each frame |
| Culling | Offscreen annotations are hidden |
| Texture pooling | Reusable textures for annotations where possible |
| Minimal ticker work | Heavy computations cached or throttled |

## Integration with HTML `<video>`

The playback system still uses an underlying HTML `<video>` element for seeking and decoding. The `<video>` is hidden offscreen, and its current frame is sampled by the Pixi.js texture.

### Seeking Behavior

When the user scrubs the timeline, `videoElement.currentTime = newTime` is called, and Pixi.js automatically picks up the new frame on the next tick.

## Relevant Files

| File | Role |
|---|---|
| `src/components/VideoPlayback.tsx` | Pixi.js canvas, scene management, effects, zoom |
