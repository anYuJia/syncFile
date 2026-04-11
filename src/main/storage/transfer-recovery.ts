import type { TransferHistoryStore } from './transfer-history';
import type { Sandbox } from './sandbox';

export function recoverTransferState(
  historyStore: TransferHistoryStore,
  sandbox: Sandbox
): void {
  historyStore.markInterruptedSends();

  for (const entry of sandbox.listResumeEntries()) {
    historyStore.upsert({
      transferId: entry.fileId,
      direction: 'receive',
      fileName: entry.fileName,
      fileSize: entry.fileSize,
      bytesTransferred: entry.bytesReceived,
      peerDeviceName: entry.deviceName,
      peerDeviceId: entry.deviceId,
      status: 'failed',
      localPath: entry.partialPath,
      error: 'Partial receive cached. Sender retry can resume.'
    });
  }
}
