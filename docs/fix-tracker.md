# syncFile 修复跟踪清单

最后更新: 2026-04-14

本文档用于把 2026-04-14 的代码审查结论落成可执行的修复 checklist。每个条目都包含优先级、类别、影响、涉及文件和完成标准，后续修复时直接逐项更新即可。

## 跟踪约定

- `[ ]` 未开始
- `[x]` 已完成
- 标记为 `需验证` 的条目先复现或补充测试，再决定是否进入修复

## 推荐修复顺序

1. P0 确定性 bug
2. P1 安全问题
3. P1 主进程阻塞问题
4. P2 影响体验的交互和状态同步问题
5. P3 风险收尾和一致性优化

## P0

- [x] `SF-001` `[P0][Bug]` 修复设置页 `useEffect` 依赖不稳定 `api` 引用导致的重复刷新
  - 影响: 设置页重复请求、重复渲染，可能造成性能问题和体验抖动
  - 涉及文件: `src/renderer/src/components/Settings.tsx`
  - 完成标准: 首次打开设置页只触发一次初始化加载；后续状态更新不会再次触发 `refreshSettings()`
  - 完成说明: 初始化 effect 已改为 mount-only，避免后续状态更新重新触发加载

- [x] `SF-002` `[P0][Bug]` 修复 macOS `activate` 仅建窗口、不重建服务的问题
  - 影响: 所有窗口关闭后重新激活应用，主进程服务状态可能不完整，IPC 或传输功能异常
  - 涉及文件: `src/main/index.ts`
  - 完成标准: 在窗口全关后重新点击 Dock 图标，窗口、TCP 服务、mDNS 服务和 IPC 依赖都能恢复到可用状态
  - 完成说明: 主进程已支持重复 bootstrap/cleanup，`activate` 会复用完整启动流程而不是只重建窗口

## P1

- [x] `SF-003` `[P1][Security]` 为传输链路增加加密，消除局域网明文传输
  - 影响: 同网段攻击者可窃听文件内容
  - 涉及文件: `src/main/transfer/tcp-client.ts`, `src/main/transfer/tcp-server.ts`, 可能新增证书或会话密钥管理模块
  - 完成标准: 文件内容不再通过明文 TCP 发送；设备身份校验与传输加密能协同工作
  - 完成说明: 已引入基于 Ed25519 身份认证 + X25519 会话协商 + AES-256-GCM 分帧的应用层加密通道，文件流和控制消息都走加密传输

- [x] `SF-004` `[P1][Security]` 为协议控制消息增加体积上限
  - 影响: 恶意对端可构造超大 `bodyLength` 触发内存膨胀或 OOM
  - 涉及文件: `src/main/transfer/codec.ts`
  - 完成标准: 控制消息长度超限时立即拒绝连接或抛出受控错误；补充边界测试
  - 完成说明: 编解码器已增加 64 KB 控制消息上限，并补充超限与 trailing remainder 边界测试

- [x] `SF-005` `[P1][Security]` 为 `openPath` 增加沙箱路径校验
  - 影响: 渲染进程若被注入，可请求主进程打开任意路径
  - 涉及文件: `src/main/ipc/handlers.ts`, `src/main/storage/sandbox.ts`
  - 完成标准: 只允许打开沙箱内已知可访问路径；非法路径返回受控错误
  - 完成说明: 主进程现在会拒绝 sandbox 外路径，sandbox 增加了 containment 校验能力和测试覆盖

- [x] `SF-006` `[P1][Security]` 为 `showItemInFolder` 增加沙箱路径校验
  - 影响: 与 `openPath` 相同，存在任意路径暴露风险
  - 涉及文件: `src/main/ipc/handlers.ts`, `src/main/storage/sandbox.ts`
  - 完成标准: 只允许 reveal 沙箱内路径；非法路径被拒绝
  - 完成说明: reveal 流程已复用同一套 sandbox 路径校验，前端只保留接收完成文件的打开/定位入口

- [x] `SF-007` `[P1][Performance]` 将 `directorySize()` 从同步递归改为非阻塞实现
  - 影响: 大量文件时阻塞主进程，设置页和沙箱相关操作卡顿
  - 涉及文件: `src/main/storage/sandbox.ts`
  - 完成标准: 不再在主线程执行深度同步遍历；获取容量信息不会造成明显 UI 卡顿
  - 完成说明: sandbox 容量统计已改为异步扫描 + dirty cache，设置页和容量检查不再走同步递归遍历

- [x] `SF-008` `[P1][Performance]` 将发送前完整 `sha256File()` 计算移出阻塞路径
  - 影响: 大文件发送前长时间无反馈
  - 涉及文件: `src/main/ipc/handlers.ts`, `src/main/transfer/*`, 可能涉及哈希工具模块
  - 完成标准: 大文件发起后能快速进入可感知状态；哈希计算不阻塞主流程
  - 完成说明: send handler 现在会先返回 transferId 和 pending 状态，SHA-256 改到 outbound 队列后台准备阶段执行

