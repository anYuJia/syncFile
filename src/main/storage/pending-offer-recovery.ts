import type { PendingOfferStore } from './pending-offers';
import type { TransferHistoryStore } from './transfer-history';

export function recoverPendingOffers(
  pendingOfferStore: PendingOfferStore,
  transferHistoryStore: TransferHistoryStore
): void {
  for (const offer of pendingOfferStore.list()) {
    transferHistoryStore.upsert({
      transferId: offer.offerId,
      direction: 'receive',
      fileName: offer.fileName,
      fileSize: offer.fileSize,
      bytesTransferred: 0,
      peerDeviceName: offer.fromDevice.name,
      peerDeviceId: offer.fromDevice.deviceId,
      status: 'failed',
      error: 'Incoming request expired because the app restarted before it was handled.'
    });
  }

  pendingOfferStore.clear();
}
