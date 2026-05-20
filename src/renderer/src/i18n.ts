export type Locale = 'zh' | 'en';

export interface Messages {
  localeName: string;
  selfDeviceLabel: string;
  loadingLocalDevice: string;
  appNotReady: string;
  trustedDeviceLabel: string;
  deviceFingerprintLabel: string;
  heroEyebrow: string;
  heroLead: string;
  heroStamp: string;
  openSandbox: string;
  dismiss: string;
  languageLabel: string;
  mainMenuAriaLabel: string;
  workspaceSectionsAriaLabel: string;
  expandMenu: string;
  collapseMenu: string;
  sidebarCommandCenter: string;
  sidebarWorkspaceLabel: string;
  sidebarIntakeLabel: string;
  sidebarUtilitiesLabel: string;
  sidebarStatusDetail: (fileRequestCount: number, pairRequestCount: number, activeTransferCount: number) => string;
  routeLabel: string;
  routeIdle: string;
  routeMetaIdle: string;
  routeReady: (fromName: string, toName: string) => string;
  workflowKicker: string;
  workflowNoDeviceTitle: string;
  workflowSelectDeviceTitle: string;
  workflowAddFilesTitle: string;
  workflowReadyTitle: string;
  workflowTransferringTitle: string;
  workflowNoDeviceNote: string;
  workflowSelectDeviceNote: string;
  workflowAddFilesNote: string;
  workflowReadyNote: string;
  workflowTransferringNote: string;
  workflowStepDiscover: string;
  workflowStepDevice: string;
  workflowStepFiles: string;
  workflowStepReady: string;
  workflowStepTransfer: string;
  workspaceSignalsLabel: string;
  workspaceMetricDevices: string;
  workspaceMetricRecipients: string;
  workspaceMetricFiles: string;
  workspaceMetricActive: string;
  workspaceMetricRequests: string;
  workspaceMetricCompleted: string;
  workspaceMetricIssues: string;
  onlineDevices: string;
  refreshDevices: string;
  refreshingDevices: string;
  sendFile: string;
  transferActivity: string;
  manifestKicker: string;
  manifestNote: string;
  dispatchKicker: string;
  dispatchNote: string;
  ledgerKicker: string;
  ledgerNote: string;
  noOnlinePeers: string;
  keepRunningOnAnotherDevice: string;
  deviceListEmptyStepOpen: string;
  deviceListEmptyStepLan: string;
  deviceListEmptyStepRefresh: string;
  deviceListTroubleshoot: string;
  deviceListTroubleshootBody: string;
  onlineDevicesAriaLabel: string;
  dropZonePassport: string;
  dropZoneTitle: string;
  dropZoneWaitingTitle: string;
  dropZoneWaitingBody: string;
  dropZoneTargetReady: (targetName: string) => string;
  dropZoneTargetFallback: string;
  dropZoneHint: string;
  dropZoneAction: string;
  dropZoneSelectDeviceFirst: string;
  dropZonePickFromDisk: string;
  dropZoneAddFolder: string;
  transferEmpty: string;
  sendTo: string;
  receiveFrom: string;
  unknownDevice: string;
  transferStatusPending: string;
  transferStatusInProgress: string;
  transferStatusPaused: string;
  transferStatusCompleted: string;
  transferStatusFailed: string;
  transferStatusRejected: string;
  transferStatusCancelled: string;
  transferReceiveModeTrusted: string;
  transferReceiveModeAuto: string;
  transferOpenFile: string;
  transferRevealFile: string;
  transferCancel: string;
  transferPause: string;
  transferResume: string;
  transferRetry: string;
  transferDelete: string;
  transferDeleteConfirm: string;
  transferDetails: string;
  transferBatchFallback: string;
  transferRateLabel: string;
  transferEtaLabel: string;
  transferPreparing: string;
  transferWaitingForReceiver: string;
  selectedRecipientLabel: string;
  sendDraftSummary: (fileCount: number, recipientCount: number) => string;
  recipientSelectionSummary: (recipientCount: number) => string;
  deviceReachabilityChecking: string;
  deviceReachabilityReachable: string;
  deviceReachabilityUnreachable: string;
  recipientOfflineLabel: string;
  taskFilterAll: string;
  taskFilterActive: string;
  taskFilterDone: string;
  taskFilterIssues: string;
  taskDirectionAll: string;
  taskDirectionSend: string;
  taskDirectionReceive: string;
  taskPeerAll: string;
  taskSearchPlaceholder: string;
  taskNoMatches: string;
  taskNoMatchesHint: string;
  taskResumeVisible: string;
  taskRetryVisible: string;
  taskCancelVisible: string;
  taskCancelVisibleConfirm: string;
  taskClearVisible: string;
  taskClearVisibleConfirm: string;
  taskResetFilters: string;
  requestsInbox: string;
  requestFilesTab: string;
  requestPairsTab: string;
  requestShowFiles: string;
  requestShowPairs: string;
  requestsEmptyTitle: string;
  requestsEmptyBody: string;
  requestFilesEmptyTitle: string;
  requestFilesEmptyBody: string;
  requestPairsEmptyTitle: string;
  requestPairsEmptyBody: string;
  logs: string;
  toolsMenuLabel: string;
  appearanceLight: string;
  appearanceDark: string;
  appearanceSystem: string;
  requestsUnreadIndicator: (count: number) => string;
  notificationsLabel: string;
  globalDropTitle: string;
  globalDropBody: string;
  globalDropQueued: (count: number) => string;
  logViewerTitle: string;
  logViewerEmpty: string;
  logViewerRefresh: string;
  logViewerClear: string;
  logViewerClearConfirm: string;
  logViewerCopy: string;
  logViewerCopied: string;
  logViewerCopyFailed: string;
  logViewerRefreshed: string;
  logViewerCleared: string;
  transferLocalPath: string;
  transferPeerId: string;
  pairDevice: string;
  pairDeviceBusy: string;
  pairedDevice: string;
  pairPromptTitle: string;
  pairPromptDesc: (deviceName: string) => string;
  pairPromptConfirm: string;
  pairPromptCancel: string;
  pairPromptCancelConfirm: string;
  pairPromptLocalFingerprint: string;
  pairPromptRemoteFingerprint: string;
  pairRequestQueueTitle: string;
  incomingFileRequest: string;
  incomingFileRequestAriaLabel: string;
  wantsToSend: string;
  waitingRequests: (count: number) => string;
  receivePromptQueueTitle: string;
  receivePromptQueuedAt: string;
  receivePromptSaveTo: string;
  reject: string;
  rejectConfirm: string;
  accept: string;
  trustAndAccept: string;
  trustAndAcceptConfirm: string;
  failedToLoadDeviceInformation: string;
  failureReason: (reason: string) => string;
  sendFailed: string;
  sendQueueStarted: (fileCount: number, recipientCount: number) => string;
  sendQueuePartial: (queuedCount: number, failedCount: number, skippedCount: number) => string;
  sendQueueUnavailable: (recipientCount: number) => string;
  sendQueueStatusReady: (readyCount: number, totalCount: number) => string;
  sendQueueStatusReadyWithChecking: (
    readyCount: number,
    checkingCount: number,
    totalCount: number
  ) => string;
  sendQueueStatusChecking: (checkingCount: number) => string;
  sendQueueStatusNoRecipients: string;
  sendQueueStatusNoReadyRecipients: string;
  failedToAcceptIncomingFile: string;
  failedToRejectIncomingFile: string;
  failedToOpenSandbox: string;
  errorDeviceNotFound: string;
  errorOfferNotFound: string;
  errorPeerDeclined: string;
  errorPeerDeclinedTooLarge: string;
  errorPeerIdentityMismatch: string;
  errorSourceFileChanged: string;
  errorPeerClosedBeforeAccept: string;
  errorPeerClosedBeforeComplete: string;
  errorSocketClosedBeforeComplete: string;
  errorConnectionTimedOut: string;
  errorPeerNoResponse: string;
  errorTransferTimedOut: string;
  settings: string;
  settingsProfileSection: string;
  settingsProfileSectionDesc: string;
  settingsProfileName: string;
  settingsProfileNameDesc: string;
  settingsProfileNameRequired: string;
  settingsProfileAvatar: string;
  settingsProfileAvatarDesc: string;
  settingsProfileChangeAvatar: string;
  settingsProfileRemoveAvatar: string;
  settingsProfileAvatarReady: string;
  settingsProfileAvatarLocalOnly: string;
  settingsReceiveSection: string;
  settingsReceiveSectionDesc: string;
  settingsStorageSection: string;
  settingsStorageSectionDesc: string;
  settingsMaxSandboxSize: string;
  settingsMaxSandboxSizeDesc: string;
  settingsMaxSandboxSizeUnit: string;
  settingsAutoAccept: string;
  settingsAutoAcceptDesc: string;
  settingsAutoAcceptMaxSize: string;
  settingsAutoAcceptMaxSizeDesc: string;
  settingsOpenReceivedFolder: string;
  settingsOpenReceivedFolderDesc: string;
  settingsDesktopNotifications: string;
  settingsDesktopNotificationsDesc: string;
  settingsNotificationsPermissionGranted: string;
  settingsNotificationsPermissionDefault: string;
  settingsNotificationsPermissionDenied: string;
  settingsNotificationsRequestPermission: string;
  settingsNotificationsRequestingPermission: string;
  settingsTrustedDevices: string;
  settingsTrustedDevicesDesc: string;
  settingsTrustedDevicesEmpty: string;
  settingsTrustedDevicesRemove: string;
  settingsTrustedDevicesRemoveConfirm: string;
  settingsMaintenanceSection: string;
  settingsMaintenanceSectionDesc: string;
  settingsTransferHistoryCount: string;
  settingsResumeCacheCount: string;
  settingsResumeCacheBytes: string;
  settingsClearTransferHistory: string;
  settingsClearTransferHistoryConfirm: string;
  settingsClearResumeCache: string;
  settingsClearResumeCacheConfirm: string;
  settingsAcceptNote: string;
  settingsSandboxFolder: string;
  settingsSandboxFolderDesc: string;
  settingsSandboxFolderDefault: string;
  settingsSandboxFolderCustom: string;
  settingsChangeSandboxFolder: string;
  settingsSpaceUsed: string;
  settingsSpaceRemaining: string;
  settingsUsageOfLimit: (used: string, total: string) => string;
  settingsSave: string;
  settingsSaving: string;
  settingsCancel: string;
  dropZoneFileSelected: (fileName: string) => string;
  dropZoneClearFile: string;
  dropZoneSend: string;
  dropZoneTrySend: string;
  dropZoneSending: string;
  dropZoneSelectDevice: string;
  dispatchTargetReady: (deviceName: string) => string;
  dispatchTargetIdle: string;
  dropZoneClearAll: string;
  dropZoneClearAllConfirm: string;
  dropZoneFileCount: (n: number) => string;
  dropZoneRemoveFile: string;
  dropZoneRemoveRecipient: (deviceName: string) => string;
  dropZoneAddMore: string;
  dropZoneDropToAdd: string;
  notificationIncomingTitle: string;
  notificationIncomingBody: (deviceName: string, fileName: string) => string;
  notificationPairTitle: string;
  notificationPairBody: (deviceName: string) => string;
  notificationTransferCompleteTitle: string;
  notificationTransferCompleteBody: (fileName: string) => string;
  notificationTransferFailedTitle: string;
  notificationTransferFailedBody: (fileName: string) => string;
}

