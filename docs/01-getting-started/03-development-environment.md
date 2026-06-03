# Development Environment

## Prerequisites

| Requirement | Minimum Version | Notes |
|---|---|---|
| Node.js | 18.x | 22.x recommended; `@electron/rebuild` requires ≥22.12.0 |
| npm | 7.x | `package-lock.json` uses lockfile version 3 (npm 7+) |
| Git | Any recent | Required to clone the repository |

Electron 39 (the version pinned in `package.json`) requires a sufficiently modern Node.js runtime. Using the LTS or Current release of Node.js is the safest option.

## Clone and Install

```bash
git clone https://github.com/siddharthvaddem/openscreen.git
cd openscreen
npm install
```

`npm install` reads `package-lock.json` (lockfile version 3) to pin exact dependency versions. Alternatively, use `npm ci` for a clean, reproducible install — preferred in CI environments.

After installation, `node_modules/` is populated. The directories `dist/`, `dist-ssr/`, `dist-electron/`, and `release/` are all generated at build or dev time and are excluded from version control.

## Running in Development Mode

```bash
npm run dev
```

This invokes `vite` directly. The `vite-plugin-electron` dev dependency hooks into the Vite dev server to compile and launch the Electron main process alongside the renderer. The configuration in `vite.config.ts` sets up three compilation targets:

1. **Main Process** (`electron/main.ts`) → `dist-electron/main.js`
2. **Preload Script** (`electron/preload.{ts,mjs}`) → `dist-electron/preload.mjs`
3. **Renderer Process** (`src/`) → served via Vite dev server with HMR

When you run `npm run dev`, Vite starts on `http://localhost:5173` (by default) and Electron launches a BrowserWindow pointing to that URL. Changes to renderer code trigger hot module replacement without restarting Electron. Changes to main process or preload scripts trigger a full Electron restart.

### What Runs Where

| Component | Runtime | Entry Point | Output | Hot Reload |
|---|---|---|---|---|
| Main Process | Node.js in Electron | `electron/main.ts` | `dist-electron/main.js` | Full restart |
| Preload Script | Sandboxed context | `electron/preload.ts` | `dist-electron/preload.mjs` | Full restart |
| Renderer Process | Chromium in Electron | `src/App.tsx` | In-memory (dev server) | HMR |

## Available npm Scripts

All scripts are defined in `package.json`:

| Script | Command | Description |
|---|---|---|
| `dev` | `vite` | Start dev server with Electron; hot reload enabled |
| `build` | `tsc && vite build && electron-builder` | Full production build for the current platform |
| `build:mac` | `tsc && vite build && electron-builder --mac` | macOS-specific build (dmg, x64 + arm64) |
| `build:win` | `tsc && vite build && electron-builder --win` | Windows-specific build (nsis installer) |
| `build:linux` | `tsc && vite build && electron-builder --linux` | Linux-specific build (AppImage) |
| `lint` | `biome check .` | Lint all source files without modifying them |
| `lint:fix` | `biome check --write .` | Lint and auto-fix all issues |
| `format` | `biome format --write .` | Format all source files in place |
| `preview` | `vite preview` | Preview the production renderer bundle (no Electron) |
| `test` | `vitest --run` | Run the test suite once |
| `test:watch` | `vitest` | Run tests in watch mode |

## Project Layout Relevant to Development

### Source Directories (version-controlled)

### Generated Directories (excluded from version control)

| Directory | Created By | Contents | Notes |
|---|---|---|---|
| `node_modules/` | `npm install` | Installed dependencies | ~2GB; exclude from git |
| `dist-electron/` | `vite-plugin-electron` | Compiled main process and preload script | `main.js`, `preload.mjs` |
| `dist/` | `vite build` | Compiled renderer bundle | `index.html`, `assets/` |
| `release/` | `electron-builder` | Platform-specific installers | `.dmg`, `.exe`, `.AppImage` |

### Key File Mappings for Development

| Source File | Compiled Output | Purpose |
|---|---|---|
| `electron/main.ts` | `dist-electron/main.js` | Main process entry; referenced in `package.json` as `"main"` |
| `electron/preload.ts` | `dist-electron/preload.mjs` | Preload script; loaded in `BrowserWindow` constructor |
| `src/App.tsx` | `dist/assets/index-*.js` | React app root; loaded by `dist/index.html` |
| `public/gif.worker.js` | `dist/gif.worker.js` | Web Worker for GIF encoding |

## Code Quality Tooling

### Biome (Linting & Formatting)

The project uses Biome (`@biomejs/biome: 2.3.13`) for both linting and formatting, replacing ESLint and Prettier. Configuration lives in `biome.json` at the project root.

| Command | Action | When to Use |
|---|---|---|
| `npm run lint` | Check for issues without modifying files | Before committing; in CI |
| `npm run lint:fix` | Auto-fix linting issues | During development |
| `npm run format` | Format all files in place | Before committing |

