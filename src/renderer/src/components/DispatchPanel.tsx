import { DropZone, type PendingFile } from './DropZone';
import type { RendererTransferProgress } from '../hooks/useSyncFile';
import type { Messages } from '../i18n';
import type { SelectedRecipientSnapshot } from '../types/workspace';
import { formatBytes, formatEta, formatTransferRate } from '../utils/format';
import type { Device } from '@shared/types';

interface DispatchPanelProps {
  messages: Messages;
  selectedDevices: SelectedRecipientSnapshot[];
  trustedDeviceKeys: Set<string>;
  busyPairingDeviceId?: string | null;
  pendingFiles: PendingFile[];
  activeSendTransfers: RendererTransferProgress[];
  primaryActiveSendTransfer: RendererTransferProgress | null;
  primaryActiveSendPercent: number;
  selfDevice: Device | null;
  onPairDevice: (deviceId: string) => void;
  onSendFiles: (filePaths: string[]) => void | Promise<void>;
  onPendingFilesChange: (files: PendingFile[]) => void;
  onRemoveRecipient: (deviceId: string) => void;
}

export function DispatchPanel({
  messages,
  selectedDevices,
  trustedDeviceKeys,
  busyPairingDeviceId = null,
  pendingFiles,
  activeSendTransfers,
  primaryActiveSendTransfer,
  primaryActiveSendPercent,
  selfDevice,
  onPairDevice,
  onSendFiles,
  onPendingFilesChange,
  onRemoveRecipient
}: DispatchPanelProps): JSX.Element {
  const singleSelectedDevice = selectedDevices.length === 1 ? selectedDevices[0] : null;
  const isPairingSingleDevice =
    Boolean(singleSelectedDevice) && busyPairingDeviceId === singleSelectedDevice?.deviceId;
  const isWaitingForReceiver =
    primaryActiveSendTransfer?.status === 'in-progress' &&
    primaryActiveSendTransfer.fileSize > 0 &&
    primaryActiveSendTransfer.bytesTransferred >= primaryActiveSendTransfer.fileSize;
  const liveTransferStatusLabel =
    isWaitingForReceiver
      ? messages.transferWaitingForReceiver
      : primaryActiveSendTransfer?.status === 'pending'
        ? messages.transferPreparing
        : messages.transferStatusInProgress;

  return (
    <section className="card card-dispatch workspace-panel">
      <div className="card-head workspace-panel-head">
        <div className="card-head-copy">
          <span className="workspace-panel-kicker">{messages.dispatchKicker}</span>
          <h2>{messages.sendFile}</h2>
          <span className="card-head-caption">{pendingFiles.length}/{selectedDevices.length}</span>
        </div>
        <div className="card-head-actions card-head-actions-dispatch">
          <span className={`dispatch-target-badge${selectedDevices.length > 0 ? ' is-active' : ''}`}>
            {selectedDevices.length > 0
              ? messages.dispatchTargetReady(selectedDevices.map((device) => device.name).join(' · '))
              : messages.dispatchTargetIdle}
          </span>
          {singleSelectedDevice && singleSelectedDevice.isOnline !== false && (
            trustedDeviceKeys.has(`${singleSelectedDevice.deviceId}:${singleSelectedDevice.trustFingerprint}`) ? (
              <span className="device-item-trusted">{messages.pairedDevice}</span>
            ) : (
              <button
                type="button"
                className="button button-ghost"
                onClick={() => onPairDevice(singleSelectedDevice.deviceId)}
                disabled={isPairingSingleDevice}
                aria-busy={isPairingSingleDevice}
              >
                {isPairingSingleDevice ? messages.pairDeviceBusy : messages.pairDevice}
              </button>
            )
          )}
        </div>
      </div>

      {primaryActiveSendTransfer && (
        <div className={`dispatch-live-transfer${isWaitingForReceiver ? ' is-confirming' : ''}`}>
          <div className="dispatch-live-transfer-head">
            <div className="dispatch-live-transfer-copy">
              <span className="dispatch-live-transfer-kicker">{liveTransferStatusLabel}</span>
              <strong className="dispatch-live-transfer-title">
                {primaryActiveSendTransfer.fileName}
              </strong>
              <span className="dispatch-live-transfer-peer">
                {primaryActiveSendTransfer.peerDeviceName || messages.unknownDevice}
              </span>
            </div>
            <div className="dispatch-live-transfer-side">
              <span className="dispatch-live-transfer-percent">{primaryActiveSendPercent}%</span>
              {activeSendTransfers.length > 1 && (
                <span className="dispatch-live-transfer-count">+{activeSendTransfers.length - 1}</span>
              )}
            </div>
          </div>
          <div
            className="dispatch-live-transfer-track"
            role="progressbar"
            aria-label={`${liveTransferStatusLabel} ${primaryActiveSendTransfer.fileName}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={primaryActiveSendPercent}
            aria-valuetext={
              isWaitingForReceiver ? messages.transferWaitingForReceiver : `${primaryActiveSendPercent}%`
            }
          >
            <div
              className="dispatch-live-transfer-fill"
              style={{ width: `${primaryActiveSendPercent}%` }}
            />
          </div>
          <div className="dispatch-live-transfer-meta">
            <span>
              {formatBytes(primaryActiveSendTransfer.bytesTransferred)} /{' '}
              {formatBytes(primaryActiveSendTransfer.fileSize)}
            </span>
            {!isWaitingForReceiver && (primaryActiveSendTransfer.status === 'in-progress' ||
              primaryActiveSendTransfer.transferRateBytesPerSecond ||
              primaryActiveSendTransfer.estimatedSecondsRemaining) && (
              <span className="dispatch-live-transfer-metrics">
                <span>
                  {messages.transferRateLabel}{' '}
                  {primaryActiveSendTransfer.transferRateBytesPerSecond
                    ? formatTransferRate(primaryActiveSendTransfer.transferRateBytesPerSecond)
                    : '--/s'}
                </span>
                <span>
                  {messages.transferEtaLabel}{' '}
                  {primaryActiveSendTransfer.estimatedSecondsRemaining
                    ? formatEta(primaryActiveSendTransfer.estimatedSecondsRemaining)
                    : '--'}
                </span>
              </span>
            )}
          </div>
        </div>
      )}

      <DropZone
        onSend={onSendFiles}
        messages={messages}
        selectedDevices={selectedDevices}
        selfDevice={selfDevice}
        pendingFiles={pendingFiles}
        onPendingFilesChange={onPendingFilesChange}
        onRemoveRecipient={onRemoveRecipient}
      />
    </section>
  );
}