export const LOCALE_STORAGE_KEY = 'syncfile.locale';

const zh: Messages = {
  localeName: '中文',
  selfDeviceLabel: '本机设备',
  loadingLocalDevice: '正在加载本机设备信息...',
  appNotReady: '应用尚未就绪',
  trustedDeviceLabel: '已信任',
  deviceFingerprintLabel: '指纹',
  heroEyebrow: '局域网传输控制台',
  heroLead: '面向可信设备的局域网文件传输工作台，集中管理发现、发送、接收和传输记录。',
  heroStamp: 'TRANSFER CONSOLE',
  openSandbox: '打开沙箱',
  dismiss: '关闭',
  languageLabel: '语言',
  mainMenuAriaLabel: '主菜单',
  workspaceSectionsAriaLabel: '工作区分区',
  expandMenu: '展开菜单',
  collapseMenu: '收起菜单',
  sidebarCommandCenter: '状态中心',
  sidebarWorkspaceLabel: '工作区',
  sidebarIntakeLabel: '接收入口',
  sidebarUtilitiesLabel: '工具',
  sidebarStatusDetail: (fileRequestCount, pairRequestCount, activeTransferCount) =>
    `文件请求 ${fileRequestCount} · 配对 ${pairRequestCount} · 活跃 ${activeTransferCount}`,
  routeLabel: '当前路线',
  routeIdle: '先选定一台目标设备，再打开这条投递路线。',
  routeMetaIdle: '尚未选中目的地',
  routeReady: (fromName, toName) => `${fromName} → ${toName}`,
  workflowKicker: '工作状态',
  workflowNoDeviceTitle: '等待发现附近设备',
  workflowSelectDeviceTitle: '选择目标设备',
  workflowAddFilesTitle: '添加要发送的文件',
  workflowReadyTitle: '可以开始发送',
  workflowTransferringTitle: '正在传输',
  workflowNoDeviceNote: '先确认另一台设备已打开 syncFile，并处于同一局域网。',
  workflowSelectDeviceNote: '从左侧设备清单选择一个或多个目的地，发件台会同步准备好。',
  workflowAddFilesNote: '目标设备已选定，拖入文件或文件夹即可建立发送队列。',
  workflowReadyNote: '目标和文件都已就绪，检查路线后点击发送。',
  workflowTransferringNote: '传输进度和异常会实时进入传输记录。',
  workflowStepDiscover: '发现',
  workflowStepDevice: '目标',
  workflowStepFiles: '文件',
  workflowStepReady: '确认',
  workflowStepTransfer: '传输',
  workspaceSignalsLabel: '工作区状态概览',
  workspaceMetricDevices: '设备',
  workspaceMetricRecipients: '收件人',
  workspaceMetricFiles: '文件',
  workspaceMetricActive: '活跃',
  workspaceMetricRequests: '请求',
  workspaceMetricCompleted: '完成',
  workspaceMetricIssues: '异常',
  onlineDevices: '在线设备',
  refreshDevices: '刷新设备',
  refreshingDevices: '刷新中...',
  sendFile: '发送文件',
  transferActivity: '传输记录',
  manifestKicker: '设备清单',
  manifestNote: '在线设备会按可达性和信任状态整理，选中后即可作为发送目标。',
  dispatchKicker: '发送工作台',
  dispatchNote: '添加文件、核对目标设备，并在发送前确认当前队列状态。',
  ledgerKicker: '传输记录',
  ledgerNote: '每一笔传输都会保留可追踪记录，便于复查进度、异常和结果。',
  noOnlinePeers: '暂无在线设备',
  keepRunningOnAnotherDevice: '请确保同一局域网内的另一台设备也在运行 syncFile。',
  deviceListEmptyStepOpen: '在另一台设备上安装并打开 syncFile。',
  deviceListEmptyStepLan: '确保两台设备处于同一局域网或同一 Wi-Fi。',
  deviceListEmptyStepRefresh: '返回这里点击“刷新设备”，等待发现完成。',
  deviceListTroubleshoot: '排障提示',
  deviceListTroubleshootBody: '检查防火墙是否允许 syncFile 通信，并确认两台设备处于同一 Wi-Fi 或局域网。',
  onlineDevicesAriaLabel: '在线设备列表',
  dropZonePassport: '发送条件',
  dropZoneTitle: '拖入文件，立刻发出',
  dropZoneWaitingTitle: '先准备本次投递目标',
  dropZoneWaitingBody: '也可以先暂存文件；选中在线设备后再发送。',
  dropZoneTargetReady: (targetName) => `本次目的地：${targetName}`,
  dropZoneTargetFallback: '尚未选择目标设备',
  dropZoneHint: '文件会通过局域网直连传输，并等待对方确认接收。',
  dropZoneAction: '拖拽文件或文件夹，或点击选取',
  dropZoneSelectDeviceFirst: '请先选择一个目标设备。',
  dropZonePickFromDisk: '或点击这里从磁盘选择文件。',
  dropZoneAddFolder: '添加文件夹',
  transferEmpty: '还没有任何传输记录。',
  sendTo: '发送到',
  receiveFrom: '接收自',
  unknownDevice: '未知设备',
  transferStatusPending: '等待中',
  transferStatusInProgress: '传输中',
  transferStatusPaused: '已暂停',
  transferStatusCompleted: '已完成',
  transferStatusFailed: '失败',
  transferStatusRejected: '已拒绝',
  transferStatusCancelled: '已取消',
  transferReceiveModeTrusted: '来自已信任设备',
  transferReceiveModeAuto: '自动接受',
  transferOpenFile: '打开文件',
  transferRevealFile: '在文件夹中显示',
  transferCancel: '取消',
  transferPause: '暂停',
  transferResume: '继续',
  transferRetry: '重试',
  transferDelete: '删除记录',
  transferDeleteConfirm: '确认删除',
  transferDetails: '查看详情',
  transferBatchFallback: '发送批次',
  transferRateLabel: '速率',
  transferEtaLabel: '剩余',
  transferPreparing: '准备发送中',
  transferWaitingForReceiver: '等待对方确认保存',
  selectedRecipientLabel: '已选',
  sendDraftSummary: (fileCount, recipientCount) => `${fileCount} 个文件 · ${recipientCount} 个收件人`,
  recipientSelectionSummary: (recipientCount) => `${recipientCount} 个收件人已选`,
  deviceReachabilityChecking: '端口探测中',
  deviceReachabilityReachable: '可发送',
  deviceReachabilityUnreachable: '端口不可达',
  recipientOfflineLabel: '暂时离线',
  taskFilterAll: '全部',
  taskFilterActive: '进行中',
  taskFilterDone: '已完成',
  taskFilterIssues: '异常',
  taskDirectionAll: '全部方向',
  taskDirectionSend: '仅发送',
  taskDirectionReceive: '仅接收',
  taskPeerAll: '全部设备',
  taskSearchPlaceholder: '搜索文件名或设备',
  taskNoMatches: '没有匹配当前筛选条件的任务。',
  taskNoMatchesHint: '调整关键词，或重置筛选后再查看传输记录。',
  taskResumeVisible: '继续可见暂停任务',
  taskRetryVisible: '重试可见异常任务',
  taskCancelVisible: '取消可见活动任务',
  taskCancelVisibleConfirm: '确认取消可见活动任务',
  taskClearVisible: '清理可见记录',
  taskClearVisibleConfirm: '确认清理可见记录',
  taskResetFilters: '重置筛选',
  requestsInbox: '收件箱',
  requestFilesTab: '文件请求',
  requestPairsTab: '配对请求',
  requestShowFiles: '查看文件请求',
  requestShowPairs: '查看配对请求',
  requestsEmptyTitle: '暂时没有待处理请求。',
  requestsEmptyBody: '当前没有待处理的接收请求，你的局域网非常安静。',
  requestFilesEmptyTitle: '暂无文件请求。',
  requestFilesEmptyBody: '当前没有设备在向你发送文件，局域网里很安静。',
  requestPairsEmptyTitle: '暂无配对请求。',
  requestPairsEmptyBody: '还没有新的信任请求。有人靠近时，这里会亮起来。',
  logs: '日志',
  toolsMenuLabel: '工具',
  appearanceLight: '切换到浅色模式',
  appearanceDark: '切换到深色模式',
  appearanceSystem: '跟随系统外观',
  requestsUnreadIndicator: (count) => `${count} 个未读请求`,
  notificationsLabel: '通知',
  globalDropTitle: '松开即可添加文件',
  globalDropBody: 'syncFile 会切回发送工作台，并把文件加入当前队列。',
  globalDropQueued: (count) => `已添加 ${count} 个拖入项目，发送工作台已准备好。`,
  logViewerTitle: '运行日志',
  logViewerEmpty: '暂无日志。执行发现、配对或传输后会在这里显示。',
  logViewerRefresh: '刷新',
  logViewerClear: '清空日志',
  logViewerClearConfirm: '确认清空日志',
  logViewerCopy: '复制日志',
  logViewerCopied: '日志已复制。',
  logViewerCopyFailed: '复制日志失败。',
  logViewerRefreshed: '日志已刷新。',
  logViewerCleared: '日志已清空。',
  transferLocalPath: '本地路径',
  transferPeerId: '设备 ID',
  pairDevice: '配对',
  pairDeviceBusy: '配对中...',
  pairedDevice: '已配对',
  pairPromptTitle: '确认设备指纹',
  pairPromptDesc: (deviceName) => `请和 ${deviceName} 设备上的指纹进行核对，确认一致后再建立配对。`,
  pairPromptConfirm: '确认配对',
  pairPromptCancel: '暂不配对',
  pairPromptCancelConfirm: '确认拒绝配对',
  pairPromptLocalFingerprint: '本机指纹',
  pairPromptRemoteFingerprint: '对方指纹',
  pairRequestQueueTitle: '等待中的配对请求',
  incomingFileRequest: '收到文件请求',
  incomingFileRequestAriaLabel: '收到文件请求',
  wantsToSend: '想要发送给你：',
  waitingRequests: (count: number) => `还有 ${count} 个请求正在等待处理。`,
  receivePromptQueueTitle: '等待中的请求',
  receivePromptQueuedAt: '收到时间',
  receivePromptSaveTo: '将保存到',
  reject: '拒绝',
  rejectConfirm: '确认拒绝',
  accept: '接受',
  trustAndAccept: '信任并接受',
  trustAndAcceptConfirm: '确认信任并接受',
  failedToLoadDeviceInformation: '加载设备信息失败。',
  failureReason: (reason) => `原因：${reason}`,
  sendFailed: '发送失败。',
  sendQueueStarted: (fileCount, recipientCount) => `已将 ${fileCount} 个文件加入发送队列，目标 ${recipientCount} 个收件人。`,
  sendQueuePartial: (queuedCount, failedCount, skippedCount) =>
    `已加入队列 ${queuedCount} 个收件人，失败 ${failedCount} 个，未尝试 ${skippedCount} 个。草稿已为未完成目标保留。`,
  sendQueueUnavailable: (recipientCount) => `已选 ${recipientCount} 个收件人，但当前没有可发送的在线目标。`,
  sendQueueStatusReady: (readyCount, totalCount) => `${readyCount} / ${totalCount} 个收件人可立即发送`,
  sendQueueStatusReadyWithChecking: (readyCount, checkingCount, totalCount) =>
    `${readyCount} / ${totalCount} 个已确认可发送，${checkingCount} 个探测中也会尝试`,
  sendQueueStatusChecking: (checkingCount) => `${checkingCount} 个收件人正在探测，可先加入队列尝试发送`,
  sendQueueStatusNoRecipients: '先选择至少一个收件设备',
  sendQueueStatusNoReadyRecipients: '当前没有可立即发送的收件人',
  failedToAcceptIncomingFile: '接受文件失败。',
  failedToRejectIncomingFile: '拒绝文件失败。',
  failedToOpenSandbox: '打开沙箱目录失败。',
  errorDeviceNotFound: '未找到目标设备。',
  errorOfferNotFound: '未找到对应的接收请求。',
  errorPeerDeclined: '对方拒绝了这次传输。',
  errorPeerDeclinedTooLarge: '对方因接收容量限制拒绝了这次传输。',
  errorPeerIdentityMismatch: '对方的设备身份校验失败，这次传输未被接受。',
  errorSourceFileChanged: '源文件已发生变化，无法继续续传，请重新选择文件后再发送。',
  errorPeerClosedBeforeAccept: '对方在接受前关闭了连接。',
  errorPeerClosedBeforeComplete: '对方在传输完成前关闭了连接。',
  errorSocketClosedBeforeComplete: '连接在传输完成前被关闭。',
  errorConnectionTimedOut: '连接目标设备超时。',
  errorPeerNoResponse: '对方长时间没有响应这次请求。',
  errorTransferTimedOut: '传输超时，已停止等待。',
  settings: '设置',
  settingsProfileSection: '个人资料',
  settingsProfileSectionDesc: '设置你的设备显示名称和头像，局域网内其他设备会看到这份资料。',
  settingsProfileName: '设备名字',
  settingsProfileNameDesc: '这个名字会显示在设备列表、发送目标和传输记录里。',
  settingsProfileNameRequired: '请输入设备名字。',
  settingsProfileAvatar: '设备头像',
  settingsProfileAvatarDesc: '头像会保存在本机，并作为压缩缩略图广播给其他设备。',
  settingsProfileChangeAvatar: '更换头像',
  settingsProfileRemoveAvatar: '移除头像',
  settingsProfileAvatarReady: '这张头像会在设备被发现后通过安全通道同步给其他设备。',
  settingsProfileAvatarLocalOnly: '头像已保存在本机。',
  settingsReceiveSection: '接收策略',
  settingsReceiveSectionDesc: '控制传入文件如何进入当前设备。',
  settingsStorageSection: '存储策略',
  settingsStorageSectionDesc: '决定文件保存到哪里，以及沙箱最多能装多少内容。',
  settingsMaxSandboxSize: '沙箱最大容量',
  settingsMaxSandboxSizeDesc: '如果新文件会让沙箱总占用超出上限，将自动拒收。',
  settingsMaxSandboxSizeUnit: 'MB',
  settingsAutoAccept: '自动接受',
  settingsAutoAcceptDesc: '按下面的规则自动接受传入文件，无需每次手动确认。',
  settingsAutoAcceptMaxSize: '自动接受大小上限',
  settingsAutoAcceptMaxSizeDesc: '只有不超过这个大小的文件，才会被自动接受；更大的文件仍会手动确认。',
  settingsOpenReceivedFolder: '接收完成后打开收件夹',
  settingsOpenReceivedFolderDesc: '每次收完文件后，在系统文件管理器里定位到新文件。',
  settingsDesktopNotifications: '桌面通知',
  settingsDesktopNotificationsDesc: '应用在后台时，为新请求和传输结果显示系统通知。',
  settingsNotificationsPermissionGranted: '系统通知权限已开启。',
  settingsNotificationsPermissionDefault: '尚未请求系统通知权限。',
  settingsNotificationsPermissionDenied: '系统通知权限已被拒绝，需要在系统设置里手动开启。',
  settingsNotificationsRequestPermission: '请求通知权限',
  settingsNotificationsRequestingPermission: '正在请求权限...',
  settingsTrustedDevices: '已信任设备',
  settingsTrustedDevicesDesc: '这些设备发送的小文件会在大小限制内自动接受。',
  settingsTrustedDevicesEmpty: '还没有已信任设备。',
  settingsTrustedDevicesRemove: '移除',
  settingsTrustedDevicesRemoveConfirm: '确认移除',
  settingsMaintenanceSection: '维护',
  settingsMaintenanceSectionDesc: '管理本地历史记录和未完成缓存。',
  settingsTransferHistoryCount: '历史记录条数',
  settingsResumeCacheCount: '未完成缓存数',
  settingsResumeCacheBytes: '未完成缓存大小',
  settingsClearTransferHistory: '清理历史',
  settingsClearTransferHistoryConfirm: '确认清理历史',
  settingsClearResumeCache: '清理未完成缓存',
  settingsClearResumeCacheConfirm: '确认清理缓存',
  settingsAcceptNote: '当前版本一旦接受文件，就会直接写入沙箱，因此不再区分“接受后是否下载”。',
  settingsSandboxFolder: '沙箱位置',
  settingsSandboxFolderDesc: '所有收到的文件都会按设备分目录存放在这里。',
  settingsSandboxFolderDefault: '默认位置',
  settingsSandboxFolderCustom: '自定义位置',
  settingsChangeSandboxFolder: '更换位置',
  settingsSpaceUsed: '已用空间',
  settingsSpaceRemaining: '剩余空间',
  settingsUsageOfLimit: (used, total) => `${used} / ${total}`,
  settingsSave: '保存',
  settingsSaving: '保存中...',
  settingsCancel: '取消',
  dropZoneFileSelected: (fileName: string) => `已选择：${fileName}`,
  dropZoneClearFile: '清除',
  dropZoneSend: '发送',
  dropZoneTrySend: '尝试发送',
  dropZoneSending: '加入队列...',
  dropZoneSelectDevice: '请选择一台目标设备',
  dispatchTargetReady: (deviceName: string) => `正在发送文件给 ${deviceName}`,
  dispatchTargetIdle: '请选择一个目标设备后再发送',
  dropZoneClearAll: '清空',
  dropZoneClearAllConfirm: '确认清空',
  dropZoneFileCount: (n: number) => `已选 ${n} 个文件`,
  dropZoneRemoveFile: '移除',
  dropZoneRemoveRecipient: (deviceName: string) => `移除收件人 ${deviceName}`,
  dropZoneAddMore: '继续添加',
  dropZoneDropToAdd: '松开以加入当前队列',
  notificationIncomingTitle: 'syncFile 收到文件请求',
  notificationIncomingBody: (deviceName, fileName) => `${deviceName} 想发送 ${fileName}`,
  notificationPairTitle: 'syncFile 收到配对请求',
  notificationPairBody: (deviceName) => `${deviceName} 想与你建立信任关系`,
  notificationTransferCompleteTitle: 'syncFile 传输完成',
  notificationTransferCompleteBody: (fileName) => `${fileName} 已完成传输`,
  notificationTransferFailedTitle: 'syncFile 传输失败',
  notificationTransferFailedBody: (fileName) => `${fileName} 传输失败，请检查后重试`
};

