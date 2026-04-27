import { createPortal } from 'react-dom';
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

  const handleCopy = async (): Promise<void> => {
    const text = entries.map(formatLogEntryForCopy).join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Copy is best-effort; logs remain visible in the panel.
    }
  };

  const content = (
    <div className="log-viewer-overlay" role="presentation">
      <section
        ref={dialogRef}
        className="log-viewer-panel"
        role="dialog"
        aria-modal="true"
        aria-label={messages.logViewerTitle}
        tabIndex={-1}
      >
        <button
          type="button"
          className="log-viewer-close"
          onClick={onClose}
          aria-label={messages.dismiss}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <header className="log-viewer-header">
          <div>
            <p className="log-viewer-kicker">{messages.logs}</p>
            <h2>{messages.logViewerTitle}</h2>
          </div>
        </header>

        <div className="log-viewer-toolbar">
          <button type="button" className="button button-muted" onClick={() => void onRefresh()}>
            {messages.logViewerRefresh}
          </button>
          <button type="button" className="button button-muted" onClick={() => void handleCopy()}>
            {messages.logViewerCopy}
          </button>
          <button type="button" className="button button-muted" onClick={() => void onClear()}>
            {messages.logViewerClear}
          </button>
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
