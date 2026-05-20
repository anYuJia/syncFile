# syncFile 设计文档

> 当前架构: Tauri 2 + Rust backend + React renderer
> 当前阶段: Phase 2 可用版

## 项目目标

syncFile 是一个局域网内的 P2P 文件传输工具，目标体验接近 AirDrop，但支持 macOS、Windows 和 Linux。

核心目标：

- 打开即用，无需账号和服务器
- 局域网自动发现设备
- 拖拽发送文件
- 接收端默认手动确认
- 文件写入隔离沙箱目录
- 通过安全握手和可信设备机制降低误收风险

## 当前架构

```text
Renderer (React)
        |
  Tauri commands/events
        |
Rust backend
  |- mDNS discovery
  |- Device registry
  |- TCP server / client
  |- Secure channel
  |- Sandbox storage
  |- Persistent settings/history
```

## 技术栈

| 层 | 选型 |
| --- | --- |
| 桌面框架 | Tauri 2 |
| 后端语言 | Rust |
| 前端 | React + TypeScript + CSS |
| 构建 | Vite + Tauri CLI |
| 局域网发现 | `mdns-sd` |
| 传输 | Rust `tokio` TCP |
| 安全 | `ring`、`aes-gcm`、`sha2` |
| 文件选择 | Tauri command + Rust `rfd` |
| 前端测试 | Vitest |

## 模块结构

```text
syncFile/
├── src-tauri/
│   ├── src/
│   │   ├── commands.rs              # Tauri command handlers
│   │   ├── discovery/               # mDNS discovery and device registry
│   │   ├── security/                # trust and secure-channel helpers
│   │   ├── storage/                 # sandbox, identity, persistent state
│   │   └── transfer/                # protocol, codec, TCP, hashing
│   └── tauri.conf.json
├── src/
│   ├── renderer/                    # React UI
│   └── shared/                      # renderer/shared TypeScript types
├── vite.config.ts
├── vitest.config.ts
├── tsconfig.web.json
└── package.json
```

## 通信边界

前端不直接访问 Rust 模块。`src/renderer/src/lib/tauri-api.ts` 负责把 Tauri commands/events 暴露为 `window.syncFile`，其余 React 代码只依赖这层 API。

这保留了前端调用面的稳定性，同时避免保留旧桌面桥接后端。

## 当前已实现

- mDNS 自动发现局域网设备
- TCP 直连文件传输
- React 桌面 UI
- Tauri command/event bridge
- 沙箱目录和接收策略
- 设备身份与可信设备配对
- 安全握手
- 传输历史、取消、暂停和恢复缓存
- 多平台发布配置

## 后续方向

- 继续补齐 Rust 侧自动化测试
- 优化文件夹批量发送体验
- 增加传输限速
- 评估 WebRTC / 跨网传输
