# Window Management & Routing

## Overview

OpenScreen manages three distinct Electron BrowserWindow instances, each serving a specific role in the recording and editing workflow. All windows share the same renderer bundle, with the UI tree selected at runtime based on the `windowType` URL query parameter. This architecture enables shared code while keeping concerns separated.

This page documents the window types, their lifecycles, routing mechanism, and interactions between windows.

## Window Types

### `hud-overlay`: Floating Recording HUD

| Attribute | Value |
|---|---|
| React Component | `LaunchWindow` |
| Window Title | (none) |
| Size | Fixed small HUD (~200x100) |
| Visibility | Always visible unless closed via menu |
| `alwaysOnTop` | Toggleable via settings; default true |
| URL | `index.html?windowType=hud-overlay` |
| Role | Record/stop controls, source selection trigger, always-on-top toggle |

#### Key Features:

- Compact floating HUD with "Select Source" and "Record" buttons
- Dynamic icon state (recording vs idle) updated via `setIconState` IPC
- `alwaysOnTop` state managed through IPC `setAlwaysOnTop`/`getAlwaysOnTop`
- Stays visible above other windows by default

### `source-selector`: Capture Source Picker

| Attribute | Value |
|---|---|
| React Component | `SourceSelector` |
| Window Title | "Select Recording Source" |
| Size | Fixed (720x600) |
| Visibility | Shown when user clicks "Select Source"; auto-hides after selection |
| URL | `index.html?windowType=source-selector` |
| Role | Displays screens and windows; lets user select what to record |

#### Key Features:

- Grid of thumbnail previews for all screens and windows via `desktopCapturer`
- Window title labels below each thumbnail
- Selected source stored in main process state via `setRecordingSource`
- Auto-hides after source selection (uses `hide()` instead of `close()`)

### `editor`: Full-Screen Video Editor

| Attribute | Value |
|---|---|
| React Component | `VideoEditor` |
| Window Title | Dynamic (e.g., "Openscreen - [video name].webm") |
| Size | Large (configurable, default ~1440x900) |
| Visibility | Shown after recording stops; user can toggle visibility |
| URL | `index.html?windowType=editor&videoPath={encodedPath}` |
| Role | Timeline editing, effects, export |

#### Key Features:

- Video path passed via `videoPath` query parameter
- Pixi.js canvas for GPU-accelerated video preview
- Timeline with draggable zoom/trim/annotation regions
- Effect settings panel
- Export controls

## Window Factory Functions

All windows are created by factory functions in `electron/windows.ts`. This centralizes window configuration and ensures consistency across main process code.

### Factory Summary

| Factory Function | Window Type | Notes |
|---|---|---|
| `createHudOverlayWindow()` | `hud-overlay` | Returns `BrowserWindow`; called on app ready |
| `createSourceSelectorWindow()` | `source-selector` | Returns `BrowserWindow`; hidden initially |
| `createEditorWindow(videoPath?: string)` | `editor` | Accepts optional video path to open on launch; sets window title |

## Window Routing Mechanism

### `App.tsx`: URL-based Component Selection

The root React component (`src/App.tsx`) inspects the `windowType` query parameter and renders the corresponding React tree.

### Query Parameters

| Parameter | Applies To | Purpose |
|---|---|---|
| `windowType` | All windows | Selects which component to render; one of `hud-overlay`, `source-selector`, `editor` |
| `videoPath` | `editor` | Optional URL-encoded absolute path to `.webm` recording to load on startup |

### Example URLs

| Window | `BrowserWindow.loadURL()` Argument |
|---|---|
| HUD Overlay | `file://.../index.html?windowType=hud-overlay` |
| Source Selector | `file://.../index.html?windowType=source-selector` |
| Editor (with video) | `file://.../index.html?windowType=editor&videoPath=%2FUsers%2F...%2Fvideo.webm` |

## Window Lifecycles

### Application Startup: `hud-overlay`

1. Electron app `ready` event fires
2. `createHudOverlayWindow()` creates the HUD window
3. HUD loads `?windowType=hud-overlay`; renders `LaunchWindow`
4. Tray icon created and menu attached

