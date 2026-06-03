# OpenScreen Overview

## What is OpenScreen

OpenScreen is a free, open-source desktop screen recorder and video editor, positioned as a lightweight alternative to Screen Studio. It is distributed as an Electron application targeting macOS, Linux, and Windows.

Current release version: 1.1.3

The application covers the full workflow from recording to polished export:

1. Capture a screen or application window.
2. Edit the recording in a non-linear timeline editor (zoom regions, trim regions, annotations).
3. Apply visual effects (backgrounds, padding, blur, shadow, crop).
4. Export as MP4 or GIF.

## Core Features

| Feature | Description |
|---|---|
| Screen / window recording | Captures via Electron's `desktopCapturer` API; stores raw WebM on disk |
| Manual zoom regions | Timeline-based zoom with configurable depth and focus point |
| Crop | Interactive crop control with standard aspect ratio presets |
| Trim | Timeline-based trim regions that skip video segments during export |
| Annotations | Text, image, and arrow/figure overlays; draggable and resizable |
| Backgrounds | JPEG wallpaper assets, solid colors, and gradients |
| Visual effects | Shadow, padding, border radius, background blur, motion blur |
| MP4 export | Hardware-accelerated H.264 via WebCodecs `VideoEncoder` + `VideoMuxer` |
| GIF export | Frame-by-frame render via `gif.js` web worker |

## Technology Stack

### Runtime Dependencies

| Category | Library | Version | Role |
|---|---|---|---|
| Application shell | `electron` | ^39.2.7 | OS integration, IPC, windows, tray |
| UI framework | `react` / `react-dom` | ^18.2.0 | Renderer-process UI |
| Rendering (preview) | `pixi.js` | ^8.14.0 | GPU-accelerated compositing in editor |
| Rendering (effects) | `@pixi/filter-drop-shadow` | ^5.2.0 | Drop-shadow filter on video layer |
| Timeline drag/drop | `dnd-timeline` | ^2.2.0 | Timeline region drag, resize, snapping |
| Animation | `gsap` | ^3.13.0 | Smooth zoom/pan animation in ticker |
| Motion library | `motion` | ^12.23.24 | UI transition animations |
| Video demuxing | `web-demuxer` | ^4.0.0 | WASM-based frame extraction |
| Video muxing | `mediabunny` | ^1.25.1 | MP4 container muxing |
| MP4 parsing | `mp4box` | ^2.2.0 | MP4 metadata/box parsing |
| GIF encoding | `gif.js` | ^0.2.0 | Web Worker GIF palette + encode |
| WebM duration fix | `@fix-webm-duration/fix` | ^1.0.1 | Patches missing WebM duration metadata |
| Component library | `@radix-ui/*` | various | Accessible dialog, select, slider, etc. |
| Styling | `tailwindcss` | ^3.4.18 | Utility CSS |
| Color utilities | `@uiw/react-color-block` | ^2.9.2 | Color picker UI |
| Emoji | `emoji-picker-react` | ^4.16.1 | Annotation emoji support |
| Unique IDs | `uuid` | ^13.0.0 | Region / annotation IDs |

### Dev / Build Dependencies

| Tool | Role |
|---|---|
| `vite` + `vite-plugin-electron` | Bundles both renderer and main process |
| `typescript` | Static typing across renderer and main |
| `electron-builder` | Produces dmg / AppImage / nsis installers |
| `@biomejs/biome` | Lint and format (replaces ESLint + Prettier) |
| `vitest` + `fast-check` | Unit tests and property-based tests |
| `terser` | JS minification in production build |

## High-Level Architecture

OpenScreen follows Electron's two-process model with strict context isolation. The main process has privileged access to Node.js APIs and system resources, while the renderer process runs sandboxed web technologies. A preload script bridges the two processes by exposing a controlled IPC interface.

The architecture separates concerns into distinct layers:

