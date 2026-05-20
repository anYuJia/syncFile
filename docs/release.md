# Release Guide

This repository publishes Tauri installers from GitHub Actions when a version tag is pushed.

## Targets

- Windows `x64` / `x86` / `arm64` installers and portable builds
- macOS `arm64` / `x64` DMG builds
- Linux `x64` AppImage and DEB builds

## Trigger a release

1. Update the version in `package.json` and `src-tauri/tauri.conf.json` if needed.
2. Commit and push your changes to `main`.
3. Create a version tag that matches the package version.

```bash
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions will typecheck, run tests, then build and publish all configured Tauri artifacts.

## Local Packaging

Build the current platform locally:

```bash
npm run build
```

Artifacts are written under `src-tauri/target/release/bundle/`.

## Notes

- macOS builds are currently unsigned.
- Windows installers are currently unsigned.
- Linux builds require the target distribution's WebKitGTK dependencies.
