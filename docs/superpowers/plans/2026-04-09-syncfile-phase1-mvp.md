# syncFile Phase 1 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working LAN P2P file transfer MVP — drag a file in Device A, confirm in Device B, file lands in B's sandbox directory. macOS + Windows + Linux.

**Architecture:** Electron (main + preload + renderer) + mDNS for device discovery + plain TCP for file transfer + React UI. No signaling server, no WebRTC, no encryption (Phase 2+).

**Tech Stack:** Electron 30+, TypeScript 5+, electron-vite, React 18, bonjour-service (mDNS), Node `net` (TCP), Vitest.

**Reference:** See `docs/design.md` for full architectural rationale.

---

## File Structure

Files created in this plan (in order of creation):

**Configuration:**
- `package.json`
- `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`
- `electron.vite.config.ts`
- `vitest.config.ts`
- `.gitignore`

**Shared types:**
- `src/shared/types.ts` — shared type definitions for main/renderer IPC

**Main process — transfer layer (TDD):**
- `src/main/transfer/protocol.ts` — wire protocol message types
- `src/main/transfer/codec.ts` + test — length-prefixed JSON encoder/decoder
- `src/main/transfer/tcp-server.ts` + test — incoming TCP server
- `src/main/transfer/tcp-client.ts` + test — outgoing TCP client

**Main process — storage (TDD):**
- `src/main/storage/sandbox.ts` + test — sandbox path/filename management
- `src/main/storage/device-identity.ts` — persistent device ID

**Main process — discovery:**
- `src/main/discovery/mdns-service.ts` — bonjour publish/find
- `src/main/discovery/device-registry.ts` — in-memory online device map

**Main process — wiring:**
- `src/main/ipc/handlers.ts` — register IPC handlers
- `src/main/index.ts` — Electron main entry

**Preload:**
- `src/preload/index.ts` — expose SyncFileAPI

**Renderer:**
- `src/renderer/index.html`
- `src/renderer/src/main.tsx`
- `src/renderer/src/App.tsx`
- `src/renderer/src/App.css`
- `src/renderer/src/hooks/useSyncFile.ts`
- `src/renderer/src/components/DeviceList.tsx`
- `src/renderer/src/components/DropZone.tsx`
- `src/renderer/src/components/TransferList.tsx`
- `src/renderer/src/components/ReceivePrompt.tsx`

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `tsconfig.web.json`
- Create: `electron.vite.config.ts`
- Create: `vitest.config.ts`

- [ ] **Step 1: Initialize git**

```bash
cd /Users/pyu/code/tools/syncFile
git init
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
out/
dist/
.DS_Store
*.log
.vite/
```

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "syncfile",
  "version": "0.1.0",
  "description": "LAN P2P file transfer tool",
  "main": "./out/main/index.js",
  "author": "",
  "license": "MIT",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json"
  },
  "dependencies": {
    "bonjour-service": "^1.2.1"
  },
  "devDependencies": {
    "@electron-toolkit/preload": "^3.0.1",
    "@electron-toolkit/utils": "^3.0.0",
    "@types/node": "^20.11.30",
    "@types/react": "^18.2.73",
    "@types/react-dom": "^18.2.23",
    "@vitejs/plugin-react": "^4.2.1",
    "electron": "^30.0.0",
    "electron-vite": "^2.1.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "typescript": "^5.4.3",
    "vite": "^5.2.6",
    "vitest": "^1.4.0"
  }
}
```

- [ ] **Step 4: Create `tsconfig.json` (root)**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

- [ ] **Step 5: Create `tsconfig.node.json` (main + preload)**

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES2022",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "types": ["electron-vite/node", "node"],
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["src/shared/*"]
    }
  },
  "include": [
    "src/main/**/*",
    "src/preload/**/*",
    "src/shared/**/*",
    "electron.vite.config.ts",
    "vitest.config.ts"
  ]
}
```

- [ ] **Step 6: Create `tsconfig.web.json` (renderer)**

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["src/shared/*"],
      "@renderer/*": ["src/renderer/src/*"]
    }
  },
  "include": ["src/renderer/**/*", "src/shared/**/*", "src/preload/index.d.ts"]
}
```

- [ ] **Step 7: Create `electron.vite.config.ts`**

```typescript
import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()]
  }
});
```

- [ ] **Step 8: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/main/**/*.test.ts', 'src/shared/**/*.test.ts']
  },
  resolve: {
    alias: {
      '@shared': resolve('src/shared')
    }
  }
});
```

- [ ] **Step 9: Install dependencies**

Run: `npm install`
Expected: creates `node_modules/`, no errors. (`npm warn` is OK.)

- [ ] **Step 10: Verify typecheck passes (should fail — no source yet)**

Run: `npm run typecheck`
Expected: succeeds with "no files" or trivially passes.

- [ ] **Step 11: Commit**

```bash
git add .gitignore package.json package-lock.json tsconfig*.json electron.vite.config.ts vitest.config.ts
git commit -m "chore: scaffold electron-vite + typescript + vitest project"
```

---

## Task 2: Shared Types

**Files:**
- Create: `src/shared/types.ts`

- [ ] **Step 1: Create `src/shared/types.ts`**

```typescript
// Shared types between main and renderer processes.
// Keep this file pure — no runtime dependencies on Electron or Node.

export interface Device {
  deviceId: string;
  name: string;
  host: string;
  address: string; // resolved IP address
  port: number;
  platform: string;
  version: string;
}

export interface TransferId {
  value: string;
}

export type TransferDirection = 'send' | 'receive';

export type TransferStatus =
  | 'pending'
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'rejected';

export interface TransferProgress {
  transferId: string;
  direction: TransferDirection;
  fileName: string;
  fileSize: number;
  bytesTransferred: number;
  peerDeviceName: string;
  status: TransferStatus;
  error?: string;
}

export interface IncomingOffer {
  offerId: string;
  fromDevice: {
    deviceId: string;
    name: string;
  };
  fileName: string;
  fileSize: number;
  mimeType?: string;
  receivedAt: number;
}

export type RejectReason = 'user-declined' | 'too-large' | 'type-not-allowed';
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(shared): add IPC-boundary type definitions"
```

---

## Task 3: Wire Protocol Types

**Files:**
- Create: `src/main/transfer/protocol.ts`

- [ ] **Step 1: Create `src/main/transfer/protocol.ts`**

```typescript
// Wire-level protocol messages exchanged over TCP between devices.
// Version: 1

export const PROTOCOL_VERSION = 1 as const;

export interface FileOfferMessage {
  type: 'file-offer';
  version: typeof PROTOCOL_VERSION;
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType?: string;
  sha256?: string;
  fromDevice: {
    deviceId: string;
    name: string;
  };
}

export interface FileAcceptMessage {
  type: 'file-accept';
  fileId: string;
}

export interface FileRejectMessage {
  type: 'file-reject';
  fileId: string;
  reason: 'user-declined' | 'too-large' | 'type-not-allowed';
}

export interface FileCompleteMessage {
  type: 'file-complete';
  fileId: string;
  bytesSent: number;
}

export type ProtocolMessage =
  | FileOfferMessage
  | FileAcceptMessage
  | FileRejectMessage
  | FileCompleteMessage;

export function isFileOffer(msg: ProtocolMessage): msg is FileOfferMessage {
  return msg.type === 'file-offer';
}

export function isFileAccept(msg: ProtocolMessage): msg is FileAcceptMessage {
  return msg.type === 'file-accept';
}

export function isFileReject(msg: ProtocolMessage): msg is FileRejectMessage {
  return msg.type === 'file-reject';
}

export function isFileComplete(msg: ProtocolMessage): msg is FileCompleteMessage {
  return msg.type === 'file-complete';
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/transfer/protocol.ts
git commit -m "feat(transfer): define wire protocol message types"
```

---

## Task 4: Length-Prefixed JSON Codec (TDD)

