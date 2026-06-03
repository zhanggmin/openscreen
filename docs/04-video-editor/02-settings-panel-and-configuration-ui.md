# SettingsPanel & Configuration UI

## Overview

The `SettingsPanel` component (`src/components/SettingsPanel.tsx`) is the primary interface for configuring visual effects, background options, crop settings, and export parameters. It organizes controls into collapsible sections and provides real-time preview of changes via the `VideoPlayback` canvas.

## Panel Sections

### Section: Effects

Controls all visual effects applied to the video layer.

| Control | Type | State Field | Effect |
|---|---|---|---|
| Blur | Slider | `blur` | Gaussian blur on video (0-20px) |
| Shadow | Toggle + sliders | `shadowEnabled`, `shadowColor`, `shadowOffsetX/Y`, `shadowBlur` | Drop shadow behind video |
| Scale | Slider | `scale` | Video scale factor (0.5x to 2x) |
| Padding | Slider | `padding` | Padding around video (0-200px) |
| Corner Radius | Slider | `cornerRadius` | Rounded corners on video (0-100px) |

All controls update state immediately, and the `VideoPlayback` canvas reflects changes in real time.

### Section: Background

Controls what appears behind the video (solid color, gradient, or image).

| Control | Type | State Field |
|---|---|---|
| Background Type | Radio group | `backgroundType` (one of `'solid'`, `'gradient'`, `'image'`) |
| Color Picker (Solid) | Color picker | `backgroundColor` |
| Gradient Stops (Gradient) | Multi-stop editor | `backgroundGradientStops` |
| Image Picker (Image) | File button | `backgroundImagePath` |

### Section: Crop

Provides interactive cropping with aspect ratio presets.

| Control | Type | State Field |
|---|---|---|
| Enable Crop | Toggle | `cropEnabled` |
| Aspect Ratio | Preset buttons + custom | `aspectRatioPreset` |
| Crop Rectangle | Draggable handles | `cropRect` (x, y, width, height in video space) |

### Section: Export

Configures output format and quality.

| Control | Type | State Field | Options |
|---|---|---|---|
| Format | Dropdown | `exportFormat` | `'mp4'`, `'gif'` |
| Resolution | Dropdown | `exportResolution` | `'original'`, `'1080p'`, `'720p'`, `'480p'` |
| Quality | Slider | `exportQuality` | 0-100 (maps to bitrate/CRF) |
| Export Button | Button | n/a | Triggers export pipeline |

## Real-Time Preview Architecture

### State → Canvas Pipeline

1. User adjusts a slider in `SettingsPanel`
2. `SettingsPanel` calls the corresponding callback (e.g., `onBlurChange(newValue)`)
3. `VideoEditor` updates its state
4. New state flows down to `VideoPlayback` as props
5. `VideoPlayback` updates Pixi.js filters/shaders on next frame

### No Debounce

Changes are applied immediately without debouncing, providing instant feedback. The Pixi.js rendering pipeline is optimized enough to handle this comfortably.

## Persistence of Settings

### Project File Inclusion

All settings (effects, background, crop, export) are saved into the `.openscreen` project file when the user saves the project. Loading a project restores all settings.

### Defaults

When no project is loaded (or for a new recording), defaults are applied:

| Setting | Default |
|---|---|
| Blur | 0 |
| Shadow | off |
| Scale | 1 |
| Padding | 0 |
| Corner Radius | 0 |
| Background | solid white |
| Crop | off |
| Export Format | `'mp4'` |
| Export Resolution | `'original'` |
| Export Quality | 80 |

## Accessibility Considerations

The `SettingsPanel` uses Radix UI primitives under the hood (e.g., `@radix-ui/react-slider`, `@radix-ui/react-tabs`), which provide good keyboard navigation and screen reader support out of the box.

| Feature | Implementation |
|---|---|
| Keyboard navigation | Tab through controls; arrow keys for sliders; space/enter to toggle |
| Labels | All controls have visible labels; screen-reader-only labels where needed |
| Focus indicators | Clear focus rings on interactive elements |

## Relevant Files

| File | Role |
|---|---|
| `src/components/SettingsPanel.tsx` | Main settings UI component |
