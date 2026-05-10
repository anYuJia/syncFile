import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { motion, type Transition } from 'framer-motion';
import { FileDown, UserRoundCheck } from 'lucide-react';

import type { IncomingOffer, PairRequest } from '@shared/types';
import type { Messages } from '../i18n';
import { formatBytes } from '../utils/format';

type RequestsInboxTab = 'files' | 'pairs';
type PendingInboxAction =
  | 'offer-accept'
  | 'offer-trust-accept'
  | 'offer-reject'
  | 'pair-accept'
  | 'pair-reject';

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
  busyPairRequestId?: string | null;
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
  busyPairRequestId,
  selfFingerprint,
  onSelectPairRequest,
  onAcceptPairRequest,
  onRejectPairRequest,
  messages
}: RequestsInboxPanelProps): JSX.Element {
  const filesTabRef = useRef<HTMLButtonElement>(null);
  const pairsTabRef = useRef<HTMLButtonElement>(null);
  const [confirmingAction, setConfirmingAction] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingInboxAction | null>(null);
  const effectiveTab: RequestsInboxTab = activeTab;
  const activeOffer = offers.find((item) => item.offerId === selectedOfferId) ?? offers[0] ?? null;
  const activePairRequest =
    pairRequests.find((item) => item.requestId === selectedPairRequestId) ?? pairRequests[0] ?? null;
  const offerRejectActionKey = activeOffer ? `offer-reject:${activeOffer.offerId}` : null;
  const offerTrustActionKey = activeOffer ? `offer-trust:${activeOffer.offerId}` : null;
  const pairRejectActionKey = activePairRequest ? `pair-reject:${activePairRequest.requestId}` : null;
  const trustedSender =
    activeOffer &&
    (trustedDeviceKeys?.has(
      `${activeOffer.fromDevice.deviceId}:${activeOffer.fromDevice.trustFingerprint}`
    ) ??
      false);
  const isEmpty = offers.length + pairRequests.length === 0;
  const isOfferActionBusy = busyOfferId !== null && busyOfferId !== undefined;
  const isPairActionBusy = busyPairRequestId !== null && busyPairRequestId !== undefined;
  const isInboxActionBusy = isOfferActionBusy || isPairActionBusy || pendingAction !== null;
  const confirmingOfferReject = Boolean(offerRejectActionKey && confirmingAction === offerRejectActionKey);
  const confirmingOfferTrust = Boolean(offerTrustActionKey && confirmingAction === offerTrustActionKey);
  const confirmingPairReject = Boolean(pairRejectActionKey && confirmingAction === pairRejectActionKey);

  useEffect(() => {
    if (!confirmingAction) {
      return;
    }
    const timer = window.setTimeout(() => setConfirmingAction(null), 3600);
    return () => window.clearTimeout(timer);
  }, [confirmingAction]);

  useEffect(() => {
    setConfirmingAction(null);
  }, [activeOffer?.offerId, activePairRequest?.requestId, effectiveTab]);

  const changeInboxTab = (tab: RequestsInboxTab): void => {
    if (isInboxActionBusy || tab === effectiveTab) {
      return;
    }
    setConfirmingAction(null);
    onTabChange(tab);
  };
  const focusTab = (tab: RequestsInboxTab): void => {
    const target = tab === 'files' ? filesTabRef.current : pairsTabRef.current;
    target?.focus();
  };
  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    let nextTab: RequestsInboxTab | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextTab = effectiveTab === 'files' ? 'pairs' : 'files';
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextTab = effectiveTab === 'files' ? 'pairs' : 'files';
    } else if (event.key === 'Home') {
      nextTab = 'files';
    } else if (event.key === 'End') {
      nextTab = 'pairs';
    }

    if (!nextTab) {
      return;
    }
    event.preventDefault();
    if (isInboxActionBusy) {
      return;
    }
    setConfirmingAction(null);
    onTabChange(nextTab);
    window.requestAnimationFrame(() => focusTab(nextTab));
  };
  const runInboxAction = async (
    action: PendingInboxAction,
    callback: () => void | Promise<void>
  ): Promise<void> => {
    if (isInboxActionBusy) {
      return;
    }
    setConfirmingAction(null);
    setPendingAction(action);
    try {
      await callback();
    } finally {
      setPendingAction((current) => (current === action ? null : current));
    }
  };
  const handleRejectOffer = async (offerId: string): Promise<void> => {
    const actionKey = `offer-reject:${offerId}`;
    if (isInboxActionBusy) {
      return;
    }
    if (confirmingAction !== actionKey) {
      setConfirmingAction(actionKey);
      return;
    }
    await runInboxAction('offer-reject', () => onReject(offerId));
  };
  const handleTrustAndAcceptOffer = async (offer: IncomingOffer): Promise<void> => {
    const actionKey = `offer-trust:${offer.offerId}`;
    if (isInboxActionBusy) {
      return;
    }
    if (confirmingAction !== actionKey) {
      setConfirmingAction(actionKey);
      return;
    }
    await runInboxAction('offer-trust-accept', () => onTrustAndAccept(offer));
  };
  const handleRejectPairRequest = async (requestId: string): Promise<void> => {
    const actionKey = `pair-reject:${requestId}`;
    if (isInboxActionBusy) {
      return;
    }
    if (confirmingAction !== actionKey) {
      setConfirmingAction(actionKey);
      return;
    }
    await runInboxAction('pair-reject', () => onRejectPairRequest(requestId));
  };

  return (
    <motion.section
      className={`requests-inbox requests-inbox-panel${isEmpty ? ' is-empty' : ''}`}
      aria-label={messages.requestsInbox}
      aria-busy={isInboxActionBusy}
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={panelSpring}
      layout
    >
      <div className="requests-inbox-tabs" role="tablist" aria-label={messages.requestsInbox}>
        <button
          ref={filesTabRef}
          id="requests-inbox-files-tab"
          type="button"
          role="tab"
          aria-selected={effectiveTab === 'files'}
          aria-controls="requests-inbox-files-panel"
          className={`requests-inbox-tab${effectiveTab === 'files' ? ' is-active' : ''}`}
          onClick={() => changeInboxTab('files')}
          onKeyDown={handleTabKeyDown}
          disabled={isInboxActionBusy}
          tabIndex={effectiveTab === 'files' ? 0 : -1}
        >
          <span className="requests-inbox-tab-label">
            <FileDown aria-hidden="true" />
            <span>{messages.requestFilesTab}</span>
          </span>
          <span className="requests-inbox-tab-count">{offers.length}</span>
        </button>
        <button
          ref={pairsTabRef}
          id="requests-inbox-pairs-tab"
          type="button"
          role="tab"
          aria-selected={effectiveTab === 'pairs'}
          aria-controls="requests-inbox-pairs-panel"
          className={`requests-inbox-tab${effectiveTab === 'pairs' ? ' is-active' : ''}`}
          onClick={() => changeInboxTab('pairs')}
          onKeyDown={handleTabKeyDown}
          disabled={isInboxActionBusy}
          tabIndex={effectiveTab === 'pairs' ? 0 : -1}
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
          <RequestsInboxEmpty
            icon="files"
            title={messages.requestFilesEmptyTitle}
            body={messages.requestFilesEmptyBody}
            panelId="requests-inbox-files-panel"
            labelledBy="requests-inbox-files-tab"
            action={
              pairRequests.length > 0
                ? {
                    label: messages.requestShowPairs,
                    onClick: () => changeInboxTab('pairs'),
                    disabled: isInboxActionBusy
                  }
                : undefined
            }
          />
        ) : (
          <motion.div
            id="requests-inbox-files-panel"
            role="tabpanel"
            aria-labelledby="requests-inbox-files-tab"
            className="requests-inbox-body"
            initial={false}
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
                    onClick={() => {
                      setConfirmingAction(null);
                      onSelectOffer(offer.offerId);
                    }}
                    disabled={isInboxActionBusy}
                    aria-current={offer.offerId === activeOffer.offerId ? 'true' : undefined}
                  >
                    <span className="requests-inbox-list-title">{offer.fileName}</span>
                    <span className="requests-inbox-list-meta">
                      {offer.fromDevice.name} · {formatBytes(offer.fileSize)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div
              className={`requests-inbox-detail${confirmingOfferReject ? ' is-confirming-reject' : ''}${
                confirmingOfferTrust ? ' is-confirming-trust' : ''
              }`}
              aria-busy={busyOfferId === activeOffer.offerId || pendingAction?.startsWith('offer-')}
            >
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
                  className={`button button-muted${confirmingOfferReject ? ' is-danger-confirm' : ''}`}
                  onClick={() => void handleRejectOffer(activeOffer.offerId)}
                  disabled={isInboxActionBusy}
                  aria-busy={pendingAction === 'offer-reject'}
                  aria-label={`${confirmingOfferReject ? messages.rejectConfirm : messages.reject} ${activeOffer.fileName}`}
                >
                  {confirmingOfferReject ? messages.rejectConfirm : messages.reject}
                </button>
                {!trustedSender && (
                  <button
                    type="button"
                    className={`button button-muted${confirmingOfferTrust ? ' is-trust-confirm' : ''}`}
                    onClick={() => void handleTrustAndAcceptOffer(activeOffer)}
                    disabled={isInboxActionBusy}
                    aria-busy={pendingAction === 'offer-trust-accept'}
                    aria-label={`${confirmingOfferTrust ? messages.trustAndAcceptConfirm : messages.trustAndAccept} ${activeOffer.fromDevice.name}`}
                  >
                    {confirmingOfferTrust ? messages.trustAndAcceptConfirm : messages.trustAndAccept}
                  </button>
                )}
                <button
                  type="button"
                  className="button"
                  onClick={() => void runInboxAction('offer-accept', () => onAccept(activeOffer.offerId))}
                  disabled={isInboxActionBusy}
                  aria-busy={pendingAction === 'offer-accept'}
                >
                  {messages.accept}
                </button>
              </div>
            </div>
          </motion.div>
        )
      ) : pairRequests.length === 0 || !activePairRequest ? (
        <RequestsInboxEmpty
          icon="pairs"
          title={messages.requestPairsEmptyTitle}
          body={messages.requestPairsEmptyBody}
          panelId="requests-inbox-pairs-panel"
          labelledBy="requests-inbox-pairs-tab"
          action={
            offers.length > 0
              ? {
                  label: messages.requestShowFiles,
                  onClick: () => changeInboxTab('files'),
                  disabled: isInboxActionBusy
                }
              : undefined
          }
        />
      ) : (
        <motion.div
          id="requests-inbox-pairs-panel"
          role="tabpanel"
          aria-labelledby="requests-inbox-pairs-tab"
          className="requests-inbox-body"
          initial={false}
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
                  onClick={() => {
                    setConfirmingAction(null);
                    onSelectPairRequest(request.requestId);
                  }}
                  disabled={isInboxActionBusy}
                  aria-current={request.requestId === activePairRequest.requestId ? 'true' : undefined}
                >
                  <span className="requests-inbox-list-title">{request.fromDevice.name}</span>
                  <span className="requests-inbox-list-meta">
                    {messages.deviceFingerprintLabel} {request.fromDevice.trustFingerprint}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div
            className={`requests-inbox-detail${confirmingPairReject ? ' is-confirming-reject' : ''}`}
            aria-busy={
              busyPairRequestId === activePairRequest.requestId || pendingAction?.startsWith('pair-')
            }
          >
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
                className={`button button-muted${confirmingPairReject ? ' is-danger-confirm' : ''}`}
                onClick={() => void handleRejectPairRequest(activePairRequest.requestId)}
                disabled={isInboxActionBusy}
                aria-busy={pendingAction === 'pair-reject'}
                aria-label={`${confirmingPairReject ? messages.pairPromptCancelConfirm : messages.pairPromptCancel} ${activePairRequest.fromDevice.name}`}
              >
                {confirmingPairReject ? messages.pairPromptCancelConfirm : messages.pairPromptCancel}
              </button>
              <button
                type="button"
                className="button"
                onClick={() =>
                  void runInboxAction('pair-accept', () =>
                    onAcceptPairRequest(activePairRequest.requestId)
                  )
                }
                disabled={isInboxActionBusy}
                aria-busy={pendingAction === 'pair-accept'}
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

function RequestsInboxEmpty({
  icon,
  title,
  body,
  panelId,
  labelledBy,
  action
}: {
  icon: RequestsInboxTab;
  title: string;
  body: string;
  panelId: string;
  labelledBy: string;
  action?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
}): JSX.Element {
  const Icon = icon === 'files' ? FileDown : UserRoundCheck;

  return (
    <motion.div
      id={panelId}
      role="tabpanel"
      aria-labelledby={labelledBy}
      className="requests-inbox-empty"
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
    >
      <span className="requests-inbox-empty-mark" aria-hidden="true">
        <Icon />
      </span>
      <div className="requests-inbox-empty-copy-block">
        <p className="requests-inbox-empty-title">{title}</p>
        <p className="requests-inbox-empty-copy">{body}</p>
      </div>
      {action && (
        <button
          type="button"
          className="button button-ghost requests-inbox-empty-action"
          onClick={action.onClick}
          disabled={action.disabled}
        >
          {action.label}
        </button>
      )}
    </motion.div>
  );
}
