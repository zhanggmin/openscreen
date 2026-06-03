# Screen Recording System

## Overview

The screen recording system is responsible for capturing screen or window video and writing it to disk in WebM format. It uses Electron's `desktopCapturer` API for source enumeration and the browser's `MediaRecorder` API for encoding. The system runs entirely in the renderer process, with IPC calls to the main process only for source selection coordination and final file storage.

This page covers source selection, recording setup, bitrate configuration, the recording lifecycle, and the WebM duration patching applied after recording stops.

## Core Components

| Component | Location | Responsibility |
|---|---|---|
| `SourceSelector` component | `src/components/SourceSelector.tsx` | Displays available sources and handles user selection |
| `useScreenRecorder` hook | `src/hooks/use-screen-recorder.ts` | Implements recording state, MediaRecorder lifecycle, data collection |
| Recording HUD UI | `src/components/LaunchWindow.tsx` | User-facing record/stop controls, status display |

## Source Selection

### Source Enumeration via `desktopCapturer`

Available capture sources are fetched in the renderer via `navigator.mediaDevices.getUserMedia`, after obtaining source IDs from Electron's `desktopCapturer`.

```typescript
// In SourceSelector.tsx
const sources = await window.electronAPI.getDesktopSources();
// sources is an array of { id, name, thumbnail }
```

The main process exposes `getDesktopSources()` via IPC, which wraps `desktopCapturer.getSources()`.

### Source Display in UI

The `SourceSelector` component renders a responsive grid of source thumbnails with the window title below each preview. Clicking a source dispatches `setRecordingSource()` IPC to store the selection in the main process and hides the source selector window.

### Storing the Selected Source

The selected source is held in main process memory (in `electron/ipc/handlers.ts` module state) and passed back to the HUD when requested. The HUD uses the source to request the appropriate media stream.

## Recording Setup: From Source to Stream

### Requesting the Media Stream

Once a source is selected, the HUD requests a `MediaStream`:

```typescript
// Rough flow in use-screen-recorder.ts
const stream = await navigator.mediaDevices.getUserMedia({
  audio: false, // OpenScreen does not record audio in current version
  video: {
    mandatory: {
      chromeMediaSource: 'desktop',
      chromeMediaSourceId: sourceId,
      minWidth: 1280,
      maxWidth: 3840,
      minHeight: 720,
      maxHeight: 2160,
    },
  },
});
```

The constraints request a high-resolution capture with minimum 720p and maximum 4K resolution.

## MediaRecorder Configuration

### Codec Selection

The `MediaRecorder` is configured to use VP8/VP9 in a WebM container:

```typescript
const mimeType = 'video/webm;codecs=vp9';
if (!MediaRecorder.isTypeSupported(mimeType)) {
  // Fall back to VP8 if VP9 not available
}
const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: ... });
```

### Bitrate Strategy

The bitrate is selected based on the source resolution to balance quality and file size:

| Resolution | Target Bitrate |
|---|---|
| ≤ 720p | 2.5 Mbps |
| ≤ 1080p | 5 Mbps |
| ≤ 1440p | 8 Mbps |
| > 1440p | 12 Mbps |

The `useScreenRecorder` hook inspects the stream's video track dimensions and chooses the appropriate bitrate before creating the `MediaRecorder`.

## Recording Lifecycle

The `useScreenRecorder` hook manages the complete recording lifecycle through a state machine.

### State Transitions

| State | Meaning | Next States |
|---|---|---|
| `idle` | Ready to record; no active stream/recorder | `starting` |
| `starting` | Acquiring stream and initializing recorder | `recording` or `error` |
| `recording` | `MediaRecorder` is accumulating data | `stopping` |
| `stopping` | Finalizing blob and patching duration | `idle` |
| `error` | Something failed (permission denied, etc.) | `idle` (after reset) |

### Key Methods Exposed by `useScreenRecorder`

