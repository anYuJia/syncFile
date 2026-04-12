import type { Device } from '@shared/types';
import type { Messages } from '../i18n';
import { useDialogA11y } from '../hooks/useDialogA11y';

interface PairDevicePromptProps {
  device: Device;
  selfFingerprint: string;
  busy?: boolean;
  onConfirm: (device: Device) => void | Promise<void>;
  onClose: () => void;
  messages: Messages;
}

export function PairDevicePrompt({
  device,
  selfFingerprint,
  busy = false,
  onConfirm,
  onClose,
  messages
}: PairDevicePromptProps): JSX.Element {
  const dialogRef = useDialogA11y(() => {
    if (!busy) {
      onClose();
    }
  });

  return (
    <div className="receive-prompt-overlay" role="presentation">
      <div
        ref={dialogRef}
        className="receive-prompt pair-prompt"
        role="dialog"
        aria-modal="true"
        aria-label={messages.pairPromptTitle}
        tabIndex={-1}
      >
        <div className="receive-prompt-stamp">{messages.pairDevice}</div>
        <h3 className="receive-prompt-title">{device.name}</h3>
        <p className="receive-prompt-from">{messages.pairPromptDesc(device.name)}</p>

        <div className="pair-prompt-grid">
          <div className="pair-prompt-card">
            <span className="pair-prompt-label">{messages.pairPromptLocalFingerprint}</span>
            <span className="pair-prompt-value">{selfFingerprint}</span>
          </div>
          <div className="pair-prompt-card">
            <span className="pair-prompt-label">{messages.pairPromptRemoteFingerprint}</span>
            <span className="pair-prompt-value">{device.trustFingerprint}</span>
          </div>
        </div>

        <div className="receive-prompt-actions">
          <button type="button" className="button button-muted" onClick={onClose} disabled={busy}>
            {messages.pairPromptCancel}
          </button>
          <button type="button" className="button" onClick={() => onConfirm(device)} disabled={busy}>
            {messages.pairPromptConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
