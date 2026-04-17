import { randomUUID } from 'crypto';
import { basename, join, parse, resolve } from 'path';
import { accessSync, constants, mkdirSync, rmSync, statSync, writeFileSync } from 'fs';

import { BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron';

import { IpcChannels, type IpcChannel } from '../../shared/ipc-channels';
import type {
  Device,
  DeviceReachability,
  IncomingOffer,
  PeerProfilePayload,
  ProfilePayload,
  RejectReason,
  RuntimeLogEntry,
  SandboxLocationInfo,
  Settings,
  SettingsPayload,
  TransferId,
  TransferRecord,
  TransferProgress
} from '../../shared/types';
import type { DeviceRegistry } from '../discovery/device-registry';
import type { MdnsService } from '../discovery/mdns-service';
import type { PendingOfferStore } from '../storage/pending-offers';
import type { RecentPeerStore } from '../storage/recent-peers';
import type { SandboxLocationStore } from '../storage/sandbox-location';
import type { Sandbox } from '../storage/sandbox';
import type { SettingsStore } from '../storage/settings';
import type { TransferHistoryStore } from '../storage/transfer-history';
import { saveIdentityProfile, type DeviceIdentity } from '../storage/device-identity';
import type { RuntimeLogger } from '../logging/runtime-log';
import type { TcpClient } from '../transfer/tcp-client';
import { sha256File } from '../transfer/file-hash';
import type {
  IncomingOfferInfo,
  OfferResponder,
  PairResponder,
  ReceiveInterruptedInfo,
  TcpServer,
  TransferErrorInfo
} from '../transfer/tcp-server';
import type { PairRequestMessage } from '../transfer/protocol';

const PROGRESS_THROTTLE_MS = 120;
const DEFAULT_TRANSFER_PORT = 43434;

interface OutboundTransferRequest {
  host: string;
  port: number;
  peerDeviceId: string;
  peerTrustFingerprint: string;
  peerTrustPublicKey: string;
  filePath: string;
  fileSize: number;
  sourceFileModifiedAt: number;
  existingTransferId?: string;
  previousTransfer?: Partial<TransferProgress>;
  sha256?: string;
}

export function sourceFileCanResume(
  previous: Partial<TransferProgress> | undefined,
  filePath: string,
  fileSize: number,
  modifiedAt: number
): boolean {
  if (!previous) {
    return true;
  }
  if (previous.direction !== 'send') {
    return true;
  }
  if (previous.localPath !== filePath) {
    return true;
  }
  if (typeof previous.sourceFileModifiedAt !== 'number') {
    return true;
  }
  return previous.fileSize === fileSize && previous.sourceFileModifiedAt === modifiedAt;
}

export function sourceFileHashCanResume(
  previous: Partial<TransferProgress> | undefined,
  filePath: string,
  fileSize: number,
  modifiedAt: number,
  sha256: string
): boolean {
  if (!previous) {
    return true;
  }
  if (previous.direction !== 'send') {
    return true;
  }
  if (previous.localPath !== filePath) {
    return false;
  }
  if (typeof previous.sourceFileSha256 === 'string' && previous.sourceFileSha256.length > 0) {
    return previous.sourceFileSha256 === sha256;
  }
  return sourceFileCanResume(previous, filePath, fileSize, modifiedAt);
}

function validateSandboxRoot(rootPath: string): string {
  const resolvedPath = resolve(rootPath);
  if (resolvedPath === parse(resolvedPath).root) {
    throw new Error('sandbox folder cannot be the filesystem root');
  }

  mkdirSync(resolvedPath, { recursive: true });
  const stats = statSync(resolvedPath);
  if (!stats.isDirectory()) {
    throw new Error('sandbox path must be a directory');
  }

  accessSync(resolvedPath, constants.R_OK | constants.W_OK);

  const probePath = join(resolvedPath, '.syncfile-write-test');
  writeFileSync(probePath, 'syncfile', 'utf8');
  rmSync(probePath, { force: true });

  return resolvedPath;
}

interface PendingOffer {
  info: IncomingOfferInfo;
  responder: OfferResponder;
}

interface PendingPairRequest {
  request: PairRequestMessage;
  responder: PairResponder;
}

type ReceiveMode = 'manual' | 'trusted-device' | 'auto-accept';

interface AcceptedInboundMeta {
  info: IncomingOfferInfo;
  receiveMode: ReceiveMode;
}

interface OutboundTransferMeta {
  transferId: string;
  batchId?: string;
  batchLabel?: string;
  fileName: string;
  fileSize: number;
  peerDeviceName: string;
  peerDeviceId: string;
  localPath: string;
  sourceFileModifiedAt: number;
  sourceFileSha256: string;
}

export interface IpcContext {
  registry: DeviceRegistry;
  mdnsService: MdnsService;
  tcpServer: TcpServer;
  tcpClient: TcpClient;
  sandbox: Sandbox;
  sandboxLocation: SandboxLocationStore;
  pendingOfferStore: PendingOfferStore;
  recentPeerStore: RecentPeerStore;
  settingsStore: SettingsStore;
  transferHistoryStore: TransferHistoryStore;
  identity: DeviceIdentity;
  userDataDir: string;
  getSelfDevice: () => Device;
  getWindow: () => BrowserWindow | null;
  logger?: RuntimeLogger;
}

let cleanupRuntimeLogSubscription: (() => void) | null = null;

export const handledIpcChannels = [
  IpcChannels.GetDevices,
  IpcChannels.RefreshDevices,
  IpcChannels.GetSelfDevice,
  IpcChannels.GetTransferHistory,
  IpcChannels.GetPendingOffers,
  IpcChannels.ProbeDevice,
  IpcChannels.FetchPeerProfile,
  IpcChannels.PairDevice,
  IpcChannels.AcceptPairRequest,
  IpcChannels.RejectPairRequest,
  IpcChannels.SendFile,
  IpcChannels.PauseTransfer,
  IpcChannels.CancelTransfer,
  IpcChannels.AcceptIncoming,
  IpcChannels.RejectIncoming,
  IpcChannels.OpenSandbox,
  IpcChannels.OpenTransferPath,
  IpcChannels.RevealTransferPath,
  IpcChannels.ClearTransferHistory,
  IpcChannels.RemoveTransferHistoryItems,
  IpcChannels.ClearResumeCache,
  IpcChannels.GetSandboxLocation,
  IpcChannels.ChooseSandboxLocation,
  IpcChannels.SelectFile,
  IpcChannels.GetSettings,
  IpcChannels.SaveSettings,
  IpcChannels.SaveProfile,
  IpcChannels.GetRuntimeLogs,
  IpcChannels.ClearRuntimeLogs
] as const;

export function unregisterIpcHandlers(): void {
  cleanupRuntimeLogSubscription?.();
  cleanupRuntimeLogSubscription = null;
  for (const channel of handledIpcChannels) {
    ipcMain.removeHandler(channel);
  }
}

export function registerIpcHandlers(context: IpcContext): void {
  cleanupRuntimeLogSubscription?.();
  cleanupRuntimeLogSubscription = null;

  const pendingOffers = new Map<string, PendingOffer>();
  const pendingPairRequests = new Map<string, PendingPairRequest>();
  const completedOrAcceptedOffers = new Map<string, AcceptedInboundMeta>();
  const outboundTransfers = new Map<string, OutboundTransferMeta>();
  const outboundRequests = new Map<string, OutboundTransferRequest>();
  const queuedOutboundTransferIds: string[] = [];
  const queuedOutboundTransferIdSet = new Set<string>();
  const cancellingOutboundTransfers = new Set<string>();
  const pausingOutboundTransfers = new Set<string>();
  const hashingOutboundTransfers = new Set<string>();
  const pendingProgressEvents = new Map<string, TransferProgress>();
  const progressTimers = new Map<string, NodeJS.Timeout>();
  const peerProfileCache = new Map<string, PeerProfilePayload>();
  const inflightPeerProfileFetches = new Map<string, Promise<void>>();
  let activeOutboundTransferId: string | null = null;

  const sendToRenderer = <T>(channel: IpcChannel, payload: T): void => {
    const window = context.getWindow();
    if (!window || window.isDestroyed()) return;
    window.webContents.send(channel, payload);
  };

  if (context.logger) {
    cleanupRuntimeLogSubscription = context.logger.subscribe((entry) => {
      sendToRenderer(IpcChannels.RuntimeLogEntry, entry);
    });
  }

  const emitTransferEvent = (
    channel: typeof IpcChannels.TransferProgress | typeof IpcChannels.TransferComplete,
    progress: TransferProgress
  ): void => {
    context.transferHistoryStore.upsert(progress);
    sendToRenderer(channel, progress);
  };

  const clearProgressTimer = (transferId: string): void => {
    const timer = progressTimers.get(transferId);
    if (timer) {
      clearTimeout(timer);
      progressTimers.delete(transferId);
    }
  };

  const flushProgressEvent = (transferId: string): void => {
    clearProgressTimer(transferId);
    const progress = pendingProgressEvents.get(transferId);
    if (!progress) {
      return;
    }
    pendingProgressEvents.delete(transferId);
    emitTransferEvent(IpcChannels.TransferProgress, progress);
  };

  const publishTransferEvent = (
    channel: typeof IpcChannels.TransferProgress | typeof IpcChannels.TransferComplete,
    progress: TransferProgress,
    immediate = channel === IpcChannels.TransferComplete || progress.status !== 'in-progress'
  ): void => {
    if (channel === IpcChannels.TransferComplete || immediate) {
      pendingProgressEvents.delete(progress.transferId);
      clearProgressTimer(progress.transferId);
      emitTransferEvent(channel, progress);
      return;
    }

    pendingProgressEvents.set(progress.transferId, progress);
    if (progressTimers.has(progress.transferId)) {
      return;
    }

    progressTimers.set(
      progress.transferId,
      setTimeout(() => {
        flushProgressEvent(progress.transferId);
      }, PROGRESS_THROTTLE_MS)
    );
  };

  const publishTransferHistoryReset = (): void => {
    sendToRenderer(IpcChannels.TransferHistoryReset, context.transferHistoryStore.list());
  };

  const rememberInboundPeer = (info: IncomingOfferInfo): void => {
    const address = info.peerAddress;
    if (!address) {
      return;
    }
    const device: Device = {
      deviceId: info.fromDevice.deviceId,
      name: info.fromDevice.name,
      hasAvatar: info.fromDevice.hasAvatar,
      profileRevision: info.fromDevice.profileRevision,
      trustFingerprint: info.fromDevice.trustFingerprint,
      trustPublicKey: info.fromDevice.trustPublicKey,
      host: address,
      address,
      port: info.fromDevice.port ?? DEFAULT_TRANSFER_PORT,
      platform: info.fromDevice.platform ?? 'unknown',
      version: info.fromDevice.version ?? '1'
    };
    context.logger?.info('discovery', 'remembered inbound peer as fallback device', {
      deviceId: device.deviceId,
      name: device.name,
      address: `${device.address}:${device.port}`
    });
    context.recentPeerStore.upsert(device);
    context.registry.upsertPersistent(device);
  };

  const rememberConnectedPeer = (
    peer: {
      deviceId: string;
      name: string;
      trustFingerprint: string;
      trustPublicKey: string;
    },
    address?: string
  ): void => {
    if (!address) {
      return;
    }
    const current = context.registry.list().find((device) => device.deviceId === peer.deviceId);
    const device: Device = {
      deviceId: peer.deviceId,
      name: peer.name,
      avatarDataUrl: current?.avatarDataUrl,
      hasAvatar: current?.hasAvatar,
      profileRevision: current?.profileRevision,
      trustFingerprint: peer.trustFingerprint,
      trustPublicKey: peer.trustPublicKey,
      host: current?.host ?? address,
      address,
      port: current?.port ?? DEFAULT_TRANSFER_PORT,
      platform: current?.platform ?? 'unknown',
      version: current?.version ?? '1'
    };
    context.logger?.info('discovery', 'remembered secure peer connection as fallback device', {
      deviceId: device.deviceId,
      name: device.name,
      address: `${device.address}:${device.port}`
    });
    context.recentPeerStore.upsert(device);
    context.registry.upsertPersistent(device);
  };

  const mergePeerProfile = (device: Device, profile: PeerProfilePayload): Device => ({
    ...device,
    name: profile.name,
    avatarDataUrl: profile.avatarDataUrl,
    hasAvatar: profile.hasAvatar,
    profileRevision: profile.profileRevision
  });

  const fetchPeerProfile = async (device: Device): Promise<PeerProfilePayload | null> => {
    if (!device.hasAvatar) {
      return null;
    }
    const cached = peerProfileCache.get(device.deviceId);
    if (cached && cached.profileRevision === (device.profileRevision ?? 0)) {
      return cached;
    }

    const profile = await context.tcpClient.fetchPeerProfile(device.address, device.port, {
      deviceId: device.deviceId,
      trustFingerprint: device.trustFingerprint,
      trustPublicKey: device.trustPublicKey
    });
    const payload: PeerProfilePayload = {
      deviceId: profile.deviceId,
      name: profile.name,
      avatarDataUrl: profile.avatarDataUrl,
      hasAvatar: profile.hasAvatar,
      profileRevision: profile.profileRevision
    };
    peerProfileCache.set(device.deviceId, payload);
    return payload;
  };

  const ensurePeerProfile = (device: Device): void => {
    if (!device.hasAvatar) {
      peerProfileCache.delete(device.deviceId);
      return;
    }
    const cached = peerProfileCache.get(device.deviceId);
    if (cached && cached.profileRevision === (device.profileRevision ?? 0)) {
      const merged = mergePeerProfile(device, cached);
      if (merged.avatarDataUrl !== device.avatarDataUrl || merged.name !== device.name) {
        context.registry.upsert(merged);
      }
      return;
    }
    if (inflightPeerProfileFetches.has(device.deviceId)) {
      return;
    }

    const task = fetchPeerProfile(device)
      .then((profile) => {
        if (!profile) {
          return;
        }
        const current = context.registry.list().find((candidate) => candidate.deviceId === device.deviceId);
        if (!current) {
          return;
        }
        context.registry.upsert(mergePeerProfile(current, profile));
      })
      .catch((error) => {
        context.logger?.warn('discovery', 'peer profile fetch failed', {
          deviceId: device.deviceId,
          address: `${device.address}:${device.port}`,
          error: error instanceof Error ? error.message : String(error)
        });
      })
      .finally(() => {
        inflightPeerProfileFetches.delete(device.deviceId);
      });

    inflightPeerProfileFetches.set(device.deviceId, task);
  };

  const makeOutboundProgress = (
    meta: OutboundTransferMeta,
    bytesTransferred: number,
    status: TransferProgress['status'],
    error?: string
  ): TransferProgress => ({
    transferId: meta.transferId,
    batchId: meta.batchId,
    batchLabel: meta.batchLabel,
    direction: 'send',
    fileName: meta.fileName,
    fileSize: meta.fileSize,
    bytesTransferred,
    peerDeviceName: meta.peerDeviceName,
    peerDeviceId: meta.peerDeviceId,
    localPath: meta.localPath,
    sourceFileModifiedAt: meta.sourceFileModifiedAt,
    sourceFileSha256: meta.sourceFileSha256,
    status,
    error
  });

  const makeInboundProgress = (
    offer: IncomingOfferInfo,
    bytesTransferred: number,
    status: TransferProgress['status'],
    receiveMode: ReceiveMode,
    localPath?: string,
    error?: string
  ): TransferProgress => ({
    transferId: offer.offerId,
    direction: 'receive',
    fileName: offer.fileName,
    fileSize: offer.fileSize,
    bytesTransferred,
    peerDeviceName: offer.fromDevice.name,
    peerDeviceId: offer.fromDevice.deviceId,
    localPath,
    status,
    receiveMode,
    error
  });

  const currentSandboxLocation = async (): Promise<SandboxLocationInfo> => ({
    path: context.sandbox.rootPath(),
    isCustom: context.sandboxLocation.currentPath() !== null,
    usageBytes: await context.sandbox.currentUsageBytes()
  });

  const currentMaintenanceInfo = () => {
    const resumeCache = context.sandbox.resumeCacheSummary();
    return {
      transferHistoryCount: context.transferHistoryStore.count(),
      resumableTransferCount: resumeCache.count,
      resumableTransferBytes: resumeCache.bytes
    };
  };

  const sandboxLimitBytes = (settings: Settings): number => settings.maxSandboxSizeMB * 1024 * 1024;
  const autoAcceptLimitBytes = (settings: Settings): number => settings.autoAcceptMaxSizeMB * 1024 * 1024;

  const exceedsSandboxLimit = async (info: IncomingOfferInfo, settings: Settings): Promise<boolean> => {
    const matchingResumeBytes = context.sandbox.matchingResumeBytes(
      info.offerId,
      info.fromDevice.deviceId,
      info.fromDevice.name,
      info.fromDevice.trustFingerprint,
      info.fromDevice.trustPublicKey,
      info.fileName,
      info.fileSize,
      info.sha256 ?? ''
    );
    const projectedUsageBytes =
      (await context.sandbox.currentUsageBytes()) + Math.max(0, info.fileSize - matchingResumeBytes);
    return projectedUsageBytes > sandboxLimitBytes(settings);
  };

  const lastTransferredBytes = (transferId: string): number => {
    return (
      pendingProgressEvents.get(transferId)?.bytesTransferred ??
      context.transferHistoryStore.get(transferId)?.bytesTransferred ??
      0
    );
  };

  const dequeueOutboundTransfer = (transferId: string): boolean => {
    const index = queuedOutboundTransferIds.indexOf(transferId);
    if (index < 0) {
      return false;
    }
    queuedOutboundTransferIds.splice(index, 1);
    queuedOutboundTransferIdSet.delete(transferId);
    return true;
  };

  const settleOutboundTransfer = (transferId: string): void => {
    pendingProgressEvents.delete(transferId);
    clearProgressTimer(transferId);
    outboundTransfers.delete(transferId);
    outboundRequests.delete(transferId);
    cancellingOutboundTransfers.delete(transferId);
    pausingOutboundTransfers.delete(transferId);
    hashingOutboundTransfers.delete(transferId);
    queuedOutboundTransferIdSet.delete(transferId);
    if (activeOutboundTransferId === transferId) {
      activeOutboundTransferId = null;
    }
  };

  const startNextOutboundTransfer = (): void => {
    if (activeOutboundTransferId) {
      return;
    }

    const nextTransferId = queuedOutboundTransferIds.shift();
    if (!nextTransferId) {
      return;
    }
    queuedOutboundTransferIdSet.delete(nextTransferId);

    const meta = outboundTransfers.get(nextTransferId);
    const request = outboundRequests.get(nextTransferId);
    if (!meta || !request) {
      settleOutboundTransfer(nextTransferId);
      startNextOutboundTransfer();
      return;
    }

    activeOutboundTransferId = nextTransferId;

    void (async () => {
      try {
        hashingOutboundTransfers.add(nextTransferId);
        const fileSha256 = await sha256File(request.filePath);
        hashingOutboundTransfers.delete(nextTransferId);

        const currentMeta = outboundTransfers.get(nextTransferId) ?? meta;
        const currentRequest = outboundRequests.get(nextTransferId) ?? request;
        if (!outboundTransfers.has(nextTransferId) || !outboundRequests.has(nextTransferId)) {
          settleOutboundTransfer(nextTransferId);
          startNextOutboundTransfer();
          return;
        }

        if (currentRequest.existingTransferId) {
          const previous = currentRequest.previousTransfer;
          if (
            !sourceFileHashCanResume(
              previous,
              currentRequest.filePath,
              currentRequest.fileSize,
              currentRequest.sourceFileModifiedAt,
              fileSha256
            )
          ) {
            throw new Error('source file changed; cannot resume transfer');
          }
        }

        const preparedMeta: OutboundTransferMeta = {
          ...currentMeta,
          sourceFileSha256: fileSha256
        };
        outboundTransfers.set(nextTransferId, preparedMeta);
        outboundRequests.set(nextTransferId, {
          ...currentRequest,
          sha256: fileSha256
        });
        publishTransferEvent(
          IpcChannels.TransferProgress,
          makeOutboundProgress(preparedMeta, lastTransferredBytes(nextTransferId), 'pending')
        );

        if (cancellingOutboundTransfers.has(nextTransferId)) {
          throw new Error('transfer cancelled');
        }
        if (pausingOutboundTransfers.has(nextTransferId)) {
          throw new Error('transfer paused');
        }

        await context.tcpClient.sendFile({
          host: currentRequest.host,
          port: currentRequest.port,
          peer: {
            deviceId: currentRequest.peerDeviceId,
            trustFingerprint: currentRequest.peerTrustFingerprint,
            trustPublicKey: currentRequest.peerTrustPublicKey
          },
          filePath: currentRequest.filePath,
          fileId: nextTransferId,
          sha256: fileSha256
        });

        const latestMeta = outboundTransfers.get(nextTransferId) ?? preparedMeta;
        context.logger?.info('transfer', 'outbound transfer completed', {
          transferId: nextTransferId,
          fileName: latestMeta.fileName,
          fileSize: latestMeta.fileSize,
          peerDeviceName: latestMeta.peerDeviceName
        });
        publishTransferEvent(
          IpcChannels.TransferComplete,
          makeOutboundProgress(latestMeta, latestMeta.fileSize, 'completed')
        );
        settleOutboundTransfer(nextTransferId);
        startNextOutboundTransfer();
      } catch (error) {
        hashingOutboundTransfers.delete(nextTransferId);
        const currentMeta = outboundTransfers.get(nextTransferId) ?? meta;
        const previousBytes = lastTransferredBytes(nextTransferId);
        const message = error instanceof Error ? error.message : String(error);
        const wasCancelled =
          cancellingOutboundTransfers.has(nextTransferId) || message.includes('transfer cancelled');
        const wasPaused =
          pausingOutboundTransfers.has(nextTransferId) || message.includes('transfer paused');

        if (wasCancelled) {
          publishTransferEvent(
            IpcChannels.TransferProgress,
            makeOutboundProgress(currentMeta, previousBytes, 'cancelled')
          );
          settleOutboundTransfer(nextTransferId);
          startNextOutboundTransfer();
          return;
        }

        if (wasPaused) {
          publishTransferEvent(
            IpcChannels.TransferProgress,
            makeOutboundProgress(currentMeta, previousBytes, 'paused')
          );
          settleOutboundTransfer(nextTransferId);
          startNextOutboundTransfer();
          return;
        }

        publishTransferEvent(
          IpcChannels.TransferProgress,
          makeOutboundProgress(currentMeta, previousBytes, 'failed', message)
        );
        context.logger?.error('transfer', 'outbound transfer failed', {
          transferId: nextTransferId,
          fileName: currentMeta.fileName,
          peerDeviceName: currentMeta.peerDeviceName,
          bytesTransferred: previousBytes,
          error: message
        });
        settleOutboundTransfer(nextTransferId);
        startNextOutboundTransfer();
      }
    })();
  };

  const isTrustedDevice = (
    deviceId: string,
    trustFingerprint: string,
    trustPublicKey: string,
    settings: Settings
  ): boolean => {
    return settings.trustedDevices.some(
      (device) =>
        device.deviceId === deviceId &&
        device.trustFingerprint === trustFingerprint &&
        (device.trustPublicKey.length === 0 || device.trustPublicKey === trustPublicKey)
    );
  };

  const resolveReceiveMode = (info: IncomingOfferInfo, settings: Settings): ReceiveMode => {
    if (
      isTrustedDevice(
        info.fromDevice.deviceId,
        info.fromDevice.trustFingerprint,
        info.fromDevice.trustPublicKey,
        settings
      )
    ) {
      return 'trusted-device';
    }
    if (settings.autoAccept) {
      return 'auto-accept';
    }
    return 'manual';
  };

  const canAutoAcceptOffer = (info: IncomingOfferInfo, settings: Settings): boolean => {
    return (
      info.fileSize <= autoAcceptLimitBytes(settings) &&
      resolveReceiveMode(info, settings) !== 'manual'
    );
  };

  const upsertTrustedDevice = (
    device: { deviceId: string; name: string; trustFingerprint: string; trustPublicKey: string }
  ): Settings => {
    const current = context.settingsStore.get();
    const trustedDevices = [
      ...current.trustedDevices.filter(
        (item) =>
          !(item.deviceId === device.deviceId && item.trustFingerprint === device.trustFingerprint)
      ),
      {
        deviceId: device.deviceId,
        name: device.name,
        trustFingerprint: device.trustFingerprint,
        trustPublicKey: device.trustPublicKey,
        trustedAt: Date.now()
      }
    ].sort((a, b) => a.name.localeCompare(b.name));
    return context.settingsStore.save({ trustedDevices });
  };

  ipcMain.handle(IpcChannels.GetDevices, (): Device[] => {
    context.logger?.debug('ipc', 'get devices requested');
    const devices = context.registry.list();
    context.logger?.debug('ipc', 'returning device list', { count: devices.length });
    for (const device of devices) {
      ensurePeerProfile(device);
    }
    return devices;
  });

  ipcMain.handle(IpcChannels.RefreshDevices, (): Device[] => {
    context.logger?.info('discovery', 'manual device refresh requested');
    context.mdnsService.refresh(false);
    return context.registry.list();
  });

  ipcMain.handle(IpcChannels.GetSelfDevice, (): Device => {
    return context.getSelfDevice();
  });

  ipcMain.handle(IpcChannels.GetTransferHistory, (): TransferRecord[] => {
    return context.transferHistoryStore.list();
  });

  ipcMain.handle(IpcChannels.PairDevice, async (_event, deviceId: string): Promise<void> => {
    const device = context.registry.list().find((candidate) => candidate.deviceId === deviceId);
    if (!device) {
      context.logger?.warn('pairing', 'pair requested for unknown device', { deviceId });
      throw new Error(`device ${deviceId} not found`);
    }
    context.logger?.info('pairing', 'starting outbound pair request', {
      deviceId: device.deviceId,
      name: device.name,
      address: device.address,
      port: device.port
    });
    const accepted = await context.tcpClient.pairWithPeer(device.address, device.port, {
      deviceId: device.deviceId,
      trustFingerprint: device.trustFingerprint,
      trustPublicKey: device.trustPublicKey
    });
    if (!accepted) {
      context.logger?.warn('pairing', 'peer declined outbound pair request', {
        deviceId: device.deviceId,
        name: device.name
      });
      throw new Error('peer declined pairing');
    }
    context.logger?.info('pairing', 'pair request accepted', {
      deviceId: device.deviceId,
      name: device.name
    });
    upsertTrustedDevice(device);
  });

  ipcMain.handle(IpcChannels.AcceptPairRequest, (_event, requestId: string): void => {
    const pending = pendingPairRequests.get(requestId);
    if (!pending) {
      context.logger?.warn('pairing', 'accept requested for missing pair request', { requestId });
      throw new Error(`pair request ${requestId} not found`);
    }
    context.logger?.info('pairing', 'incoming pair request accepted', {
      requestId,
      deviceId: pending.request.fromDevice.deviceId,
      name: pending.request.fromDevice.name
    });
    upsertTrustedDevice(pending.request.fromDevice);
    pending.responder.accept();
    pendingPairRequests.delete(requestId);
  });

  ipcMain.handle(IpcChannels.RejectPairRequest, (_event, requestId: string): void => {
    const pending = pendingPairRequests.get(requestId);
    if (!pending) {
      context.logger?.warn('pairing', 'reject requested for missing pair request', { requestId });
      throw new Error(`pair request ${requestId} not found`);
    }
    context.logger?.info('pairing', 'incoming pair request rejected', {
      requestId,
      deviceId: pending.request.fromDevice.deviceId,
      name: pending.request.fromDevice.name
    });
    pending.responder.reject();
    pendingPairRequests.delete(requestId);
  });

  ipcMain.handle(IpcChannels.GetPendingOffers, (): IncomingOffer[] => {
    return context.pendingOfferStore.list();
  });

  ipcMain.handle(IpcChannels.FetchPeerProfile, async (_event, deviceId: string): Promise<PeerProfilePayload | null> => {
    const device = context.registry.list().find((candidate) => candidate.deviceId === deviceId);
    if (!device) {
      return null;
    }
    return await fetchPeerProfile(device);
  });

  ipcMain.handle(IpcChannels.ProbeDevice, async (_event, deviceId: string): Promise<DeviceReachability> => {
    const device = context.registry.list().find((candidate) => candidate.deviceId === deviceId);
    if (!device) {
      return {
        deviceId,
        status: 'unknown',
        checkedAt: Date.now(),
        error: 'device not found'
      };
    }

    try {
      await context.tcpClient.probePeer(device.address, device.port, {
        deviceId: device.deviceId,
        trustFingerprint: device.trustFingerprint,
        trustPublicKey: device.trustPublicKey
      });
      return {
        deviceId,
        status: 'reachable',
        checkedAt: Date.now()
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      context.logger?.warn('discovery', 'peer reachability probe failed', {
        deviceId,
        address: `${device.address}:${device.port}`,
        error: message
      });
      return {
        deviceId,
        status: 'unreachable',
        checkedAt: Date.now(),
        error: message
      };
    }
  });

  ipcMain.handle(
    IpcChannels.SendFile,
    async (
      _event,
      deviceId: string,
      filePath: string,
      existingTransferId?: string,
      batchMeta?: { batchId?: string; batchLabel?: string }
    ): Promise<TransferId> => {
      const device = context.registry.list().find((candidate) => candidate.deviceId === deviceId);
      if (!device) {
        context.logger?.warn('transfer', 'send requested for unknown device', { deviceId, filePath });
        throw new Error(`device ${deviceId} not found`);
      }

      const transferId = existingTransferId ?? randomUUID();
      const fileName = basename(filePath);
      const fileStats = statSync(filePath);
      const fileSize = fileStats.size;
      const previousTransfer = existingTransferId
        ? context.transferHistoryStore.get(existingTransferId)
        : undefined;

      outboundTransfers.set(transferId, {
        transferId,
        batchId: batchMeta?.batchId,
        batchLabel: batchMeta?.batchLabel,
        fileName,
        fileSize,
        peerDeviceName: device.name,
        peerDeviceId: device.deviceId,
        localPath: filePath,
        sourceFileModifiedAt: fileStats.mtimeMs,
        sourceFileSha256: previousTransfer?.sourceFileSha256 ?? ''
      });
      outboundRequests.set(transferId, {
        host: device.address,
        port: device.port,
        peerDeviceId: device.deviceId,
        peerTrustFingerprint: device.trustFingerprint,
        peerTrustPublicKey: device.trustPublicKey,
        filePath,
        fileSize,
        sourceFileModifiedAt: fileStats.mtimeMs,
        existingTransferId,
        previousTransfer
      });
      context.logger?.info('transfer', 'queued outbound transfer', {
        transferId,
        fileName,
        fileSize,
        peerDeviceId: device.deviceId,
        peerDeviceName: device.name,
        peerAddress: `${device.address}:${device.port}`
      });

      const meta = outboundTransfers.get(transferId)!;
      publishTransferEvent(
        IpcChannels.TransferProgress,
        makeOutboundProgress(meta, lastTransferredBytes(transferId), 'pending')
      );

      if (!queuedOutboundTransferIdSet.has(transferId) && activeOutboundTransferId !== transferId) {
        queuedOutboundTransferIds.push(transferId);
        queuedOutboundTransferIdSet.add(transferId);
      }
      startNextOutboundTransfer();

      return { value: transferId };
    }
  );

  ipcMain.handle(IpcChannels.PauseTransfer, (_event, transferId: string): void => {
    const outbound = outboundTransfers.get(transferId);
    if (!outbound) {
      throw new Error(`transfer ${transferId} not found`);
    }

    if (dequeueOutboundTransfer(transferId)) {
      publishTransferEvent(
        IpcChannels.TransferProgress,
        makeOutboundProgress(outbound, lastTransferredBytes(transferId), 'paused')
      );
      settleOutboundTransfer(transferId);
      startNextOutboundTransfer();
      return;
    }

    pausingOutboundTransfers.add(transferId);
    if (hashingOutboundTransfers.has(transferId)) {
      return;
    }
    const paused = context.tcpClient.pause(transferId);
    if (!paused) {
      pausingOutboundTransfers.delete(transferId);
      throw new Error(`transfer ${transferId} not found`);
    }
  });

  ipcMain.handle(IpcChannels.CancelTransfer, (_event, transferId: string): void => {
    const outbound = outboundTransfers.get(transferId);
    if (outbound) {
      if (dequeueOutboundTransfer(transferId)) {
        publishTransferEvent(
          IpcChannels.TransferProgress,
          makeOutboundProgress(outbound, lastTransferredBytes(transferId), 'cancelled')
        );
        settleOutboundTransfer(transferId);
        startNextOutboundTransfer();
        return;
      }

      cancellingOutboundTransfers.add(transferId);
      if (hashingOutboundTransfers.has(transferId)) {
        return;
      }
      const cancelled = context.tcpClient.cancel(transferId);
      if (!cancelled) {
        cancellingOutboundTransfers.delete(transferId);
        throw new Error(`transfer ${transferId} not found`);
      }
      return;
    }

    const inbound = completedOrAcceptedOffers.get(transferId);
    if (inbound) {
      const cancelled = context.tcpServer.cancel(transferId);
      if (!cancelled) {
        throw new Error(`transfer ${transferId} not found`);
      }
      return;
    }

    throw new Error(`transfer ${transferId} not found`);
  });

  ipcMain.handle(IpcChannels.AcceptIncoming, (_event, offerId: string): void => {
    const pending = pendingOffers.get(offerId);
    if (!pending) {
      context.logger?.warn('transfer', 'accept requested for missing incoming offer', { offerId });
      throw new Error(`offer ${offerId} not found`);
    }
    const receiveMode = resolveReceiveMode(pending.info, context.settingsStore.get());
    context.logger?.info('transfer', 'incoming offer accepted', {
      offerId,
      fileName: pending.info.fileName,
      peerDeviceName: pending.info.fromDevice.name,
      receiveMode
    });
    completedOrAcceptedOffers.set(offerId, { info: pending.info, receiveMode });
    pending.responder.accept();
    pendingOffers.delete(offerId);
    context.pendingOfferStore.remove(offerId);
    publishTransferEvent(IpcChannels.TransferProgress, makeInboundProgress(pending.info, 0, 'pending', receiveMode));
  });

  ipcMain.handle(
    IpcChannels.RejectIncoming,
    (_event, offerId: string, reason: RejectReason = 'user-declined'): void => {
      const pending = pendingOffers.get(offerId);
      if (!pending) {
        context.logger?.warn('transfer', 'reject requested for missing incoming offer', { offerId });
        throw new Error(`offer ${offerId} not found`);
      }
      context.logger?.info('transfer', 'incoming offer rejected', {
        offerId,
        fileName: pending.info.fileName,
        reason
      });
      pending.responder.reject(reason);
      pendingOffers.delete(offerId);
      context.pendingOfferStore.remove(offerId);
      publishTransferEvent(IpcChannels.TransferProgress, makeInboundProgress(pending.info, 0, 'rejected', 'manual'));
    }
  );

  ipcMain.handle(IpcChannels.OpenSandbox, async (): Promise<void> => {
    const result = await shell.openPath(context.sandbox.rootPath());
    if (result.length > 0) {
      throw new Error(result);
    }
  });

  ipcMain.handle(IpcChannels.OpenTransferPath, async (_event, path: string): Promise<void> => {
    const safePath = context.sandbox.assertContainsPath(path);
    const result = await shell.openPath(safePath);
    if (result.length > 0) {
      throw new Error(result);
    }
  });

  ipcMain.handle(IpcChannels.RevealTransferPath, (_event, path: string): void => {
    shell.showItemInFolder(context.sandbox.assertContainsPath(path));
  });

  ipcMain.handle(IpcChannels.ClearTransferHistory, (): void => {
    const dismissibleReceiveIds = context.transferHistoryStore
      .list()
      .filter(
        (record) =>
          record.direction === 'receive' &&
          !['pending', 'in-progress', 'paused'].includes(record.status) &&
          context.sandbox.hasIncomingResume(record.transferId)
      )
      .map((record) => record.transferId);

    for (const transferId of dismissibleReceiveIds) {
      context.sandbox.discardIncomingResume(transferId, true);
    }

    context.transferHistoryStore.clearDismissible();
    publishTransferHistoryReset();
  });

  ipcMain.handle(IpcChannels.RemoveTransferHistoryItems, (_event, transferIds: string[]): void => {
    if (!Array.isArray(transferIds) || transferIds.length === 0) {
      return;
    }

    const removableRecords = context.transferHistoryStore
      .list()
      .filter(
        (record) =>
          transferIds.includes(record.transferId) &&
          !['pending', 'in-progress', 'paused'].includes(record.status)
      );

    if (removableRecords.length === 0) {
      return;
    }

    const receiveResumeIds = removableRecords
      .filter(
        (record) =>
          record.direction === 'receive' && context.sandbox.hasIncomingResume(record.transferId)
      )
      .map((record) => record.transferId);

    for (const transferId of receiveResumeIds) {
      context.sandbox.discardIncomingResume(transferId, true);
    }

    context.transferHistoryStore.removeMany(removableRecords.map((record) => record.transferId));
    publishTransferHistoryReset();
  });

  ipcMain.handle(IpcChannels.ClearResumeCache, (): void => {
    const activeReceiveIds = new Set(completedOrAcceptedOffers.keys());
    const clearedIds = context.sandbox.clearResumeCache(activeReceiveIds);
    for (const id of clearedIds) {
      context.transferHistoryStore.remove(id);
    }
    publishTransferHistoryReset();
  });

  ipcMain.handle(IpcChannels.GetSandboxLocation, async (): Promise<SandboxLocationInfo> => {
    return currentSandboxLocation();
  });

  ipcMain.handle(IpcChannels.ChooseSandboxLocation, async (): Promise<SandboxLocationInfo | null> => {
    const window = context.getWindow();
    const dialogOptions: OpenDialogOptions = {
      title: 'Select Sandbox Folder',
      buttonLabel: 'Use This Folder',
      properties: ['openDirectory', 'createDirectory', 'promptToCreate']
    };
    const selected = window
      ? await dialog.showOpenDialog(window, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (selected.canceled || selected.filePaths.length === 0) {
      return null;
    }

    const rootPath = context.sandboxLocation.save(validateSandboxRoot(selected.filePaths[0]));
    context.sandbox.setRoot(rootPath);
    return currentSandboxLocation();
  });

  ipcMain.handle(IpcChannels.SelectFile, async (): Promise<string | null> => {
    const window = context.getWindow();
    const dialogOptions: OpenDialogOptions = {
      title: 'Select File',
      properties: ['openFile']
    };
    const selected = window
      ? await dialog.showOpenDialog(window, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (selected.canceled || selected.filePaths.length === 0) {
      return null;
    }
    return selected.filePaths[0];
  });

  ipcMain.handle(IpcChannels.GetSettings, async (): Promise<SettingsPayload> => {
    return {
      ...context.settingsStore.get(),
      sandboxLocation: await currentSandboxLocation(),
      maintenance: currentMaintenanceInfo()
    };
  });

  ipcMain.handle(IpcChannels.SaveSettings, (_event, partial: Partial<Settings>): Settings => {
    return context.settingsStore.save(partial);
  });

  ipcMain.handle(IpcChannels.SaveProfile, async (_event, profile: ProfilePayload): Promise<Device> => {
    const normalizedName = profile.name.trim();
    if (normalizedName.length === 0) {
      throw new Error('profile name cannot be empty');
    }
    saveIdentityProfile(context.userDataDir, context.identity, {
      name: normalizedName,
      avatarDataUrl: profile.avatarDataUrl
    });
    await context.mdnsService.updateSelf();
    const selfDevice = context.getSelfDevice();
    context.logger?.info('profile', 'updated local profile', {
      name: selfDevice.name,
      hasAvatar: Boolean(selfDevice.avatarDataUrl)
    });
    sendToRenderer(IpcChannels.SelfDeviceUpdated, selfDevice);
    return selfDevice;
  });

  ipcMain.handle(IpcChannels.GetRuntimeLogs, (): RuntimeLogEntry[] => {
    return context.logger?.list() ?? [];
  });

  ipcMain.handle(IpcChannels.ClearRuntimeLogs, (): void => {
    context.logger?.clear();
    context.logger?.info('logs', 'runtime log cleared');
  });

  context.registry.on('device-online', (device) => {
    context.recentPeerStore.upsert(device);
    context.registry.upsertPersistent(device);
    ensurePeerProfile(device);
    context.logger?.info('discovery', 'device online', {
      deviceId: device.deviceId,
      name: device.name,
      address: device.address,
      port: device.port,
      platform: device.platform
    });
    sendToRenderer(IpcChannels.DeviceOnline, device);
  });

  context.registry.on('device-offline', (deviceId) => {
    context.logger?.info('discovery', 'device offline', { deviceId });
    sendToRenderer(IpcChannels.DeviceOffline, deviceId);
  });

  context.tcpServer.on('peer-connected', (peer, address) => {
    rememberConnectedPeer(peer, address);
  });

  context.tcpServer.on('incoming-offer', (info, responder) => {
    rememberInboundPeer(info);
    void (async () => {
      try {
        const settings = context.settingsStore.get();
        if (await exceedsSandboxLimit(info, settings)) {
          responder.reject('too-large');
          publishTransferEvent(IpcChannels.TransferProgress, makeInboundProgress(info, 0, 'rejected', 'manual'));
          return;
        }

        if (canAutoAcceptOffer(info, settings)) {
          const receiveMode = resolveReceiveMode(info, settings);
          context.logger?.info('transfer', 'incoming offer auto-accepted', {
            offerId: info.offerId,
            fileName: info.fileName,
            peerDeviceName: info.fromDevice.name,
            receiveMode
          });
          completedOrAcceptedOffers.set(info.offerId, { info, receiveMode });
          responder.accept();
          context.pendingOfferStore.remove(info.offerId);
          publishTransferEvent(IpcChannels.TransferProgress, makeInboundProgress(info, 0, 'pending', receiveMode));
          return;
        }

        pendingOffers.set(info.offerId, { info, responder });
        context.logger?.info('transfer', 'incoming offer waiting for user response', {
          offerId: info.offerId,
          fileName: info.fileName,
          fileSize: info.fileSize,
          peerDeviceName: info.fromDevice.name
        });

        const offer: IncomingOffer = {
          offerId: info.offerId,
          fromDevice: info.fromDevice,
          fileName: info.fileName,
          fileSize: info.fileSize,
          mimeType: info.mimeType,
          receivedAt: Date.now(),
          saveDirectory: context.sandbox.directoryForIncoming(info.fromDevice.deviceId)
        };

        context.pendingOfferStore.upsert(offer);
        sendToRenderer(IpcChannels.IncomingOffer, offer);
      } catch (error) {
        context.logger?.error('transfer', 'failed to inspect incoming offer', error);
        responder.reject('user-declined');
        publishTransferEvent(IpcChannels.TransferProgress, {
          transferId: info.offerId,
          direction: 'receive',
          fileName: info.fileName,
          fileSize: info.fileSize,
          bytesTransferred: 0,
          peerDeviceName: info.fromDevice.name,
          peerDeviceId: info.fromDevice.deviceId,
          status: 'failed',
          error: error instanceof Error ? error.message : 'failed to inspect sandbox usage'
        } satisfies TransferProgress);
      }
    })();
  });

  context.tcpServer.on('pair-request', (request, responder) => {
    context.logger?.info('pairing', 'incoming pair request', {
      requestId: request.requestId,
      peerDeviceId: request.fromDevice.deviceId,
      peerDeviceName: request.fromDevice.name
    });
    pendingPairRequests.set(request.requestId, { request, responder });
    sendToRenderer(IpcChannels.IncomingPairRequest, {
      requestId: request.requestId,
      fromDevice: request.fromDevice,
      receivedAt: Date.now()
    });
  });

  context.tcpServer.on('pair-request-closed', (requestId) => {
    if (!pendingPairRequests.delete(requestId)) {
      return;
    }
    context.logger?.warn('pairing', 'incoming pair request connection closed', { requestId });
    sendToRenderer(IpcChannels.PairRequestRemoved, requestId);
  });

  context.tcpServer.on('transfer-complete', (info) => {
    const meta = completedOrAcceptedOffers.get(info.offerId);
    const progress: TransferProgress = {
      transferId: info.offerId,
      direction: 'receive',
      fileName: meta?.info.fileName ?? basename(info.savedPath),
      fileSize: meta?.info.fileSize ?? info.bytesReceived,
      bytesTransferred: info.bytesReceived,
      peerDeviceName: info.fromDevice.name,
      peerDeviceId: info.fromDevice.deviceId,
      status: 'completed',
      receiveMode: meta?.receiveMode ?? 'manual',
      localPath: info.savedPath
    };

    completedOrAcceptedOffers.delete(info.offerId);
    context.logger?.info('transfer', 'incoming transfer completed', {
      offerId: info.offerId,
      savedPath: info.savedPath,
      bytesReceived: info.bytesReceived,
      peerDeviceName: info.fromDevice.name
    });
    publishTransferEvent(IpcChannels.TransferComplete, progress);

    if (context.settingsStore.get().openReceivedFolder) {
      shell.showItemInFolder(info.savedPath);
    }
  });

  context.tcpServer.on('progress', (info) => {
    const receiveMode = completedOrAcceptedOffers.get(info.offerId)?.receiveMode ?? 'manual';
    publishTransferEvent(
      IpcChannels.TransferProgress,
      makeInboundProgress(info, info.bytesReceived, 'in-progress', receiveMode)
    );
  });

  context.tcpServer.on('transfer-paused', (info: ReceiveInterruptedInfo) => {
    const receiveMode = completedOrAcceptedOffers.get(info.offerId)?.receiveMode ?? 'manual';
    publishTransferEvent(
      IpcChannels.TransferProgress,
      makeInboundProgress(
        info,
        info.bytesReceived,
        'paused',
        receiveMode,
        info.localPath,
        info.reason === 'sender-paused'
          ? 'Sender paused the transfer. Retry from the sender to continue.'
          : 'Transfer interrupted. Sender retry can resume from the cached partial file.'
      )
    );
    completedOrAcceptedOffers.delete(info.offerId);
    context.logger?.warn('transfer', 'incoming transfer paused', {
      offerId: info.offerId,
      bytesReceived: info.bytesReceived,
      reason: info.reason
    });
  });

  context.tcpServer.on('transfer-cancelled', (info) => {
    const receiveMode = completedOrAcceptedOffers.get(info.offerId)?.receiveMode ?? 'manual';
    publishTransferEvent(
      IpcChannels.TransferProgress,
      makeInboundProgress(info, info.bytesReceived, 'cancelled', receiveMode)
    );
    completedOrAcceptedOffers.delete(info.offerId);
    context.logger?.warn('transfer', 'incoming transfer cancelled', {
      offerId: info.offerId,
      bytesReceived: info.bytesReceived,
      reason: info.reason
    });
  });

  context.tcpServer.on('transfer-error', (info: TransferErrorInfo) => {
    if (!info.offerId && !info.fileName && !info.fromDevice) {
      return;
    }
    if (info.offerId) {
      completedOrAcceptedOffers.delete(info.offerId);
    }
    context.logger?.error('transfer', 'incoming transfer failed', {
      offerId: info.offerId,
      fileName: info.fileName,
      bytesReceived: info.bytesReceived,
      error: info.error.message
    });
    publishTransferEvent(IpcChannels.TransferProgress, {
      transferId: info.offerId ?? randomUUID(),
      direction: 'receive',
      fileName: info.fileName ?? 'incoming file',
      fileSize: info.fileSize ?? 0,
      bytesTransferred: info.bytesReceived ?? 0,
      peerDeviceName: info.fromDevice?.name ?? '',
      peerDeviceId: info.fromDevice?.deviceId,
      status: 'failed',
      localPath: info.localPath,
      error: info.error.message
    } satisfies TransferProgress);
  });

  context.tcpClient.on('progress', (progress) => {
    const meta = outboundTransfers.get(progress.fileId);
    const fallbackMeta: OutboundTransferMeta = {
      transferId: progress.fileId,
      batchId: meta?.batchId,
      batchLabel: meta?.batchLabel,
      fileName: progress.fileName,
      fileSize: progress.totalBytes,
      peerDeviceName: meta?.peerDeviceName ?? '',
      peerDeviceId: meta?.peerDeviceId ?? '',
      localPath: meta?.localPath ?? '',
      sourceFileModifiedAt: meta?.sourceFileModifiedAt ?? 0,
      sourceFileSha256: meta?.sourceFileSha256 ?? ''
    };
    const currentMeta = meta ?? fallbackMeta;
    publishTransferEvent(
      IpcChannels.TransferProgress,
      makeOutboundProgress(
        currentMeta,
        progress.bytesTransferred,
        progress.bytesTransferred >= progress.totalBytes ? 'completed' : 'in-progress'
      )
    );
  });
}
