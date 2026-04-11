import { useEffect, useState } from 'react';
import type { SandboxLocationInfo, Settings } from '@shared/types';
import type { Messages } from '../i18n';

interface SettingsModalProps {
  messages: Messages;
  onClose: () => void;
}

const DEFAULT_SETTINGS: Settings = {
  maxSandboxSizeMB: 1024,
  autoAccept: false,
  openReceivedFolder: false
};

export function SettingsModal({ messages, onClose }: SettingsModalProps): JSX.Element {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [sandboxLocation, setSandboxLocation] = useState<SandboxLocationInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [choosingSandbox, setChoosingSandbox] = useState(false);
  const api = window.syncFile as typeof window.syncFile & {
    getSandboxLocation?: () => Promise<SandboxLocationInfo>;
    chooseSandboxLocation?: () => Promise<SandboxLocationInfo | null>;
  };
  const supportsSandboxSelection =
    typeof api.getSandboxLocation === 'function' && typeof api.chooseSandboxLocation === 'function';

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const nextSettings = await window.syncFile.getSettings();
        setSettings(nextSettings);

        if (typeof api.getSandboxLocation === 'function') {
          const nextSandboxLocation = await api.getSandboxLocation();
          setSandboxLocation(nextSandboxLocation);
        }
      } catch {
        // Keep defaults if IPC not available
      }
    };

    void load();
  }, [api]);

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      const normalized: Settings = {
        ...settings,
        maxSandboxSizeMB: Math.min(102400, Math.max(64, Math.round(settings.maxSandboxSizeMB) || 1024))
      };
      await window.syncFile.saveSettings(normalized);
      onClose();
    } catch {
      // Settings will be saved next time
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleChooseSandbox = async (): Promise<void> => {
    if (typeof api.chooseSandboxLocation !== 'function') {
      return;
    }
    setChoosingSandbox(true);
    try {
      const selected = await api.chooseSandboxLocation();
      if (selected) {
        setSandboxLocation(selected);
      }
    } finally {
      setChoosingSandbox(false);
    }
  };

  const busy = saving || choosingSandbox;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2 className="settings-title">{messages.settings}</h2>
          <button type="button" className="settings-close" onClick={onClose} aria-label={messages.dismiss}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="settings-body">
          <section className="settings-section">
            <div className="settings-section-head">
              <h3 className="settings-section-title">{messages.settingsReceiveSection}</h3>
              <p className="settings-section-copy">{messages.settingsReceiveSectionDesc}</p>
            </div>

            <div className="settings-note">
              {messages.settingsAcceptNote}
            </div>

            <div className="settings-card-list">
              <div className="settings-card">
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

              <div className="settings-card">
                <div className="settings-toggle-row">
                  <div className="settings-toggle-text">
                    <span className="settings-label">{messages.settingsOpenReceivedFolder}</span>
                    <span className="settings-desc">{messages.settingsOpenReceivedFolderDesc}</span>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle${settings.openReceivedFolder ? ' is-on' : ''}`}
                    onClick={() =>
                      setSettings({ ...settings, openReceivedFolder: !settings.openReceivedFolder })
                    }
                    role="switch"
                    aria-checked={settings.openReceivedFolder}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-head">
              <h3 className="settings-section-title">{messages.settingsStorageSection}</h3>
              <p className="settings-section-copy">{messages.settingsStorageSectionDesc}</p>
            </div>

            <div className="settings-card-list">
              <div className="settings-card">
                <label className="settings-label">{messages.settingsMaxSandboxSize}</label>
                <span className="settings-desc">{messages.settingsMaxSandboxSizeDesc}</span>
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

              <div className="settings-card">
                <div className="settings-path-head">
                  <div className="settings-path-copy">
                    <span className="settings-label">{messages.settingsSandboxFolder}</span>
                    <span className="settings-desc">{messages.settingsSandboxFolderDesc}</span>
                  </div>
                  <span className={`settings-badge${sandboxLocation?.isCustom ? ' is-custom' : ''}`}>
                    {sandboxLocation?.isCustom
                      ? messages.settingsSandboxFolderCustom
                      : messages.settingsSandboxFolderDefault}
                  </span>
                </div>

                <div className="settings-path-box">
                  {sandboxLocation?.path ?? '...'}
                </div>

                <div className="settings-inline-actions">
                  <button
                    type="button"
                    className="button button-muted"
                    onClick={() => void window.syncFile.openSandbox()}
                    disabled={busy}
                  >
                    {messages.openSandbox}
                  </button>
                  <button
                    type="button"
                    className="button button-muted"
                    onClick={() => void handleChooseSandbox()}
                    disabled={busy || !supportsSandboxSelection}
                  >
                    {messages.settingsChangeSandboxFolder}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="settings-actions">
          <button type="button" className="button button-muted" onClick={onClose} disabled={busy}>
            {messages.settingsCancel}
          </button>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => void handleSave()}
          >
            {messages.settingsSave}
          </button>
        </div>
      </div>
    </div>
  );
}
