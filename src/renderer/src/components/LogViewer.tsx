import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { RuntimeLogEntry } from '@shared/types';
import type { Messages } from '../i18n';
import { useDialogA11y } from '../hooks/useDialogA11y';

interface LogViewerProps {
  entries: RuntimeLogEntry[];
  messages: Messages;
  onRefresh: () => void | Promise<void>;
  onClear: () => void | Promise<void>;
  onClose: () => void;
}

export function LogViewer({
  entries,
  messages,
  onRefresh,
  onClear,
  onClose
}: LogViewerProps): JSX.Element {
  const dialogRef = useDialogA11y(onClose);
  const [busyAction, setBusyAction] = useState<'refresh' | 'copy' | 'clear' | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!statusMessage) {
      return;
    }
    const timer = window.setTimeout(() => setStatusMessage(null), 2200);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  useEffect(() => {
    if (!confirmClear) {
      return;
    }
    const timer = window.setTimeout(() => setConfirmClear(false), 3600);
    return () => window.clearTimeout(timer);
  }, [confirmClear]);

  const handleCopy = async (): Promise<void> => {
    if (busyAction || entries.length === 0) {
      return;
    }

    const text = entries.map(formatLogEntryForCopy).join('\n');
    try {
      setBusyAction('copy');
      await navigator.clipboard.writeText(text);
      setStatusMessage(messages.logViewerCopied);
    } catch {
      setStatusMessage(messages.logViewerCopyFailed);
    } finally {
      setBusyAction(null);
    }
  };

  const handleRefresh = async (): Promise<void> => {
    if (busyAction) {
      return;
    }
    try {
      setBusyAction('refresh');
      await onRefresh();
      setStatusMessage(messages.logViewerRefreshed);
    } finally {
      setBusyAction(null);
    }
  };

  const handleClear = async (): Promise<void> => {
    if (busyAction || entries.length === 0) {
      return;
    }
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    try {
      setBusyAction('clear');
      await onClear();
      setStatusMessage(messages.logViewerCleared);
      setConfirmClear(false);
    } finally {
      setBusyAction(null);
    }
  };

  const content = (
    <div className="log-viewer-overlay" role="presentation">
      <section
        ref={dialogRef}
        className="log-viewer-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="log-viewer-title"
        aria-describedby="log-viewer-status"
        aria-busy={busyAction !== null}
        tabIndex={-1}
      >
        <button
          type="button"
          className="log-viewer-close"
          onClick={onClose}
          aria-label={messages.dismiss}
        >
          <X aria-hidden="true" />
        </button>
        <header className="log-viewer-header">
          <div>
            <p className="log-viewer-kicker">{messages.logs}</p>
            <h2 id="log-viewer-title">{messages.logViewerTitle}</h2>
          </div>
        </header>

        <div className="log-viewer-toolbar">
          <button
            type="button"
            className="button button-muted"
            onClick={() => void handleRefresh()}
            disabled={busyAction !== null}
            aria-busy={busyAction === 'refresh'}
          >
            {messages.logViewerRefresh}
          </button>
          <button
            type="button"
            className="button button-muted"
            onClick={() => void handleCopy()}
            disabled={busyAction !== null || entries.length === 0}
            aria-busy={busyAction === 'copy'}
          >
            {messages.logViewerCopy}
          </button>
          <button
            type="button"
            className={`button button-muted${confirmClear ? ' is-danger-confirm' : ''}`}
            onClick={() => void handleClear()}
            disabled={busyAction !== null || entries.length === 0}
            aria-busy={busyAction === 'clear'}
          >
            {confirmClear ? messages.logViewerClearConfirm : messages.logViewerClear}
          </button>
          <span id="log-viewer-status" className="log-viewer-status" role="status" aria-live="polite">
            {statusMessage ?? ''}
          </span>
        </div>

        <div className="log-viewer-list" role="log" aria-live="polite">
          {entries.length === 0 ? (
            <p className="log-viewer-empty">{messages.logViewerEmpty}</p>
          ) : (
            entries.map((entry) => (
              <article key={entry.sequence} className={`log-viewer-entry is-${entry.level}`}>
                <div className="log-viewer-entry-head">
                  <span className="log-viewer-entry-time">{formatLogTime(entry.timestamp)}</span>
                  <span className="log-viewer-entry-level">{entry.level}</span>
                  <span className="log-viewer-entry-scope">{entry.scope}</span>
                </div>
                <p className="log-viewer-entry-message">{entry.message}</p>
                {entry.details && <pre className="log-viewer-entry-details">{entry.details}</pre>}
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );

  return createPortal(content, document.body);
}

function formatLogTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatLogEntryForCopy(entry: RuntimeLogEntry): string {
  const details = entry.details ? ` ${entry.details}` : '';
  return `${new Date(entry.timestamp).toISOString()} [${entry.level}] [${entry.scope}] ${entry.message}${details}`;
}