Biome provides platform-specific native binaries via optional dependencies (`@biomejs/cli-*`), enabling fast linting and formatting without a Node.js runtime overhead.

### TypeScript

TypeScript (`^5.2.2`) is used across both the main process (`electron/`) and renderer (`src/`). The compilation strategy differs between development and production:

| Mode | TypeScript Handling | Command |
|---|---|---|
| **Development** (`npm run dev`) | Vite transpiles TypeScript on-the-fly via esbuild; no type checking | Fast iteration |
| **Production** (`npm run build`) | `tsc` runs first to type-check, then Vite bundles | `tsc && vite build` |

Type definitions for Electron are provided by the `electron` dev dependency, which includes `@types/node` internally. React types come from `@types/react` and `@types/react-dom`.

## Common Development Tasks

### Accessing Electron APIs from Renderer

The preload script (`electron/preload.ts`) exposes a whitelist of IPC methods to the renderer via `contextBridge.exposeInMainWorld('electronAPI', ...)`. In the renderer, access these via `window.electronAPI`:

```typescript
// Example: Open source selector
await window.electronAPI.openSourceSelector();

// Example: Save recording
await window.electronAPI.storeRecordedVideo(blob, cursorData);
```

All available methods are typed in `electron/ipc/types.ts` and exposed through the preload script.

### Debugging the Main Process

During development, you can attach a debugger to the main process:

1. Add `--inspect=5858` to the Electron launch in `vite.config.ts` (under `vite-plugin-electron` options)
2. Open `chrome://inspect` in Chrome
3. Click "inspect" next to the remote target

Alternatively, use `console.log()` in main process code — output appears in the terminal where you ran `npm run dev`.

### Working with IPC Handlers

To add a new IPC handler:

1. Define the method signature in `electron/ipc/types.ts` (in the `ElectronAPI` interface)
2. Implement the handler in `electron/ipc/handlers.ts` (inside `registerIpcHandlers()`)
3. Expose it in `electron/preload.ts` (in the `electronAPI` object passed to `contextBridge.exposeInMainWorld()`)
4. Call it from the renderer via `window.electronAPI.yourMethod()`

### Hot Reload Behavior

| File Type | Change Detection | Reload Behavior |
|---|---|---|
| `src/**/*.tsx`, `src/**/*.ts` | Vite HMR | Instant UI update; state preserved when possible |
| `electron/main.ts`, `electron/windows.ts` | `vite-plugin-electron` watcher | Full Electron restart |
| `electron/preload.ts` | `vite-plugin-electron` watcher | Full Electron restart |
| `electron/ipc/*.ts` | `vite-plugin-electron` watcher | Full Electron restart |
| `public/**/*` | Vite static file watcher | Copy to dev server; no restart |

## Testing

Tests run with Vitest (`^4.0.16`), which is Vite-compatible and shares the same configuration context as the build system. Vitest reuses the `vite.config.ts` settings for module resolution and TypeScript handling.

```bash
npm test          # single run, exits after completion
npm run test:watch # watch mode, re-runs on file changes
```

The test suite also uses `fast-check` (`^4.5.2`) for property-based testing, particularly useful for testing complex region calculations and timeline logic.

### Test File Locations

Tests should be placed adjacent to the code they test with a `.test.ts` or `.test.tsx` suffix:

```
src/
├── components/
│   ├── VideoEditor.tsx
│   └── VideoEditor.test.tsx  ← Test file
└── lib/
    ├── utils.ts
    └── utils.test.ts         ← Test file
```

Vitest automatically discovers test files matching the pattern `**/*.{test,spec}.{ts,tsx}`.

## Dependency Overview

Dependencies are split into two groups in `package.json`:

### Runtime Dependencies

| Category | Packages |
|---|---|
| UI framework | `react`, `react-dom`, Radix UI primitives |
| Canvas/rendering | `pixi.js`, `@pixi/filter-drop-shadow` |
| Media processing | `web-demuxer`, `mp4box`, `mediabunny`, `gif.js`, `fix-webm-duration` |
| Timeline | `dnd-timeline` |
| Animation | `gsap`, `motion` |
| Utilities | `uuid`, `clsx`, `tailwind-merge`, `lucide-react` |

### Dev Dependencies

| Package | Role |
|---|---|
| `electron` (^39.2.7) | Electron runtime for development |
| `vite` (^5.1.6) | Dev server and bundler |
| `vite-plugin-electron` (^0.28.6) | Integrates Electron main process into Vite |
| `vite-plugin-electron-renderer` (^0.14.5) | Renderer-side Electron integration |
| `electron-builder` (^26.7.0) | Cross-platform packaging |
| `typescript` (^5.2.2) | TypeScript compiler |
| `@biomejs/biome` (2.3.13) | Linting and formatting |
| `vitest` (^4.0.16) | Test runner |
| `tailwindcss` (^3.4.18) | Utility CSS framework |