### Source Selection Flow

1. User clicks "Select Source" in HUD
2. HUD calls `window.electronAPI.openSourceSelector()`
3. Main process calls `createSourceSelectorWindow()` if not yet created; otherwise just shows it
4. Source selector window renders `SourceSelector` component and fetches sources via `desktopCapturer`
5. User clicks a source thumbnail
6. Source selector calls `window.electronAPI.setRecordingSource(source)` and hides itself
7. HUD updates "Select Source" button to show selected source name

### Recording-to-Editor Flow

1. User clicks "Record" in HUD
2. HUD begins recording via `useScreenRecorder` and cursor telemetry via IPC
3. User clicks "Stop" in HUD
4. HUD calls `window.electronAPI.storeRecordedVideo(blob, cursorData)` → main saves `.webm` and `.cursor.json`
5. HUD calls `window.electronAPI.recordingStopped(videoPath)`
6. Main process calls `createEditorWindow(videoPath)` or `showEditor()` if editor exists
7. Editor window loads `?windowType=editor&videoPath=...`; `VideoEditor` reads `videoPath` from URL and loads recording
8. Editor shown and focused

## Window State Management

### Tracking Window Instances

The main process maintains references to all created windows in module-level variables in `electron/windows.ts`.

### `alwaysOnTop` State (HUD Only)

The HUD supports an `alwaysOnTop` toggle controlled through IPC:

- `getAlwaysOnTop()` → returns current state
- `setAlwaysOnTop(alwaysOnTop)` → updates `BrowserWindow.setAlwaysOnTop()` and notifies subscribers
- `onAlwaysOnTopChanged(listener)` → subscribes renderer to state changes

### Editor Window Size

The editor window size is configurable via IPC:

- `setWindowSize(width, height)` → resizes the editor window
- `getWindowSize()` → returns current dimensions

## Cross-Window Communication

### Coordination via Main Process

Windows never communicate directly. All coordination flows through the main process via IPC, with the main process acting as the single source of truth for shared state (selected recording source, recording state, etc.).

### Shared State Examples

| State | Owner | Access Methods |
|---|---|---|
| Selected recording source | Main | `setRecordingSource(source)` (write only from source selector; read via `getRecordingSource` internally in main) |
| Recording state (idle/recording) | Main | `setIconState(state)` (write); `onRecordingStateChanged(listener)` (subscribe) |
| Cursor telemetry enabled | Main | `setCursorTelemetryEnabled(enabled)`; `getCursorTelemetryEnabled()`; `onCursorTelemetryEnabledChanged(listener)` |
| Record hotkey | Main | `setRecordHotkey(hotkey)`; `getRecordHotkey()`; `onRecordHotkeyChanged(listener)` |
| HUD always-on-top state | Main | `setAlwaysOnTop(alwaysOnTop)`; `getAlwaysOnTop()`; `onAlwaysOnTopChanged(listener)` |

## Window Visibility Policies

| Window | Shown By | Hidden By | Closed By |
|---|---|---|---|
| `hud-overlay` | App startup | (never auto-hidden; can be closed via tray menu) | User via tray menu (but usually kept running) |
| `source-selector` | `openSourceSelector()` IPC call | User selecting a source; `hide()` | User closing window manually |
| `editor` | `recordingStopped()` IPC call; `showEditor()` IPC call | `hideEditor()` IPC call | User closing window |

The source selector and editor prefer `hide()` over `close()` to preserve in-memory state (e.g., the editor keeps the video loaded). Closing them disposes the window and requires recreating from scratch.

## Relevant Files

| File | Role |
|---|---|
| `electron/windows.ts` | Window factory functions, window instance storage |
| `electron/main.ts` | App lifecycle, window creation on startup |
| `src/App.tsx` | URL-based routing, component selection |
| `src/components/LaunchWindow.tsx` | HUD UI |
| `src/components/SourceSelector.tsx` | Source picker UI |
| `src/components/VideoEditor.tsx` | Editor UI |
