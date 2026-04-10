import type { SyncFileAPI } from './index';

declare global {
  interface Window {
    syncFile: SyncFileAPI;
  }
}

export {};
