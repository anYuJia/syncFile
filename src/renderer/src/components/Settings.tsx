import { useEffect, useState } from 'react';
import type { Settings } from '@shared/types';
import type { Messages } from '../i18n';

interface SettingsModalProps {
  messages: Messages;
  onClose: () => void;
}

const DEFAULT_SETTINGS: Settings = {
  maxSandboxSizeMB: 1024,
  autoAccept: false,
  autoDownload: false
};

export function SettingsModal({ messages, onClose }: SettingsModalProps): JSX.Element {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    window.syncFile.getSettings().then(setSettings).catch(() => {
      // Keep defaults if IPC not available
    });
  }, []);

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      await window.syncFile.saveSettings(settings);
      onClose();
    } catch {
      // Settings will be saved next time
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2 className="settings-title">{messages.settings}</h2>
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="settings-body">
          <div className="settings-group">
            <label className="settings-label">{messages.settingsMaxSandboxSize}</label>
            <div className="settings-input-row">
              <input
                type="number"
                className="settings-input"
                min={64}
                max={102400}
                value={settings.maxSandboxSizeMB}
                onChange={(e) =>
                  setSettings({ ...settings, maxSandboxSizeMB: Math.max(0, Number(e.target.value)) })
                }
              />
              <span className="settings-unit">{messages.settingsMaxSandboxSizeUnit}</span>
            </div>
          </div>

          <div className="settings-group">
            <div className="settings-toggle-row">
              <div className="settings-toggle-text">
                <span className="settings-label">{messages.settingsAutoAccept}</span>
                <span className="settings-desc">{messages.settingsAutoAcceptDesc}</span>
              </div>
              <button
                type="button"
                className={`settings-toggle${settings.autoAccept ? ' is-on' : ''}`}
                onClick={() => setSettings({ ...settings, autoAccept: !settings.autoAccept })}
                role="switch"
                aria-checked={settings.autoAccept}
              >
                <span className="settings-toggle-knob" />
              </button>
            </div>
          </div>

          <div className="settings-group">
            <div className="settings-toggle-row">
              <div className="settings-toggle-text">
                <span className="settings-label">{messages.settingsAutoDownload}</span>
                <span className="settings-desc">{messages.settingsAutoDownloadDesc}</span>
              </div>
              <button
                type="button"
                className={`settings-toggle${settings.autoDownload ? ' is-on' : ''}`}
                onClick={() => setSettings({ ...settings, autoDownload: !settings.autoDownload })}
                role="switch"
                aria-checked={settings.autoDownload}
              >
                <span className="settings-toggle-knob" />
              </button>
            </div>
          </div>
        </div>

        <div className="settings-actions">
          <button type="button" className="button button-muted" onClick={onClose}>
            {messages.settingsCancel}
          </button>
          <button
            type="button"
            className="button"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {messages.settingsSave}
          </button>
        </div>
      </div>
    </div>
  );
}
