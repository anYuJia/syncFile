import { useEffect, useState } from 'react';

import type { PairRequest } from '@shared/types';
import type { Messages } from '../i18n';
import { useDialogA11y } from '../hooks/useDialogA11y';

interface PairRequestQueuePromptProps {
  requests: PairRequest[];
  selectedRequestId: string;
  onSelectRequest: (requestId: string) => void;
  selfFingerprint: string;
  busy?: boolean;
  onAccept: (requestId: string) => void | Promise<void>;
  onReject: (requestId: string) => void | Promise<void>;
  messages: Messages;
}

export function PairRequestQueuePrompt({
  requests,
  selectedRequestId,
  onSelectRequest,
  selfFingerprint,
  busy = false,
  onAccept,
  onReject,
  messages
}: PairRequestQueuePromptProps): JSX.Element {
  const request = requests.find((item) => item.requestId === selectedRequestId) ?? requests[0];
  const dialogRef = useDialogA11y(undefined);
  const [confirmingRejectRequestId, setConfirmingRejectRequestId] = useState<string | null>(null);
  const confirmingReject = confirmingRejectRequestId === request.requestId;

  useEffect(() => {
    if (!confirmingRejectRequestId) {
      return;
    }
    const timer = window.setTimeout(() => setConfirmingRejectRequestId(null), 3600);
    return () => window.clearTimeout(timer);
  }, [confirmingRejectRequestId]);

  useEffect(() => {
    setConfirmingRejectRequestId(null);
  }, [request.requestId]);

  const handleReject = (): void => {
    if (busy) {
      return;
    }
    if (!confirmingReject) {
      setConfirmingRejectRequestId(request.requestId);
      return;
    }
    setConfirmingRejectRequestId(null);
    void onReject(request.requestId);
  };

  return (
    <div className="receive-prompt-overlay" role="presentation">
      <div
        ref={dialogRef}
        className="receive-prompt pair-prompt"
        role="dialog"
        aria-modal="true"
        aria-label={messages.pairPromptTitle}
        aria-busy={busy}
        tabIndex={-1}
      >
        <div className={`receive-prompt-shell${requests.length > 1 ? '' : ' receive-prompt-shell-single'}`}>
          {requests.length > 1 && (
            <aside className="receive-prompt-queue-list" aria-label={messages.pairRequestQueueTitle}>
              <div className="receive-prompt-queue-head">
                <span className="receive-prompt-stamp">{messages.pairRequestQueueTitle}</span>
                <span className="receive-prompt-queue-count">{requests.length}</span>
              </div>
              <div className="receive-prompt-queue-items">
                {requests.map((item) => {
                  const selected = item.requestId === request.requestId;
                  return (
                    <button
                      key={item.requestId}
                      type="button"
                      className={`receive-prompt-queue-item${selected ? ' is-active' : ''}`}
                      onClick={() => {
                        setConfirmingRejectRequestId(null);
                        onSelectRequest(item.requestId);
                      }}
                      disabled={busy}
                      aria-current={selected ? 'true' : undefined}
                    >
                      <span className="receive-prompt-queue-file">{item.fromDevice.name}</span>
                      <span className="receive-prompt-queue-meta">
                        {messages.deviceFingerprintLabel} {item.fromDevice.trustFingerprint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>
          )}

          <div className={`receive-prompt-main${confirmingReject ? ' is-confirming-reject' : ''}`}>
            <div className="receive-prompt-stamp">{messages.pairDevice}</div>
            <h3 className="receive-prompt-title">{request.fromDevice.name}</h3>
            <p className="receive-prompt-from">{messages.pairPromptDesc(request.fromDevice.name)}</p>

            <div className="pair-prompt-grid">
              <div className="pair-prompt-card">
                <span className="pair-prompt-label">{messages.pairPromptLocalFingerprint}</span>
                <span className="pair-prompt-value">{selfFingerprint}</span>
              </div>
              <div className="pair-prompt-card">
                <span className="pair-prompt-label">{messages.pairPromptRemoteFingerprint}</span>
                <span className="pair-prompt-value">{request.fromDevice.trustFingerprint}</span>
              </div>
            </div>

            {requests.length > 1 && (
              <p className="receive-prompt-queue">{messages.waitingRequests(requests.length - 1)}</p>
            )}

            <div className="receive-prompt-actions">
              <button
                type="button"
                className={`button button-muted${confirmingReject ? ' is-danger-confirm' : ''}`}
                onClick={handleReject}
                disabled={busy}
                aria-label={`${confirmingReject ? messages.pairPromptCancelConfirm : messages.pairPromptCancel} ${request.fromDevice.name}`}
              >
                {confirmingReject ? messages.pairPromptCancelConfirm : messages.pairPromptCancel}
              </button>
              <button
                type="button"
                className="button"
                onClick={() => {
                  setConfirmingRejectRequestId(null);
                  void onAccept(request.requestId);
                }}
                disabled={busy}
              >
                {messages.pairPromptConfirm}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
