# syncFile 设计文档

> 版本: v0.1 (Phase 1 MVP)
> 日期: 2026-04-09

## 1. 项目目标

**一句话**：用户 A 拖入文件 → 自动送达用户 B 电脑 → 跨平台、零配置。

syncFile 是一个局域网内的 P2P 文件传输工具，目标体验类似 AirDrop，但跨平台支持 macOS / Windows / Linux。

## 2. 设计原则

1. **零配置优先** — 用户打开即用，不需要注册账号、不需要输入 IP
2. **最小依赖** — Phase 1 不依赖任何服务器，纯局域网
3. **安全默认** — 默认手动确认接收，所有文件落入隔离沙箱
4. **渐进式复杂度** — MVP 能跑通最核心链路，再逐步加功能

## 3. 分阶段路线图

### Phase 1 (本文档聚焦) — 局域网 MVP

- mDNS 自动发现局域网设备
- TCP 直连传输文件
- 拖拽发送
- 接收端手动确认
- 文件落入沙箱目录
- Electron 桌面端 (macOS / Windows / Linux)

### Phase 2 — 策略与信任

- 自动接收策略引擎（可信设备、文件大小/类型白名单）
- 设备信任管理（首次配对 PIN 确认）
- 传输历史持久化
- 沙箱自动清理策略

### Phase 3 — 跨网传输

- WebRTC DataChannel 作为跨网传输层
- 信令服务器（Node.js + WebSocket）
- STUN / TURN NAT 穿透
- 账号体系（可选）

### Phase 4 — 高级特性

- 断点续传
- 传输限速
- 移动端（React Native / Flutter）
- 离线暂存（消息队列）

---

## 4. Phase 1 架构

### 4.1 整体架构图

```
┌─────────────────────┐           ┌─────────────────────┐
│    Device A         │           │    Device B         │
│  ┌───────────────┐  │           │  ┌───────────────┐  │
│  │   Renderer    │  │           │  │   Renderer    │  │
│  │  (React UI)   │  │           │  │  (React UI)   │  │
│  └───────┬───────┘  │           │  └───────┬───────┘  │
│          │ IPC      │           │          │ IPC      │
│  ┌───────▼───────┐  │           │  ┌───────▼───────┐  │
│  │ Main Process  │  │           │  │ Main Process  │  │
│  │  ┌─────────┐  │  │  mDNS     │  │  ┌─────────┐  │  │
│  │  │Discovery│◄─┼──┼──(UDP)────┼──┼─►│Discovery│  │  │
│  │  └─────────┘  │  │           │  │  └─────────┘  │  │
│  │  ┌─────────┐  │  │  TCP      │  │  ┌─────────┐  │  │
│  │  │Transfer │◄─┼──┼──(data)───┼──┼─►│Transfer │  │  │
│  │  └─────────┘  │  │           │  │  └─────────┘  │  │
│  │  ┌─────────┐  │  │           │  │  ┌─────────┐  │  │
│  │  │ Sandbox │  │  │           │  │  │ Sandbox │  │  │
│  │  └─────────┘  │  │           │  │  └─────────┘  │  │
│  └───────────────┘  │           │  └───────────────┘  │
└─────────────────────┘           └─────────────────────┘
```

### 4.2 核心组件

| 组件 | 位置 | 职责 |
|---|---|---|
| **mDNS Discovery** | Main | 广播本机服务 / 浏览局域网其他设备 |
| **Device Registry** | Main | 维护在线设备列表、上下线事件 |
| **TCP Server** | Main | 监听端口，接收来自其他设备的文件 |
| **TCP Client** | Main | 主动连接对端，发送文件 |
| **Protocol Codec** | Main | 长度前缀 JSON 消息编解码 |
| **Sandbox Storage** | Main | 隔离目录管理、唯一文件名生成 |
| **IPC Bridge** | Main ↔ Preload | 主进程 ↔ 渲染进程的安全通道 |
| **Renderer UI** | Renderer | 设备列表、拖拽区、传输进度、接收确认 |

### 4.3 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| **桌面框架** | Electron | WebRTC 友好（Phase 3 考虑）、生态成熟、RC 快 |
| **语言** | TypeScript | 类型安全，Electron 官方一等公民 |
| **构建工具** | electron-vite | 比 webpack 快 10x，支持主/渲染/preload 三进程 |
| **UI 框架** | React + CSS | 社区最大，electron-vite 官方模板支持 |
| **mDNS** | `bonjour-service` | 纯 JS 实现，跨平台，维护活跃 |
| **TCP 传输** | Node 原生 `net` 模块 | 无需引入第三方库，性能直达内核 |
| **测试** | Vitest | 速度快，与 Vite 生态一致，TypeScript 零配置 |
| **打包** | electron-builder | 行业标准，自动处理签名/公证 |

---

## 5. 模块详细设计

### 5.1 mDNS 发现

**库**: `bonjour-service`

**服务类型**: `_syncfile._tcp.local`

