# Installation & Setup

## Purpose and Scope

This page provides detailed instructions for installing OpenScreen on macOS, Windows, and Linux operating systems. It covers downloading pre-built binaries from GitHub Releases, handling platform-specific installation procedures, and configuring necessary system permissions for screen recording and accessibility features.

For setting up a development environment to build OpenScreen from source, see Development Environment. For information about the automated build pipeline that creates these installers, see CI/CD Pipeline.

## System Requirements

OpenScreen requires the following minimum system specifications:

| Platform | Requirements |
|---|---|
| **macOS** | macOS 10.15 (Catalina) or later; x64 or arm64 architecture |
| **Windows** | Windows 10 or later; 64-bit processor |
| **Linux** | Ubuntu 18.04 or later (or equivalent); FUSE support for AppImage |
| **All Platforms** | Minimum 4GB RAM; Hardware graphics acceleration support |

## Download Locations

## Binary Distribution Strategy

OpenScreen distributes pre-built installers through GitHub Releases. The build system generates platform-specific artifacts using electron-builder as defined in the CI/CD workflow.

### Artifact Naming Conventions

The artifact names follow patterns defined in `electron-builder.json5`:

- **macOS**: `${productName}-Mac-${arch}-${version}-Installer.${ext}`
- **Linux**: `${productName}-Linux-${version}.${ext}`
- **Windows**: Default NSIS naming convention

## macOS Installation

### Installation Procedure

1. Download the appropriate DMG file for your system architecture (x64 for Intel Macs, arm64 for Apple Silicon)
2. Open the downloaded `.dmg` file
3. Drag `Openscreen.app` to the Applications folder
4. The application is now installed but may be blocked by macOS Gatekeeper

### Gatekeeper Bypass

OpenScreen is not code-signed with an Apple Developer certificate, so macOS Gatekeeper will block the first launch. To bypass this restriction:

1. **Grant Terminal Full Disk Access**:
   - Navigate to System Settings > Privacy & Security > Full Disk Access
   - Add your terminal application (e.g., Terminal.app or iTerm.app)

2. **Remove Quarantine Attribute**:

3. **Navigate to Security Settings**:
   - Go to System Preferences > Security & Privacy
   - Authorize any prompts related to the application

### Required System Permissions

After installation, OpenScreen requires two critical permissions:

### Permission Types:

| Permission | Purpose | Prompt Timing |
|---|---|---|
| **Screen Recording** | Enables `desktopCapturer` API to list and capture windows/screens | First attempt to select recording source |
| **Accessibility** | Allows monitoring of cursor position and system events | First recording attempt |

## Windows Installation

### Installation Procedure

1. Download the `.exe` installer from GitHub Releases
2. Run the installer executable
3. Windows SmartScreen may display a warning; click "More info" and then "Run anyway"
4. Follow the installation wizard prompts
5. The application installs to `C:\Users\{Username}\AppData\Local\Programs\openscreen` by default

### NSIS Installer Configuration

The Windows installer uses NSIS (Nullsoft Scriptable Install System) as configured in `electron-builder.json5`:

The installer automatically:

- Creates a desktop shortcut
- Adds an uninstaller entry in Windows Settings
- Registers file associations for `.openscreen` project files

## Linux Installation

### AppImage Installation

OpenScreen distributes as an AppImage for maximum compatibility across Linux distributions.

1. Download the `.AppImage` file from GitHub Releases
2. Make the file executable:
3. Run the AppImage:

### Sandbox Compatibility Issues

Some Linux environments may encounter sandbox errors due to kernel namespace restrictions. If the application fails to launch with a sandbox-related error:

**Warning**: Running with `--no-sandbox` reduces security isolation. Only use this flag if the standard launch fails.

### Desktop Integration

For improved user experience, integrate the AppImage with your desktop environment:

### Permission Requirements

Linux permission requirements vary by desktop environment:

| Desktop Environment | Permission Configuration |
|---|---|
| **GNOME/Ubuntu** | Settings > Privacy > Screen Sharing |
| **KDE Plasma** | System Settings > Applications > Screen Capturing |
| **Wayland Sessions** | May require `xdg-desktop-portal` with appropriate backend |

## Post-Installation Verification

### Launch Verification Workflow

### Verify Installation Success

After installation, confirm OpenScreen is functioning correctly:

1. **Application Launches**: The HUD overlay window appears on first launch
2. **Source Selection**: Clicking "Select Source" opens the source selector dialog
3. **Permission Status**: No permission errors appear in the console or UI
4. **Recording Directory**: Check that the recordings directory exists:
   - macOS: `~/Library/Application Support/Openscreen/recordings`
   - Windows: `%APPDATA%\Openscreen\recordings`
   - Linux: `~/.config/Openscreen/recordings`

## Troubleshooting Common Issues

### macOS: "App is damaged and can't be opened"

This error indicates the quarantine attribute is still set.

### Windows: SmartScreen Filter Block

Windows Defender SmartScreen may block unsigned applications:

1. Click "More info" on the warning dialog
2. Select "Run anyway"
3. If the option is unavailable, check Windows security settings to ensure SmartScreen is not set to maximum protection

### Linux: FUSE Not Available

AppImages require FUSE to mount.

### All Platforms: Black Screen During Recording

If the preview or recording shows a black screen:

1. Verify screen recording permissions are granted
2. Check that hardware acceleration is enabled in the system
3. Try selecting a different recording source
4. On Linux with Wayland, ensure `xdg-desktop-portal-wlr` or equivalent is installed

## Uninstallation

### macOS

### Windows

- Use "Add or Remove Programs" in Windows Settings
- Or run the uninstaller from `C:\Users\{Username}\AppData\Local\Programs\openscreen\Uninstall Openscreen.exe`

### Linux
