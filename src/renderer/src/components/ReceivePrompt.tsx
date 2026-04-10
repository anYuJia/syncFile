import type { IncomingOffer } from '@shared/types';

interface ReceivePromptProps {
  offer: IncomingOffer;
  queueCount: number;
  busy?: boolean;
  onAccept: (offerId: string) => void | Promise<void>;
  onReject: (offerId: string) => void | Promise<void>;
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
  busy = false,
  onAccept,
  onReject
}: ReceivePromptProps): JSX.Element {
  return (
    <div className="receive-prompt-overlay" role="presentation">
      <div className="receive-prompt" role="dialog" aria-modal="true" aria-label="Incoming file offer">
        <h3 className="receive-prompt-title">Incoming file request</h3>
        <p className="receive-prompt-from">
          <strong>{offer.fromDevice.name}</strong> wants to send:
        </p>
        <div className="receive-prompt-file">
          <p className="receive-prompt-file-name">{offer.fileName}</p>
          <p className="receive-prompt-file-size">{formatBytes(offer.fileSize)}</p>
        </div>
        {queueCount > 1 && <p className="receive-prompt-queue">{queueCount - 1} more request(s) waiting.</p>}
        <div className="receive-prompt-actions">
          <button
            type="button"
            className="button button-muted"
            onClick={() => onReject(offer.offerId)}
            disabled={busy}
          >
            Reject
          </button>
          <button type="button" className="button" onClick={() => onAccept(offer.offerId)} disabled={busy}>
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
