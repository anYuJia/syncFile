// Central list of all IPC channel names, kept in sync between
// main/preload/renderer to avoid stringly-typed mistakes.

export const IpcChannels = {
  // Renderer -> Main (invoke)
  GetDevices: 'syncfile:get-devices',
  GetSelfDevice: 'syncfile:get-self-device',
  GetTransferHistory: 'syncfile:get-transfer-history',
  SendFile: 'syncfile:send-file',
  PauseTransfer: 'syncfile:pause-transfer',
  CancelTransfer: 'syncfile:cancel-transfer',
  AcceptIncoming: 'syncfile:accept-incoming',
  RejectIncoming: 'syncfile:reject-incoming',
  OpenSandbox: 'syncfile:open-sandbox',
  OpenTransferPath: 'syncfile:open-transfer-path',
  RevealTransferPath: 'syncfile:reveal-transfer-path',
  ClearTransferHistory: 'syncfile:clear-transfer-history',
  ClearResumeCache: 'syncfile:clear-resume-cache',
  GetSandboxLocation: 'syncfile:get-sandbox-location',
  ChooseSandboxLocation: 'syncfile:choose-sandbox-location',
  SelectFile: 'syncfile:select-file',
  GetSettings: 'syncfile:get-settings',
  SaveSettings: 'syncfile:save-settings',

  // Main -> Renderer (send)
  DeviceOnline: 'syncfile:device-online',
  DeviceOffline: 'syncfile:device-offline',
  TransferProgress: 'syncfile:transfer-progress',
  TransferComplete: 'syncfile:transfer-complete',
  IncomingOffer: 'syncfile:incoming-offer'
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];
