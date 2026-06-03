# OpenScreen Documentation

Welcome to the complete documentation for OpenScreen, an open-source desktop screen recorder and video editor built on Electron.

## Overview

OpenScreen is a free, open-source alternative to commercial screen recording tools. It provides:

- Screen and window recording
- Timeline-based editing with zoom regions
- Visual effects (blur, shadow, crop, etc.)
- MP4 and GIF export
- Cursor telemetry for smart zoom suggestions

## Table of Contents

### Getting Started
- [Overview](./01-overview.md) - Introduction to OpenScreen
- [Getting Started](./01-getting-started/01-getting-started.md) - Quick start guide
- [Installation & Setup](./01-getting-started/02-installation-and-setup.md) - Platform-specific installation
- [Development Environment](./01-getting-started/03-development-environment.md) - Setting up for development

### Architecture
- [IPC Communication System](./02-architecture/01-ipc-communication-system.md) - How main and renderer processes communicate
- [Window Management & Routing](./02-architecture/02-window-management-and-routing.md) - Application windows and navigation

### Recording
- [Screen Recording System](./03-recording/01-screen-recording-system.md) - Video capture pipeline
- [Recording Workflow & Controls](./03-recording/02-recording-workflow-and-controls.md) - User workflow for recording
- [Cursor Telemetry System](./03-recording/03-cursor-telemetry-system.md) - Cursor position tracking

### Video Editor
- [VideoEditor Component & State Management](./04-video-editor/01-video-editor-component-and-state-management.md) - Core editor component
- [SettingsPanel & Configuration UI](./04-video-editor/02-settings-panel-and-configuration-ui.md) - Effect controls
- [Video Playback System](./04-video-editor/03-video-playback-system.md) - Pixi.js rendering

### Export
- [Export Pipeline Architecture](./05-export/01-export-pipeline-architecture.md) - MP4 and GIF export pipeline

### Additional Documentation
- [Testing - Windows Native Cursor](./testing/windows-native-cursor.md)
- [Engineering - Windows Native Recorder Roadmap](./engineering/windows-native-recorder-roadmap.md)
- [Engineering - macOS Native Recorder Roadmap](./engineering/macos-native-recorder-roadmap.md)
- [Architecture - Native Bridge](./architecture/native-bridge.md)
- [Tests - Writing Tests](./tests/writing-tests.md)

## Technology Stack

- **Electron** - Desktop application framework
- **React** - UI library
- **Pixi.js** - GPU-accelerated rendering
- **WebCodecs** - Video encoding/decoding
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Biome** - Linting and formatting

## Project Structure

```
openscreen/
├── docs/              # This documentation
├── electron/          # Main process code
│   ├── main.ts        # App entry point
│   ├── windows.ts     # Window management
│   ├── preload.ts     # Context bridge
│   └── ipc/           # IPC handlers
├── src/               # Renderer process code
│   ├── components/    # React components
│   ├── hooks/         # Custom hooks
│   ├── lib/           # Utilities and exporters
│   └── types.ts       # Type definitions
├── public/            # Static assets
└── package.json       # Dependencies and scripts
```

## License

OpenScreen is open-source software. Please refer to the project's LICENSE file for details.
