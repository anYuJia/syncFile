// Central list of all IPC channel names, kept in sync between
// main/preload/renderer to avoid stringly-typed mistakes.

export const IpcChannels = {
  // Renderer -> Main (invoke)
  GetDevices: 'syncfile:get-devices',
  GetSelfDevice: 'syncfile:get-self-device',
  SendFile: 'syncfile:send-file',
  AcceptIncoming: 'syncfile:accept-incoming',
  RejectIncoming: 'syncfile:reject-incoming',
  OpenSandbox: 'syncfile:open-sandbox',

  // Main -> Renderer (send)
  DeviceOnline: 'syncfile:device-online',
  DeviceOffline: 'syncfile:device-offline',
  TransferProgress: 'syncfile:transfer-progress',
  TransferComplete: 'syncfile:transfer-complete',
  IncomingOffer: 'syncfile:incoming-offer'
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];
