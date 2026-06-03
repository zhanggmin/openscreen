# Getting Started

## What is OpenScreen?

OpenScreen is a desktop screen recording and video editing application built on Electron. It lets users record a screen or application window, then edit the recording with zooms, crops, annotations, and background effects before exporting to MP4 or GIF.

The application runs as a single Electron process pair: a **main process** (Node.js) that manages windows, handles IPC, and writes files, and a **renderer process** (Chromium + React) that renders the UI. Three distinct window types are served from the same renderer bundle, selected via a URL query parameter (`windowType`).

## Prerequisites at a Glance

### End Users

No prerequisites beyond a supported operating system. Download the appropriate artifact from the GitHub Releases page.

| Platform | Artifact | Notes |
|---|---|---|
| macOS (x64 + arm64) | `.dmg` | Requires Gatekeeper bypass and Screen Recording permission |
| Linux | `.AppImage` | May require `--no-sandbox` flag on some distributions |
| Windows | NSIS `.exe` | Standard installer |

### Developers

| Requirement | Notes |
|---|---|
| Node.js | Version compatible with `electron` and `vite` (see `package.json` `engines` field) |
| npm | Used for all scripts (`dev`, `build`, `lint`, `test`) |
| Git | To clone the repository |
| Python | Required by some native build steps in the CI pipeline |

## Two Entry Points

| Goal | Path | Details |
|---|---|---|
| Install and use OpenScreen | Download release artifact for your platform | See Installation & Setup |
| Build and run from source | Clone repo, install Node.js dependencies, run `npm run dev` | See Development Environment |

## Project Structure Overview

The repository has a clear separation between the Electron main-process code and the React renderer code.

```
openscreen/
├── electron/          ← Main process (Node.js, not bundled by Vite for renderer)
│   ├── main.ts       ← App entry, tray, window lifecycle
│   ├── windows.ts    ← BrowserWindow factory functions
│   ├── preload.ts    ← contextBridge exposing window.electronAPI
│   └── ipc/
│       └── handlers.ts ← All ipcMain.handle() registrations
├── src/              ← Renderer process (React + TypeScript)
│   ├── App.tsx       ← Root component, window type routing
│   ├── components/   ← Window-level and shared components
│   └── lib/         ← Exporter, utilities, type definitions
├── public/
│   └── wallpapers/  ← Bundled wallpaper assets (extraResources in electron-builder)
├── vite.config.ts   ← Build configuration (includes vite-plugin-electron)
├── electron-builder.json5 ← Platform packaging configuration
└── package.json     ← Scripts, dependencies
```

## Next Steps

| Page | Purpose |
|---|---|
| Installation & Setup | Platform-specific installation, Gatekeeper bypass, permission grants, sandbox workarounds |
| Development Environment | Cloning, `npm install`, `npm run dev`, understanding the Vite + Electron build pipeline |
| Architecture Overview | How the main/renderer process split works, IPC channels, window routing |
