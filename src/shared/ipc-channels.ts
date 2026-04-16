// Central list of all IPC channel names, kept in sync between
// main/preload/renderer to avoid stringly-typed mistakes.

export const IpcChannels = {
  // Renderer -> Main (invoke)
  GetDevices: 'syncfile:get-devices',
  RefreshDevices: 'syncfile:refresh-devices',
  GetSelfDevice: 'syncfile:get-self-device',
  GetTransferHistory: 'syncfile:get-transfer-history',
  GetPendingOffers: 'syncfile:get-pending-offers',
  ProbeDevice: 'syncfile:probe-device',
  FetchPeerProfile: 'syncfile:fetch-peer-profile',
  PairDevice: 'syncfile:pair-device',
  AcceptPairRequest: 'syncfile:accept-pair-request',
  RejectPairRequest: 'syncfile:reject-pair-request',
  SendFile: 'syncfile:send-file',
  PauseTransfer: 'syncfile:pause-transfer',
  CancelTransfer: 'syncfile:cancel-transfer',
  AcceptIncoming: 'syncfile:accept-incoming',
  RejectIncoming: 'syncfile:reject-incoming',
  OpenSandbox: 'syncfile:open-sandbox',
  OpenTransferPath: 'syncfile:open-transfer-path',
  RevealTransferPath: 'syncfile:reveal-transfer-path',
  ClearTransferHistory: 'syncfile:clear-transfer-history',
  RemoveTransferHistoryItems: 'syncfile:remove-transfer-history-items',
  ClearResumeCache: 'syncfile:clear-resume-cache',
  GetSandboxLocation: 'syncfile:get-sandbox-location',
  ChooseSandboxLocation: 'syncfile:choose-sandbox-location',
  SelectFile: 'syncfile:select-file',
  GetSettings: 'syncfile:get-settings',
  SaveSettings: 'syncfile:save-settings',
  SaveProfile: 'syncfile:save-profile',
  GetRuntimeLogs: 'syncfile:get-runtime-logs',
  ClearRuntimeLogs: 'syncfile:clear-runtime-logs',

  // Main -> Renderer (send)
  DeviceOnline: 'syncfile:device-online',
  DeviceOffline: 'syncfile:device-offline',
  TransferProgress: 'syncfile:transfer-progress',
  TransferComplete: 'syncfile:transfer-complete',
  TransferHistoryReset: 'syncfile:transfer-history-reset',
  IncomingOffer: 'syncfile:incoming-offer',
  IncomingPairRequest: 'syncfile:incoming-pair-request',
  PairRequestRemoved: 'syncfile:pair-request-removed',
  RuntimeLogEntry: 'syncfile:runtime-log-entry',
  SelfDeviceUpdated: 'syncfile:self-device-updated'
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];