const en: Messages = {
  localeName: 'English',
  selfDeviceLabel: 'This device',
  loadingLocalDevice: 'Loading local device...',
  appNotReady: 'Not ready',
  trustedDeviceLabel: 'Trusted',
  deviceFingerprintLabel: 'Fingerprint',
  heroEyebrow: 'LAN transfer console',
  heroLead: 'A focused workspace for trusted local file transfer, covering discovery, dispatch, intake, and audit history.',
  heroStamp: 'TRANSFER CONSOLE',
  openSandbox: 'Open sandbox',
  dismiss: 'Dismiss',
  languageLabel: 'Language',
  mainMenuAriaLabel: 'Main menu',
  workspaceSectionsAriaLabel: 'Workspace sections',
  expandMenu: 'Expand menu',
  collapseMenu: 'Collapse menu',
  sidebarCommandCenter: 'Status center',
  sidebarWorkspaceLabel: 'Workspace',
  sidebarIntakeLabel: 'Intake',
  sidebarUtilitiesLabel: 'Utilities',
  sidebarStatusDetail: (fileRequestCount, pairRequestCount, activeTransferCount) =>
    `${fileRequestCount} files · ${pairRequestCount} pairs · ${activeTransferCount} active`,
  routeLabel: 'Current route',
  routeIdle: 'Choose a destination device before opening this dispatch lane.',
  routeMetaIdle: 'No destination selected',
  routeReady: (fromName, toName) => `${fromName} → ${toName}`,
  workflowKicker: 'Workspace status',
  workflowNoDeviceTitle: 'Waiting for nearby devices',
  workflowSelectDeviceTitle: 'Choose a target device',
  workflowAddFilesTitle: 'Add files to send',
  workflowReadyTitle: 'Ready to send',
  workflowTransferringTitle: 'Transfer in progress',
  workflowNoDeviceNote: 'Make sure another device is running syncFile on this LAN.',
  workflowSelectDeviceNote: 'Pick one or more destinations from the device manifest and the dispatch desk will arm itself.',
  workflowAddFilesNote: 'A destination is selected. Drop files or folders to build the outgoing queue.',
  workflowReadyNote: 'Destination and files are ready. Check the route, then send.',
  workflowTransferringNote: 'Progress and issues are mirrored into the transfer activity list.',
  workflowStepDiscover: 'Discover',
  workflowStepDevice: 'Target',
  workflowStepFiles: 'Files',
  workflowStepReady: 'Confirm',
  workflowStepTransfer: 'Transfer',
  workspaceSignalsLabel: 'Workspace status summary',
  workspaceMetricDevices: 'Devices',
  workspaceMetricRecipients: 'Recipients',
  workspaceMetricFiles: 'Files',
  workspaceMetricActive: 'Active',
  workspaceMetricRequests: 'Requests',
  workspaceMetricCompleted: 'Done',
  workspaceMetricIssues: 'Issues',
  onlineDevices: 'Online devices',
  refreshDevices: 'Refresh devices',
  refreshingDevices: 'Refreshing...',
  sendFile: 'Send file',
  transferActivity: 'Transfer activity',
  manifestKicker: 'Manifest',
  manifestNote: 'Discovered peers are organized by reachability and trust state before they become destinations.',
  dispatchKicker: 'Send workspace',
  dispatchNote: 'Add files, confirm recipients, and review queue readiness before sending.',
  ledgerKicker: 'History',
  ledgerNote: 'Every transfer keeps a traceable record for progress, issues, and final outcome.',
  noOnlinePeers: 'No online peers',
  keepRunningOnAnotherDevice: 'Keep syncFile running on another device in this LAN.',
  deviceListEmptyStepOpen: 'Install and open syncFile on another device.',
  deviceListEmptyStepLan: 'Make sure both devices are on the same LAN or Wi-Fi.',
  deviceListEmptyStepRefresh: 'Come back here and click refresh to discover it.',
  deviceListTroubleshoot: 'Troubleshoot',
  deviceListTroubleshootBody: 'Check firewall rules for syncFile and make sure both devices are on the same Wi-Fi or LAN.',
  onlineDevicesAriaLabel: 'Online devices',
  dropZonePassport: 'Send conditions',
  dropZoneTitle: 'Drop a file to send immediately',
  dropZoneWaitingTitle: 'Prepare a destination first',
  dropZoneWaitingBody: 'You can stage files now, then choose an online device before sending.',
  dropZoneTargetReady: (targetName) => `Destination locked: ${targetName}`,
  dropZoneTargetFallback: 'No destination selected yet',
  dropZoneHint: 'Transfers run over direct LAN links and wait for receiver confirmation.',
  dropZoneAction: 'Drag files or folders, or click to browse',
  dropZoneSelectDeviceFirst: 'Select a target device first.',
  dropZonePickFromDisk: 'Or click to pick from disk.',
  dropZoneAddFolder: 'Add folder',
  transferEmpty: 'No transfer records yet.',
  sendTo: 'Send to',
  receiveFrom: 'Receive from',
  unknownDevice: 'unknown',
  transferStatusPending: 'Pending',
  transferStatusInProgress: 'In progress',
  transferStatusPaused: 'Paused',
  transferStatusCompleted: 'Completed',
  transferStatusFailed: 'Failed',
  transferStatusRejected: 'Rejected',
  transferStatusCancelled: 'Cancelled',
  transferReceiveModeTrusted: 'Trusted device',
  transferReceiveModeAuto: 'Auto-accepted',
  transferOpenFile: 'Open file',
  transferRevealFile: 'Reveal in folder',
  transferCancel: 'Cancel',
  transferPause: 'Pause',
  transferResume: 'Resume',
  transferRetry: 'Retry',
  transferDelete: 'Delete record',
  transferDeleteConfirm: 'Confirm delete',
  transferDetails: 'View details',
  transferBatchFallback: 'Send batch',
  transferRateLabel: 'Rate',
  transferEtaLabel: 'ETA',
  transferPreparing: 'Preparing transfer',
  transferWaitingForReceiver: 'Waiting for receiver confirmation',
  selectedRecipientLabel: 'Selected',
  sendDraftSummary: (fileCount, recipientCount) => `${fileCount} files · ${recipientCount} recipients`,
  recipientSelectionSummary: (recipientCount) => `${recipientCount} recipients selected`,
  deviceReachabilityChecking: 'Checking port',
  deviceReachabilityReachable: 'Ready',
  deviceReachabilityUnreachable: 'Port unreachable',
  recipientOfflineLabel: 'Offline for now',
  taskFilterAll: 'All',
  taskFilterActive: 'Active',
  taskFilterDone: 'Done',
  taskFilterIssues: 'Issues',
  taskDirectionAll: 'All directions',
  taskDirectionSend: 'Send only',
  taskDirectionReceive: 'Receive only',
  taskPeerAll: 'All peers',
  taskSearchPlaceholder: 'Search file or device',
  taskNoMatches: 'No tasks match the current filters.',
  taskNoMatchesHint: 'Adjust the search, or reset filters to see transfer records again.',
  taskResumeVisible: 'Resume visible paused',
  taskRetryVisible: 'Retry visible issues',
  taskCancelVisible: 'Cancel visible active tasks',
  taskCancelVisibleConfirm: 'Confirm cancel visible active tasks',
  taskClearVisible: 'Clear visible records',
  taskClearVisibleConfirm: 'Confirm clear visible',
  taskResetFilters: 'Reset filters',
  requestsInbox: 'Inbox',
  requestFilesTab: 'File requests',
  requestPairsTab: 'Pair requests',
  requestShowFiles: 'View file requests',
  requestShowPairs: 'View pair requests',
  requestsEmptyTitle: 'No pending requests right now.',
  requestsEmptyBody: 'No pending receive requests. The LAN is quiet right now.',
  requestFilesEmptyTitle: 'No file requests.',
  requestFilesEmptyBody: 'No nearby device is sending a file right now.',
  requestPairsEmptyTitle: 'No pair requests.',
  requestPairsEmptyBody: 'No new trust requests yet. This panel lights up when one arrives.',
  logs: 'Logs',
  toolsMenuLabel: 'Tools',
  appearanceLight: 'Switch to light mode',
  appearanceDark: 'Switch to dark mode',
  appearanceSystem: 'Follow system appearance',
  requestsUnreadIndicator: (count) => `${count} unread request(s)`,
  notificationsLabel: 'Notifications',
  globalDropTitle: 'Release to add files',
  globalDropBody: 'syncFile will switch to the send workspace and queue the dropped files.',
  globalDropQueued: (count) => `Added ${count} dropped item(s); the send workspace is ready.`,
  logViewerTitle: 'Runtime logs',
  logViewerEmpty: 'No logs yet. Discovery, pairing, and transfer events will appear here.',
  logViewerRefresh: 'Refresh',
  logViewerClear: 'Clear logs',
  logViewerClearConfirm: 'Confirm clear logs',
  logViewerCopy: 'Copy logs',
  logViewerCopied: 'Logs copied.',
  logViewerCopyFailed: 'Failed to copy logs.',
  logViewerRefreshed: 'Logs refreshed.',
  logViewerCleared: 'Logs cleared.',
  transferLocalPath: 'Local path',
  transferPeerId: 'Peer ID',
  pairDevice: 'Pair',
  pairDeviceBusy: 'Pairing...',
  pairedDevice: 'Paired',
  pairPromptTitle: 'Confirm device fingerprint',
  pairPromptDesc: (deviceName) => `Compare the fingerprint shown on ${deviceName} before trusting this device.`,
  pairPromptConfirm: 'Confirm pair',
  pairPromptCancel: 'Not now',
  pairPromptCancelConfirm: 'Confirm reject pair',
  pairPromptLocalFingerprint: 'This device',
  pairPromptRemoteFingerprint: 'Remote device',
  pairRequestQueueTitle: 'Pending pair requests',
  incomingFileRequest: 'Incoming file request',
  incomingFileRequestAriaLabel: 'Incoming file offer',
  wantsToSend: 'wants to send:',
  waitingRequests: (count: number) => `${count} more request(s) waiting.`,
  receivePromptQueueTitle: 'Pending requests',
  receivePromptQueuedAt: 'Received',
  receivePromptSaveTo: 'Will be saved to',
  reject: 'Reject',
  rejectConfirm: 'Confirm reject',
  accept: 'Accept',
  trustAndAccept: 'Trust & accept',
  trustAndAcceptConfirm: 'Confirm trust & accept',
  failedToLoadDeviceInformation: 'Failed to load device information.',
  failureReason: (reason) => `Reason: ${reason}`,
  sendFailed: 'Send failed.',
  sendQueueStarted: (fileCount, recipientCount) =>
    `Queued ${fileCount} files for ${recipientCount} recipient(s).`,
  sendQueuePartial: (queuedCount, failedCount, skippedCount) =>
    `Queued ${queuedCount} recipient(s), failed ${failedCount}, skipped ${skippedCount}. Drafts were kept for unfinished targets.`,
  sendQueueUnavailable: (recipientCount) =>
    `${recipientCount} recipient(s) are selected, but none are currently reachable for sending.`,
  sendQueueStatusReady: (readyCount, totalCount) => `${readyCount} of ${totalCount} recipient(s) are ready`,
  sendQueueStatusReadyWithChecking: (readyCount, checkingCount, totalCount) =>
    `${readyCount} of ${totalCount} confirmed ready; ${checkingCount} checking will be tried too`,
  sendQueueStatusChecking: (checkingCount) =>
    `Checking connectivity for ${checkingCount} recipient(s); you can queue now`,
  sendQueueStatusNoRecipients: 'Choose at least one recipient device',
  sendQueueStatusNoReadyRecipients: 'No recipient is ready for immediate sending',
  failedToAcceptIncomingFile: 'Failed to accept incoming file.',
  failedToRejectIncomingFile: 'Failed to reject incoming file.',
  failedToOpenSandbox: 'Unable to open sandbox folder.',
  errorDeviceNotFound: 'Target device not found.',
  errorOfferNotFound: 'Incoming offer not found.',
  errorPeerDeclined: 'The peer declined this transfer.',
  errorPeerDeclinedTooLarge: 'The peer rejected this transfer because its receive limit was reached.',
  errorPeerIdentityMismatch: 'The peer identity verification failed and the transfer was rejected.',
  errorSourceFileChanged: 'The source file changed, so this transfer cannot be resumed. Select the file again.',
  errorPeerClosedBeforeAccept: 'The peer closed the connection before accepting.',
  errorPeerClosedBeforeComplete: 'The peer closed the connection before completion.',
  errorSocketClosedBeforeComplete: 'The connection closed before transfer completion.',
  errorConnectionTimedOut: 'Connecting to the peer timed out.',
  errorPeerNoResponse: 'The peer did not respond in time.',
  errorTransferTimedOut: 'The transfer timed out.',
  settings: 'Settings',
  settingsProfileSection: 'Profile',
  settingsProfileSectionDesc: 'Set the device name and avatar that other devices see on this LAN.',
  settingsProfileName: 'Device name',
  settingsProfileNameDesc: 'This name appears in discovery, recipient chips, and transfer records.',
  settingsProfileNameRequired: 'Enter a device name.',
  settingsProfileAvatar: 'Device avatar',
  settingsProfileAvatarDesc: 'The avatar is stored locally and broadcast as a compressed thumbnail to peers.',
  settingsProfileChangeAvatar: 'Change avatar',
  settingsProfileRemoveAvatar: 'Remove avatar',
  settingsProfileAvatarReady: 'This avatar will sync to nearby devices over the secure profile channel.',
  settingsProfileAvatarLocalOnly: 'The avatar is saved locally.',
  settingsReceiveSection: 'Receive behavior',
  settingsReceiveSectionDesc: 'Control how incoming files enter this device.',
  settingsStorageSection: 'Storage behavior',
  settingsStorageSectionDesc: 'Choose where received files live and how much space the sandbox can use.',
  settingsMaxSandboxSize: 'Max sandbox size',
  settingsMaxSandboxSizeDesc: 'If a new file would push total sandbox usage past this limit, it is rejected automatically.',
  settingsMaxSandboxSizeUnit: 'MB',
  settingsAutoAccept: 'Auto-accept',
  settingsAutoAcceptDesc: 'Automatically accept incoming files that match the rule below.',
  settingsAutoAcceptMaxSize: 'Auto-accept size limit',
  settingsAutoAcceptMaxSizeDesc: 'Only files up to this size are auto-accepted. Larger files still require manual approval.',
  settingsOpenReceivedFolder: 'Reveal after receive',
  settingsOpenReceivedFolderDesc: 'Show the new file in the system file manager after each completed receive.',
  settingsDesktopNotifications: 'Desktop notifications',
  settingsDesktopNotificationsDesc: 'Show system notifications for new requests and transfer results while the app is in the background.',
  settingsNotificationsPermissionGranted: 'System notification permission is enabled.',
  settingsNotificationsPermissionDefault: 'System notification permission has not been requested yet.',
  settingsNotificationsPermissionDenied: 'System notification permission is denied. Re-enable it in system settings.',
  settingsNotificationsRequestPermission: 'Request notification permission',
  settingsNotificationsRequestingPermission: 'Requesting permission...',
  settingsTrustedDevices: 'Trusted devices',
  settingsTrustedDevicesDesc: 'Small files from these devices are auto-accepted within the size limit.',
  settingsTrustedDevicesEmpty: 'No trusted devices yet.',
  settingsTrustedDevicesRemove: 'Remove',
  settingsTrustedDevicesRemoveConfirm: 'Confirm remove',
  settingsMaintenanceSection: 'Maintenance',
  settingsMaintenanceSectionDesc: 'Manage local history and unfinished cached data.',
  settingsTransferHistoryCount: 'History entries',
  settingsResumeCacheCount: 'Resumable cache count',
  settingsResumeCacheBytes: 'Resumable cache size',
  settingsClearTransferHistory: 'Clear history',
  settingsClearTransferHistoryConfirm: 'Confirm clear history',
  settingsClearResumeCache: 'Clear resumable cache',
  settingsClearResumeCacheConfirm: 'Confirm clear cache',
  settingsAcceptNote: 'In the current build, accepting a file immediately writes it into the sandbox, so there is no separate download step.',
  settingsSandboxFolder: 'Sandbox folder',
  settingsSandboxFolderDesc: 'All received files are stored here in per-device subfolders.',
  settingsSandboxFolderDefault: 'Default location',
  settingsSandboxFolderCustom: 'Custom location',
  settingsChangeSandboxFolder: 'Change folder',
  settingsSpaceUsed: 'Used',
  settingsSpaceRemaining: 'Remaining',
  settingsUsageOfLimit: (used, total) => `${used} / ${total}`,
  settingsSave: 'Save',
  settingsSaving: 'Saving...',
  settingsCancel: 'Cancel',
  dropZoneFileSelected: (fileName: string) => `Selected: ${fileName}`,
  dropZoneClearFile: 'Clear',
  dropZoneSend: 'Send',
  dropZoneTrySend: 'Try send',
  dropZoneSending: 'Queueing...',
  dropZoneSelectDevice: 'Select a target device',
  dispatchTargetReady: (deviceName: string) => `Sending files to ${deviceName}`,
  dispatchTargetIdle: 'Select a target device before sending',
  dropZoneClearAll: 'Clear all',
  dropZoneClearAllConfirm: 'Confirm clear',
  dropZoneFileCount: (n: number) => `${n} file(s) selected`,
  dropZoneRemoveFile: 'Remove',
  dropZoneRemoveRecipient: (deviceName: string) => `Remove recipient ${deviceName}`,
  dropZoneAddMore: 'Add more',
  dropZoneDropToAdd: 'Release to add to queue',
  notificationIncomingTitle: 'syncFile incoming file request',
  notificationIncomingBody: (deviceName, fileName) => `${deviceName} wants to send ${fileName}`,
  notificationPairTitle: 'syncFile pair request',
  notificationPairBody: (deviceName) => `${deviceName} wants to pair with this device`,
  notificationTransferCompleteTitle: 'syncFile transfer complete',
  notificationTransferCompleteBody: (fileName) => `${fileName} finished transferring`,
  notificationTransferFailedTitle: 'syncFile transfer failed',
  notificationTransferFailedBody: (fileName) => `${fileName} failed to transfer`
};

export const messagesByLocale: Record<Locale, Messages> = {
  zh,
  en
};

export function detectInitialLocale(): Locale {
  const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (saved === 'zh' || saved === 'en') {
    return saved;
  }

  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function setStoredLocale(locale: Locale): void {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
}
