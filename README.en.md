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

`syncFile` is a LAN P2P file transfer tool built with Electron and TypeScript.

The product goal is simple:

- zero-account, zero-server setup
- automatic device discovery on the same LAN
- drag-and-drop sending
- manual confirmation on the receiver side
- sandboxed file storage by default

The current repository already implements the Phase 1 MVP path:

- mDNS peer discovery
- direct TCP file transfer
- Electron main / preload / renderer integration
- React desktop UI
- GitHub Actions based release publishing

---

## Highlights

| Capability | Details |
| --- | --- |
| Zero-config discovery | Device discovery via `bonjour-service` |
| Direct transfer | Plain TCP built on Node `net` |
| Safe by default | Manual receive confirmation and sandboxed storage |
| Type-safe | Shared TypeScript contracts across processes |
| Testable core | Vitest coverage for transport-critical modules |
| Releasable | GitHub Actions + `electron-builder` pipeline included |

---

## Current Release Targets

The current CI publishes:

- macOS `arm64`
- Windows `ia32`

Release assets are published to:

- [GitHub Releases](https://github.com/anYuJia/syncFile/releases)

Notes:

- macOS packages are currently unsigned
- Windows installers are currently unsigned
- if by "Windows x86" you actually mean 64-bit Windows, switch the target arch from `ia32` to `x64`

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
npm run dist:mac:arm64
npm run dist:win:ia32
```

---

## Release Flow

GitHub Actions is already wired for automated releases.

When you push a tag like `v0.0.1`, the workflow will run:

1. `typecheck`
2. `test`
3. Windows `ia32` build and publish
4. macOS `arm64` build and publish

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
      IPC
        |
Main Process
  |- mDNS Discovery
  |- Device Registry
  |- TCP Server / Client
  |- Protocol Codec
  |- Sandbox Storage
```

Core directories:

- `src/main`: discovery, transfer, storage, IPC, app entry
- `src/preload`: secure API bridge
- `src/renderer`: React UI
- `src/shared`: shared types and IPC channels

Design reference:

- [docs/design.md](./docs/design.md)

---

## Project Status

Current milestone: `Phase 1 MVP`

Implemented:

- LAN discovery
- single-file transfer
- manual receive confirmation
- sandbox file persistence
- basic transfer activity UI
- baseline release automation

Not implemented yet:

- resume / breakpoint transfer
- file hash verification
- trusted device pairing
- bandwidth limiting
- WebRTC / internet transfer

---

## Test Coverage

Current tests focus on the transport-critical layer:

- `codec`
- `sandbox`
- `tcp-server`
- `tcp-client`

Run:

```bash
npm test
```

---

## Stack

- Electron
- React 18
- TypeScript
- electron-vite
- Vitest
- bonjour-service
- electron-builder

---

## License

MIT
