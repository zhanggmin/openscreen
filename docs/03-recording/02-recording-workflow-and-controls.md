# Recording Workflow & Controls

## Overview

The recording workflow is driven by the `LaunchWindow` component (HUD overlay) and orchestrated by the `useScreenRecorder` custom hook. This page walks through the complete user journey from source selection to recording completion and opening the editor, with details about UI state, IPC calls, and parallel subsystems like cursor telemetry.

## Workflow Sequence: From Source Selection to Editor

The recording flow consists of several well-defined stages, each with user interaction, state transitions, and cross-process communication.

### Step 1: Source Selection

### Step 2: HUD Updates with Selected Source

### Step 3: User Initiates Recording

### Step 4: Recording in Progress

### Step 5: User Stops Recording

### Step 6: Post-Processing and Storage

### Step 7: Editor Opens with New Recording

## `LaunchWindow`: HUD UI Components

The `LaunchWindow` component (`src/components/LaunchWindow.tsx`) is the primary interface for controlling recording. Its UI evolves depending on recording state.

### UI States

| State | Visuals | Actions |
|---|---|---|
| **No source selected** | "Select Source" button | Click to open source selector |
| **Source selected, idle** | Source name + "Record" button | Click "Record" to start; click source name to reselect |
| **Recording** | Red "Stop" button + timer, "Cancel" option | Click "Stop" to finish and save; click "Cancel" to discard |
| **Processing (post-stop)** | Spinner + "Saving..." | No user action |

### Controls Exposed

| Control | Type | Function |
|---|---|---|
| Source selector trigger | Button (or source name) | Calls `openSourceSelector()` |
| Record button | Button | Calls `startRecording()` from `useScreenRecorder` |
| Stop button | Button | Calls `stopRecording()` from `useScreenRecorder` |
| Cancel button | Button | Calls `discardRecording()` from `useScreenRecorder` |
| Always-on-top toggle | Switch | Calls `setAlwaysOnTop()` IPC |
| Hotkey config | Link/button | Calls `showRecordHotkeyDialog()` IPC |

## `useScreenRecorder`: State Machine and API

The `useScreenRecorder` hook (`src/hooks/use-screen-recorder.ts`) encapsulates the entire recording lifecycle and exposes a clean imperative API to the UI.

### State Shape

```typescript
interface ScreenRecorderState {
  status: 'idle' | 'starting' | 'recording' | 'stopping' | 'error';
  error: Error | null;
  recordingStartTimestamp: number | null;
  // ... internal fields (stream, recorder, chunks, etc.)
}
```

### Exposed Methods

| Method | Arguments | Effect |
|---|---|---|
| `startRecording` | `sourceId: string` | Acquires stream, initializes recorder, starts telemetry |
| `stopRecording` | none | Stops recorder, patches duration, calls `storeRecordedVideo` IPC |
| `discardRecording` | none | Stops without saving, cleans up |

### Event Handlers Used Internally

| Handler | Attached To | Purpose |
|---|---|---|
| `ondataavailable` | `MediaRecorder` | Collects encoded video chunks |
| `onstop` | `MediaRecorder` | Assembles blob, patches duration, triggers save flow |
| `onerror` | `MediaRecorder` | Sets error state, cleans up |

## Cursor Telemetry Integration

The `useScreenRecorder` hook coordinates with the cursor telemetry system to capture mouse position in parallel with video.

### Timing: Telemetry Start/Stop

| Recording Event | Telemetry Action |
|---|---|
| `startRecording()` called | Calls `window.electronAPI.startCursorTelemetry()` |
| `stopRecording()` called | Calls `window.electronAPI.stopCursorTelemetry()` → gets `CursorData` → passes to `storeRecordedVideo` alongside video blob |

The telemetry data is saved as a `.cursor.json` file alongside the `.webm` recording, with the same base name.

## IPC Touchpoints During Workflow

| Workflow Step | IPC Method Called | Direction | Purpose |
|---|---|---|---|
| User clicks "Select Source" | `openSourceSelector()` | Renderer → Main | Shows source selector window |
| User selects a source in picker | `setRecordingSource(source)` | Renderer → Main | Stores source in main process memory |
| Recording begins | `setIconState('recording')` | Renderer → Main | Changes tray icon to recording state |
| Recording stops | `setIconState('idle')` | Renderer → Main | Reverts tray icon to idle |
| Recording saved | `storeRecordedVideo(blob, cursorData)` | Renderer → Main | Saves `.webm` and `.cursor.json` to disk; returns metadata |
| After saving completes | `recordingStopped(videoPath)` | Renderer → Main | Instructs main to open editor with the new video |

## Global Hotkey Support

Users can configure a global hotkey (e.g., `CmdOrCtrl+Shift+R`) to start/stop recording without interacting with the HUD.

### Hotkey Flow

1. User configures hotkey via HUD UI → `showRecordHotkeyDialog()` IPC → main opens hotkey config window
2. User presses desired key combination → `setRecordHotkey(newHotkey)` IPC → main registers/unregisters global accelerator
3. Hotkey pressed anywhere → main emits event → HUD's `onRecordHotkeyPressed()` callback fires → toggles recording

## Error States and Recovery

The workflow handles several error conditions gracefully:

| Error | When | User Experience |
|---|---|---|
| `getUserMedia` fails | No screen recording permission, invalid source | HUD shows error message; user can retry after granting permissions |
| `MediaRecorder` unsupported | Very old browser/Electron version | Friendly error; suggests updating |
| Insufficient disk space | On `storeRecordedVideo` | Error surfaced; user can free space and retry |
| Cursor telemetry failure | Accessibility not granted | Recording still completes; telemetry optional |

## Relevant Files

| File | Role |
|---|---|
| `src/components/LaunchWindow.tsx` | HUD UI and workflow orchestration |
| `src/hooks/use-screen-recorder.ts` | Recording state machine and MediaRecorder management |
| `electron/ipc/handlers.ts` | IPC handlers for source selection, video storage, telemetry |
