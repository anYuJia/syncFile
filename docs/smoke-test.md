# Phase 1 Smoke Test

## Single-Machine Loopback

1. Start the app with `npm run dev`.
2. Open a second instance.
   On macOS packaged builds, use `open -n`.
   In development, launch a second copy from another working tree or packaged app.
3. Confirm both instances discover each other in the device list.
4. Drag a test file from one instance to the other.
5. Accept the incoming offer in the receiver window.
6. Confirm the file appears in the sandbox directory from the `Open Sandbox` action.

## Two-Machine LAN Test

1. Run the app on Machine A.
2. Run the app on Machine B.
3. Put both machines on the same Wi-Fi or wired LAN.
4. Verify mutual discovery within a few seconds.
5. Send a file around 100 MB from A to B and observe progress updates.
6. Verify file integrity with SHA256 on both sides.
   macOS: `shasum -a 256 <file>`
   Linux: `sha256sum <file>`
   Windows: `certutil -hashfile <file> SHA256`

## Regression Checklist

- `file-offer` arrives before any file bytes flow.
- Rejecting an offer surfaces a sender-side error state.
- Files land under the sandbox root in a per-device subdirectory.
- Sender progress reaches 100% and receiver shows a completed transfer.
