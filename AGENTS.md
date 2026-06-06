# AGENTS.md

This file provides guidance to Qoder (qoder.com) when working with code in this repository.

## Build & Development Commands

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server (launches Electron in dev mode) |
| `npm run build` | Type-check (`tsc`), Vite build, then `electron-builder` |
| `npm run build-vite` | Type-check + Vite build only (no Electron packaging) |
| `npm run lint` | Biome check (read-only) |
| `npm run lint:fix` | Biome check with auto-fix |
| `npm run format` | Biome format (writes in place) |
| `npm run i18n:check` | Validate i18n locale files for missing keys |
| `npm test` | Run all unit tests once (vitest, jsdom environment) |
| `npm run test:watch` | Run unit tests in watch mode |
| `npm run test:browser` | Run browser-mode tests (vitest + Playwright chromium, for Pixi.js) |
| `npm run test:e2e` | Run Playwright end-to-end tests |

**Platform-specific builds:**
- `npm run build:mac` — Build native macOS helper + macOS package
- `npm run build:win` — Build native Windows helper + Windows package
- `npm run build:linux` — Build Linux packages (AppImage, deb, pacman)

**Running a single test file:**
```bash
npx vitest --run path/to/file.test.ts
```

**Node version:** 22.22.1 (see `.nvmrc`)

## Linting & Formatting

- **Biome** (not ESLint/Prettier). Config in `biome.json`.
- **Indentation:** Tabs, line width 100.
- **Quotes:** Double quotes for JS/TS.
- **CSS files are excluded** from Biome.
- Pre-commit hook runs `lint-staged` → `biome check --no-errors-on-unmatched`.
- Imports are auto-organized via `assist.source.organizeImports: "on"`.

## Architecture Overview

OpenScreen is an **Electron + React + TypeScript + Vite** desktop app for screen recording and video editing — a free alternative to Screen Studio.

### Multi-Window Electron Architecture

The app uses **4 Electron windows**, all sharing a single `index.html` entry point. Routing is determined by the `windowType` URL query parameter:

| `windowType` | Component | Description |
|---|---|---|
| `hud-overlay` | `LaunchWindow` | Floating always-on-top HUD for recording controls |
| `source-selector` | `SourceSelector` | Modal picker for screen/window selection |
| `countdown-overlay` | `CountdownOverlay` | Transparent pre-roll countdown overlay |
| `editor` | `VideoEditor` | Main editor window (timeline, settings, canvas) |

Window creation is in `electron/windows.ts`. The main process (`electron/main.ts`) manages window lifecycle, tray icon, and application menu.

### IPC Communication

Two IPC patterns exist:

1. **Direct IPC channels** — Legacy per-feature channels registered in `electron/ipc/handlers.ts` (~2800 lines). The preload (`electron/preload.ts`) exposes these as `window.electronAPI.*`.

2. **Native Bridge** — Newer, structured request/response pattern over a single IPC channel (`native-bridge:invoke`). Defined by:
   - **Contracts:** `src/native/contracts.ts` — Typed request/response/error types, versioned protocol
   - **Client:** `src/native/client.ts` — Renderer-side typed client (`nativeBridgeClient.system/project/cursor`)
   - **Handler:** `electron/ipc/nativeBridge.ts` — Main-process handler dispatching to service classes
   - **Services:** `electron/native-bridge/services/` — `ProjectService`, `CursorService`, `SystemService`
   - **Store:** `electron/native-bridge/store.ts` — In-memory state for the bridge

New features should prefer the Native Bridge pattern over adding new direct IPC channels.

### Renderer (React) Architecture

- **Path alias:** `@/` → `src/`
- **Entry:** `src/App.tsx` switches on `windowType` to render the correct component tree
- **VideoEditor** (`src/components/video-editor/VideoEditor.tsx`) — Large component (~3000 lines) that owns the editor state via `useEditorHistory` hook
- **PixiJS** — Used for video canvas rendering in the editor (frame rendering, annotations, cursor overlay, blur effects)
- **dnd-timeline** — Timeline component for trim/speed segments
- **GSAP** — Animation library for zoom transitions
- **State management** — Primarily React hooks/contexts (no Redux). Key contexts: `I18nContext`, `ShortcutsContext`

### Recording Pipeline

- **WebRTC recording** (`src/hooks/useScreenRecorder.ts`) — Browser `MediaRecorder` with `desktopCapturer` sources, streams chunks to main process via `RecordingStreamRegistry`
- **RecordingStream** (`electron/ipc/recordingStream.ts`) — Main-process write streams that flush MediaRecorder chunks to disk incrementally, avoiding large in-memory buffers
- **Native macOS recording** (`src/lib/nativeMacRecording.ts`) — ScreenCaptureKit-based helper (Swift, in `electron/native/screencapturekit/`)
- **Native Windows recording** (`src/lib/nativeWindowsRecording.ts`) — Windows.Graphics.Capture helper (C++, in `electron/native/wgc-capture/`)

### Export Pipeline

Located in `src/lib/exporter/`:

- **VideoExporter** (`videoExporter.ts`) — MP4 export with PixiJS frame rendering, audio encoding, zoom keyframes
- **GifExporter** (`gifExporter.ts`) — GIF export with configurable size/framerate presets
- **FrameRenderer** (`frameRenderer.ts`) — PixiJS-based frame compositor (background, zoom, cursor, annotations, blur, webcam)
- **AudioEncoder** (`audioEncoder.ts`) — Audio track processing (mixing, trimming, system + mic)
- **StreamingDecoder** (`streamingDecoder.ts`) — WebCodecs-based video decoder for frame extraction

### Cursor System

- **Cursor telemetry** — Native cursor position tracking during recording, stored as timestamped samples
- **Cursor types** — Defined in `src/native/contracts.ts` (`NativeCursorType`), rendered as SVG assets in `src/assets/cursors/`
- **Cursor rendering** — `src/lib/cursor/` handles cursor overlay rendering in the editor and export

### i18n

- 13 locales, namespace-based JSON files in `src/i18n/locales/{locale}/{namespace}.json`
- Namespaces: `common`, `dialogs`, `editor`, `launch`, `settings`, `shortcuts`, `timeline`
- Renderer uses React context (`I18nContext`), main process has its own lightweight i18n (`electron/i18n.ts`) for menus/tray
- Always run `npm run i18n:check` after modifying locale files

### Project & Session Persistence

- **Recording sessions** (`src/lib/recordingSession.ts`) — Typed session data including video paths, cursor data, webcam overlay position
- **Project files** — JSON-serialized editor state saved/loaded via IPC, with unsaved-changes tracking and close confirmation dialog
- **User preferences** (`src/lib/userPreferences.ts`) — Stored via Electron `store`

## Key Conventions

- **Strict TypeScript:** `noUnusedLocals`, `noUnusedParameters`, `strict` mode enabled. Test files (`.test.ts/tsx`) are excluded from `tsconfig.json`.
- **Test file location:** Tests co-located with source files using `.test.ts`/`.test.tsx` suffix. Browser-mode tests use `.browser.test.ts`/`.browser.test.tsx`.
- **Browser tests** require `npm run test:browser:install` first (installs Playwright chromium with SwiftShader for headless Pixi.js).
- **Adding new i18n keys:** Add to English (`en`) first, then run `npm run i18n:check` to find missing translations.
- **PRs with UI changes must include screenshots or a short video** per CONTRIBUTING.md.
