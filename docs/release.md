# Release Guide

This repository publishes installers from GitHub Actions when a version tag is pushed.

## Targets

- Windows `ia32` via NSIS
- macOS `arm64` via DMG and ZIP

## Trigger a release

1. Update `package.json` version if needed.
2. Commit and push your changes to `main`.
3. Create a version tag that matches the package version.

```bash
git tag v0.1.0
git push origin v0.1.0
```

4. GitHub Actions will:
   - run typecheck and tests on Ubuntu
   - build and publish `win-ia32`
   - build and publish `mac-arm64`

## Local packaging

Build macOS ARM64 locally:

```bash
npm run dist:mac:arm64
```

Build Windows IA32 locally on a Windows machine:

```bash
npm run dist:win:ia32
```

Artifacts are written to the `release/` directory.

## Notes

- macOS builds are currently unsigned.
- Windows installers are currently unsigned.
- If by `winx86` you actually mean 64-bit Windows, change the target arch from `ia32` to `x64`.
