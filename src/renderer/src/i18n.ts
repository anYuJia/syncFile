export type Locale = 'zh' | 'en';

export interface Messages {
  localeName: string;
  selfDeviceLabel: string;
  loadingLocalDevice: string;
  appNotReady: string;
  trustedDeviceLabel: string;
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
  onlineDevicesAriaLabel: string;
  dropZonePassport: string;
  dropZoneTitle: string;
  dropZoneTargetReady: (targetName: string) => string;
  dropZoneTargetFallback: string;
  dropZoneHint: string;
  dropZoneAction: string;
  dropZoneSelectDeviceFirst: string;
  dropZonePickFromDisk: string;
  transferEmpty: string;
  sendTo: string;
  receiveFrom: string;
  unknownDevice: string;
  transferStatusPending: string;
  transferStatusInProgress: string;
  transferStatusCompleted: string;
  transferStatusFailed: string;
  transferStatusRejected: string;
  transferReceiveModeTrusted: string;
  transferReceiveModeAuto: string;
  incomingFileRequest: string;
  incomingFileRequestAriaLabel: string;
  wantsToSend: string;
  waitingRequests: (count: number) => string;
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
  errorPeerClosedBeforeAccept: string;
  errorPeerClosedBeforeComplete: string;
  errorSocketClosedBeforeComplete: string;
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
  settingsTrustedDevices: string;
  settingsTrustedDevicesDesc: string;
  settingsTrustedDevicesEmpty: string;
  settingsTrustedDevicesRemove: string;
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
}

export const LOCALE_STORAGE_KEY = 'syncfile.locale';

const zh: Messages = {
  localeName: '中文',
  selfDeviceLabel: '本机设备',
  loadingLocalDevice: '正在加载本机设备信息...',
  appNotReady: '应用尚未就绪',
  trustedDeviceLabel: '已信任',
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
  onlineDevicesAriaLabel: '在线设备列表',
  dropZonePassport: '投递许可',
  dropZoneTitle: '拖入文件，立刻发出',
  dropZoneTargetReady: (targetName) => `本次目的地：${targetName}`,
  dropZoneTargetFallback: '尚未选择目标设备',
  dropZoneHint: '文件会通过局域网直连传输，并等待对方确认接收。',
  dropZoneAction: '拖拽或点击选取',
  dropZoneSelectDeviceFirst: '请先选择一个目标设备。',
  dropZonePickFromDisk: '或点击这里从磁盘选择文件。',
  transferEmpty: '还没有任何传输记录。',
  sendTo: '发送到',
  receiveFrom: '接收自',
  unknownDevice: '未知设备',
  transferStatusPending: '等待中',
  transferStatusInProgress: '传输中',
  transferStatusCompleted: '已完成',
  transferStatusFailed: '失败',
  transferStatusRejected: '已拒绝',
  transferReceiveModeTrusted: '来自已信任设备',
  transferReceiveModeAuto: '自动接受',
  incomingFileRequest: '收到文件请求',
  incomingFileRequestAriaLabel: '收到文件请求',
  wantsToSend: '想要发送给你：',
  waitingRequests: (count: number) => `还有 ${count} 个请求正在等待处理。`,
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
  errorPeerClosedBeforeAccept: '对方在接受前关闭了连接。',
  errorPeerClosedBeforeComplete: '对方在传输完成前关闭了连接。',
  errorSocketClosedBeforeComplete: '连接在传输完成前被关闭。',
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
  settingsTrustedDevices: '已信任设备',
  settingsTrustedDevicesDesc: '这些设备发送的小文件会在大小限制内自动接受。',
  settingsTrustedDevicesEmpty: '还没有已信任设备。',
  settingsTrustedDevicesRemove: '移除',
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
  dropZoneDropToAdd: '松开以加入当前队列'
};

const en: Messages = {
  localeName: 'English',
  selfDeviceLabel: 'This device',
  loadingLocalDevice: 'Loading local device...',
  appNotReady: 'Not ready',
  trustedDeviceLabel: 'Trusted',
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
  onlineDevicesAriaLabel: 'Online devices',
  dropZonePassport: 'Dispatch permit',
  dropZoneTitle: 'Drop a file to send immediately',
  dropZoneTargetReady: (targetName) => `Destination locked: ${targetName}`,
  dropZoneTargetFallback: 'No destination selected yet',
  dropZoneHint: 'Transfers run over direct LAN links and wait for receiver confirmation.',
  dropZoneAction: 'Drag or click to browse',
  dropZoneSelectDeviceFirst: 'Select a target device first.',
  dropZonePickFromDisk: 'Or click to pick from disk.',
  transferEmpty: 'No transfer records yet.',
  sendTo: 'Send to',
  receiveFrom: 'Receive from',
  unknownDevice: 'unknown',
  transferStatusPending: 'Pending',
  transferStatusInProgress: 'In progress',
  transferStatusCompleted: 'Completed',
  transferStatusFailed: 'Failed',
  transferStatusRejected: 'Rejected',
  transferReceiveModeTrusted: 'Trusted device',
  transferReceiveModeAuto: 'Auto-accepted',
  incomingFileRequest: 'Incoming file request',
  incomingFileRequestAriaLabel: 'Incoming file offer',
  wantsToSend: 'wants to send:',
  waitingRequests: (count: number) => `${count} more request(s) waiting.`,
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
  errorPeerClosedBeforeAccept: 'The peer closed the connection before accepting.',
  errorPeerClosedBeforeComplete: 'The peer closed the connection before completion.',
  errorSocketClosedBeforeComplete: 'The connection closed before transfer completion.',
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
  settingsTrustedDevices: 'Trusted devices',
  settingsTrustedDevicesDesc: 'Small files from these devices are auto-accepted within the size limit.',
  settingsTrustedDevicesEmpty: 'No trusted devices yet.',
  settingsTrustedDevicesRemove: 'Remove',
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
  dropZoneDropToAdd: 'Release to add to queue'
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
