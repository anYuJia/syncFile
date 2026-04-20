import type { IncomingOffer, PairRequest } from '@shared/types';
import type { Messages } from '../i18n';
import { useDialogA11y } from '../hooks/useDialogA11y';
import { formatBytes } from '../utils/format';

type RequestsInboxTab = 'files' | 'pairs';

interface RequestsInboxDrawerProps {
  isOpen: boolean;
  activeTab: RequestsInboxTab;
  onTabChange: (tab: RequestsInboxTab) => void;
  onClose: () => void;
  offers: IncomingOffer[];
  selectedOfferId: string | null;
  trustedDeviceKeys?: Set<string>;
  busyOfferId?: string | null;
  onSelectOffer: (offerId: string) => void;
  onAccept: (offerId: string) => void | Promise<void>;
  onTrustAndAccept: (offer: IncomingOffer) => void | Promise<void>;
  onReject: (offerId: string) => void | Promise<void>;
  pairRequests: PairRequest[];
  selectedPairRequestId: string | null;
  selfFingerprint?: string | null;
  onSelectPairRequest: (requestId: string) => void;
  onAcceptPairRequest: (requestId: string) => void | Promise<void>;
  onRejectPairRequest: (requestId: string) => void | Promise<void>;
  messages: Messages;
}

export function RequestsInboxDrawer({
  isOpen,
  activeTab,
  onTabChange,
  onClose,
  offers,
  selectedOfferId,
  trustedDeviceKeys,
  busyOfferId,
  onSelectOffer,
  onAccept,
  onTrustAndAccept,
  onReject,
  pairRequests,
  selectedPairRequestId,
  selfFingerprint,
  onSelectPairRequest,
  onAcceptPairRequest,
  onRejectPairRequest,
  messages
}: RequestsInboxDrawerProps): JSX.Element | null {
  const dialogRef = useDialogA11y(onClose, isOpen);

  if (!isOpen) {
    return null;
  }

  const effectiveTab: RequestsInboxTab =
    activeTab === 'pairs'
      ? pairRequests.length > 0 || offers.length === 0
        ? 'pairs'
        : 'files'
      : offers.length > 0 || pairRequests.length === 0
        ? 'files'
        : 'pairs';
  const activeOffer = offers.find((item) => item.offerId === selectedOfferId) ?? offers[0] ?? null;
  const activePairRequest =
    pairRequests.find((item) => item.requestId === selectedPairRequestId) ?? pairRequests[0] ?? null;
  const trustedSender =
    activeOffer &&
    (trustedDeviceKeys?.has(
      `${activeOffer.fromDevice.deviceId}:${activeOffer.fromDevice.trustFingerprint}`
    ) ??
      false);

  return (
    <div className="requests-drawer-overlay" role="presentation" onClick={onClose}>
      <aside
        ref={dialogRef}
        className="requests-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={messages.requestsInbox}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="requests-drawer-header">
          <div>
            <p className="requests-drawer-kicker">{messages.requestsInbox}</p>
            <h2 className="requests-drawer-title">{messages.requestsInbox}</h2>
          </div>
          <button type="button" className="button button-ghost" onClick={onClose}>
            {messages.dismiss}
          </button>
        </header>

        <div className="requests-drawer-tabs" role="tablist" aria-label={messages.requestsInbox}>
          <button
            type="button"
            role="tab"
            aria-selected={effectiveTab === 'files'}
            className={`requests-drawer-tab${effectiveTab === 'files' ? ' is-active' : ''}`}
            onClick={() => onTabChange('files')}
          >
            <span>{messages.requestFilesTab}</span>
            <span className="requests-drawer-tab-count">{offers.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={effectiveTab === 'pairs'}
            className={`requests-drawer-tab${effectiveTab === 'pairs' ? ' is-active' : ''}`}
            onClick={() => onTabChange('pairs')}
          >
            <span>{messages.requestPairsTab}</span>
            <span className="requests-drawer-tab-count">{pairRequests.length}</span>
          </button>
        </div>

        {effectiveTab === 'files' ? (
          offers.length === 0 || !activeOffer ? (
            <RequestsDrawerEmpty messages={messages} />
          ) : (
            <div className="requests-drawer-body">
              {offers.length > 1 && (
                <div className="requests-drawer-list" aria-label={messages.receivePromptQueueTitle}>
                  {offers.map((offer) => (
                    <button
                      key={offer.offerId}
                      type="button"
                      className={`requests-drawer-list-item${
                        offer.offerId === activeOffer.offerId ? ' is-active' : ''
                      }`}
                      onClick={() => onSelectOffer(offer.offerId)}
                    >
                      <span className="requests-drawer-list-title">{offer.fileName}</span>
                      <span className="requests-drawer-list-meta">
                        {offer.fromDevice.name} · {formatBytes(offer.fileSize)}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="requests-drawer-detail">
                <div className="requests-drawer-stamp">{messages.incomingFileRequest}</div>
                <h3 className="requests-drawer-detail-title">{activeOffer.fileName}</h3>
                <p className="requests-drawer-detail-copy">
                  <strong>{activeOffer.fromDevice.name}</strong> {messages.wantsToSend}
                </p>
                <p className="requests-drawer-detail-fingerprint">
                  {messages.deviceFingerprintLabel}: {activeOffer.fromDevice.trustFingerprint}
                </p>
                {trustedSender && (
                  <p className="requests-drawer-detail-trusted">{messages.trustedDeviceLabel}</p>
                )}

                <div className="requests-drawer-card">
                  <div className="requests-drawer-card-row">
                    <span className="requests-drawer-card-label">{messages.incomingFileRequest}</span>
                    <span className="requests-drawer-card-value">{formatBytes(activeOffer.fileSize)}</span>
                  </div>
                  <p className="requests-drawer-card-title">{activeOffer.fileName}</p>
                </div>

                <div className="requests-drawer-meta-block">
                  <span className="requests-drawer-meta-label">{messages.receivePromptSaveTo}</span>
                  <span className="requests-drawer-meta-value">{activeOffer.saveDirectory}</span>
                </div>

                <div className="requests-drawer-actions">
                  <button
                    type="button"
                    className="button button-muted"
                    onClick={() => onReject(activeOffer.offerId)}
                    disabled={busyOfferId === activeOffer.offerId}
                  >
                    {messages.reject}
                  </button>
                  {!trustedSender && (
                    <button
                      type="button"
                      className="button button-muted"
                      onClick={() => onTrustAndAccept(activeOffer)}
                      disabled={busyOfferId === activeOffer.offerId}
                    >
                      {messages.trustAndAccept}
                    </button>
                  )}
                  <button
                    type="button"
                    className="button"
                    onClick={() => onAccept(activeOffer.offerId)}
                    disabled={busyOfferId === activeOffer.offerId}
                  >
                    {messages.accept}
                  </button>
                </div>
              </div>
            </div>
          )
        ) : pairRequests.length === 0 || !activePairRequest ? (
          <RequestsDrawerEmpty messages={messages} />
        ) : (
          <div className="requests-drawer-body">
            {pairRequests.length > 1 && (
              <div className="requests-drawer-list" aria-label={messages.pairRequestQueueTitle}>
                {pairRequests.map((request) => (
                  <button
                    key={request.requestId}
                    type="button"
                    className={`requests-drawer-list-item${
                      request.requestId === activePairRequest.requestId ? ' is-active' : ''
                    }`}
                    onClick={() => onSelectPairRequest(request.requestId)}
                  >
                    <span className="requests-drawer-list-title">{request.fromDevice.name}</span>
                    <span className="requests-drawer-list-meta">
                      {messages.deviceFingerprintLabel} {request.fromDevice.trustFingerprint}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="requests-drawer-detail">
              <div className="requests-drawer-stamp">{messages.pairDevice}</div>
              <h3 className="requests-drawer-detail-title">{activePairRequest.fromDevice.name}</h3>
              <p className="requests-drawer-detail-copy">
                {messages.pairPromptDesc(activePairRequest.fromDevice.name)}
              </p>

              {selfFingerprint && (
                <div className="requests-drawer-meta-block">
                  <span className="requests-drawer-meta-label">{messages.pairPromptLocalFingerprint}</span>
                  <span className="requests-drawer-meta-value">{selfFingerprint}</span>
                </div>
              )}
              <div className="requests-drawer-meta-block">
                <span className="requests-drawer-meta-label">{messages.pairPromptRemoteFingerprint}</span>
                <span className="requests-drawer-meta-value">
                  {activePairRequest.fromDevice.trustFingerprint}
                </span>
              </div>

              <div className="requests-drawer-actions">
                <button
                  type="button"
                  className="button button-muted"
                  onClick={() => onRejectPairRequest(activePairRequest.requestId)}
                >
                  {messages.pairPromptCancel}
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => onAcceptPairRequest(activePairRequest.requestId)}
                >
                  {messages.pairPromptConfirm}
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function RequestsDrawerEmpty({ messages }: { messages: Messages }): JSX.Element {
  return (
    <div className="requests-drawer-empty">
      <p className="requests-drawer-empty-title">{messages.requestsEmptyTitle}</p>
      <p className="requests-drawer-empty-copy">{messages.requestsEmptyBody}</p>
    </div>
  );
}
