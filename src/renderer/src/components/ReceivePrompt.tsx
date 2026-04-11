import type { IncomingOffer } from '@shared/types';
import type { Messages } from '../i18n';

interface ReceivePromptProps {
  offer: IncomingOffer;
  queueCount: number;
  trustedSender?: boolean;
  busy?: boolean;
  onAccept: (offerId: string) => void | Promise<void>;
  onTrustAndAccept: (offer: IncomingOffer) => void | Promise<void>;
  onReject: (offerId: string) => void | Promise<void>;
  messages: Messages;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function ReceivePrompt({
  offer,
  queueCount,
  trustedSender = false,
  busy = false,
  onAccept,
  onTrustAndAccept,
  onReject,
  messages
}: ReceivePromptProps): JSX.Element {
  return (
    <div className="receive-prompt-overlay" role="presentation">
      <div
        className="receive-prompt"
        role="dialog"
        aria-modal="true"
        aria-label={messages.incomingFileRequestAriaLabel}
      >
        <div className="receive-prompt-stamp">{messages.incomingFileRequest}</div>
        <h3 className="receive-prompt-title">{offer.fileName}</h3>
        <p className="receive-prompt-from">
          <strong>{offer.fromDevice.name}</strong> {messages.wantsToSend}
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
        {queueCount > 1 && <p className="receive-prompt-queue">{messages.waitingRequests(queueCount - 1)}</p>}
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
  );
}