| Method | Action |
|---|---|
| `startRecording(sourceId)` | Acquires stream, starts recorder, begins cursor telemetry |
| `stopRecording()` | Stops recorder, finalizes blob, calls `storeRecordedVideo()` IPC |
| `discardRecording()` | Cancels without saving |

## Data Collection and Blob Assembly

As `MediaRecorder` runs, it emits `dataavailable` events with chunks of encoded video. The hook collects these chunks in an array and, when stopped, constructs a single `Blob`:

```typescript
const chunks: Blob[] = [];
recorder.ondataavailable = (e) => {
  if (e.data.size > 0) chunks.push(e.data);
};
recorder.onstop = () => {
  const blob = new Blob(chunks, { type: 'video/webm' });
  // proceed to patch duration and save
};
```

## Fixing WebM Duration

WebM files recorded with `MediaRecorder` often do not have a valid duration metadata atom in their container. The application post-processes the recorded blob with `@fix-webm-duration/fix` to inject accurate timing:

```typescript
import fixWebmDuration from '@fix-webm-duration/fix';

// After recording stops
const fixedBlob = await fixWebmDuration(rawBlob, actualDurationMs);
```

The patched blob is then what gets saved to disk.

## Storing the Recording

Once the WebM is patched, the HUD calls `storeRecordedVideo()` IPC with both the blob and the cursor telemetry data:

```typescript
const metadata = await window.electronAPI.storeRecordedVideo(
  fixedWebmBlob,
  cursorTelemetryData
);
// metadata contains { filePath, cursorFilePath, size, duration, etc. }
```

The main process writes two files:

- Video: `RECORDINGS_DIR/recording_YYYYMMDD_HHMMSS.webm`
- Cursor telemetry: `RECORDINGS_DIR/recording_YYYYMMDD_HHMMSS.cursor.json`

After storage completes, `recordingStopped()` IPC is invoked to open the editor with the new recording.

## Parallel Cursor Telemetry Capture

During recording, the HUD simultaneously captures cursor position at ~10Hz via the `startCursorTelemetry()` / `stopCursorTelemetry()` IPC methods. This telemetry is stored as a separate JSON file alongside the video.

The cursor telemetry system is detailed in Cursor Telemetry System.

## Permissions Required

Recording requires two permissions granted at the OS level:

| Permission | macOS | Windows | Linux |
|---|---|---|---|
| **Screen Recording** | System Settings > Privacy & Security > Screen Recording | n/a (usually not requested separately) | Varies by DE (GNOME Settings > Privacy, etc.) |
| **Accessibility** (optional) | System Settings > Privacy & Security > Accessibility | n/a | n/a |

The first time the user attempts to record, macOS prompts for these permissions. The application cannot proceed without the screen recording permission.

## Error Handling

The `useScreenRecorder` hook catches and surfaces several error conditions:

- `getUserMedia` rejection (permission denied, source invalid)
- `MediaRecorder` initialization failure
- Runtime errors during recording

Errors are surfaced to the UI via the hook's returned `error` state.

## Performance Considerations

| Optimization | Purpose |
|---|---|
| Resolution-adaptive bitrate | Prevents excessive file sizes on high-resolution sources while keeping quality acceptable on low-res |
| `timeslice: 1000` in `MediaRecorder.start()` | Collects data in 1-second chunks to limit memory growth during long recordings |
| No audio track | Reduces CPU usage and file size |

## Future Considerations

Planned improvements include:

- Optional microphone audio track
- System audio capture
- More granular bitrate controls
- Hardware-accelerated encoding where available

## Relevant Files

| File | Role |
|---|---|
| `src/hooks/use-screen-recorder.ts` | Recording state machine, MediaRecorder orchestration |
| `src/components/LaunchWindow.tsx` | HUD UI that uses `useScreenRecorder` |
| `src/components/SourceSelector.tsx` | Source selection UI |
| `electron/ipc/handlers.ts` | `storeRecordedVideo`, `setRecordingSource`, etc. |
