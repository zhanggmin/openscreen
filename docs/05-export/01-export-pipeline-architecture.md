# Export Pipeline Architecture

## Overview

The export pipeline processes the edited video into a final MP4 or GIF file. It decodes the source video frame by frame, applies all edits (zoom, crop, effects, annotations) on a canvas, and re-encodes the result. The pipeline is designed to be non-blocking, with progress reporting, and runs primarily in the renderer process.

## Pipeline Stages

The export process is structured as a sequence of stages:

| Stage | Responsibility |
|---|---|
| 1. Demuxing | Extracts video frames from the source WebM |
| 2. Frame Rendering | Draws each frame with all edits applied |
| 3. Encoding | Encodes rendered frames to H.264 (MP4) or GIF |
| 4. Muxing | Packages encoded video into final container |

## Core Classes

### `Exporter`

The `Exporter` class (`src/lib/exporter.ts`) orchestrates the entire pipeline.

```typescript
class Exporter {
  constructor(config: ExportConfig);
  export(): AsyncGenerator<ExportProgress, ExportResult>;
  cancel(): void;
}
```

### `StreamingVideoDecoder`

Wraps `web-demuxer` to provide an async iterable of video frames.

### `FrameRenderer`

Applies all edits to a given frame and draws to an `OffscreenCanvas` or `<canvas>`.

### `VideoEncoder`

Wraps the WebCodecs `VideoEncoder` API to encode frames.

### `VideoMuxer` (MP4 Only)

Wraps `mediabunny` to mux encoded frames into an MP4 container.

## MP4 Export Pipeline

### Demuxing the Source

```typescript
import { WebmDemuxer } from 'web-demuxer';

const demuxer = new WebmDemuxer();
await demuxer.load(sourceFile);
const frames = demuxer.frames(); // async iterable
```

### Rendering Each Frame

For each decoded frame, `FrameRenderer` draws the video with all edits:

1. **Crop**: Applies crop rectangle
2. **Zoom**: Applies zoom transform for the current timestamp
3. **Effects**: Applies blur, shadow, etc. (on a canvas, not using Pixi.js)
4. **Background**: Draws background color/gradient/image behind the video
5. **Annotations**: Overlays text, arrows, and images

This rendering happens on a canvas separate from the editor's Pixi.js canvas to avoid interfering with the UI.

### Encoding via WebCodecs

The rendered canvas frames are fed into a WebCodecs `VideoEncoder`:

```typescript
const encoder = new VideoEncoder({
  output: (chunk, meta) => { /* send to muxer */ },
  error: (err) => { /* handle error */ },
});

encoder.configure({
  codec: 'avc1.42E01F', // H.264 baseline profile
  width: outputWidth,
  height: outputHeight,
  bitrate: targetBitrate,
  framerate: framerate,
});
```

### Muxing to MP4 with `mediabunny`

Encoded chunks are passed to `mediabunny` to build the final MP4 file:

```typescript
import { createVideoMuxer } from 'mediabunny';

const muxer = createVideoMuxer({
  width: outputWidth,
  height: outputHeight,
  fps: framerate,
});

// For each encoded chunk...
muxer.addVideoChunk(chunk, meta);

// Finalize...
const mp4Blob = await muxer.finalize();
```

## GIF Export Pipeline

GIF export follows a similar demux/render pipeline but uses `gif.js` for encoding instead of WebCodecs.

### Framerate and Quality Tradeoffs

GIFs use a palette and are much less efficient than MP4. To keep file sizes reasonable:

- If the source video is high-fps, the exporter may downsample to ~15-20 fps for GIF
- The user-adjustable `exportQuality` controls palette size and dithering

### `gif.js` Encoding

```typescript
import GIF from 'gif.js';

const gif = new GIF({
  workers: 2,
  quality: 10 - exportQuality / 10, // map 0-100 to 1-10
  width: outputWidth,
  height: outputHeight,
});

for each rendered frame {
  gif.addFrame(canvas, { delay: frameDelayMs });
}

gif.on('finished', (blob) => { /* save blob */ });
gif.render();
```

## Progress Reporting

The `Exporter.export()` method returns an `AsyncGenerator` that yields progress updates:

```typescript
for await (const progress of exporter.export()) {
  console.log(`Exporting: ${progress.percent.toFixed(1)}%`);
  // update UI progress bar
}
```

| Progress Field | Type | Meaning |
|---|---|---|
| `stage` | `'demuxing' \| 'rendering' \| 'encoding' \| 'muxing' \| 'saving'` | Current pipeline stage |
| `frameCount` | `number` | Frames processed so far |
| `totalFrames` | `number` | Total frames to process |
| `percent` | `number` | Overall percentage (0-100) |

## Cancel Support

The exporter supports cancellation via `exporter.cancel()`. This immediately stops the pipeline and cleans up resources.

## Performance Considerations

| Optimization | Technique |
|---|---|
| Parallelism | `gif.js` uses Web Workers; WebCodecs is highly optimized by browsers |
| Canvas reuse | Same canvas reused for rendering each frame; avoids reallocations |
| Resolution scaling | Downscales early if `exportResolution` is lower than source |
| Hardware acceleration | WebCodecs uses GPU where available |

## Error Handling

The pipeline wraps each stage in try/catch and surfaces errors to the UI via a rejected promise or error event.

| Possible Error | Cause |
|---|---|
| Demuxing failed | Corrupt source file; unsupported codec |
| WebCodecs unavailable | Older browser/Electron version; falls back to alternative path if available |
| Out of memory | Very high-resolution export with limited RAM; user advised to lower resolution |

## Relevant Files

| File | Role |
|---|---|
| `src/lib/exporter.ts` | `Exporter` class, pipeline orchestration |