**Files:**
- Create: `src/main/transfer/codec.test.ts`
- Create: `src/main/transfer/codec.ts`

- [ ] **Step 1: Write failing test for encoder**

Create `src/main/transfer/codec.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { encodeMessage, MessageDecoder } from './codec';

describe('encodeMessage', () => {
  it('prefixes the JSON payload with a 4-byte big-endian length', () => {
    const buf = encodeMessage({ type: 'file-accept', fileId: 'abc' });
    const length = buf.readUInt32BE(0);
    const json = buf.subarray(4).toString('utf8');
    expect(length).toBe(json.length);
    expect(JSON.parse(json)).toEqual({ type: 'file-accept', fileId: 'abc' });
  });

  it('encodes unicode correctly', () => {
    const buf = encodeMessage({
      type: 'file-offer',
      version: 1,
      fileId: 'id',
      fileName: '报告.pdf',
      fileSize: 10,
      fromDevice: { deviceId: 'd', name: '测试' }
    } as any);
    const length = buf.readUInt32BE(0);
    const payload = buf.subarray(4, 4 + length).toString('utf8');
    const parsed = JSON.parse(payload);
    expect(parsed.fileName).toBe('报告.pdf');
  });
});

describe('MessageDecoder', () => {
  it('decodes a single complete message', () => {
    const decoder = new MessageDecoder();
    const encoded = encodeMessage({ type: 'file-accept', fileId: 'x' });
    const messages = decoder.push(encoded);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ type: 'file-accept', fileId: 'x' });
  });

  it('handles a message split across multiple chunks', () => {
    const decoder = new MessageDecoder();
    const encoded = encodeMessage({ type: 'file-accept', fileId: 'split' });
    const m1 = decoder.push(encoded.subarray(0, 2));
    const m2 = decoder.push(encoded.subarray(2, 6));
    const m3 = decoder.push(encoded.subarray(6));
    expect(m1).toHaveLength(0);
    expect(m2).toHaveLength(0);
    expect(m3).toHaveLength(1);
    expect(m3[0]).toEqual({ type: 'file-accept', fileId: 'split' });
  });

  it('handles multiple messages in a single chunk', () => {
    const decoder = new MessageDecoder();
    const a = encodeMessage({ type: 'file-accept', fileId: 'a' });
    const b = encodeMessage({ type: 'file-accept', fileId: 'b' });
    const combined = Buffer.concat([a, b]);
    const messages = decoder.push(combined);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ type: 'file-accept', fileId: 'a' });
    expect(messages[1]).toEqual({ type: 'file-accept', fileId: 'b' });
  });

  it('returns any extra bytes after a message as raw data', () => {
    const decoder = new MessageDecoder();
    const msg = encodeMessage({ type: 'file-accept', fileId: 'x' });
    const payload = Buffer.from([1, 2, 3, 4]);
    const { messages, remainder } = decoder.pushWithRemainder(Buffer.concat([msg, payload]));
    expect(messages).toHaveLength(1);
    expect(remainder).toEqual(payload);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- codec`
Expected: FAIL — `Cannot find module './codec'`

- [ ] **Step 3: Implement `src/main/transfer/codec.ts`**

```typescript
import type { ProtocolMessage } from './protocol';

export function encodeMessage(msg: ProtocolMessage): Buffer {
  const json = Buffer.from(JSON.stringify(msg), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(json.length, 0);
  return Buffer.concat([header, json]);
}

export class MessageDecoder {
  private buffer: Buffer = Buffer.alloc(0);

  /**
   * Append bytes and return any complete messages decoded.
   * Remaining partial bytes are retained internally.
   */
  push(chunk: Buffer): ProtocolMessage[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    return this.drainMessages();
  }

  /**
   * Like push(), but also returns any remainder bytes that come
   * after the last complete message. Used when the stream switches
   * from control messages to raw file bytes.
   */
  pushWithRemainder(chunk: Buffer): { messages: ProtocolMessage[]; remainder: Buffer } {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages = this.drainMessages();
    const remainder = this.buffer;
    this.buffer = Buffer.alloc(0);
    return { messages, remainder };
  }

  private drainMessages(): ProtocolMessage[] {
    const out: ProtocolMessage[] = [];
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32BE(0);
      if (this.buffer.length < 4 + length) break;
      const json = this.buffer.subarray(4, 4 + length).toString('utf8');
      out.push(JSON.parse(json) as ProtocolMessage);
      this.buffer = this.buffer.subarray(4 + length);
    }
    return out;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- codec`
Expected: PASS, 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/main/transfer/codec.ts src/main/transfer/codec.test.ts
git commit -m "feat(transfer): length-prefixed JSON codec with streaming decoder"
```

---

## Task 5: Sandbox Storage (TDD)

**Files:**
- Create: `src/main/storage/sandbox.test.ts`
- Create: `src/main/storage/sandbox.ts`

- [ ] **Step 1: Write failing test**

Create `src/main/storage/sandbox.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Sandbox } from './sandbox';

