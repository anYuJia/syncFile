import { dirname, join } from 'path';
import { platform as getPlatform } from 'os';

import { app, BrowserWindow, shell } from 'electron';

import type { Device } from '../shared/types';
import type { MdnsService } from './discovery/mdns-service';
import { DeviceRegistry } from './discovery/device-registry';
import { MdnsService as SyncMdnsService } from './discovery/mdns-service';
import { registerIpcHandlers, unregisterIpcHandlers } from './ipc/handlers';
import { loadOrCreateIdentity } from './storage/device-identity';
import { SandboxLocationStore } from './storage/sandbox-location';
import { Sandbox } from './storage/sandbox';
import { PendingOfferStore } from './storage/pending-offers';
import { recoverPendingOffers } from './storage/pending-offer-recovery';
import { SettingsStore } from './storage/settings';
import { TransferHistoryStore } from './storage/transfer-history';
import { recoverTransferState } from './storage/transfer-recovery';
import { TcpClient } from './transfer/tcp-client';
import { TcpServer } from './transfer/tcp-server';
import {
  initRuntimeLogger,
  installProcessLoggers,
  logError,
  logInfo,
  type RuntimeLogger
} from './logging/runtime-log';

const DEFAULT_TRANSFER_PORT = 43434;

let mainWindow: BrowserWindow | null = null;
let tcpServer: TcpServer | null = null;
let mdnsService: MdnsService | null = null;
let transferHistoryStore: TransferHistoryStore | null = null;
let runtimeLogger: RuntimeLogger | null = null;
let cleanupPromise: Promise<void> | null = null;
let bootstrapPromise: Promise<void> | null = null;
let ipcRegistered = false;

async function createWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 880,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      safeDialogs: true
    }
  });

  window.on('ready-to-show', () => {
    window.show();
  });

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  window.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    await window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await window.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return window;
}

function hasActiveServices(): boolean {
  return tcpServer !== null && mdnsService !== null && transferHistoryStore !== null;
}

function hasPartialRuntimeState(): boolean {
  return tcpServer !== null || mdnsService !== null || transferHistoryStore !== null || ipcRegistered;
}

async function ensureWindow(): Promise<void> {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return;
  }

  mainWindow = await createWindow();
}

async function bootstrapServices(): Promise<void> {
  const userDataDir = app.getPath('userData');
  runtimeLogger = initRuntimeLogger(userDataDir);
  installProcessLoggers();
  runtimeLogger.info('app', 'bootstrapping services', {
    userDataDir,
    platform: getPlatform()
  });
  const identity = loadOrCreateIdentity(userDataDir);
  const defaultSandboxRoot = resolveDefaultSandboxRoot();
  const sandboxLocation = new SandboxLocationStore(userDataDir);
  const sandbox = new Sandbox(sandboxLocation.resolvePath(defaultSandboxRoot));
  const pendingOfferStore = new PendingOfferStore(userDataDir);
  const settingsStore = new SettingsStore(userDataDir);
  transferHistoryStore = new TransferHistoryStore(userDataDir);
  recoverTransferState(transferHistoryStore, sandbox);
  recoverPendingOffers(pendingOfferStore, transferHistoryStore);
  const registry = new DeviceRegistry();

  tcpServer = new TcpServer({
    sandbox,
    selfDevice: {
      deviceId: identity.deviceId,
      name: identity.name,
      trustFingerprint: identity.trustFingerprint,
      trustPublicKey: identity.trustPublicKey,
      trustPrivateKey: identity.trustPrivateKey
    }
  });
  const actualPort = await tcpServer
    .listen(DEFAULT_TRANSFER_PORT)
    .catch(() => (tcpServer as TcpServer).listen(0));
  runtimeLogger.info('transfer', 'tcp server listening', { port: actualPort });

  const tcpClient = new TcpClient({
    selfDevice: {
      deviceId: identity.deviceId,
      name: identity.name,
      trustFingerprint: identity.trustFingerprint,
      trustPublicKey: identity.trustPublicKey,
      trustPrivateKey: identity.trustPrivateKey
    }
  });

  mdnsService = new SyncMdnsService({
    registry,
    self: {
      deviceId: identity.deviceId,
      name: identity.name,
      trustFingerprint: identity.trustFingerprint,
      port: actualPort,
      platform: getPlatform()
    }
  });
  mdnsService.start();

  const getSelfDevice = (): Device => ({
    deviceId: identity.deviceId,
    name: identity.name,
    trustFingerprint: identity.trustFingerprint,
    trustPublicKey: identity.trustPublicKey,
    host: 'localhost',
    address: '127.0.0.1',
    port: actualPort,
    platform: getPlatform(),
    version: '1'
  });

  if (!ipcRegistered) {
    registerIpcHandlers({
      registry,
      tcpServer,
      tcpClient,
      sandbox,
      sandboxLocation,
      pendingOfferStore,
      settingsStore,
      transferHistoryStore,
      mdnsService,
      logger: runtimeLogger,
      identity,
      getSelfDevice,
      getWindow: () => mainWindow
    });
    ipcRegistered = true;
  }
}

async function bootstrap(): Promise<void> {
  if (cleanupPromise) {
    await cleanupPromise;
  }

  if (bootstrapPromise) {
    await bootstrapPromise;
    return;
  }

  bootstrapPromise = (async () => {
    if (!hasActiveServices()) {
      if (hasPartialRuntimeState()) {
        await cleanup();
      }

      try {
        await bootstrapServices();
      } catch (error) {
        logError('app', 'failed to bootstrap services', error);
        await cleanup();
        throw error;
      }
    }

    await ensureWindow();
  })();

  try {
    await bootstrapPromise;
  } finally {
    bootstrapPromise = null;
  }
}

function resolveDefaultSandboxRoot(): string {
  if (!app.isPackaged) {
    return join(app.getAppPath(), 'file');
  }

  const exeDir = dirname(app.getPath('exe'));
  if (getPlatform() === 'darwin') {
    const appBundleDir = dirname(dirname(exeDir));
    return join(dirname(appBundleDir), 'file');
  }

  return join(exeDir, 'file');
}

async function cleanup(): Promise<void> {
  if (cleanupPromise) {
    await cleanupPromise;
    return;
  }

  cleanupPromise = (async () => {
    logInfo('app', 'cleaning up runtime services');
    if (ipcRegistered) {
      unregisterIpcHandlers();
      ipcRegistered = false;
    }

    if (mdnsService) {
      await mdnsService.stop();
      mdnsService = null;
    }

    await transferHistoryStore?.flush();
    transferHistoryStore = null;

    if (tcpServer) {
      await tcpServer.close();
      tcpServer = null;
    }
  })().finally(() => {
    cleanupPromise = null;
  });

  await cleanupPromise;
}

app.whenReady().then(() => {
  void bootstrap();
});

app.on('before-quit', () => {
  void cleanup();
});

app.on('window-all-closed', () => {
  if (getPlatform() !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void bootstrap();
  }
});
