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
  routeLabel: string;
  routeIdle: string;
  routeMetaIdle: string;
  routeReady: (fromName: string, toName: string) => string;
  onlineDevices: string;
  refreshDevices: string;
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
  onlineDevicesAriaLabel: string;
  compactSectionsAriaLabel: string;
  dropZonePassport: string;
  dropZoneTitle: string;
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
  transferRateLabel: string;
  transferEtaLabel: string;
  transferPreparing: string;
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
  taskRetryVisible: string;
  taskCancelVisible: string;
  requestsInbox: string;
  logs: string;
  logViewerTitle: string;
  logViewerEmpty: string;
  logViewerRefresh: string;
  logViewerClear: string;
  logViewerCopy: string;
  transferLocalPath: string;
  transferPeerId: string;
  pairDevice: string;
  pairedDevice: string;
  pairPromptTitle: string;
  pairPromptDesc: (deviceName: string) => string;
  pairPromptConfirm: string;
  pairPromptCancel: string;
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
  accept: string;
  trustAndAccept: string;
  failedToLoadDeviceInformation: string;
  sendFailed: string;
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
  settingsTrustedDevices: string;
  settingsTrustedDevicesDesc: string;
  settingsTrustedDevicesEmpty: string;
  settingsTrustedDevicesRemove: string;
  settingsMaintenanceSection: string;
  settingsMaintenanceSectionDesc: string;
  settingsTransferHistoryCount: string;
  settingsResumeCacheCount: string;
  settingsResumeCacheBytes: string;
  settingsClearTransferHistory: string;
  settingsClearResumeCache: string;
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
  settingsCancel: string;
  dropZoneFileSelected: (fileName: string) => string;
  dropZoneClearFile: string;
  dropZoneSend: string;
  dropZoneSelectDevice: string;
  dropZoneClearAll: string;
  dropZoneFileCount: (n: number) => string;
  dropZoneRemoveFile: string;
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
  heroEyebrow: '局域网即时投递',
  heroLead: '把此刻需要的文件，像一张被盖章的航空托运单那样，直接送往下一台设备。',
  heroStamp: 'AIR DESK',
  openSandbox: '打开沙箱',
  dismiss: '关闭',
  languageLabel: '语言',
  routeLabel: '当前路线',
  routeIdle: '先选定一台目标设备，再打开这条投递路线。',
  routeMetaIdle: '尚未选中目的地',
  routeReady: (fromName, toName) => `${fromName} → ${toName}`,
  onlineDevices: '在线设备',
  refreshDevices: '刷新设备',
  sendFile: '发送文件',
  transferActivity: '传输记录',
  manifestKicker: '设备清单',
  manifestNote: '在线设备会被整理成投递目的地。选中之后，右侧发件台会立刻进入可发送状态。',
  dispatchKicker: '发件台',
  dispatchNote: '支持拖拽或点击选取，可连续加入多个文件；接收端仍需手动确认。',
  ledgerKicker: '传输账本',
  ledgerNote: '每一笔投递都会记在这里，从等待、传输到完成或失败都可追踪。',
  noOnlinePeers: '暂无在线设备',
  keepRunningOnAnotherDevice: '请确保同一局域网内的另一台设备也在运行 syncFile。',
  deviceListEmptyStepOpen: '在另一台设备上安装并打开 syncFile。',
  deviceListEmptyStepLan: '确保两台设备处于同一局域网或同一 Wi-Fi。',
  deviceListEmptyStepRefresh: '返回这里点击“刷新设备”，等待发现完成。',
  onlineDevicesAriaLabel: '在线设备列表',
  compactSectionsAriaLabel: '紧凑布局分区切换',
  dropZonePassport: '投递许可',
  dropZoneTitle: '拖入文件，立刻发出',
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
  transferRateLabel: '速率',
  transferEtaLabel: '剩余',
  transferPreparing: '准备发送中',
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
  taskRetryVisible: '重试可见异常任务',
  taskCancelVisible: '取消可见进行中任务',
  requestsInbox: '请求收件箱',
  logs: '日志',
  logViewerTitle: '运行日志',
  logViewerEmpty: '暂无日志。执行发现、配对或传输后会在这里显示。',
  logViewerRefresh: '刷新',
  logViewerClear: '清空日志',
  logViewerCopy: '复制日志',
  transferLocalPath: '本地路径',
  transferPeerId: '设备 ID',
  pairDevice: '配对',
  pairedDevice: '已配对',
  pairPromptTitle: '确认设备指纹',
  pairPromptDesc: (deviceName) => `请和 ${deviceName} 设备上的指纹进行核对，确认一致后再建立配对。`,
  pairPromptConfirm: '确认配对',
  pairPromptCancel: '暂不配对',
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
  accept: '接受',
  trustAndAccept: '信任并接受',
  failedToLoadDeviceInformation: '加载设备信息失败。',
  sendFailed: '发送失败。',
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
  settingsNotificationsPermissionDenied: '系统通知权限已被拒绝，需要在系统或 Electron 权限设置里手动开启。',
  settingsNotificationsRequestPermission: '请求通知权限',
  settingsTrustedDevices: '已信任设备',
  settingsTrustedDevicesDesc: '这些设备发送的小文件会在大小限制内自动接受。',
  settingsTrustedDevicesEmpty: '还没有已信任设备。',
  settingsTrustedDevicesRemove: '移除',
  settingsMaintenanceSection: '维护',
  settingsMaintenanceSectionDesc: '管理本地历史记录和未完成缓存。',
  settingsTransferHistoryCount: '历史记录条数',
  settingsResumeCacheCount: '未完成缓存数',
  settingsResumeCacheBytes: '未完成缓存大小',
  settingsClearTransferHistory: '清理历史',
  settingsClearResumeCache: '清理未完成缓存',
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
  settingsCancel: '取消',
  dropZoneFileSelected: (fileName: string) => `已选择：${fileName}`,
  dropZoneClearFile: '清除',
  dropZoneSend: '发送',
  dropZoneSelectDevice: '请选择一台目标设备',
  dropZoneClearAll: '清空',
  dropZoneFileCount: (n: number) => `已选 ${n} 个文件`,
  dropZoneRemoveFile: '移除',
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
  heroEyebrow: 'LAN EXPRESS DESK',
  heroLead: 'Hand off the file you need right now like a stamped local airmail packet.',
  heroStamp: 'LOCAL AIRMAIL',
  openSandbox: 'Open sandbox',
  dismiss: 'Dismiss',
  languageLabel: 'Language',
  routeLabel: 'Current route',
  routeIdle: 'Choose a destination device before opening this dispatch lane.',
  routeMetaIdle: 'No destination selected',
  routeReady: (fromName, toName) => `${fromName} → ${toName}`,
  onlineDevices: 'Online devices',
  refreshDevices: 'Refresh devices',
  sendFile: 'Send file',
  transferActivity: 'Transfer activity',
  manifestKicker: 'Manifest',
  manifestNote: 'Discovered peers are listed here as ready destinations. Pick one to arm the dispatch desk.',
  dispatchKicker: 'Dispatch desk',
  dispatchNote: 'Drag files in or click to browse. You can queue multiple files, and the receiver still confirms manually.',
  ledgerKicker: 'Ledger',
  ledgerNote: 'Every handoff is logged here, from queueing to delivery, rejection, or failure.',
  noOnlinePeers: 'No online peers',
  keepRunningOnAnotherDevice: 'Keep syncFile running on another device in this LAN.',
  deviceListEmptyStepOpen: 'Install and open syncFile on another device.',
  deviceListEmptyStepLan: 'Make sure both devices are on the same LAN or Wi-Fi.',
  deviceListEmptyStepRefresh: 'Come back here and click refresh to discover it.',
  onlineDevicesAriaLabel: 'Online devices',
  compactSectionsAriaLabel: 'Compact layout section switcher',
  dropZonePassport: 'Dispatch permit',
  dropZoneTitle: 'Drop a file to send immediately',
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
  transferRateLabel: 'Rate',
  transferEtaLabel: 'ETA',
  transferPreparing: 'Preparing transfer',
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
  taskRetryVisible: 'Retry visible issues',
  taskCancelVisible: 'Cancel visible active',
  requestsInbox: 'Requests inbox',
  logs: 'Logs',
  logViewerTitle: 'Runtime logs',
  logViewerEmpty: 'No logs yet. Discovery, pairing, and transfer events will appear here.',
  logViewerRefresh: 'Refresh',
  logViewerClear: 'Clear logs',
  logViewerCopy: 'Copy logs',
  transferLocalPath: 'Local path',
  transferPeerId: 'Peer ID',
  pairDevice: 'Pair',
  pairedDevice: 'Paired',
  pairPromptTitle: 'Confirm device fingerprint',
  pairPromptDesc: (deviceName) => `Compare the fingerprint shown on ${deviceName} before trusting this device.`,
  pairPromptConfirm: 'Confirm pair',
  pairPromptCancel: 'Not now',
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
  accept: 'Accept',
  trustAndAccept: 'Trust & accept',
  failedToLoadDeviceInformation: 'Failed to load device information.',
  sendFailed: 'Send failed.',
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
  settingsNotificationsPermissionDenied: 'System notification permission is denied. Re-enable it in system or Electron permission settings.',
  settingsNotificationsRequestPermission: 'Request notification permission',
  settingsTrustedDevices: 'Trusted devices',
  settingsTrustedDevicesDesc: 'Small files from these devices are auto-accepted within the size limit.',
  settingsTrustedDevicesEmpty: 'No trusted devices yet.',
  settingsTrustedDevicesRemove: 'Remove',
  settingsMaintenanceSection: 'Maintenance',
  settingsMaintenanceSectionDesc: 'Manage local history and unfinished cached data.',
  settingsTransferHistoryCount: 'History entries',
  settingsResumeCacheCount: 'Resumable cache count',
  settingsResumeCacheBytes: 'Resumable cache size',
  settingsClearTransferHistory: 'Clear history',
  settingsClearResumeCache: 'Clear resumable cache',
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
  settingsCancel: 'Cancel',
  dropZoneFileSelected: (fileName: string) => `Selected: ${fileName}`,
  dropZoneClearFile: 'Clear',
  dropZoneSend: 'Send',
  dropZoneSelectDevice: 'Select a target device',
  dropZoneClearAll: 'Clear all',
  dropZoneFileCount: (n: number) => `${n} file(s) selected`,
  dropZoneRemoveFile: 'Remove',
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