- **Main Process**: Manages application lifecycle, native windows, system tray, and file system access
- **Preload Bridge**: Exposes 32 whitelisted IPC methods via `window.electronAPI` with no direct Node.js access
- **Renderer Process**: Three window types routed by `App.tsx` based on `windowType` parameter
- **Core Systems**: Recording (MediaRecorder), Timeline (dnd-timeline), Playback (Pixi.js), Export (WebCodecs)
- **Storage**: Recordings directory stores `.webm` videos, `.cursor.json` telemetry, and `.openscreen` project files

## Major Subsystems

The codebase is organized into four primary subsystems that handle the complete workflow from recording to export.

### Recording System

Captures screen/window content using Electron's `desktopCapturer` API and the browser's `MediaRecorder`. Stores raw `.webm` video files and parallel `.cursor.json` telemetry files in `RECORDINGS_DIR`. The `useScreenRecorder` hook manages recording state, bitrate selection, and blob accumulation.

### Video Editor System

The `VideoEditor` component orchestrates all editing state and distributes it to child components. `VideoPlayback` uses Pixi.js for GPU-accelerated rendering with real-time effect preview. `TimelineEditor` provides a drag-and-drop interface for four region types (zoom, trim, speed, annotation) using the `dnd-timeline` library. `SettingsPanel` exposes all effect controls and export configuration.

### Export System

Processes the final output through a multi-stage pipeline: `StreamingVideoDecoder` decodes frames via WebCodecs API, `FrameRenderer` applies all effects on a canvas (zoom, crop, blur, annotations, backgrounds), `VideoEncoder` re-encodes to H.264, and `VideoMuxer` packages to MP4. GIF export follows a similar path but uses `gif.js` for palette generation and encoding.

### Shared Types & Utilities

Type definitions in `src/types.ts` define the data models for all region types and project configuration. Layout utilities calculate stage dimensions, crop rectangles, and coordinate transformations. Zoom suggestions analyze cursor telemetry to recommend zoom regions.

## Application Windows

The app renders three distinct window types, all served from the same Vite bundle. `src/App.tsx` reads the `windowType` URL query parameter and renders the correct React tree.

| `windowType` value | React component | Purpose |
|---|---|---|
| `hud-overlay` | `LaunchWindow` | Floating HUD for record / stop and source selection |
| `source-selector` | `SourceSelector` | Displays available screen / window capture sources |
| `editor` | `VideoEditor` | Full-screen non-linear editor with timeline and export |

## Complete Data Pipeline: Recording to Export

The following sequence illustrates the full data flow from initial recording through editing to final export, showing how data moves between processes and storage.

### Key Data Artifacts

| File | Location | Format | Contents |
|---|---|---|---|
| Recording video | `RECORDINGS_DIR/recording_YYYYMMDD_HHMMSS.webm` | WebM (VP8/VP9) | Raw screen capture from MediaRecorder |
| Cursor telemetry | `RECORDINGS_DIR/recording_YYYYMMDD_HHMMSS.cursor.json` | JSON array | `[{t: number, x: number, y: number}]` sampled at 100ms |
| Project file | User-selected location | `.openscreen` JSON | All regions, effects, crop settings, export configuration |
| Exported video | User-selected location | MP4 (H.264) or GIF | Final rendered output with all effects applied |

## Where to Go Next

| Topic | Page |
|---|---|
| Installation on macOS / Linux / Windows | Installation & Setup |
| Cloning and running in development | Development Environment |
| Electron process model details | Electron Process Model |
| All IPC channels and `window.electronAPI` surface | IPC Communication System |
| Screen recording subsystem | Screen Recording System |
| Video editor component tree and state | VideoEditor Component & State Management |
| Export pipeline (MP4 and GIF) | Export Pipeline Architecture |
| Build scripts and CI/CD | Build Scripts & Development Workflow |
| Full dependency catalog | Dependencies & Technology Stack |
