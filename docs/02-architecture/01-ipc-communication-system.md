# IPC Communication System

## Overview

The IPC (Inter-Process Communication) system is the exclusive communication channel between the Electron main process and renderer processes. The architecture strictly enforces context isolation and uses `contextBridge` to expose only whitelisted APIs to the renderer process, ensuring security by design.

The IPC layer sits below all application features and provides the foundation for window management, file system access, system permissions, and cross-window coordination. This page documents all exposed IPC methods, their implementations, and usage patterns.

## Architecture: Preload Script and `contextBridge`

### Context Isolation Guarantee

OpenScreen enforces strict context isolation between main and renderer processes. The renderer has **no direct access** to Node.js APIs or the `electron` module. All communication flows through a preload script that exposes a controlled surface via `contextBridge.exposeInMainWorld`.

### Preload Script Setup

The preload script (`electron/preload.ts`) executes in a context that has access to both Electron APIs and the renderer's JavaScript context, but with Node.js integration disabled by default. It sets up the IPC bridge in two phases:

1. **Main Process Setup**: Imports `ipcMain` and registers all handlers
2. **Preload Setup**: Imports `ipcRenderer` and `contextBridge`, exposes the whitelisted API

All exposed methods have fully typed TypeScript definitions, enabling type-safe IPC calls from the renderer.

### Type Definitions

The complete type definitions for `window.electronAPI` live in `electron/ipc/types.ts` and are consumed by both the preload script (for implementation) and the renderer (for type hints).

## IPC Method Reference

All IPC methods are exposed as properties on `window.electronAPI`. The following table summarizes all available methods:

| Method Name | Type | Description |
|---|---|---|
| `getPath` | `(path: string) => Promise<string>` | Returns platform-specific app data paths |
| `openFile` | `(title: string, filters: FileFilter[]) => Promise<string[]>` | Shows file open dialog |
| `saveFile` | `(title: string, filters: FileFilter[]) => Promise<string>` | Shows file save dialog |
| `writeFile` | `(filePath: string, content: string) => Promise<void>` | Writes string content to a file |
| `readFile` | `(filePath: string) => Promise<string>` | Reads text file content |
| `readFileRaw` | `(filePath: string) => Promise<Uint8Array>` | Reads binary file content |
| `fileExists` | `(filePath: string) => Promise<boolean>` | Checks file existence |
| `mkdir` | `(dirPath: string) => Promise<void>` | Creates directory (with parents) |
| `copyFile` | `(src: string, dest: string) => Promise<void>` | Copies file from source to destination |
| `openURL` | `(url: string) => Promise<void>` | Opens external URL in default browser |
| `openSourceSelector` | `() => Promise<void>` | Opens source selector window (or shows it) |
| `showEditor` | `() => Promise<void>` | Shows editor window (creates it if necessary) |
| `hideEditor` | `() => Promise<void>` | Hides editor window |
| `storeRecordedVideo` | `(blob: Blob, cursorData: CursorData) => Promise<RecordingMetadata>` | Stores recorded WebM blob and cursor data; returns metadata |
| `setRecordingSource` | `(source: MediaSourceInfo) => Promise<void>` | Stores selected recording source for HUD |
| `selectRecordingSource` | `() => Promise<void>` | Triggers source selection flow (used by HUD) |
| `recordingStopped` | `(videoPath: string) => Promise<void>` | Notifies main process when recording stops (opens editor with video) |
| `getRecordingsDirectory` | `() => Promise<string>` | Returns absolute path to recordings directory |
| `getCursorTelemetry` | `(videoPath: string) => Promise<CursorData>` | Reads cursor telemetry for a given recording |
| `setIconState` | `(state: 'recording' | 'idle') => Promise<void>` | Updates tray icon state (recording vs idle) |
| `onRecordingStateChanged` | `(listener: (state: RecordingState) => void) => void` | Subscribes to recording state changes |
| `setCursorTelemetryEnabled` | `(enabled: boolean) => Promise<void>` | Toggles cursor telemetry collection |
| `getCursorTelemetryEnabled` | `() => Promise<boolean>` | Returns whether cursor telemetry is enabled |
| `onCursorTelemetryEnabledChanged` | `(listener: (enabled: boolean) => void) => void` | Subscribes to telemetry enablement changes |
| `getScreenCursorPosition` | `() => Promise<{ x: number; y: number }>` | Gets current cursor position in screen coordinates |
| `startCursorTelemetry` | `() => Promise<void>` | Starts cursor telemetry capture |
| `stopCursorTelemetry` | `() => Promise<CursorData>` | Stops telemetry capture and returns collected data |
| `setAlwaysOnTop` | `(alwaysOnTop: boolean) => Promise<void>` | Toggles HUD always-on-top state |
| `getAlwaysOnTop` | `() => Promise<boolean>` | Returns whether HUD is always on top |
| `onAlwaysOnTopChanged` | `(listener: (alwaysOnTop: boolean) => void) => void` | Subscribes to always-on-top state changes |
| `setRecordHotkey` | `(hotkey: string) => Promise<void>` | Sets global record hotkey |
| `getRecordHotkey` | `() => Promise<string>` | Returns current record hotkey |
| `onRecordHotkeyChanged` | `(listener: (hotkey: string) => void) => void` | Subscribes to hotkey changes |
| `showRecordHotkeyDialog` | `() => Promise<void>` | Displays hotkey configuration dialog |
| `onRecordHotkeyPressed` | `(listener: () => void) => void` | Subscribes to record hotkey press events |
| `setWindowSize` | `(width: number, height: number) => Promise<void>` | Resizes editor window |
| `getWindowSize` | `() => Promise<{ width: number; height: number }>` | Returns current editor window dimensions |

