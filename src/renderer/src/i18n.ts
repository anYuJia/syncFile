export type Locale = 'zh' | 'en';

export interface Messages {
  localeName: string;
  selfDeviceLabel: string;
  loadingLocalDevice: string;
  appNotReady: string;
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
  incomingFileRequest: string;
  incomingFileRequestAriaLabel: string;
  wantsToSend: string;
  waitingRequests: (count: number) => string;
  reject: string;
  accept: string;
  failedToLoadDeviceInformation: string;
  sendFailed: string;
  failedToAcceptIncomingFile: string;
  failedToRejectIncomingFile: string;
  failedToOpenSandbox: string;
  errorDeviceNotFound: string;
  errorOfferNotFound: string;
  errorPeerDeclined: string;
  errorPeerClosedBeforeAccept: string;
  errorPeerClosedBeforeComplete: string;
  errorSocketClosedBeforeComplete: string;
}

export const LOCALE_STORAGE_KEY = 'syncfile.locale';

const zh: Messages = {
  localeName: '中文',
  selfDeviceLabel: '本机设备',
  loadingLocalDevice: '正在加载本机设备信息...',
  appNotReady: '应用尚未就绪',
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
  dispatchNote: '支持拖拽或点击选取。当前阶段按单文件投递，接收端需要手动确认。',
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
  incomingFileRequest: '收到文件请求',
  incomingFileRequestAriaLabel: '收到文件请求',
  wantsToSend: '想要发送给你：',
  waitingRequests: (count: number) => `还有 ${count} 个请求正在等待处理。`,
  reject: '拒绝',
  accept: '接受',
  failedToLoadDeviceInformation: '加载设备信息失败。',
  sendFailed: '发送失败。',
  failedToAcceptIncomingFile: '接受文件失败。',
  failedToRejectIncomingFile: '拒绝文件失败。',
  failedToOpenSandbox: '打开沙箱目录失败。',
  errorDeviceNotFound: '未找到目标设备。',
  errorOfferNotFound: '未找到对应的接收请求。',
  errorPeerDeclined: '对方拒绝了这次传输。',
  errorPeerClosedBeforeAccept: '对方在接受前关闭了连接。',
  errorPeerClosedBeforeComplete: '对方在传输完成前关闭了连接。',
  errorSocketClosedBeforeComplete: '连接在传输完成前被关闭。'
};

const en: Messages = {
  localeName: 'English',
  selfDeviceLabel: 'This device',
  loadingLocalDevice: 'Loading local device...',
  appNotReady: 'Not ready',
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
  dispatchNote: 'Drag a file in or click to browse. Phase 1 sends one file at a time and requires receiver approval.',
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
  incomingFileRequest: 'Incoming file request',
  incomingFileRequestAriaLabel: 'Incoming file offer',
  wantsToSend: 'wants to send:',
  waitingRequests: (count: number) => `${count} more request(s) waiting.`,
  reject: 'Reject',
  accept: 'Accept',
  failedToLoadDeviceInformation: 'Failed to load device information.',
  sendFailed: 'Send failed.',
  failedToAcceptIncomingFile: 'Failed to accept incoming file.',
  failedToRejectIncomingFile: 'Failed to reject incoming file.',
  failedToOpenSandbox: 'Unable to open sandbox folder.',
  errorDeviceNotFound: 'Target device not found.',
  errorOfferNotFound: 'Incoming offer not found.',
  errorPeerDeclined: 'The peer declined this transfer.',
  errorPeerClosedBeforeAccept: 'The peer closed the connection before accepting.',
  errorPeerClosedBeforeComplete: 'The peer closed the connection before completion.',
  errorSocketClosedBeforeComplete: 'The connection closed before transfer completion.'
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
