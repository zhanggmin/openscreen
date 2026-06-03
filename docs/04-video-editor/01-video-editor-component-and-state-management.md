# VideoEditor Component & State Management

## Overview

The `VideoEditor` component (`src/components/VideoEditor.tsx`) is the central orchestrator of the editing experience. It owns the full application state for the loaded project (video, regions, effects, export settings), distributes state to child components via props and context, and coordinates the export pipeline. This page documents the component hierarchy, state structure, and data flow patterns.

## Component Hierarchy

The `VideoEditor` sits at the root of the editor window React tree and renders several top-level child components:

```
VideoEditor (root)
├── Header
│   └── Project title, save/load buttons
├── MainWorkspace
│   ├── VideoPlayback (Pixi.js canvas)
│   └── AnnotationsOverlay (React portal into canvas coordinates)
├── TimelineEditor
│   ├── TimelineTrack (zoom/trim regions)
│   └── TimelineScrubber
└── SettingsPanel
    ├── EffectsSection
    ├── BackgroundSection
    ├── CropSection
    └── ExportSection
```

### Child Component Responsibilities

| Component | Primary Responsibility |
|---|---|
| `VideoPlayback` | Pixi.js-based video rendering, effects preview, frame-accurate seeking |
| `TimelineEditor` | Drag/drop zoom/trim regions, current time display, playback controls |
| `SettingsPanel` | Effect sliders, background picker, crop tools, export configuration |
| `AnnotationsOverlay` | React-rendered text, arrows, and images positioned in video space |

## State Management Strategy

### Single Source of Truth: `VideoEditor` Component State

The `VideoEditor` component maintains a large `useState` object that holds the entire editing state. This state is passed down to child components via props and custom hooks.

### State Shape Summary

The editor state is organized into several logical groups:

| State Group | Examples |
|---|---|
| **Video Source** | `videoPath`, `videoDuration`, `videoResolution`, `cursorTelemetry` |
| **Playback** | `currentTime`, `isPlaying`, `playbackRate` |
| **Timeline Regions** | `zoomRegions`, `trimRegions`, `annotationRegions` |
| **Effects** | `blur`, `shadow`, `scale`, `padding`, `cornerRadius` |
| **Background** | `backgroundType`, `backgroundColor`, `backgroundGradient`, `backgroundImagePath` |
| **Crop** | `cropEnabled`, `cropRect`, `aspectRatioPreset` |
| **Export** | `exportFormat`, `exportResolution`, `exportQuality` |
| **UI** | `activeTool`, `selectedRegionId`, `sidebarOpen` |

## Key State Transitions

### Loading a Video

When the editor opens with a video (via `videoPath` query parameter), it:

1. Reads the video file via `readFileRaw()` IPC
2. Loads cursor telemetry via `getCursorTelemetry()` IPC
3. Parses video metadata (duration, resolution) using `mp4box`/custom demuxer
4. Initializes default regions/effects
5. Populates state and renders

### Adding a Zoom Region

1. User drags on the timeline → `TimelineEditor` calls `onAddZoomRegion(newRegion)` callback
2. `VideoEditor` updates `zoomRegions` state with the new region
3. Re-render propagates to `VideoPlayback` and `TimelineEditor`
4. `VideoPlayback` applies the zoom to the canvas preview when `currentTime` falls within the region

### Exporting

1. User clicks "Export" in `SettingsPanel` → calls `onExport(settings)` callback
2. `VideoEditor` passes all relevant state (regions, effects, crop, etc.) to the `Exporter` class
3. `Exporter` runs the export pipeline in a Web Worker or async generator
4. Progress updates flow back into state and to UI

## Performance Optimizations

### Selective Re-renders

- Child components use `React.memo()` where appropriate
- Callbacks passed to children are wrapped in `useCallback()`
- Large state objects are split or accessed via selectors to avoid unnecessary renders

### Refs for Non-React State

The `VideoEditor` uses several `useRef` values for state that doesn't need to trigger React re-renders:

| Ref | Purpose |
|---|---|
| `videoElementRef` | Underlying `<video>` element for the source |
| `pixiApplicationRef` | Pixi.js `Application` instance |
| `exporterRef` | Current `Exporter` instance (if export running) |
| `animationFrameIdRef` | For manual `requestAnimationFrame` loops |

## Data Flow Patterns

### Downward: State → Props

```
VideoEditor state
  ├─→ VideoPlayback (currentTime, effects, regions, ...)
  ├─→ TimelineEditor (currentTime, duration, regions, ...)
  └─→ SettingsPanel (effects, export settings, ...)
```

### Upward: Events → Callbacks

```
User interaction in child
  ↓
Child calls callback (e.g., `onCurrentTimeChange`, `onAddZoomRegion`)
  ↓
VideoEditor updates its state
  ↓
Re-render propagates changes back down
```

## Persistence: Save and Load Project

### Project File Format

The editor saves the entire state as a JSON file with extension `.openscreen`. This file references the original `.webm` by absolute path.

### Save Flow

1. User clicks "Save"
2. `VideoEditor` serializes its state to JSON
3. `saveFile()` IPC shows save dialog
4. `writeFile()` IPC writes the JSON

### Load Flow

1. User clicks "Open Project"
2. `openFile()` IPC shows open dialog
3. `readFile()` IPC reads the JSON
4. `VideoEditor` hydrates its state from the JSON
5. If the referenced video exists, it is loaded; otherwise, user is prompted to locate it

## Relevant Files

| File | Role |
|---|---|
| `src/components/VideoEditor.tsx` | Root editor component, state owner, coordination |
| `src/components/VideoPlayback.tsx` | Pixi.js rendering canvas |
| `src/components/TimelineEditor.tsx` | Timeline UI and region editing |
| `src/components/SettingsPanel.tsx` | Effect controls and export UI |
