import { motion, type Transition } from 'framer-motion';
import { FileDown, Inbox, UserRoundCheck } from 'lucide-react';

import type { IncomingOffer, PairRequest } from '@shared/types';
import type { Messages } from '../i18n';
import { formatBytes } from '../utils/format';

type RequestsInboxTab = 'files' | 'pairs';

const panelSpring: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 36,
  mass: 0.8
};

interface RequestsInboxPanelProps {
  activeTab: RequestsInboxTab;
  onTabChange: (tab: RequestsInboxTab) => void;
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

export function RequestsInboxPanel({
  activeTab,
  onTabChange,
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
}: RequestsInboxPanelProps): JSX.Element {
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
  const isEmpty = offers.length + pairRequests.length === 0;

  return (
    <motion.section
      className={`requests-inbox requests-inbox-panel${isEmpty ? ' is-empty' : ''}`}
      aria-label={messages.requestsInbox}
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={panelSpring}
      layout
    >
      <div className="requests-inbox-tabs" role="tablist" aria-label={messages.requestsInbox}>
        <button
          type="button"
          role="tab"
          aria-selected={effectiveTab === 'files'}
          className={`requests-inbox-tab${effectiveTab === 'files' ? ' is-active' : ''}`}
          onClick={() => onTabChange('files')}
        >
          <span className="requests-inbox-tab-label">
            <FileDown aria-hidden="true" />
            <span>{messages.requestFilesTab}</span>
          </span>
          <span className="requests-inbox-tab-count">{offers.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={effectiveTab === 'pairs'}
          className={`requests-inbox-tab${effectiveTab === 'pairs' ? ' is-active' : ''}`}
          onClick={() => onTabChange('pairs')}
        >
          <span className="requests-inbox-tab-label">
            <UserRoundCheck aria-hidden="true" />
            <span>{messages.requestPairsTab}</span>
          </span>
          <span className="requests-inbox-tab-count">{pairRequests.length}</span>
        </button>
      </div>

      {effectiveTab === 'files' ? (
        offers.length === 0 || !activeOffer ? (
          <RequestsInboxEmpty messages={messages} />
        ) : (
          <motion.div
            className="requests-inbox-body"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
          >
            {offers.length > 1 && (
              <div className="requests-inbox-list" aria-label={messages.receivePromptQueueTitle}>
                {offers.map((offer) => (
                  <button
                    key={offer.offerId}
                    type="button"
                    className={`requests-inbox-list-item${
                      offer.offerId === activeOffer.offerId ? ' is-active' : ''
                    }`}
                    onClick={() => onSelectOffer(offer.offerId)}
                  >
                    <span className="requests-inbox-list-title">{offer.fileName}</span>
                    <span className="requests-inbox-list-meta">
                      {offer.fromDevice.name} · {formatBytes(offer.fileSize)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="requests-inbox-detail">
              <div className="requests-inbox-stamp">{messages.incomingFileRequest}</div>
              <h3 className="requests-inbox-detail-title">{activeOffer.fileName}</h3>
              <p className="requests-inbox-detail-copy">
                <strong>{activeOffer.fromDevice.name}</strong> {messages.wantsToSend}
              </p>
              <p className="requests-inbox-detail-fingerprint">
                {messages.deviceFingerprintLabel}: {activeOffer.fromDevice.trustFingerprint}
              </p>
              {trustedSender && <p className="requests-inbox-detail-trusted">{messages.trustedDeviceLabel}</p>}

              <div className="requests-inbox-card">
                <div className="requests-inbox-card-row">
                  <span className="requests-inbox-card-label">{messages.incomingFileRequest}</span>
                  <span className="requests-inbox-card-value">{formatBytes(activeOffer.fileSize)}</span>
                </div>
                <p className="requests-inbox-card-title">{activeOffer.fileName}</p>
              </div>

              <div className="requests-inbox-meta-block">
                <span className="requests-inbox-meta-label">{messages.receivePromptSaveTo}</span>
                <span className="requests-inbox-meta-value">{activeOffer.saveDirectory}</span>
              </div>

              <div className="requests-inbox-actions">
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
          </motion.div>
        )
      ) : pairRequests.length === 0 || !activePairRequest ? (
        <RequestsInboxEmpty messages={messages} />
      ) : (
        <motion.div
          className="requests-inbox-body"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
        >
          {pairRequests.length > 1 && (
            <div className="requests-inbox-list" aria-label={messages.pairRequestQueueTitle}>
              {pairRequests.map((request) => (
                <button
                  key={request.requestId}
                  type="button"
                  className={`requests-inbox-list-item${
                    request.requestId === activePairRequest.requestId ? ' is-active' : ''
                  }`}
                  onClick={() => onSelectPairRequest(request.requestId)}
                >
                  <span className="requests-inbox-list-title">{request.fromDevice.name}</span>
                  <span className="requests-inbox-list-meta">
                    {messages.deviceFingerprintLabel} {request.fromDevice.trustFingerprint}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="requests-inbox-detail">
            <div className="requests-inbox-stamp">{messages.pairDevice}</div>
            <h3 className="requests-inbox-detail-title">{activePairRequest.fromDevice.name}</h3>
            <p className="requests-inbox-detail-copy">
              {messages.pairPromptDesc(activePairRequest.fromDevice.name)}
            </p>

            {selfFingerprint && (
              <div className="requests-inbox-meta-block">
                <span className="requests-inbox-meta-label">{messages.pairPromptLocalFingerprint}</span>
                <span className="requests-inbox-meta-value">{selfFingerprint}</span>
              </div>
            )}
            <div className="requests-inbox-meta-block">
              <span className="requests-inbox-meta-label">{messages.pairPromptRemoteFingerprint}</span>
              <span className="requests-inbox-meta-value">
                {activePairRequest.fromDevice.trustFingerprint}
              </span>
            </div>

            <div className="requests-inbox-actions">
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
        </motion.div>
      )}
    </motion.section>
  );
}

function RequestsInboxEmpty({ messages }: { messages: Messages }): JSX.Element {
  return (
    <motion.div
      className="requests-inbox-empty"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
    >
      <span className="requests-inbox-empty-mark" aria-hidden="true">
        <Inbox />
      </span>
      <div className="requests-inbox-empty-copy-block">
        <p className="requests-inbox-empty-title">{messages.requestsEmptyTitle}</p>
        <p className="requests-inbox-empty-copy">{messages.requestsEmptyBody}</p>
      </div>
    </motion.div>
  );
}
