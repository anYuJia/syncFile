import type { TransferStatus } from '@shared/types';

const RATE_BLEND_FACTOR = 0.35;
const METRICS_STALE_AFTER_MS = 4000;

export interface TransferTelemetry {
  transferRateBytesPerSecond?: number;
  estimatedSecondsRemaining?: number;
  lastByteSampleAt?: number;
  lastByteSampleBytes?: number;
  lastProgressAt?: number;
}

interface TransferSnapshot {
  status: TransferStatus;
  fileSize: number;
  bytesTransferred: number;
}

export function deriveTransferTelemetry(
  previous: TransferTelemetry | undefined,
  next: TransferSnapshot,
  now = Date.now()
): TransferTelemetry {
  if (next.status !== 'in-progress') {
    return {
      transferRateBytesPerSecond: undefined,
      estimatedSecondsRemaining: undefined,
      lastByteSampleAt: previous?.lastByteSampleAt,
      lastByteSampleBytes: previous?.lastByteSampleBytes,
      lastProgressAt: previous?.lastProgressAt
    };
  }

  const previousBytes = previous?.lastByteSampleBytes;
  const previousSampleAt = previous?.lastByteSampleAt;
  const advancedBytes =
    typeof previousBytes === 'number' ? next.bytesTransferred - previousBytes : 0;

  let transferRateBytesPerSecond = previous?.transferRateBytesPerSecond;
  let lastProgressAt = previous?.lastProgressAt;

  if (
    typeof previousBytes === 'number' &&
    typeof previousSampleAt === 'number' &&
    advancedBytes > 0 &&
    now > previousSampleAt
  ) {
    const instantRate = (advancedBytes / (now - previousSampleAt)) * 1000;
    transferRateBytesPerSecond = transferRateBytesPerSecond
      ? transferRateBytesPerSecond * (1 - RATE_BLEND_FACTOR) + instantRate * RATE_BLEND_FACTOR
      : instantRate;
    lastProgressAt = now;
  } else if (
    typeof previousBytes !== 'number' ||
    next.bytesTransferred > (previous?.lastByteSampleBytes ?? -1)
  ) {
    lastProgressAt = now;
  }

  if (lastProgressAt && now - lastProgressAt > METRICS_STALE_AFTER_MS) {
    transferRateBytesPerSecond = undefined;
  }

  let estimatedSecondsRemaining: number | undefined;
  if (
    transferRateBytesPerSecond &&
    transferRateBytesPerSecond > 0 &&
    next.fileSize > next.bytesTransferred
  ) {
    estimatedSecondsRemaining =
      (next.fileSize - next.bytesTransferred) / transferRateBytesPerSecond;
  }

  return {
    transferRateBytesPerSecond,
    estimatedSecondsRemaining,
    lastByteSampleAt: now,
    lastByteSampleBytes: next.bytesTransferred,
    lastProgressAt
  };
}

export function refreshTransferTelemetry<T extends TransferSnapshot & TransferTelemetry>(
  transfer: T,
  now = Date.now()
): T {
  if (
    transfer.status !== 'in-progress' ||
    !transfer.lastProgressAt ||
    now - transfer.lastProgressAt <= METRICS_STALE_AFTER_MS ||
    (!transfer.transferRateBytesPerSecond && !transfer.estimatedSecondsRemaining)
  ) {
    return transfer;
  }

  return {
    ...transfer,
    transferRateBytesPerSecond: undefined,
    estimatedSecondsRemaining: undefined
  };
}