**广播内容**:
```json
{
  "name": "pyu-macbook",            // 设备显示名
  "host": "pyu-macbook.local",      // hostname
  "port": 43434,                     // TCP 传输端口
  "txt": {
    "deviceId": "uuid-v4",           // 设备唯一 ID（首次启动生成并持久化）
    "version": "0.1.0",              // 协议版本
    "platform": "darwin"             // 操作系统
  }
}
```

**事件流**:
```
启动 → 生成/加载 deviceId → mDNS.publish() → mDNS.find()
       ↓                                       ↓
       设备注册到 Registry              发现新设备时触发 "device:online"
                                        设备下线时触发 "device:offline"
```

### 5.2 传输协议

**设计原则**: 简单、自描述、可流式处理。

**消息格式**: 长度前缀 JSON (length-prefixed JSON)
```
[4 bytes: JSON 长度 (uint32 BE)] [N bytes: JSON payload]
```

对于文件数据本身：
```
[4 bytes: JSON 长度] [N bytes: JSON 元数据] [M bytes: 原始文件内容]
```

**消息类型**:

```typescript
// 发送方 → 接收方
interface FileOfferMessage {
  type: 'file-offer';
  version: 1;
  fileId: string;          // UUID，用于后续引用
  fileName: string;
  fileSize: number;
  mimeType?: string;
  sha256?: string;         // 可选，大文件传输前不强求
  fromDevice: {
    deviceId: string;
    name: string;
  };
}

// 接收方 → 发送方
interface FileAcceptMessage {
  type: 'file-accept';
  fileId: string;
}

interface FileRejectMessage {
  type: 'file-reject';
  fileId: string;
  reason: 'user-declined' | 'too-large' | 'type-not-allowed';
}

// 发送方 → 接收方（传输结束）
interface FileCompleteMessage {
  type: 'file-complete';
  fileId: string;
  bytesSent: number;
}
```

**传输流程**:
```
A                                    B
│                                    │
│──── file-offer (JSON) ────────────►│
│                                    │ (B 弹窗确认)
│◄──── file-accept (JSON) ───────────│
│                                    │
│──── [file bytes stream] ──────────►│
│                                    │ (写入沙箱)
│──── file-complete (JSON) ─────────►│
│                                    │
│ (close socket)                    │
```

**背压处理**: 使用 Node stream 的 `.pipe()` 和 `.drain` 事件自动处理。

### 5.3 沙箱存储

**路径**:
- macOS: `~/Library/Application Support/syncFile/sandbox/`
- Windows: `%APPDATA%/syncFile/sandbox/`
- Linux: `~/.config/syncFile/sandbox/`

**文件命名规则**: 防止覆盖 + 可追溯来源
```
{sandbox}/{deviceId}/{timestamp}_{original_filename}
```

例如：`sandbox/abc-123/20260409_153022_report.pdf`

**Phase 1 简化**: 不做自动清理、不做权限隔离，仅做目录隔离。

### 5.4 IPC 接口设计

主进程暴露给渲染进程的 API（通过 preload）:

```typescript
interface SyncFileAPI {
  // 设备发现
  onDeviceOnline(cb: (device: Device) => void): () => void;
  onDeviceOffline(cb: (deviceId: string) => void): () => void;
  getDevices(): Promise<Device[]>;

  // 发送文件
  sendFile(deviceId: string, filePath: string): Promise<TransferId>;
  onTransferProgress(cb: (progress: TransferProgress) => void): () => void;
  onTransferComplete(cb: (transferId: TransferId) => void): () => void;

  // 接收文件
  onIncomingOffer(cb: (offer: IncomingOffer) => void): () => void;
  acceptIncoming(offerId: string): Promise<void>;
  rejectIncoming(offerId: string, reason?: string): Promise<void>;

  // 系统
  getSelfDevice(): Promise<Device>;
  openSandbox(): Promise<void>;
}
```

### 5.5 UI 布局（Phase 1）

