<div align="center">

# syncFile

A LAN-first, cross-platform file transfer app.  
Think AirDrop-style flow, built for macOS and Windows.

[![Release](https://github.com/anYuJia/syncFile/actions/workflows/release.yml/badge.svg)](https://github.com/anYuJia/syncFile/actions/workflows/release.yml)
[![Latest Release](https://img.shields.io/github/v/release/anYuJia/syncFile?display_name=tag)](https://github.com/anYuJia/syncFile/releases)
[![License](https://img.shields.io/badge/license-MIT-1f6feb.svg)](./package.json)

[中文](./README.md) | English

</div>

---

## Overview

`syncFile` is a LAN P2P file transfer tool built with Tauri, Rust, and React.

The product goal is simple:

- zero-account, zero-server setup
- automatic device discovery on the same LAN
- drag-and-drop sending
- manual confirmation on the receiver side
- sandboxed file storage by default

The current repository already implements the core LAN transfer path:

- mDNS peer discovery
- direct TCP file transfer
- Tauri command/event integration with the React renderer
- secure handshake and trusted device pairing
- transfer history, pause, cancel, and recovery cache
- React desktop UI
- GitHub Actions based release publishing

---

## Highlights

| Capability | Details |
| --- | --- |
| Zero-config discovery | Device discovery via mDNS |
| Direct transfer | LAN TCP transfer implemented in Rust |
| Safe by default | Manual receive confirmation, sandboxed storage, and peer identity checks |
| Trusted pairing | Devices can pair and identify peers by fingerprint and public key |
| Cross-platform desktop | Tauri provides the native shell, React handles the UI |
| Releasable | GitHub Actions builds multi-platform packages |

---

## Current Release Targets

The current CI publishes:

- macOS `arm64` / `x64` DMG
- Windows `x64` / `x86` / `arm64` installers and portable builds
- Linux `x64` AppImage / DEB

Release assets are published to:

- [GitHub Releases](https://github.com/anYuJia/syncFile/releases)

Notes:

- macOS packages are currently unsigned
- Windows installers are currently unsigned
- Linux builds depend on the target distribution's WebKitGTK support

---

## Quick Start

### Option 1: Download a release build

1. Open [Releases](https://github.com/anYuJia/syncFile/releases)
2. Download the package for your platform
3. Launch the app on two machines in the same LAN
4. Pick a target device and drag a file into the drop zone

#### ⚠️ Bypassing Unsigned App Warnings

Since the app is currently unsigned, you may see security warnings on first launch:

**macOS:**

If you see "syncFile is damaged and can't be opened", run this in Terminal:

```bash
xattr -cr /Applications/syncFile.app
```

Or right-click the app → Open → Click "Open" when prompted.

**Windows:**

If SmartScreen blocks the app:

1. Click "More info"
2. Click "Run anyway"

### Option 2: Run from source

```bash
git clone https://github.com/anYuJia/syncFile.git
cd syncFile
npm install
npm run dev
```

---

## How It Works

### Basic send flow

1. Connect both devices to the same LAN
2. Launch `syncFile` on both machines
3. Wait for the peer to appear in the device list
4. Select the target device
5. Drop a file into the send area
6. Click `Accept` on the receiver side
7. Open the sandbox folder after the transfer completes

For a more complete test checklist:

- [docs/smoke-test.md](./docs/smoke-test.md)

---

## Development Commands

```bash
npm run dev
npm run build
npm run typecheck
npm test
```

Local packaging:

```bash
npm run build
```

---

## Release Flow

GitHub Actions is already wired for automated releases.

When you push a tag like `v0.0.1`, the workflow will run:

1. `typecheck`
2. `test`
3. Windows multi-architecture builds and publish
4. macOS multi-architecture builds and publish
5. Linux x64 builds and publish

Example:

```bash
git tag v0.0.1
git push origin v0.0.1
```

More details:

- [docs/release.md](./docs/release.md)

---

## Architecture

```text
Renderer (React UI)
        |
  Tauri commands/events
        |
Rust backend
  |- mDNS discovery
  |- Device registry
  |- TCP server / client
  |- Secure channel
  |- Sandbox storage
```

Core directories:

- `src-tauri/src`: discovery, transfer, security, storage, and Tauri commands
- `src/renderer`: React UI
- `src/shared`: renderer/shared TypeScript types

Design reference:

- [docs/design.md](./docs/design.md)

---

## Project Status

Current milestone: `Phase 2 usable build`

Implemented:

- LAN discovery
- single-file transfer
- manual receive confirmation
- sandbox file persistence
- trusted device pairing
- secure handshake
- recovery cache
- multi-platform release automation

Not implemented yet:

- bandwidth limiting
- WebRTC / internet transfer

---

## Test Coverage

Current tests focus on UI state helpers and Rust transport/storage/discovery modules:

- TypeScript renderer utilities
- Rust mDNS and TCP helpers
- Rust secure-channel helpers

Run:

```bash
npm test
```

---

## Stack

- Tauri 2
- Rust
- React 18
- TypeScript
- Vite
- Vitest
- Tokio
- mdns-sd

---

## License

MIT