## P2

- [x] `SF-009` `[P2][UX]` 为小窗口和窄布局增加响应式降级
  - 影响: 当前布局在窄窗口下拥挤且无优雅退化
  - 涉及文件: `src/renderer/src/App.tsx`, `src/renderer/src/App.css`
  - 完成标准: 至少有一组窄窗口断点，设备列表、发送区、传输区可以在小宽度下正常使用
  - 完成说明: 新增 1040px 紧凑布局，设备/发送/传输切为 tab 式任务视图，并补充窄屏样式收口

- [x] `SF-010` `[P2][UX]` 为非活跃传输提供直接操作按钮
  - 影响: 暂停、失败、完成状态必须进入详情才能重试或打开文件
  - 涉及文件: `src/renderer/src/components/TransferList.tsx`
  - 完成标准: `paused`、`failed`、`completed` 等状态可在列表中直接执行关键操作
  - 完成说明: 列表项在 paused / failed / completed receive 等状态下会展开关键操作，不再只限 in-progress

- [x] `SF-011` `[P2][UX]` 增加实时速率和剩余时间展示
  - 影响: 大文件传输缺少进度预期
  - 涉及文件: `src/renderer/src/components/TransferList.tsx`, `src/renderer/src/hooks/useSyncFile.ts`
  - 完成标准: 传输中可看到稳定的速率和 ETA；暂停或无数据时展示合理降级文案
  - 完成说明: 渲染层现在基于进度事件计算平滑速率和 ETA，并在列表与详情弹窗中显示

- [x] `SF-012` `[P2][UX]` 为拖拽区补充目录发送支持
  - 影响: 无法直接选择或拖入文件夹
  - 涉及文件: `src/renderer/src/components/DropZone.tsx`, 可能涉及 preload / IPC 文件选择接口
  - 完成标准: 支持目录选择或目录拖拽；不支持的平台有明确提示
  - 完成说明: DropZone 新增文件夹选择入口，并通过 `webkitGetAsEntry`/`webkitdirectory` 支持目录拖入和目录选择

- [x] `SF-013` `[P2][UX]` 改善首次启动和无设备在线时的空状态引导
  - 影响: 新用户不知道下一步应该做什么
  - 涉及文件: `src/renderer/src/App.tsx`, `src/renderer/src/components/DeviceList.tsx`, 文案资源文件
  - 完成标准: 空状态包含明确的下一步指引，至少说明另一台设备需要安装并打开 syncFile
  - 完成说明: 设备空状态新增三步引导和刷新按钮，首次打开时能明确告诉用户下一步怎么做

- [x] `SF-014` `[P2][Bug]` 避免语言切换时 `useSyncFile` 重新注册全量 IPC 监听器
  - 影响: 切换语言可能造成闪烁、短暂事件丢失和重新初始化
  - 涉及文件: `src/renderer/src/hooks/useSyncFile.ts`
  - 完成标准: 切换语言不会重新绑定 IPC 监听，也不会重置设备和传输状态
  - 完成说明: `useSyncFile` 初始化 effect 已改为稳定挂载一次，错误文案通过 ref 读取最新语言

- [x] `SF-015` `[P2][Performance]` 优化 `transferMap` 高频更新时的对象浅拷贝
  - 影响: 高频进度事件造成额外 GC 压力
  - 涉及文件: `src/renderer/src/hooks/useSyncFile.ts`
  - 完成标准: 传输高频更新时减少大对象复制；行为与现有 UI 一致
  - 完成说明: 传输状态已改为 `Map + ref + version` 模型，进度事件不再全量浅拷贝整个对象字典

- [x] `SF-016` `[P2][Performance]` 避免每次渲染重新构造 `trustedDeviceKeys`
  - 影响: 无谓的派生数据分配
  - 涉及文件: `src/renderer/src/App.tsx`
  - 完成标准: `trustedDeviceKeys` 仅在依赖变更时重算
  - 完成说明: `trustedDeviceKeys` 已切到 `useMemo`

- [x] `SF-017` `[P2][A11y]` 为设备列表补齐键盘导航和语义状态
  - 影响: 当前无明确的上下方向键导航支持
  - 涉及文件: `src/renderer/src/components/DeviceList.tsx`
  - 完成标准: 设备列表支持键盘聚焦、上下选择和可感知选中状态
  - 完成说明: 设备列表已补 roving tabindex 和 Up/Down/Home/End 导航

- [x] `SF-018` `[P2][A11y]` 调整接收弹窗 `Escape` 行为，避免误拒绝
  - 影响: 用户按 `Escape` 可能误触发拒绝接收
  - 涉及文件: `src/renderer/src/components/ReceivePrompt.tsx`
  - 完成标准: `Escape` 不再直接拒绝文件，行为与对话框关闭预期一致
  - 完成说明: 接收弹窗已移除 Escape 自动拒绝映射