```
┌─────────────────────────────────────┐
│  syncFile                    ⚙ 📂   │  ← 顶部栏（设置/打开沙箱）
├─────────────────────────────────────┤
│                                     │
│  ┌───────────────────────────────┐  │
│  │                               │  │
│  │    拖拽文件到此处发送            │  │  ← Drop Zone
│  │                               │  │
│  └───────────────────────────────┘  │
│                                     │
│  在线设备 (2)                        │  ← Device List
│  ┌───────────────────────────────┐  │
│  │ 💻 liu-windows                │  │
│  │    192.168.1.42               │  │
│  ├───────────────────────────────┤  │
│  │ 💻 wang-linux                 │  │
│  │    192.168.1.55               │  │
│  └───────────────────────────────┘  │
│                                     │
│  传输记录                            │  ← Transfer List
│  ┌───────────────────────────────┐  │
│  │ ↑ report.pdf → liu-windows    │  │
│  │   ████████░░  80%             │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

**拖拽发送流程**:
1. 用户拖文件到 Drop Zone
2. UI 弹出设备选择器（或如果只有一个设备，直接发送）
3. 调用 `sendFile(deviceId, filePath)`
4. Transfer List 显示进度

**接收流程**:
1. 收到 file-offer → 弹出确认对话框
2. 显示：来源设备、文件名、大小
3. 用户点击"接受"或"拒绝"
4. 接受 → 开始接收，Transfer List 显示进度
5. 完成后提示"已保存到沙箱"，提供"打开文件夹"按钮

---

## 6. 安全考虑（Phase 1）

| 威胁 | 缓解措施 |
|---|---|
| 局域网内恶意设备发送病毒文件 | 默认手动确认；所有文件进入隔离沙箱 |
| 设备名伪造 | Phase 1 不做信任验证，依赖用户肉眼判断；Phase 2 加入 PIN 配对 |
| 端口占用冲突 | 端口 43434 被占用时尝试下一个；mDNS TXT 记录广播实际端口 |
| 大文件 OOM | 使用 Node stream 分块传输，不一次性 load 到内存 |

**Phase 1 明确不做**：
- 传输层加密（局域网内明文 TCP，Phase 2 加 TLS）
- 设备身份验证（任何局域网设备都可见）
- 文件 hash 校验（Phase 2 加）

---

## 7. 文件/模块结构

```
syncFile/
├── docs/
│   ├── design.md                        # 本文档
│   └── superpowers/plans/
│       └── 2026-04-09-syncfile-phase1-mvp.md
├── src/
│   ├── shared/
│   │   └── types.ts                     # Main ↔ Renderer 共享类型
│   ├── main/
│   │   ├── index.ts                     # Electron 主进程入口
│   │   ├── discovery/
│   │   │   ├── mdns-service.ts          # mDNS 广播/浏览
│   │   │   └── device-registry.ts       # 在线设备管理
│   │   ├── transfer/
│   │   │   ├── protocol.ts              # 消息类型定义
│   │   │   ├── codec.ts                 # 长度前缀 JSON 编解码
│   │   │   ├── tcp-server.ts            # 接收端 TCP 服务器
│   │   │   └── tcp-client.ts            # 发送端 TCP 客户端
│   │   ├── storage/
│   │   │   ├── sandbox.ts               # 沙箱目录管理
│   │   │   └── device-identity.ts       # 设备 ID 持久化
│   │   └── ipc/
│   │       └── handlers.ts              # IPC handler 注册
│   ├── preload/
│   │   └── index.ts                     # 暴露 SyncFileAPI 到渲染进程
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── App.css
│           ├── hooks/
│           │   └── useSyncFile.ts       # 封装 IPC 的 React hook
│           └── components/
│               ├── DeviceList.tsx
│               ├── DropZone.tsx
│               ├── TransferList.tsx
│               └── ReceivePrompt.tsx
├── electron.vite.config.ts              # electron-vite 配置
├── vitest.config.ts                     # 测试配置
├── package.json
├── tsconfig.json                        # 根 tsconfig
├── tsconfig.node.json                   # Node/Main 进程 tsconfig
└── tsconfig.web.json                    # Renderer 进程 tsconfig
```

---

## 8. 开发与测试策略

### 8.1 测试金字塔

- **单元测试** (Vitest) — 覆盖 codec、protocol、sandbox、device-registry
- **集成测试** (Vitest + 真实 TCP) — tcp-server ↔ tcp-client 端到端
- **手动测试** — 两台真实设备跨机器传输

### 8.2 TDD 优先

核心模块（codec / tcp-server / tcp-client / sandbox）使用 TDD 流程：
1. 先写失败的测试
2. 最小实现让测试通过
3. 重构 + 提交

### 8.3 提交策略

- 每个子任务完成后立即提交
- commit message 使用 Conventional Commits (`feat:` / `fix:` / `test:` / `chore:`)

---

## 9. 开放问题（留待实现阶段解决）

1. **设备名默认值**：用 `os.hostname()` 还是让用户首次启动时输入？
   - **初步决定**：Phase 1 使用 `os.hostname()`，Phase 2 加入设置面板
2. **端口占用**：固定 43434 还是动态分配？
   - **初步决定**：优先尝试 43434，失败则让系统分配，通过 mDNS TXT 广播实际端口
3. **多文件拖拽**：Phase 1 是否支持？
   - **初步决定**：Phase 1 只支持单文件，多文件串行发送（UI 上表现为多条传输记录）

---

## 10. 参考资料

- [PairDrop](https://github.com/schlagmichdoch/PairDrop) — WebRTC 局域网传输参考
- [LANDrop](https://github.com/LANDrop/LANDrop) — UI 体验参考
- [Syncthing](https://github.com/syncthing/syncthing) — 设备信任模型参考
- [bonjour-service](https://github.com/onlxltd/bonjour-service) — mDNS 实现
- [electron-vite](https://electron-vite.org/) — 构建工具文档
