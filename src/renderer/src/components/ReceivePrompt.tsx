import type { IncomingOffer } from '@shared/types';
import type { Messages } from '../i18n';
import { useDialogA11y } from '../hooks/useDialogA11y';
import { formatBytes } from '../utils/format';

interface ReceivePromptProps {
  offers: IncomingOffer[];
  selectedOfferId: string;
  trustedDeviceKeys?: Set<string>;
  onSelectOffer: (offerId: string) => void;
  busy?: boolean;
  onAccept: (offerId: string) => void | Promise<void>;
  onTrustAndAccept: (offer: IncomingOffer) => void | Promise<void>;
  onReject: (offerId: string) => void | Promise<void>;
  messages: Messages;
}

export function ReceivePrompt({
  offers,
  selectedOfferId,
  trustedDeviceKeys,
  onSelectOffer,
  busy = false,
  onAccept,
  onTrustAndAccept,
  onReject,
  messages
}: ReceivePromptProps): JSX.Element {
  const offer = offers.find((item) => item.offerId === selectedOfferId) ?? offers[0];
  const trustedSender =
    trustedDeviceKeys?.has(`${offer.fromDevice.deviceId}:${offer.fromDevice.trustFingerprint}`) ?? false;
  const dialogRef = useDialogA11y(undefined);

  return (
    <div className="receive-prompt-overlay" role="presentation">
      <div
        ref={dialogRef}
        className="receive-prompt"
        role="dialog"
        aria-modal="true"
        aria-label={messages.incomingFileRequestAriaLabel}
        tabIndex={-1}
      >
        <div className={`receive-prompt-shell${offers.length > 1 ? '' : ' receive-prompt-shell-single'}`}>
          {offers.length > 1 && (
            <aside className="receive-prompt-queue-list" aria-label={messages.receivePromptQueueTitle}>
              <div className="receive-prompt-queue-head">
                <span className="receive-prompt-stamp">{messages.receivePromptQueueTitle}</span>
                <span className="receive-prompt-queue-count">{offers.length}</span>
              </div>
              <div className="receive-prompt-queue-items">
                {offers.map((item) => {
                  const selected = item.offerId === offer.offerId;
                  return (
                    <button
                      key={item.offerId}
                      type="button"
                      className={`receive-prompt-queue-item${selected ? ' is-active' : ''}`}
                      onClick={() => onSelectOffer(item.offerId)}
                    >
                      <span className="receive-prompt-queue-file">{item.fileName}</span>
                      <span className="receive-prompt-queue-meta">
                        {item.fromDevice.name} · {formatBytes(item.fileSize)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>
          )}

          <div className="receive-prompt-main">
            <div className="receive-prompt-stamp">{messages.incomingFileRequest}</div>
            <h3 className="receive-prompt-title">{offer.fileName}</h3>
            <p className="receive-prompt-from">
              <strong>{offer.fromDevice.name}</strong> {messages.wantsToSend}
            </p>
            <p className="receive-prompt-fingerprint">
              {messages.deviceFingerprintLabel}: {offer.fromDevice.trustFingerprint}
            </p>
            {trustedSender && <p className="receive-prompt-trusted">{messages.trustedDeviceLabel}</p>}
            <div className="receive-prompt-file">
              <p className="receive-prompt-file-name">{offer.fileName}</p>
              <p className="receive-prompt-file-size">{formatBytes(offer.fileSize)}</p>
            </div>
            <div className="receive-prompt-path">
              <span className="receive-prompt-path-label">{messages.receivePromptSaveTo}</span>
              <span className="receive-prompt-path-value">{offer.saveDirectory}</span>
            </div>
            {offers.length > 1 && <p className="receive-prompt-queue">{messages.waitingRequests(offers.length - 1)}</p>}
            <div className="receive-prompt-actions">
              <button
                type="button"
                className="button button-muted"
                onClick={() => onReject(offer.offerId)}
                disabled={busy}
              >
                {messages.reject}
              </button>
              {!trustedSender && (
                <button
                  type="button"
                  className="button button-muted"
                  onClick={() => onTrustAndAccept(offer)}
                  disabled={busy}
                >
                  {messages.trustAndAccept}
                </button>
              )}
              <button type="button" className="button" onClick={() => onAccept(offer.offerId)} disabled={busy}>
                {messages.accept}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