describe('Sandbox', () => {
  let root: string;
  let sandbox: Sandbox;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'syncfile-test-'));
    sandbox = new Sandbox(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('creates the device subdirectory on first use', () => {
    const path = sandbox.pathForIncoming('device-1', 'hello.txt');
    writeFileSync(path, 'hi');
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, 'utf8')).toBe('hi');
  });

  it('isolates files per device', () => {
    const a = sandbox.pathForIncoming('device-a', 'report.pdf');
    const b = sandbox.pathForIncoming('device-b', 'report.pdf');
    expect(a).not.toBe(b);
    expect(a).toContain('device-a');
    expect(b).toContain('device-b');
  });

  it('prefixes filenames with a timestamp to avoid collisions', () => {
    const path = sandbox.pathForIncoming('d1', 'photo.jpg');
    const filename = path.split(/[\\/]/).pop() ?? '';
    expect(filename).toMatch(/^\d{8}_\d{6}_photo\.jpg$/);
  });

  it('sanitizes dangerous filename characters', () => {
    const path = sandbox.pathForIncoming('d1', '../../etc/passwd');
    expect(path).not.toContain('..');
    const filename = path.split(/[\\/]/).pop() ?? '';
    expect(filename).toContain('passwd');
    expect(filename).not.toContain('/');
  });

  it('returns the sandbox root for openSandbox', () => {
    expect(sandbox.rootPath()).toBe(root);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- sandbox`
Expected: FAIL — `Cannot find module './sandbox'`

- [ ] **Step 3: Implement `src/main/storage/sandbox.ts`**

```typescript
import { mkdirSync } from 'fs';
import { join, basename } from 'path';

export class Sandbox {
  constructor(private readonly root: string) {}

  rootPath(): string {
    return this.root;
  }

  pathForIncoming(deviceId: string, originalFileName: string): string {
    const safeDeviceId = sanitizeSegment(deviceId);
    const deviceDir = join(this.root, safeDeviceId);
    mkdirSync(deviceDir, { recursive: true });
    const safeName = sanitizeSegment(basename(originalFileName));
    const stamp = formatTimestamp(new Date());
    return join(deviceDir, `${stamp}_${safeName}`);
  }
}

function sanitizeSegment(input: string): string {
  // Strip path separators and leading dots so we can never escape the root.
  return input.replace(/[\\/\0]/g, '_').replace(/^\.+/, '') || 'unnamed';
}

function formatTimestamp(d: Date): string {
  const yyyy = d.getFullYear().toString();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- sandbox`
Expected: PASS, 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/main/storage/sandbox.ts src/main/storage/sandbox.test.ts
git commit -m "feat(storage): sandbox directory with per-device isolation"
```

---

## Task 6: Device Identity Persistence

**Files:**
- Create: `src/main/storage/device-identity.ts`

- [ ] **Step 1: Create `src/main/storage/device-identity.ts`**

```typescript
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';
import { hostname } from 'os';

export interface DeviceIdentity {
  deviceId: string;
  name: string;
}

/**
 * Loads the persisted device identity from `<userData>/identity.json`.
 * Generates a new one on first run.
 */
export function loadOrCreateIdentity(userDataDir: string): DeviceIdentity {
  const identityPath = join(userDataDir, 'identity.json');
  if (existsSync(identityPath)) {
    try {
      const raw = readFileSync(identityPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<DeviceIdentity>;
      if (parsed.deviceId && parsed.name) {
        return { deviceId: parsed.deviceId, name: parsed.name };
      }
    } catch {
      // fallthrough: regenerate
    }
  }
  const identity: DeviceIdentity = {
    deviceId: randomUUID(),
    name: hostname()
  };
  mkdirSync(dirname(identityPath), { recursive: true });
  writeFileSync(identityPath, JSON.stringify(identity, null, 2), 'utf8');
  return identity;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/storage/device-identity.ts
git commit -m "feat(storage): persist device identity (id + display name)"
```

---

## Task 7: TCP Server (TDD)

**Files:**
- Create: `src/main/transfer/tcp-server.test.ts`
- Create: `src/main/transfer/tcp-server.ts`

- [ ] **Step 1: Write failing test**

Create `src/main/transfer/tcp-server.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { connect } from 'net';
import { Sandbox } from '../storage/sandbox';
import { TcpServer } from './tcp-server';
import { encodeMessage } from './codec';
import type { FileOfferMessage } from './protocol';

describe('TcpServer', () => {
  let root: string;
  let sandbox: Sandbox;
  let server: TcpServer;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'syncfile-srv-'));
    sandbox = new Sandbox(root);
    server = new TcpServer({ sandbox });
  });

  afterEach(async () => {
    await server.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('emits an incoming offer and writes the file when accepted', async () => {
    const port = await server.listen(0);

    const offerPromise = new Promise<void>((resolve) => {
      server.on('incoming-offer', (offer, respond) => {
        expect(offer.fileName).toBe('hello.txt');
        expect(offer.fileSize).toBe(5);
        respond.accept();
        resolve();
      });
    });

    const completedPromise = new Promise<string>((resolve) => {
      server.on('transfer-complete', (info) => resolve(info.savedPath));
    });

    const sock = connect(port, '127.0.0.1');
    await new Promise<void>((res) => sock.once('connect', () => res()));

    const offer: FileOfferMessage = {
      type: 'file-offer',
      version: 1,
      fileId: 'f1',
      fileName: 'hello.txt',
      fileSize: 5,
      fromDevice: { deviceId: 'dev-a', name: 'A' }
    };
    sock.write(encodeMessage(offer));

    // Wait for accept to come back before sending file bytes
    await new Promise<void>((resolve) => {
      sock.once('data', () => resolve());
    });

    sock.write(Buffer.from('hello'));
    sock.write(
      encodeMessage({ type: 'file-complete', fileId: 'f1', bytesSent: 5 })
    );

    await offerPromise;
    const savedPath = await completedPromise;
    sock.end();

    expect(statSync(savedPath).size).toBe(5);
    expect(readFileSync(savedPath, 'utf8')).toBe('hello');
  });

  it('closes the connection when rejected', async () => {
    const port = await server.listen(0);

    server.on('incoming-offer', (_offer, respond) => {
      respond.reject('user-declined');
    });

    const sock = connect(port, '127.0.0.1');
    await new Promise<void>((res) => sock.once('connect', () => res()));

    sock.write(
      encodeMessage({
        type: 'file-offer',
        version: 1,
        fileId: 'f2',
        fileName: 'x.bin',
        fileSize: 10,
        fromDevice: { deviceId: 'dev-a', name: 'A' }
      })
    );

    const closed = await new Promise<boolean>((resolve) => {
      sock.once('close', () => resolve(true));
      setTimeout(() => resolve(false), 1000);
    });
    expect(closed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tcp-server`
Expected: FAIL — `Cannot find module './tcp-server'`

- [ ] **Step 3: Implement `src/main/transfer/tcp-server.ts`**

```typescript
import { createServer, type Server, type Socket } from 'net';
import { createWriteStream, type WriteStream } from 'fs';
import { EventEmitter } from 'events';
import type { Sandbox } from '../storage/sandbox';
import { MessageDecoder, encodeMessage } from './codec';
import {
  isFileOffer,
  isFileComplete,
  type FileOfferMessage
} from './protocol';

export interface TcpServerOptions {
  sandbox: Sandbox;
}

export interface IncomingOfferInfo {
  offerId: string; // server-assigned unique id (== fileId for now)
  fileName: string;
  fileSize: number;
  mimeType?: string;
  fromDevice: { deviceId: string; name: string };
}

export interface OfferResponder {
  accept(): void;
  reject(reason: 'user-declined' | 'too-large' | 'type-not-allowed'): void;
}

export interface TransferCompleteInfo {
  offerId: string;
  savedPath: string;
  bytesReceived: number;
  fromDevice: { deviceId: string; name: string };
}

export interface TcpServerEvents {
  'incoming-offer': (offer: IncomingOfferInfo, respond: OfferResponder) => void;
  'transfer-complete': (info: TransferCompleteInfo) => void;
  'transfer-error': (err: Error) => void;
}

export declare interface TcpServer {
  on<K extends keyof TcpServerEvents>(event: K, listener: TcpServerEvents[K]): this;
  emit<K extends keyof TcpServerEvents>(
    event: K,
    ...args: Parameters<TcpServerEvents[K]>
  ): boolean;
}

export class TcpServer extends EventEmitter {
  private server: Server;

  constructor(private readonly opts: TcpServerOptions) {
    super();
    this.server = createServer((sock) => this.handleSocket(sock));
  }

  listen(port = 43434): Promise<number> {
    return new Promise((resolve, reject) => {
      const onError = (err: Error) => {
        this.server.off('listening', onListening);
        reject(err);
      };
      const onListening = () => {
        this.server.off('error', onError);
        const addr = this.server.address();
        if (addr && typeof addr === 'object') resolve(addr.port);
        else reject(new Error('unexpected server address'));
      };
      this.server.once('error', onError);
      this.server.once('listening', onListening);
      this.server.listen(port);
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }

  private handleSocket(sock: Socket): void {
    const decoder = new MessageDecoder();
    let state: 'awaiting-offer' | 'awaiting-data' | 'finished' = 'awaiting-offer';
    let offer: FileOfferMessage | null = null;
    let writeStream: WriteStream | null = null;
    let savedPath: string | null = null;
    let bytesReceived = 0;

    const fail = (err: Error) => {
      this.emit('transfer-error', err);
      if (writeStream) writeStream.destroy();
      sock.destroy();
    };

    sock.on('data', (chunk) => {
      try {
        if (state === 'awaiting-offer') {
          const messages = decoder.push(chunk);
          if (messages.length === 0) return;
          const first = messages[0];
          if (!isFileOffer(first)) {
            fail(new Error('expected file-offer as first message'));
            return;
          }
          offer = first;
          this.emit(
            'incoming-offer',
            {
              offerId: offer.fileId,
              fileName: offer.fileName,
              fileSize: offer.fileSize,
              mimeType: offer.mimeType,
              fromDevice: offer.fromDevice
            },
            {
              accept: () => {
                if (!offer) return;
                sock.write(
                  encodeMessage({ type: 'file-accept', fileId: offer.fileId })
                );
                savedPath = this.opts.sandbox.pathForIncoming(
                  offer.fromDevice.deviceId,
                  offer.fileName
                );
                writeStream = createWriteStream(savedPath);
                state = 'awaiting-data';
              },
              reject: (reason) => {
                if (!offer) return;
                sock.write(
                  encodeMessage({
                    type: 'file-reject',
                    fileId: offer.fileId,
                    reason
                  })
                );
                sock.end();
                state = 'finished';
              }
            }
          );
        } else if (state === 'awaiting-data') {
          if (!offer || !writeStream || !savedPath) {
            fail(new Error('invalid state: awaiting-data without offer'));
            return;
          }
          const bytesNeeded = offer.fileSize - bytesReceived;
          if (chunk.length <= bytesNeeded) {
            writeStream.write(chunk);
            bytesReceived += chunk.length;
          } else {
            const fileSlice = chunk.subarray(0, bytesNeeded);
            const tail = chunk.subarray(bytesNeeded);
            writeStream.write(fileSlice);
            bytesReceived += fileSlice.length;
            // Tail should contain a file-complete message
            const messages = decoder.push(tail);
            for (const msg of messages) {
              if (isFileComplete(msg)) {
                writeStream.end(() => {
                  if (offer && savedPath) {
                    this.emit('transfer-complete', {
                      offerId: offer.fileId,
                      savedPath,
                      bytesReceived,
                      fromDevice: offer.fromDevice
                    });
                  }
                });
                state = 'finished';
              }
            }
          }
          if (state === 'awaiting-data' && bytesReceived >= offer.fileSize) {
            writeStream.end(() => {
              if (offer && savedPath) {
                this.emit('transfer-complete', {
                  offerId: offer.fileId,
                  savedPath,
                  bytesReceived,
                  fromDevice: offer.fromDevice
                });
              }
            });
            state = 'finished';
          }
        }
      } catch (err) {
        fail(err as Error);
      }
    });

    sock.on('error', (err) => this.emit('transfer-error', err));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tcp-server`
Expected: PASS, 2 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/main/transfer/tcp-server.ts src/main/transfer/tcp-server.test.ts
git commit -m "feat(transfer): TCP server receives file-offer and streams into sandbox"
```

---

## Task 8: TCP Client (TDD)

**Files:**
- Create: `src/main/transfer/tcp-client.test.ts`
- Create: `src/main/transfer/tcp-client.ts`

- [ ] **Step 1: Write failing test (uses real TcpServer as the peer)**

Create `src/main/transfer/tcp-client.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Sandbox } from '../storage/sandbox';
import { TcpServer } from './tcp-server';
import { TcpClient } from './tcp-client';

describe('TcpClient', () => {
  let root: string;
  let sandbox: Sandbox;
  let server: TcpServer;
  let port: number;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'syncfile-cli-'));
    sandbox = new Sandbox(root);
    server = new TcpServer({ sandbox });
    server.on('incoming-offer', (_offer, respond) => respond.accept());
    port = await server.listen(0);
  });

  afterEach(async () => {
    await server.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('sends a file end-to-end and reports progress', async () => {
    const srcPath = join(root, 'source.txt');
    writeFileSync(srcPath, 'hello world');

    const client = new TcpClient({
      selfDevice: { deviceId: 'client-device', name: 'Client' }
    });

    const progressEvents: number[] = [];
    client.on('progress', (p) => progressEvents.push(p.bytesTransferred));

    const savedPathPromise = new Promise<string>((resolve) => {
      server.on('transfer-complete', (info) => resolve(info.savedPath));
    });

    await client.sendFile({
      host: '127.0.0.1',
      port,
      filePath: srcPath
    });

    const savedPath = await savedPathPromise;
    expect(readFileSync(savedPath, 'utf8')).toBe('hello world');
    expect(progressEvents.length).toBeGreaterThan(0);
    expect(progressEvents[progressEvents.length - 1]).toBe(11);
  });

  it('rejects the promise if the peer declines the offer', async () => {
    server.removeAllListeners('incoming-offer');
    server.on('incoming-offer', (_offer, respond) => respond.reject('user-declined'));

    const srcPath = join(root, 'source2.txt');
    writeFileSync(srcPath, 'data');

    const client = new TcpClient({
      selfDevice: { deviceId: 'cli', name: 'cli' }
    });

    await expect(
      client.sendFile({ host: '127.0.0.1', port, filePath: srcPath })
    ).rejects.toThrow(/declined/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tcp-client`
Expected: FAIL — `Cannot find module './tcp-client'`

- [ ] **Step 3: Implement `src/main/transfer/tcp-client.ts`**

```typescript
import { connect, type Socket } from 'net';
import { createReadStream, statSync } from 'fs';
import { basename } from 'path';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { MessageDecoder, encodeMessage } from './codec';
import {
  isFileAccept,
  isFileReject,
  type FileOfferMessage
} from './protocol';

export interface TcpClientOptions {
  selfDevice: { deviceId: string; name: string };
}

export interface SendFileParams {
  host: string;
  port: number;
  filePath: string;
}

export interface ProgressEvent {
  fileId: string;
  bytesTransferred: number;
  totalBytes: number;
}

export declare interface TcpClient {
  on(event: 'progress', listener: (progress: ProgressEvent) => void): this;
  emit(event: 'progress', progress: ProgressEvent): boolean;
}

export class TcpClient extends EventEmitter {
  constructor(private readonly opts: TcpClientOptions) {
    super();
  }

  async sendFile(params: SendFileParams): Promise<void> {
    const { host, port, filePath } = params;
    const stats = statSync(filePath);
    const fileId = randomUUID();
    const fileName = basename(filePath);

    const sock = await openSocket(host, port);

    const decoder = new MessageDecoder();
    let acceptReceived = false;

    const response = new Promise<void>((resolve, reject) => {
      sock.on('data', (chunk) => {
        const messages = decoder.push(chunk);
        for (const msg of messages) {
          if (isFileAccept(msg) && msg.fileId === fileId) {
            acceptReceived = true;
            this.streamFile(sock, filePath, fileId, stats.size)
              .then(resolve)
              .catch(reject);
          } else if (isFileReject(msg) && msg.fileId === fileId) {
            reject(new Error(`peer declined: ${msg.reason}`));
            sock.destroy();
          }
        }
      });
      sock.on('error', reject);
      sock.on('close', () => {
        if (!acceptReceived) reject(new Error('peer closed before accept'));
      });
    });

    const offer: FileOfferMessage = {
      type: 'file-offer',
      version: 1,
      fileId,
      fileName,
      fileSize: stats.size,
      fromDevice: this.opts.selfDevice
    };
    sock.write(encodeMessage(offer));

    await response;
    sock.end();
  }

  private streamFile(
    sock: Socket,
    filePath: string,
    fileId: string,
    totalBytes: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const stream = createReadStream(filePath);
      let bytesTransferred = 0;

      stream.on('data', (chunk: Buffer) => {
        const ok = sock.write(chunk);
        bytesTransferred += chunk.length;
        this.emit('progress', { fileId, bytesTransferred, totalBytes });
        if (!ok) {
          stream.pause();
          sock.once('drain', () => stream.resume());
        }
      });
      stream.on('end', () => {
        sock.write(
          encodeMessage({ type: 'file-complete', fileId, bytesSent: bytesTransferred })
        );
        resolve();
      });
      stream.on('error', reject);
    });
  }
}

function openSocket(host: string, port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const sock = connect(port, host);
    sock.once('connect', () => resolve(sock));
    sock.once('error', reject);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tcp-client`
Expected: PASS, 2 tests passing.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: all tests pass (codec + sandbox + tcp-server + tcp-client).

- [ ] **Step 6: Commit**

```bash
git add src/main/transfer/tcp-client.ts src/main/transfer/tcp-client.test.ts
git commit -m "feat(transfer): TCP client sends files with backpressure-aware streaming"
```

---

## Task 9: Device Registry

**Files:**
- Create: `src/main/discovery/device-registry.ts`

- [ ] **Step 1: Create `src/main/discovery/device-registry.ts`**

```typescript
import { EventEmitter } from 'events';
import type { Device } from '../../shared/types';

export interface DeviceRegistryEvents {
  'device-online': (device: Device) => void;
  'device-offline': (deviceId: string) => void;
}

export declare interface DeviceRegistry {
  on<K extends keyof DeviceRegistryEvents>(
    event: K,
    listener: DeviceRegistryEvents[K]
  ): this;
  emit<K extends keyof DeviceRegistryEvents>(
    event: K,
    ...args: Parameters<DeviceRegistryEvents[K]>
  ): boolean;
}

export class DeviceRegistry extends EventEmitter {
  private devices = new Map<string, Device>();

  upsert(device: Device): void {
    const existing = this.devices.get(device.deviceId);
    this.devices.set(device.deviceId, device);
    if (!existing) {
      this.emit('device-online', device);
    }
  }

  remove(deviceId: string): void {
    if (this.devices.delete(deviceId)) {
      this.emit('device-offline', deviceId);
    }
  }

  list(): Device[] {
    return Array.from(this.devices.values());
  }

  clear(): void {
    const ids = Array.from(this.devices.keys());
    this.devices.clear();
    for (const id of ids) this.emit('device-offline', id);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/discovery/device-registry.ts
git commit -m "feat(discovery): in-memory device registry with online/offline events"
```

---

## Task 10: mDNS Discovery Service

**Files:**
- Create: `src/main/discovery/mdns-service.ts`

- [ ] **Step 1: Create `src/main/discovery/mdns-service.ts`**

```typescript
import { Bonjour, type Service, type Browser } from 'bonjour-service';
import type { DeviceRegistry } from './device-registry';
import type { Device } from '../../shared/types';

export const SERVICE_TYPE = 'syncfile';
const PROTOCOL_VERSION = '1';

export interface MdnsServiceOptions {
  registry: DeviceRegistry;
  self: {
    deviceId: string;
    name: string;
    port: number;
    platform: string;
  };
}

/**
 * Advertises this device on the LAN and tracks peers in the registry.
 */
export class MdnsService {
  private bonjour: Bonjour;
  private published?: Service;
  private browser?: Browser;

  constructor(private readonly opts: MdnsServiceOptions) {
    this.bonjour = new Bonjour();
  }

  start(): void {
    this.published = this.bonjour.publish({
      name: `${this.opts.self.name}-${this.opts.self.deviceId.slice(0, 8)}`,
      type: SERVICE_TYPE,
      port: this.opts.self.port,
      txt: {
        deviceId: this.opts.self.deviceId,
        displayName: this.opts.self.name,
        platform: this.opts.self.platform,
        version: PROTOCOL_VERSION
      }
    });

    this.browser = this.bonjour.find({ type: SERVICE_TYPE });

    this.browser.on('up', (svc) => {
      const device = this.serviceToDevice(svc);
      if (!device) return;
      if (device.deviceId === this.opts.self.deviceId) return; // ignore self
      this.opts.registry.upsert(device);
    });

    this.browser.on('down', (svc) => {
      const txt = svc.txt as Record<string, string> | undefined;
      const deviceId = txt?.deviceId;
      if (deviceId && deviceId !== this.opts.self.deviceId) {
        this.opts.registry.remove(deviceId);
      }
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.browser?.stop();
      if (this.published) {
        this.published.stop(() => {
          this.bonjour.destroy();
          resolve();
        });
      } else {
        this.bonjour.destroy();
        resolve();
      }
    });
  }

  private serviceToDevice(svc: Service): Device | null {
    const txt = svc.txt as Record<string, string> | undefined;
    if (!txt?.deviceId) return null;
    const address =
      svc.addresses?.find((a) => !a.includes(':')) ?? svc.addresses?.[0] ?? svc.host;
    return {
      deviceId: txt.deviceId,
      name: txt.displayName || svc.name,
      host: svc.host,
      address,
      port: svc.port,
      platform: txt.platform || 'unknown',
      version: txt.version || '1'
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/discovery/mdns-service.ts
git commit -m "feat(discovery): mDNS advertise + browse via bonjour-service"
```

---

## Task 11: IPC Channel Constants

**Files:**
- Create: `src/shared/ipc-channels.ts`

- [ ] **Step 1: Create `src/shared/ipc-channels.ts`**

```typescript
// Central list of all IPC channel names, kept in sync between
// main/preload/renderer to avoid stringly-typed mistakes.

export const IpcChannels = {
  // Renderer -> Main (invoke)
  GetDevices: 'syncfile:get-devices',
  GetSelfDevice: 'syncfile:get-self-device',
  SendFile: 'syncfile:send-file',
  AcceptIncoming: 'syncfile:accept-incoming',
  RejectIncoming: 'syncfile:reject-incoming',
  OpenSandbox: 'syncfile:open-sandbox',

  // Main -> Renderer (send)
  DeviceOnline: 'syncfile:device-online',
  DeviceOffline: 'syncfile:device-offline',
  TransferProgress: 'syncfile:transfer-progress',
  TransferComplete: 'syncfile:transfer-complete',
  IncomingOffer: 'syncfile:incoming-offer'
} as const;
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/ipc-channels.ts
git commit -m "feat(shared): centralize IPC channel names"
```

---

## Task 12: Main Process IPC Handlers

**Files:**
- Create: `src/main/ipc/handlers.ts`

- [ ] **Step 1: Create `src/main/ipc/handlers.ts`**

```typescript
import { ipcMain, BrowserWindow, shell } from 'electron';
import { randomUUID } from 'crypto';
import { IpcChannels } from '../../shared/ipc-channels';
import type {
  Device,
  IncomingOffer,
  TransferProgress,
  RejectReason
} from '../../shared/types';
import type { DeviceRegistry } from '../discovery/device-registry';
import type { TcpServer, IncomingOfferInfo, OfferResponder } from '../transfer/tcp-server';
import type { TcpClient } from '../transfer/tcp-client';
import type { Sandbox } from '../storage/sandbox';
import type { DeviceIdentity } from '../storage/device-identity';

export interface IpcContext {
  registry: DeviceRegistry;
  tcpServer: TcpServer;
  tcpClient: TcpClient;
  sandbox: Sandbox;
  identity: DeviceIdentity;
  getSelfDevice: () => Device;
  getWindow: () => BrowserWindow | null;
}

/**
 * Registers all IPC handlers. Must be called exactly once after
 * the main BrowserWindow is created.
 */
export function registerIpcHandlers(ctx: IpcContext): void {
  // Track pending incoming offers: offerId -> OfferResponder
  const pendingOffers = new Map<string, OfferResponder>();

  ipcMain.handle(IpcChannels.GetDevices, (): Device[] => {
    return ctx.registry.list();
  });

  ipcMain.handle(IpcChannels.GetSelfDevice, (): Device => {
    return ctx.getSelfDevice();
  });

  ipcMain.handle(
    IpcChannels.SendFile,
    async (_e, deviceId: string, filePath: string) => {
      const device = ctx.registry.list().find((d) => d.deviceId === deviceId);
      if (!device) throw new Error(`device ${deviceId} not found`);
      await ctx.tcpClient.sendFile({
        host: device.address,
        port: device.port,
        filePath
      });
    }
  );

  ipcMain.handle(IpcChannels.AcceptIncoming, (_e, offerId: string) => {
    const responder = pendingOffers.get(offerId);
    if (!responder) throw new Error(`offer ${offerId} not found`);
    responder.accept();
    pendingOffers.delete(offerId);
  });

  ipcMain.handle(
    IpcChannels.RejectIncoming,
    (_e, offerId: string, reason: RejectReason = 'user-declined') => {
      const responder = pendingOffers.get(offerId);
      if (!responder) return;
      responder.reject(reason);
      pendingOffers.delete(offerId);
    }
  );

  ipcMain.handle(IpcChannels.OpenSandbox, async () => {
    await shell.openPath(ctx.sandbox.rootPath());
  });

  // Main -> Renderer events
  const send = (channel: string, ...args: unknown[]) => {
    const win = ctx.getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, ...args);
    }
  };

  ctx.registry.on('device-online', (device: Device) => {
    send(IpcChannels.DeviceOnline, device);
  });
  ctx.registry.on('device-offline', (deviceId: string) => {
    send(IpcChannels.DeviceOffline, deviceId);
  });

  ctx.tcpServer.on('incoming-offer', (info: IncomingOfferInfo, respond) => {
    const offerId = info.offerId;
    pendingOffers.set(offerId, respond);
    const offer: IncomingOffer = {
      offerId,
      fromDevice: info.fromDevice,
      fileName: info.fileName,
      fileSize: info.fileSize,
      mimeType: info.mimeType,
      receivedAt: Date.now()
    };
    send(IpcChannels.IncomingOffer, offer);
  });

  ctx.tcpServer.on('transfer-complete', (info) => {
    const progress: TransferProgress = {
      transferId: info.offerId,
      direction: 'receive',
      fileName: info.savedPath.split(/[\\/]/).pop() ?? 'file',
      fileSize: info.bytesReceived,
      bytesTransferred: info.bytesReceived,
      peerDeviceName: info.fromDevice.name,
      status: 'completed'
    };
    send(IpcChannels.TransferComplete, progress);
  });

  ctx.tcpClient.on('progress', (p) => {
    const progress: TransferProgress = {
      transferId: p.fileId,
      direction: 'send',
      fileName: '',
      fileSize: p.totalBytes,
      bytesTransferred: p.bytesTransferred,
      peerDeviceName: '',
      status: p.bytesTransferred >= p.totalBytes ? 'completed' : 'in-progress'
    };
    send(IpcChannels.TransferProgress, progress);
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/ipc/handlers.ts
git commit -m "feat(ipc): register IPC handlers bridging transfer layer to renderer"
```

---

## Task 13: Main Process Entry

**Files:**
- Create: `src/main/index.ts`

- [ ] **Step 1: Create `src/main/index.ts`**

```typescript
import { app, BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { platform } from 'os';
import { loadOrCreateIdentity } from './storage/device-identity';
import { Sandbox } from './storage/sandbox';
import { DeviceRegistry } from './discovery/device-registry';
import { MdnsService } from './discovery/mdns-service';
import { TcpServer } from './transfer/tcp-server';
import { TcpClient } from './transfer/tcp-client';
import { registerIpcHandlers } from './ipc/handlers';
import type { Device } from '../shared/types';

const DEFAULT_TRANSFER_PORT = 43434;

let mainWindow: BrowserWindow | null = null;
let mdns: MdnsService | null = null;
let tcpServer: TcpServer | null = null;

async function createWindow(): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.on('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    await win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}

async function bootstrap(): Promise<void> {
  const userDataDir = app.getPath('userData');
  const identity = loadOrCreateIdentity(userDataDir);
  const sandbox = new Sandbox(join(userDataDir, 'sandbox'));
  const registry = new DeviceRegistry();

  tcpServer = new TcpServer({ sandbox });
  const actualPort = await tcpServer.listen(DEFAULT_TRANSFER_PORT).catch(async () => {
    // port in use — let OS assign one
    return (tcpServer as TcpServer).listen(0);
  });

  const tcpClient = new TcpClient({
    selfDevice: { deviceId: identity.deviceId, name: identity.name }
  });

  mdns = new MdnsService({
    registry,
    self: {
      deviceId: identity.deviceId,
      name: identity.name,
      port: actualPort,
      platform: platform()
    }
  });
  mdns.start();

  mainWindow = await createWindow();

  const getSelfDevice = (): Device => ({
    deviceId: identity.deviceId,
    name: identity.name,
    host: 'localhost',
    address: '127.0.0.1',
    port: actualPort,
    platform: platform(),
    version: '1'
  });

  registerIpcHandlers({
    registry,
    tcpServer,
    tcpClient,
    sandbox,
    identity,
    getSelfDevice,
    getWindow: () => mainWindow
  });
}

app.whenReady().then(bootstrap);

app.on('window-all-closed', async () => {
  if (mdns) await mdns.stop();
  if (tcpServer) await tcpServer.close();
  if (platform() !== 'darwin') app.quit();
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = await createWindow();
  }
});
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(main): wire discovery, transfer, and IPC on app startup"
```

---

## Task 14: Preload Script

**Files:**
- Create: `src/preload/index.ts`
- Create: `src/preload/index.d.ts`

- [ ] **Step 1: Create `src/preload/index.ts`**

```typescript
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IpcChannels } from '../shared/ipc-channels';
import type {
  Device,
  IncomingOffer,
  TransferProgress,
  RejectReason
} from '../shared/types';

const api = {
  getDevices: (): Promise<Device[]> => ipcRenderer.invoke(IpcChannels.GetDevices),
  getSelfDevice: (): Promise<Device> => ipcRenderer.invoke(IpcChannels.GetSelfDevice),

  sendFile: (deviceId: string, filePath: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.SendFile, deviceId, filePath),

  acceptIncoming: (offerId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.AcceptIncoming, offerId),
  rejectIncoming: (offerId: string, reason?: RejectReason): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.RejectIncoming, offerId, reason),

  openSandbox: (): Promise<void> => ipcRenderer.invoke(IpcChannels.OpenSandbox),

  onDeviceOnline(cb: (device: Device) => void): () => void {
    const listener = (_e: IpcRendererEvent, device: Device) => cb(device);
    ipcRenderer.on(IpcChannels.DeviceOnline, listener);
    return () => ipcRenderer.off(IpcChannels.DeviceOnline, listener);
  },
  onDeviceOffline(cb: (deviceId: string) => void): () => void {
    const listener = (_e: IpcRendererEvent, deviceId: string) => cb(deviceId);
    ipcRenderer.on(IpcChannels.DeviceOffline, listener);
    return () => ipcRenderer.off(IpcChannels.DeviceOffline, listener);
  },
  onIncomingOffer(cb: (offer: IncomingOffer) => void): () => void {
    const listener = (_e: IpcRendererEvent, offer: IncomingOffer) => cb(offer);
    ipcRenderer.on(IpcChannels.IncomingOffer, listener);
    return () => ipcRenderer.off(IpcChannels.IncomingOffer, listener);
  },
  onTransferProgress(cb: (progress: TransferProgress) => void): () => void {
    const listener = (_e: IpcRendererEvent, progress: TransferProgress) => cb(progress);
    ipcRenderer.on(IpcChannels.TransferProgress, listener);
    return () => ipcRenderer.off(IpcChannels.TransferProgress, listener);
  },
  onTransferComplete(cb: (progress: TransferProgress) => void): () => void {
    const listener = (_e: IpcRendererEvent, progress: TransferProgress) => cb(progress);
    ipcRenderer.on(IpcChannels.TransferComplete, listener);
    return () => ipcRenderer.off(IpcChannels.TransferComplete, listener);
  }
};

export type SyncFileAPI = typeof api;

contextBridge.exposeInMainWorld('syncFile', api);
```

- [ ] **Step 2: Create `src/preload/index.d.ts`**

```typescript
import type { SyncFileAPI } from './index';

declare global {
  interface Window {
    syncFile: SyncFileAPI;
  }
}

export {};
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts src/preload/index.d.ts
git commit -m "feat(preload): expose SyncFileAPI via contextBridge"
```

---

## Task 15: Renderer HTML + Entry

**Files:**
- Create: `src/renderer/index.html`
- Create: `src/renderer/src/main.tsx`

- [ ] **Step 1: Create `src/renderer/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>syncFile</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `src/renderer/src/main.tsx`**

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './App.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/index.html src/renderer/src/main.tsx
git commit -m "feat(renderer): react entry point"
```

---

## Task 16: React Hook — useSyncFile

**Files:**
- Create: `src/renderer/src/hooks/useSyncFile.ts`

- [ ] **Step 1: Create `src/renderer/src/hooks/useSyncFile.ts`**

```typescript
import { useEffect, useState, useCallback } from 'react';
import type {
  Device,
  IncomingOffer,
  TransferProgress
} from '../../../shared/types';

export interface SyncFileState {
  selfDevice: Device | null;
  devices: Device[];
  pendingOffers: IncomingOffer[];
  transfers: Map<string, TransferProgress>;
}

export function useSyncFile() {
  const [selfDevice, setSelfDevice] = useState<Device | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [pendingOffers, setPendingOffers] = useState<IncomingOffer[]>([]);
  const [transfers, setTransfers] = useState<Map<string, TransferProgress>>(
    new Map()
  );

  useEffect(() => {
    window.syncFile.getSelfDevice().then(setSelfDevice);
    window.syncFile.getDevices().then(setDevices);

    const offOnline = window.syncFile.onDeviceOnline((d) => {
      setDevices((prev) => {
        if (prev.some((p) => p.deviceId === d.deviceId)) return prev;
        return [...prev, d];
      });
    });
    const offOffline = window.syncFile.onDeviceOffline((id) => {
      setDevices((prev) => prev.filter((p) => p.deviceId !== id));
    });
    const offOffer = window.syncFile.onIncomingOffer((offer) => {
      setPendingOffers((prev) => [...prev, offer]);
    });
    const offProgress = window.syncFile.onTransferProgress((progress) => {
      setTransfers((prev) => {
        const next = new Map(prev);
        next.set(progress.transferId, progress);
        return next;
      });
    });
    const offComplete = window.syncFile.onTransferComplete((progress) => {
      setTransfers((prev) => {
        const next = new Map(prev);
        next.set(progress.transferId, progress);
        return next;
      });
    });

    return () => {
      offOnline();
      offOffline();
      offOffer();
      offProgress();
      offComplete();
    };
  }, []);

  const sendFile = useCallback(async (deviceId: string, filePath: string) => {
    await window.syncFile.sendFile(deviceId, filePath);
  }, []);

  const acceptOffer = useCallback(async (offerId: string) => {
    await window.syncFile.acceptIncoming(offerId);
    setPendingOffers((prev) => prev.filter((o) => o.offerId !== offerId));
  }, []);

  const rejectOffer = useCallback(async (offerId: string) => {
    await window.syncFile.rejectIncoming(offerId, 'user-declined');
    setPendingOffers((prev) => prev.filter((o) => o.offerId !== offerId));
  }, []);

  const openSandbox = useCallback(async () => {
    await window.syncFile.openSandbox();
  }, []);

  return {
    selfDevice,
    devices,
    pendingOffers,
    transfers: Array.from(transfers.values()),
    sendFile,
    acceptOffer,
    rejectOffer,
    openSandbox
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/hooks/useSyncFile.ts
git commit -m "feat(renderer): useSyncFile hook wrapping IPC API"
```

---

## Task 17: Renderer Components

**Files:**
- Create: `src/renderer/src/components/DeviceList.tsx`
- Create: `src/renderer/src/components/DropZone.tsx`
- Create: `src/renderer/src/components/TransferList.tsx`
- Create: `src/renderer/src/components/ReceivePrompt.tsx`

- [ ] **Step 1: Create `src/renderer/src/components/DeviceList.tsx`**

```typescript
import type { Device } from '../../../shared/types';

interface Props {
  devices: Device[];
  selectedDeviceId: string | null;
  onSelect: (deviceId: string) => void;
}

export function DeviceList({ devices, selectedDeviceId, onSelect }: Props) {
  if (devices.length === 0) {
    return (
      <div className="device-list empty">
        <p>No devices found on the network</p>
        <small>Make sure syncFile is running on another machine in the same LAN</small>
      </div>
    );
  }
  return (
    <ul className="device-list">
      {devices.map((d) => (
        <li
          key={d.deviceId}
          className={d.deviceId === selectedDeviceId ? 'selected' : ''}
          onClick={() => onSelect(d.deviceId)}
        >
          <div className="device-icon">💻</div>
          <div className="device-info">
            <div className="device-name">{d.name}</div>
            <div className="device-address">{d.address}:{d.port}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Create `src/renderer/src/components/DropZone.tsx`**

```typescript
import { useState, type DragEvent } from 'react';

interface Props {
  onFileDropped: (filePath: string) => void;
  disabled?: boolean;
}

export function DropZone({ onFileDropped, disabled }: Props) {
  const [dragging, setDragging] = useState(false);

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled) setDragging(true);
  };

  const onDragLeave = () => setDragging(false);

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) {
      // Electron exposes the absolute path on File objects
      const path = (file as unknown as { path: string }).path;
      if (path) onFileDropped(path);
    }
  };

  return (
    <div
      className={`drop-zone ${dragging ? 'dragging' : ''} ${disabled ? 'disabled' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="drop-zone-content">
        <div className="drop-zone-icon">📁</div>
        <div className="drop-zone-text">
          {disabled
            ? 'Select a device first'
            : 'Drag a file here to send'}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/renderer/src/components/TransferList.tsx`**

```typescript
import type { TransferProgress } from '../../../shared/types';

interface Props {
  transfers: TransferProgress[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function TransferList({ transfers }: Props) {
  if (transfers.length === 0) {
    return <div className="transfer-list empty">No transfers yet</div>;
  }
  return (
    <ul className="transfer-list">
      {transfers.map((t) => {
        const percent = t.fileSize > 0
          ? Math.round((t.bytesTransferred / t.fileSize) * 100)
          : 0;
        const arrow = t.direction === 'send' ? '↑' : '↓';
        return (
          <li key={t.transferId} className={`transfer-item ${t.status}`}>
            <div className="transfer-header">
              <span className="transfer-direction">{arrow}</span>
              <span className="transfer-name">{t.fileName || '(file)'}</span>
              <span className="transfer-size">
                {formatBytes(t.bytesTransferred)} / {formatBytes(t.fileSize)}
              </span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${percent}%` }} />
            </div>
            <div className="transfer-status">{t.status} — {percent}%</div>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: Create `src/renderer/src/components/ReceivePrompt.tsx`**

```typescript
import type { IncomingOffer } from '../../../shared/types';

interface Props {
  offer: IncomingOffer;
  onAccept: (offerId: string) => void;
  onReject: (offerId: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ReceivePrompt({ offer, onAccept, onReject }: Props) {
  return (
    <div className="receive-prompt-backdrop">
      <div className="receive-prompt">
        <h3>Incoming file</h3>
        <p>
          <strong>{offer.fromDevice.name}</strong> wants to send you:
        </p>
        <div className="receive-file-info">
          <div className="file-name">{offer.fileName}</div>
          <div className="file-size">{formatBytes(offer.fileSize)}</div>
        </div>
        <div className="receive-actions">
          <button className="btn reject" onClick={() => onReject(offer.offerId)}>
            Reject
          </button>
          <button className="btn accept" onClick={() => onAccept(offer.offerId)}>
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/
git commit -m "feat(renderer): DeviceList, DropZone, TransferList, ReceivePrompt components"
```

---

## Task 18: App Shell + Styles

**Files:**
- Create: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/App.css`

- [ ] **Step 1: Create `src/renderer/src/App.tsx`**

```typescript
import { useState } from 'react';
import { useSyncFile } from './hooks/useSyncFile';
import { DeviceList } from './components/DeviceList';
import { DropZone } from './components/DropZone';
import { TransferList } from './components/TransferList';
import { ReceivePrompt } from './components/ReceivePrompt';

export function App() {
  const {
    selfDevice,
    devices,
    pendingOffers,
    transfers,
    sendFile,
    acceptOffer,
    rejectOffer,
    openSandbox
  } = useSyncFile();

  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const handleFileDropped = async (filePath: string) => {
    if (!selectedDeviceId) return;
    try {
      await sendFile(selectedDeviceId, filePath);
    } catch (err) {
      console.error('send failed', err);
      alert(`Send failed: ${(err as Error).message}`);
    }
  };

  const currentOffer = pendingOffers[0] ?? null;

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">syncFile</div>
        <div className="app-self">
          {selfDevice ? `as ${selfDevice.name}` : ''}
        </div>
        <button className="btn small" onClick={openSandbox} title="Open sandbox folder">
          📂
        </button>
      </header>

      <main className="app-main">
        <section className="panel">
          <h2>Devices</h2>
          <DeviceList
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            onSelect={setSelectedDeviceId}
          />
        </section>

        <section className="panel">
          <h2>Send</h2>
          <DropZone
            onFileDropped={handleFileDropped}
            disabled={!selectedDeviceId}
          />
        </section>

        <section className="panel">
          <h2>Transfers</h2>
          <TransferList transfers={transfers} />
        </section>
      </main>

      {currentOffer && (
        <ReceivePrompt
          offer={currentOffer}
          onAccept={acceptOffer}
          onReject={rejectOffer}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `src/renderer/src/App.css`**

```css
:root {
  --bg: #1a1a1a;
  --bg-panel: #242424;
  --bg-hover: #2f2f2f;
  --bg-selected: #3a3a5a;
  --text: #e6e6e6;
  --text-dim: #888;
  --accent: #5c7cfa;
  --accent-hover: #748ffc;
  --danger: #e03131;
  --success: #37b24d;
  --border: #333;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  user-select: none;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.app-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border);
}

.app-title {
  font-size: 18px;
  font-weight: 600;
}

.app-self {
  flex: 1;
  color: var(--text-dim);
  font-size: 13px;
}

.btn {
  background: var(--accent);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.btn:hover {
  background: var(--accent-hover);
}

.btn.small {
  padding: 4px 10px;
  font-size: 18px;
  background: transparent;
}

.btn.small:hover {
  background: var(--bg-hover);
}

.btn.reject {
  background: transparent;
  border: 1px solid var(--border);
}

.btn.reject:hover {
  background: var(--bg-hover);
}

.app-main {
  flex: 1;
  display: grid;
  grid-template-columns: 280px 1fr;
  grid-template-rows: auto 1fr;
  gap: 16px;
  padding: 16px;
  overflow: hidden;
}

.panel {
  background: var(--bg-panel);
  border-radius: 8px;
  padding: 16px;
  overflow: auto;
}

.panel:nth-child(1) {
  grid-row: 1 / 3;
}

.panel h2 {
  font-size: 13px;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-bottom: 12px;
  letter-spacing: 0.5px;
}

/* Device list */
.device-list {
  list-style: none;
}

.device-list.empty {
  text-align: center;
  color: var(--text-dim);
  padding: 20px 10px;
}

.device-list.empty small {
  display: block;
  margin-top: 8px;
  font-size: 11px;
}

.device-list li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 4px;
  transition: background 0.15s;
}

.device-list li:hover {
  background: var(--bg-hover);
}

.device-list li.selected {
  background: var(--bg-selected);
}

.device-icon {
  font-size: 24px;
}

.device-name {
  font-weight: 500;
}

.device-address {
  font-size: 11px;
  color: var(--text-dim);
}

/* Drop zone */
.drop-zone {
  border: 2px dashed var(--border);
  border-radius: 8px;
  min-height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
}

.drop-zone.dragging {
  border-color: var(--accent);
  background: rgba(92, 124, 250, 0.1);
}

.drop-zone.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.drop-zone-content {
  text-align: center;
}

.drop-zone-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.drop-zone-text {
  color: var(--text-dim);
  font-size: 14px;
}

/* Transfer list */
.transfer-list {
  list-style: none;
}

.transfer-list.empty {
  text-align: center;
  color: var(--text-dim);
  padding: 20px;
}

.transfer-item {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  margin-bottom: 8px;
}

.transfer-header {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  margin-bottom: 6px;
}

.transfer-name {
  flex: 1;
  font-weight: 500;
}

.transfer-size {
  color: var(--text-dim);
  font-size: 11px;
}

.progress-bar {
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.2s;
}

.transfer-item.completed .progress-fill {
  background: var(--success);
}

.transfer-item.failed .progress-fill {
  background: var(--danger);
}

.transfer-status {
  font-size: 11px;
  color: var(--text-dim);
  margin-top: 4px;
}

/* Receive prompt */
.receive-prompt-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.receive-prompt {
  background: var(--bg-panel);
  padding: 24px;
  border-radius: 10px;
  min-width: 360px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
}

.receive-prompt h3 {
  margin-bottom: 12px;
}

.receive-prompt p {
  color: var(--text-dim);
  margin-bottom: 12px;
  font-size: 13px;
}

.receive-file-info {
  background: var(--bg);
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 20px;
}

.receive-file-info .file-name {
  font-weight: 500;
  margin-bottom: 4px;
}

.receive-file-info .file-size {
  color: var(--text-dim);
  font-size: 12px;
}

.receive-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/App.css
git commit -m "feat(renderer): app shell with devices, drop zone, transfers, receive prompt"
```

---

## Task 19: Build Verification

**Files:** (none modified)

- [ ] **Step 1: Run build**

Run: `npm run build`
Expected: succeeds. Outputs files in `out/main/`, `out/preload/`, `out/renderer/`.

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: all tests pass (codec, sandbox, tcp-server, tcp-client).

- [ ] **Step 3: Commit the lockfile if changed**

```bash
git status
# if package-lock.json changed:
git add package-lock.json
git commit -m "chore: update lockfile after build verification"
```

---

## Task 20: Smoke Test Documentation

**Files:**
- Create: `docs/smoke-test.md`

- [ ] **Step 1: Create `docs/smoke-test.md`**

```markdown
# Phase 1 Smoke Test

## Single-machine loopback test

1. Start the app: `npm run dev`
2. Open a second instance in another terminal:
   - macOS: `open -n /Applications/.../syncFile.app` (after packaging) OR
   - Dev: run `npm run dev` in a second clone, or launch a second BrowserWindow
   - Simplest: package the app and run two installed copies
3. Verify both instances see each other in the device list
4. Drag a test file onto one instance targeting the other
5. Accept the incoming prompt on the second instance
6. Confirm the file appears in the sandbox (click 📂 button)

## Two-machine test

1. Install/run on Machine A (macOS)
2. Install/run on Machine B (Windows or Linux)
3. Both on the same Wi-Fi / LAN
4. Verify mutual discovery (may take up to 3 seconds)
5. Send a ~100MB file from A to B — verify progress bar updates
6. Verify file integrity by comparing SHA256 on both sides:
   - macOS: `shasum -a 256 <file>`
   - Linux: `sha256sum <file>`
   - Windows: `certutil -hashfile <file> SHA256`

## Known issues to verify are NOT regressions

- Offers must arrive before file bytes start flowing
- Sender cannot send a second file until first completes (Phase 1 serializes)
- If peer rejects, sender shows an error alert
```

- [ ] **Step 2: Commit**

```bash
git add docs/smoke-test.md
git commit -m "docs: add phase 1 smoke test checklist"
```

---

## Self-Review Notes

**Spec coverage check:**
- [x] mDNS device discovery — Task 9, 10
- [x] TCP direct transfer — Tasks 7, 8
- [x] Drag & drop send — Task 17 (DropZone), Task 18 (App wiring)
- [x] Manual confirm receive — Task 17 (ReceivePrompt), Task 12 (IPC)
- [x] Sandbox directory — Task 5, integrated in Task 7
- [x] Electron cross-platform — Task 1 (electron-vite), Task 13 (main entry)
- [x] Device identity persistence — Task 6
- [x] Protocol + codec with backpressure — Tasks 3, 4, 8

**No placeholders:** every code step contains complete code. No "TODO" or "similar to above".

**Type consistency:** `SyncFileAPI` in preload matches handlers in `ipc/handlers.ts`; `IpcChannels` shared between both sides; `Device`, `TransferProgress`, `IncomingOffer` shapes are consistent across main/preload/renderer.