- [x] `SF-019` `[P2][Performance]` 统一重复的 `formatBytes()` 工具函数
  - 影响: 维护成本偏高，多个组件重复实现同一格式化逻辑
  - 涉及文件: `src/renderer/src/components/DropZone.tsx`, `src/renderer/src/components/TransferList.tsx`, `src/renderer/src/components/ReceivePrompt.tsx`, `src/renderer/src/components/Settings.tsx`
  - 完成标准: 统一为共享工具函数，现有显示格式保持一致
  - 完成说明: 已抽成 `src/renderer/src/utils/format.ts`

- [x] `SF-020` `[P2][Bug][需验证]` 复现并收敛 outbound retry 快速点击时的重复入队竞态
  - 影响: 理论上可能造成重复排队或状态不一致
  - 涉及文件: `src/main/ipc/handlers.ts`
  - 完成标准: 有复现用例或测试覆盖；确认无竞态或完成加锁/状态保护
  - 完成说明: outbound 队列已加 `Set` 去重，渲染层也为 pause/cancel/retry 增加 busy 态，避免重复点击触发并发操作

- [x] `SF-021` `[P2][Performance]` 降低 mDNS browser 周期性销毁重建的开销
  - 影响: 周期 destroy/create 可能带来额外网络和 GC 负担
  - 涉及文件: `src/main/discovery/mdns-service.ts`
  - 完成标准: 浏览器刷新策略更稳定，减少不必要的实例重建
  - 完成说明: 周期 refresh 已改为常规 `browser.update()`，browser 重建只保留在显式 refresh 场景

- [x] `SF-022` `[P2][Performance]` 避免传输历史持久化每次都同步全量写盘
  - 影响: 主进程同步 `JSON.stringify + writeFileSync` 会放大完成事件成本
  - 涉及文件: `src/main/storage/transfer-history.ts`
  - 完成标准: 历史持久化从同步全量写入演进为更轻量或异步的策略
  - 完成说明: 传输历史持久化已改为合并式异步写盘循环，测试同步更新为 await flush

- [x] `SF-023` `[P2][Stability]` 重新评估 30 秒 socket idle timeout 对大文件和波动网络的适配性
  - 影响: 真实网络抖动场景下可能误判超时
  - 涉及文件: `src/main/transfer/tcp-server.ts`, `src/main/transfer/tcp-client.ts`
  - 完成标准: timeout 策略有明确依据，能覆盖慢磁盘、网络抖动和暂停恢复场景
  - 完成说明: 双端 idle timeout 已统一上调到 120 秒，给大文件、慢磁盘和瞬时网络抖动更合理的恢复空间

## P3

- [x] `SF-024` `[P3][Security]` 为私钥持久化增加更安全的存储方案
  - 影响: `identity.json` 中的 base64 私钥若被读取会直接泄露身份
  - 涉及文件: `src/main/storage/device-identity.ts`, 可能新增平台安全存储适配层
  - 完成标准: 私钥不再以明文直接落盘，或至少具备平台级保护与权限限制
  - 完成说明: 设备私钥现在优先使用 Electron `safeStorage` 加密持久化，不支持时回退到受限权限文件并自动迁移旧明文格式

- [x] `SF-025` `[P3][Security]` 为 pair request 增加重放保护
  - 影响: 合法配对请求可被重放
  - 涉及文件: `src/main/security/trust.ts`
  - 完成标准: 验证逻辑检查时间窗口或 nonce；过期请求会被拒绝
  - 完成说明: pair-request 现已校验 5 分钟有效期和未来时钟偏移，服务端还会丢弃窗口内的重复 `requestId`

- [x] `SF-026` `[P3][Security]` 评估并最小化 mDNS 暴露设备指纹信息
  - 影响: 广播公钥会增加设备被追踪的可观测性
  - 涉及文件: `src/main/discovery/mdns-service.ts`, `src/shared/types/*`, 信任流程相关模块
  - 完成标准: 明确保留或收敛广播字段，并记录权衡
  - 完成说明: mDNS 现只广播设备指纹，不再广播完整公钥；真实公钥改由安全握手返回并与广播指纹绑定校验

- [x] `SF-027` `[P3][UX]` 将暗色模式切换按钮的 emoji 替换为统一图标
  - 影响: 图标风格不一致，跨平台渲染差异较大
  - 涉及文件: `src/renderer/src/App.tsx`
  - 完成标准: 切换按钮使用与其他控件一致的 SVG 或图标系统
  - 完成说明: 主题切换按钮已替换为统一的 sun/moon SVG 图标

## 备注

- `SF-003` 到 `SF-006` 建议一起设计，因为它们都在收紧传输与主进程边界。
- `SF-007`、`SF-008`、`SF-022` 需要一起看主进程阻塞路径，避免只修单点。
- `SF-014`、`SF-015`、`SF-016`、`SF-019` 可以作为一组渲染层状态管理整理。
