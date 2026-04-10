import { join } from 'path';
import { platform as getPlatform } from 'os';

import { app, BrowserWindow, shell } from 'electron';

import type { Device } from '../shared/types';
import { DeviceRegistry } from './discovery/device-registry';
import { MdnsService } from './discovery/mdns-service';
import { registerIpcHandlers } from './ipc/handlers';
import { loadOrCreateIdentity } from './storage/device-identity';
import { Sandbox } from './storage/sandbox';
import { TcpClient } from './transfer/tcp-client';
import { TcpServer } from './transfer/tcp-server';

const DEFAULT_TRANSFER_PORT = 43434;

let mainWindow: BrowserWindow | null = null;
let tcpServer: TcpServer | null = null;
let mdnsService: MdnsService | null = null;
let cleanupPromise: Promise<void> | null = null;
let ipcRegistered = false;

async function createWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 960,
    height: 720,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  window.on('ready-to-show', () => {
    window.show();
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

async function bootstrap(): Promise<void> {
  const userDataDir = app.getPath('userData');
  const identity = loadOrCreateIdentity(userDataDir);
  const sandbox = new Sandbox(join(userDataDir, 'sandbox'));
  const registry = new DeviceRegistry();

  tcpServer = new TcpServer({ sandbox });
  const actualPort = await tcpServer
    .listen(DEFAULT_TRANSFER_PORT)
    .catch(() => (tcpServer as TcpServer).listen(0));

  const tcpClient = new TcpClient({
    selfDevice: {
      deviceId: identity.deviceId,
      name: identity.name
    }
  });

  mdnsService = new MdnsService({
    registry,
    self: {
      deviceId: identity.deviceId,
      name: identity.name,
      port: actualPort,
      platform: getPlatform()
    }
  });
  mdnsService.start();

  mainWindow = await createWindow();

  const getSelfDevice = (): Device => ({
    deviceId: identity.deviceId,
    name: identity.name,
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
      identity,
      getSelfDevice,
      getWindow: () => mainWindow
    });
    ipcRegistered = true;
  }
}

async function cleanup(): Promise<void> {
  if (cleanupPromise) {
    await cleanupPromise;
    return;
  }

  cleanupPromise = (async () => {
    if (mdnsService) {
      await mdnsService.stop();
      mdnsService = null;
    }

    if (tcpServer) {
      await tcpServer.close();
      tcpServer = null;
    }
  })();

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
    void createWindow().then((window) => {
      mainWindow = window;
    });
  }
});
