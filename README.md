<div align="center">

# syncFile

一个面向局域网的跨平台文件快传工具。
目标体验接近 AirDrop，但支持 macOS、Windows 和 Linux。

[![Release](https://github.com/anYuJia/syncFile/actions/workflows/release.yml/badge.svg)](https://github.com/anYuJia/syncFile/actions/workflows/release.yml)
[![Latest Release](https://img.shields.io/github/v/release/anYuJia/syncFile?display_name=tag)](https://github.com/anYuJia/syncFile/releases)
[![License](https://img.shields.io/badge/license-MIT-1f6feb.svg)](./package.json)

[中文](./README.md) | [English](./README.en.md)

</div>

---

## 项目简介

`syncFile` 是一个基于 Tauri、Rust 和 React 构建的局域网 P2P 文件传输工具。

它的设计目标很直接：

- 打开即用，无需注册账号
- 局域网自动发现设备，不需要手填 IP
- 用拖拽完成发送
- 接收端默认手动确认
- 文件落入隔离沙箱目录，避免误覆盖

当前仓库已完成局域网传输的核心链路：

- mDNS 自动发现局域网设备
- TCP 直连传输文件
- Tauri 命令层与 React 渲染层打通
- 安全握手与可信设备配对
- 传输历史、暂停、取消与恢复缓存
- React 桌面 UI
- GitHub Actions 自动发布

---

## 功能亮点

| 能力 | 说明 |
| --- | --- |
| 零配置发现 | 基于 mDNS 进行局域网设备发现 |
| 直接传输 | 基于 TCP 直连进行局域网文件传输 |
| 安全默认 | 接收端手动确认，文件进入沙箱目录，传输前进行身份校验 |
| 可信配对 | 设备可完成配对，后续传输使用指纹和公钥识别对端 |
| 跨平台桌面 | Tauri 提供原生桌面壳，React 负责界面交互 |
| 可测试 | TypeScript 与 Rust 核心模块都有自动化测试 |
| 可发布 | GitHub Actions 自动构建多平台安装包 |

---

## 当前发布目标

当前 CI 默认构建以下发布产物：

- macOS `arm64` / `x64` DMG
- Windows `x64` / `x86` / `arm64` 安装包与 portable 版本
- Linux `x64` AppImage / DEB

发布产物会上传到：

- [GitHub Releases](https://github.com/anYuJia/syncFile/releases)

说明：

- 当前 macOS 安装包未签名
- 当前 Windows 安装包未签名
- Linux 版本依赖目标发行版对 WebKitGTK 的支持

---

## 快速开始

### 下载发布版

1. 打开 [Releases](https://github.com/anYuJia/syncFile/releases)
2. 下载与你平台对应的安装包
3. 在两台同一局域网机器上启动应用
4. 选择目标设备后拖拽文件发送

#### ⚠️ 绕过未签名应用警告

由于当前应用未签名，首次打开时可能会遇到安全警告：

**macOS：**

如果提示「syncFile 已损坏，无法打开」，在终端运行：

```bash
xattr -cr /Applications/syncFile.app
```

或者右键点击应用 → 打开 → 在弹窗中点击「打开」。

**Windows：**

如果 SmartScreen 拦截了应用：

1. 点击「更多信息」
2. 点击「仍要运行」

### 从源码运行

```bash
git clone https://github.com/anYuJia/syncFile.git
cd syncFile
npm install
npm run tauri:dev
```

---

## 基本使用

### 单文件发送

1. 两台设备连接同一个局域网
2. 分别启动 `syncFile`
3. 等待设备出现在设备列表
4. 在发送端选中目标设备
5. 将文件拖入发送区域
6. 在接收端点击 `Accept`
7. 传输完成后点击 `Open sandbox` 查看文件

### 1 台 Mac + 1 台 Windows 测试建议

1. 两台机器都运行 `syncFile`
2. 关闭 VPN
3. 确保 Windows 网络是“专用网络”
4. 允许 Windows 防火墙放行 syncFile
5. 先传一个小文件，再传一个 50MB 到 100MB 文件

更完整的检查流程见：

- [docs/smoke-test.md](./docs/smoke-test.md)

---

## 开发命令

```bash
npm run dev
npm run tauri:dev
npm run build
npm run tauri:build
npm run typecheck
npm test
```

本地打包：

```bash
npm run tauri:build
```

---

## 发布流程

当前仓库已接入 GitHub Actions 自动发布。

当你推送形如 `v0.0.1` 的 tag 时，会自动执行：

1. `typecheck`
2. `test`
3. Windows 多架构构建与发布
4. macOS 多架构构建与发布
5. Linux x64 构建与发布

示例：

```bash
git tag v0.0.1
git push origin v0.0.1
```

详细说明见：

- [docs/release.md](./docs/release.md)

---

## 架构概览

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
```

核心实现目录：

- `src-tauri/src`：发现、传输、安全、存储与 Tauri 命令
- `src/renderer`：React UI
- `src/shared`：前端共享类型

系统设计文档：

- [docs/design.md](./docs/design.md)

---

## 项目状态

当前阶段：`Phase 2 可用版`

已完成：

- 局域网发现
- 单文件发送
- 手动确认接收
- 沙箱落盘
- 可信设备配对
- 安全握手
- 断点恢复缓存
- 多平台自动发布

暂未实现：

- 传输限速
- WebRTC / 跨网传输
- 文件夹批量发送体验优化

---

## 测试覆盖

当前测试重点覆盖传输、存储、发现和 UI 状态计算：

- TypeScript: renderer hooks、格式化、传输指标、Electron legacy 模块
- Rust: mDNS、TCP 控制帧、安全通道相关辅助逻辑

运行：

```bash
npm test
```

---

## 技术栈

- Electron
- Tauri 2
- Rust
- React 18
- TypeScript
- Vite
- Vitest
- Tokio
- mdns-sd

---

## 许可证

MIT