## Key IPC Methods by Use Case

### File System Access

### `getPath(name: string): Promise<string>`

Wraps Electron's `app.getPath(name)` to retrieve platform-specific directories.

**Use Cases**:
- Determining app data directory (`getPath('appData')`)
- Accessing user documents (`getPath('documents')`)
- Getting temporary directory (`getPath('temp')`)

**Example (Renderer)**:
```typescript
const appDataPath = await window.electronAPI.getPath('appData');
const recordingsDir = path.join(appDataPath, 'Openscreen', 'recordings');
```

### `writeFile(filePath: string, content: string): Promise<void>`

Saves string content to disk, creating parent directories if they don't exist.

**Implementation**: Uses `fs.promises.writeFile` with `fs.promises.mkdir` for parent directories.

### `readFile(filePath: string): Promise<string>`

Reads a text file and returns its content as a UTF-8 string.

### `readFileRaw(filePath: string): Promise<Uint8Array>`

Reads a binary file and returns its content as a `Uint8Array`. Used for loading `.webm` video files in the editor.

### Window Management

### `openSourceSelector(): Promise<void>`

Creates or shows the source selector window where users choose which screen or window to record.

### `showEditor(): Promise<void>`

Shows the editor window, creating it if it doesn't exist. Called after a recording stops to open the newly recorded video.

### `hideEditor(): Promise<void>`

Hides the editor window (keeps it in memory).

### Recording Workflow

### `storeRecordedVideo(blob: Blob, cursorData: CursorData): Promise<RecordingMetadata>`

Handles the final step of the recording process: saving the WebM blob and cursor telemetry to disk.

### Recording State and Telemetry

### `setIconState(state: 'recording' | 'idle'): Promise<void>`

Updates the tray icon appearance to indicate whether recording is active.

### Hotkey Management

### `setRecordHotkey(hotkey: string): Promise<void>`

Registers a global keyboard shortcut for starting/stopping recording.

## IPC Implementation Details

### Handler Registration

All IPC handlers are registered in `electron/ipc/handlers.ts` within a single `registerIpcHandlers()` function.

### Error Handling in IPC

Main process IPC handlers catch errors and propagate them back to the renderer as rejected promises.

### Event Subscription Pattern

For methods that subscribe to events (e.g., `onRecordingStateChanged`), the preload script wraps `ipcRenderer.on()` and returns a cleanup function.

## Security Best Practices Followed

| Practice | Implementation |
|---|---|
| **Context Isolation** | `contextIsolation: true` on all `BrowserWindow`s; no Node.js in renderer |
| **Limited API Surface** | Only 32 specific methods exposed via `contextBridge`; no arbitrary IPC |
| **No Arbitrary File Paths** | Most file operations target known directories (app data, recordings) |
| **No `shell.openExternal` for Arbitrary URLs** | The `openURL` method validates URL schemes (https only) |
| **No `eval`** | No dynamic code execution anywhere in the codebase |

## Usage Patterns in Renderer Code

### Async/Await for One-Off IPC Calls

```typescript
// Example: Saving a project file
const filePath = await window.electronAPI.saveFile('Save Project', [
  { name: 'OpenScreen Project', extensions: ['openscreen'] },
]);
if (filePath) {
  await window.electronAPI.writeFile(filePath, JSON.stringify(projectState));
}
```

### Subscription with Cleanup

For subscriptions (e.g., `onRecordingStateChanged`), use a React effect to clean up on unmount:

```typescript
useEffect(() => {
  const cleanup = window.electronAPI.onRecordingStateChanged((state) => {
    console.log('Recording state changed:', state);
  });
  return cleanup;
}, []);
```

### Type Safety

All IPC methods are fully typed in the renderer. Your IDE will autocomplete `window.electronAPI` methods and provide type hints for arguments and return values.

## Common IPC Workflows Illustrated

### Full Recording Workflow

| Step | IPC Method(s) | Direction | Notes |
|---|---|---|---|
| 1. User clicks "Select Source" | `openSourceSelector()` | Renderer → Main | Main creates/shows source selector window |
| 2. User selects source | `setRecordingSource()` | Renderer → Main | Main stores source in state for HUD |
| 3. User clicks "Record" | `startCursorTelemetry()` | Renderer → Main | Main begins capturing cursor position at 10Hz |
| 4. Recording stops | `stopCursorTelemetry()` + `storeRecordedVideo()` | Renderer → Main | Main saves `.webm` and `.cursor.json`, returns metadata |
| 5. Open in editor | `recordingStopped(videoPath)` | Renderer → Main | Main shows editor window with the new video |
| 6. Editor loads video | `readFileRaw(videoPath)` + `getCursorTelemetry(videoPath)` | Renderer → Main | Editor loads video and cursor data from disk |

### Hotkey Configuration Flow

| Step | IPC Method(s) | Notes |
|---|---|---|
| User triggers hotkey config | `showRecordHotkeyDialog()` | Main opens hotkey dialog |
| User presses new hotkey | `setRecordHotkey(newKey)` | Main unregisters old hotkey, registers new one |
| Hotkey press event | `onRecordHotkeyPressed(callback)` | Renderer listens for hotkey events |

## Where IPC is Defined in the Codebase

| File | Role |
|---|---|
| `electron/ipc/types.ts` | TypeScript definitions for all IPC methods and data structures |
| `electron/ipc/handlers.ts` | All `ipcMain.handle()` implementations |
| `electron/preload.ts` | `contextBridge` setup exposing `window.electronAPI` to renderer |
