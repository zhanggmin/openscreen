# Cursor Telemetry System

## Overview

The cursor telemetry system captures mouse cursor position during screen recording and stores it as a time series alongside the video. This data powers automatic zoom suggestions, enables cursor highlighting effects, and provides temporal context for video editing. Telemetry runs in the main process to avoid blocking the renderer, sampling the cursor at a configurable interval.

## Data Model: `CursorData` and `CursorTelemetryPoint`

### Core Types

```typescript
// src/types.ts
interface CursorTelemetryPoint {
  t: number; // milliseconds since recording start
  x: number; // x coordinate in screen space
  y: number; // y coordinate in screen space
}

type CursorData = CursorTelemetryPoint[];
```

### Data Characteristics

| Property | Value |
|---|---|
| Sampling Rate | ~10Hz (1 sample every 100ms) by default; configurable via env var in tests |
| Coordinate System | Absolute screen coordinates (not relative to captured window) |
| Time Base | `t=0` at `startCursorTelemetry()`; monotonically increasing |
| Storage Format | JSON array |
| File Naming | Same base name as the video, with `.cursor.json` extension |

## Telemetry Capture: Main Process

The main process implements telemetry capture using `setInterval` and Electron's `screen.getCursorScreenPoint()`.

### State Management

Telemetry state lives in module-level variables in `electron/ipc/handlers.ts`:

```typescript
let cursorTelemetryPoints: CursorData = [];
let cursorTelemetryInterval: NodeJS.Timeout | null = null;
let cursorTelemetryStartTime: number = 0;
let isCursorTelemetryEnabled = true; // toggleable via settings
```

### Start/Stop IPC Methods

| IPC Method | Effect |
|---|---|
| `startCursorTelemetry()` | Clears any existing points; records start timestamp; starts interval |
| `stopCursorTelemetry()` | Stops interval; returns collected `CursorData` |
| `getScreenCursorPosition()` | Returns current cursor position once (rarely used directly) |

### Sample Collection Loop

```typescript
// Simplified from electron/ipc/handlers.ts
cursorTelemetryInterval = setInterval(() => {
  const point = screen.getCursorScreenPoint();
  const now = Date.now();
  cursorTelemetryPoints.push({
    t: now - cursorTelemetryStartTime,
    x: point.x,
    y: point.y,
  });
}, 100);
```

## Coordinate Transformations in the Editor

The editor must map cursor telemetry from raw screen coordinates into the video's coordinate space.

### Why Transformation Is Necessary

- The captured region may be a subset of the screen (window recording or partial screen)
- The video may be cropped or scaled in the editor
- The video may have a different aspect ratio from the captured area

### Transformation Pipeline

| Step | Input | Output | Notes |
|---|---|---|---|
| 1 | Raw screen `(x, y)` | Position relative to captured region origin | Subtract captured region top-left offset |
| 2 | Relative position | Position in video pixel space | Scale by video resolution / capture resolution |
| 3 | Video pixel space | Position on editor stage (accounting for crop, scale, padding) | Apply current crop and layout transforms |

## Zoom Suggestions: Analyzing Telemetry

The `suggestZoomRegions()` utility analyzes cursor movement to propose useful zoom regions. It looks for:

- Periods of reduced cursor movement (stable focus on an area)
- Cursor dwells on a small region for multiple seconds

### Algorithm Sketch

1. Smooth cursor positions using a moving average
2. Detect segments where the cursor stays within a small bounding box for >1 second
3. Create a zoom region centered on that area with appropriate scale
4. Return suggested regions to the editor UI

## Persistence: `.cursor.json` Files

When a recording finishes, the main process writes the telemetry alongside the video.

### Storage Layout

```
RECORDINGS_DIR/
├── recording_20250101_123456.webm
└── recording_20250101_123456.cursor.json  ← telemetry
```

### File Structure (Example)

```json
[
  { "t": 0, "x": 1250, "y": 680 },
  { "t": 102, "x": 1252, "y": 681 },
  { "t": 201, "x": 1255, "y": 683 },
  ...
]
```

### IPC for Retrieval

The editor loads telemetry via `getCursorTelemetry(videoPath)` IPC, which infers the JSON path by replacing `.webm` with `.cursor.json` and returns the parsed array.

## Toggle and Preferences

The telemetry system can be toggled on/off by the user.

### State and Subscriptions

| IPC Method | Purpose |
|---|---|
| `setCursorTelemetryEnabled(enabled)` | Sets enabled state; persists to config |
| `getCursorTelemetryEnabled()` | Returns current state |
| `onCursorTelemetryEnabledChanged(listener)` | Subscribes to state changes |

When disabled, `startCursorTelemetry()` still succeeds but records an empty array.

## Performance Considerations

| Consideration | Mitigation |
|---|---|
| Main process event loop impact | 10Hz sampling is low enough to be negligible; interval runs only during recording |
| Memory usage | Points stored as simple objects; typical 60s recording ~600 points (~tens of KB) |
| File I/O | Written only once at end of recording; JSON serialization is fast |

## Testing the Telemetry System

A test script (`docs/testing/windows-native-cursor.md`) uses environment variables to test telemetry at different sampling rates.

| Environment Variable | Purpose |
|---|---|
| `CURSOR_TEST_SAMPLE_INTERVAL_MS` | Overrides default 100ms interval; set to e.g., 16 for 60Hz in tests |

## Relevant Files

| File | Role |
|---|---|
| `electron/ipc/handlers.ts` | Telemetry IPC handlers, interval management, point collection |
| `src/types.ts` | `CursorData`, `CursorTelemetryPoint` type definitions |
