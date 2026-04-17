import { describe, expect, it } from 'vitest';

import { deriveTransferTelemetry, refreshTransferTelemetry } from './transfer-metrics';

describe('deriveTransferTelemetry', () => {
  it('calculates smoothed transfer rate and eta from progress samples', () => {
    const first = deriveTransferTelemetry(
      undefined,
      { status: 'in-progress', fileSize: 1_000, bytesTransferred: 200 },
      1_000
    );

    expect(first.transferRateBytesPerSecond).toBeUndefined();
    expect(first.estimatedSecondsRemaining).toBeUndefined();
    expect(first.lastProgressAt).toBe(1_000);

    const second = deriveTransferTelemetry(
      first,
      { status: 'in-progress', fileSize: 1_000, bytesTransferred: 500 },
      2_000
    );

    expect(second.transferRateBytesPerSecond).toBe(300);
    expect(second.estimatedSecondsRemaining).toBeCloseTo(500 / 300, 5);
    expect(second.lastProgressAt).toBe(2_000);
  });

  it('drops live metrics when progress has gone stale', () => {
    const active = deriveTransferTelemetry(
      {
        lastByteSampleAt: 1_000,
        lastByteSampleBytes: 500,
        lastProgressAt: 1_000,
        transferRateBytesPerSecond: 250,
        estimatedSecondsRemaining: 2
      },
      { status: 'in-progress', fileSize: 1_000, bytesTransferred: 500 },
      5_500
    );

    expect(active.transferRateBytesPerSecond).toBeUndefined();
    expect(active.estimatedSecondsRemaining).toBeUndefined();
  });

  it('clears live metrics for paused transfers', () => {
    const paused = deriveTransferTelemetry(
      {
        lastByteSampleAt: 1_000,
        lastByteSampleBytes: 400,
        lastProgressAt: 1_000,
        transferRateBytesPerSecond: 200,
        estimatedSecondsRemaining: 3
      },
      { status: 'paused', fileSize: 1_000, bytesTransferred: 400 },
      2_000
    );

    expect(paused.transferRateBytesPerSecond).toBeUndefined();
    expect(paused.estimatedSecondsRemaining).toBeUndefined();
    expect(paused.lastProgressAt).toBe(1_000);
  });
});

describe('refreshTransferTelemetry', () => {
  it('preserves fresh live metrics', () => {
    const transfer = {
      status: 'in-progress' as const,
      fileSize: 1_000,
      bytesTransferred: 500,
      lastProgressAt: 2_000,
      transferRateBytesPerSecond: 250,
      estimatedSecondsRemaining: 2
    };

    expect(refreshTransferTelemetry(transfer, 5_000)).toBe(transfer);
  });

  it('clears stale metrics without changing transfer progress', () => {
    const transfer = {
      status: 'in-progress' as const,
      fileSize: 1_000,
      bytesTransferred: 500,
      lastProgressAt: 2_000,
      transferRateBytesPerSecond: 250,
      estimatedSecondsRemaining: 2
    };

    expect(refreshTransferTelemetry(transfer, 6_500)).toEqual({
      ...transfer,
      transferRateBytesPerSecond: undefined,
      estimatedSecondsRemaining: undefined
    });
  });
});
