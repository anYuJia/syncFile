import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { Device, SandboxLocationInfo, Settings, SettingsPayload } from '@shared/types';
import type { Messages } from '../i18n';
import { useDialogA11y } from '../hooks/useDialogA11y';
import { formatBytes } from '../utils/format';
import { Avatar } from './Avatar';

interface SettingsModalProps {
  messages: Messages;
  onClose: () => void;
}

type SettingsApi = typeof window.syncFile & {
  getSandboxLocation?: () => Promise<SandboxLocationInfo>;
  chooseSandboxLocation?: () => Promise<SandboxLocationInfo | null>;
};

const DEFAULT_SETTINGS: Settings = {
  maxSandboxSizeMB: 1024,
  autoAccept: false,
  autoAcceptMaxSizeMB: 64,
  openReceivedFolder: false,
  desktopNotifications: true,
  trustedDevices: []
};

function hasSandboxLocation(payload: unknown): payload is SettingsPayload {
  return typeof payload === 'object' && payload !== null && 'sandboxLocation' in payload;
}

export function SettingsModal({ messages, onClose }: SettingsModalProps): JSX.Element {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [profile, setProfile] = useState<Device | null>(null);
  const [profileName, setProfileName] = useState('');
  const [profileAvatarDataUrl, setProfileAvatarDataUrl] = useState<string | undefined>(undefined);
  const [sandboxLocation, setSandboxLocation] = useState<SandboxLocationInfo | null>(null);
  const [maintenance, setMaintenance] = useState<SettingsPayload['maintenance']>({
    transferHistoryCount: 0,
    resumableTransferCount: 0,
    resumableTransferBytes: 0
  });
  const [saving, setSaving] = useState(false);
  const [choosingSandbox, setChoosingSandbox] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() => {
    return typeof window.Notification?.permission === 'string' ? window.Notification.permission : 'default';
  });
  const api = window.syncFile as SettingsApi;
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const busy = saving || choosingSandbox;
  const handleClose = (): void => {
    if (!busy) {
      onClose();
    }
  };
  const dialogRef = useDialogA11y(handleClose, true);

  const refreshSettings = async (): Promise<void> => {
    try {
      setInlineError(null);
      const [nextSettings, selfDevice] = await Promise.all([
        window.syncFile.getSettings(),
        window.syncFile.getSelfDevice()
      ]);
      setSettings(nextSettings);
      setProfile(selfDevice);
      setProfileName(selfDevice.name);
      setProfileAvatarDataUrl(selfDevice.avatarDataUrl);
      if (hasSandboxLocation(nextSettings)) {
        setSandboxLocation(nextSettings.sandboxLocation);
        setMaintenance(nextSettings.maintenance);
      }

      if (typeof api.getSandboxLocation === 'function') {
        const nextSandboxLocation = await api.getSandboxLocation();
        setSandboxLocation(nextSandboxLocation);
      }
      if (typeof window.Notification?.permission === 'string') {
        setNotificationPermission(window.Notification.permission);
      }
    } catch (error) {
      setInlineError(error instanceof Error ? error.message : messages.failedToLoadDeviceInformation);
    }
  };

  useEffect(() => {
    void refreshSettings();
  }, []);

  const handleOpenSandbox = async (): Promise<void> => {
    setChoosingSandbox(true);
    try {
      setInlineError(null);
      await window.syncFile.openSandbox();
      await refreshSettings();
    } catch (error) {
      setInlineError(error instanceof Error ? error.message : messages.failedToOpenSandbox);
    } finally {
      setChoosingSandbox(false);
    }
  };

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      setInlineError(null);
      if (!profile) {
        throw new Error(messages.failedToLoadDeviceInformation);
      }
      if (profileName.trim().length === 0) {
        throw new Error(messages.settingsProfileName);
      }
      const normalized: Settings = {
        ...settings,
        maxSandboxSizeMB: Math.min(102400, Math.max(64, Math.round(settings.maxSandboxSizeMB) || 1024)),
        autoAcceptMaxSizeMB: Math.min(102400, Math.max(1, Math.round(settings.autoAcceptMaxSizeMB) || 64))
      };
      if (
        normalized.desktopNotifications &&
        typeof window.Notification?.requestPermission === 'function' &&
        window.Notification.permission === 'default'
      ) {
        try {
          await window.Notification.requestPermission();
        } catch {
          // Best effort only.
        }
      }
      await window.syncFile.saveProfile({
        name: profileName.trim(),
        avatarDataUrl: profileAvatarDataUrl
      });
      await window.syncFile.saveSettings(normalized);
      onClose();
    } catch (error) {
      setInlineError(error instanceof Error ? error.message : messages.settings);
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
      setInlineError(null);
      const selected = await api.chooseSandboxLocation();
      if (selected) {
        setSandboxLocation(selected);
        await refreshSettings();
      }
    } catch (error) {
      setInlineError(error instanceof Error ? error.message : messages.settingsSandboxFolder);
    } finally {
      setChoosingSandbox(false);
    }
  };

  const maxBytes = settings.maxSandboxSizeMB * 1024 * 1024;
  const usedBytes = sandboxLocation?.usageBytes ?? 0;
  const remainingBytes = Math.max(0, maxBytes - usedBytes);
  const usageRatio = maxBytes > 0 ? Math.min(100, Math.round((usedBytes / maxBytes) * 100)) : 0;
  const displayPath = sandboxLocation?.path ?? '';

  const handleRequestNotificationPermission = async (): Promise<void> => {
    if (typeof window.Notification?.requestPermission !== 'function') {
      return;
    }
    try {
      const result = await window.Notification.requestPermission();
      setNotificationPermission(result);
    } catch {
      // Best effort only.
    }
  };

  const handleRemoveTrustedDevice = (deviceId: string, trustFingerprint: string): void => {
    setSettings((current) => ({
      ...current,
      trustedDevices: current.trustedDevices.filter(
        (device) =>
          !(device.deviceId === deviceId && device.trustFingerprint === trustFingerprint)
      )
    }));
  };

  const handlePickAvatar = (): void => {
    avatarInputRef.current?.click();
  };

  const handleAvatarInput = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    try {
      const avatarDataUrl = await makeAvatarDataUrl(file);
      setProfileAvatarDataUrl(avatarDataUrl);
    } catch (error) {
      setInlineError(error instanceof Error ? error.message : messages.settingsProfileAvatar);
    }
  };

  const handleClearTransferHistory = async (): Promise<void> => {
    setChoosingSandbox(true);
    try {
      setInlineError(null);
      await window.syncFile.clearTransferHistory();
      await refreshSettings();
    } catch (error) {
      setInlineError(error instanceof Error ? error.message : messages.settingsClearTransferHistory);
    } finally {
      setChoosingSandbox(false);
    }
  };

  const handleClearResumeCache = async (): Promise<void> => {
    setChoosingSandbox(true);
    try {
      setInlineError(null);
      await window.syncFile.clearResumeCache();
      await refreshSettings();
    } catch (error) {
      setInlineError(error instanceof Error ? error.message : messages.settingsClearResumeCache);
    } finally {
      setChoosingSandbox(false);
    }
  };

  return (
    <div className="settings-overlay" onClick={handleClose}>
      <div
        ref={dialogRef}
        className="settings-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
      >
        <div className="settings-header">
          <button type="button" className="settings-back" onClick={handleClose} aria-label={messages.dismiss}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h2 id="settings-title" className="settings-title">{messages.settings}</h2>
        </div>

        <div className="settings-body">
          {inlineError && <div className="settings-error-banner">{inlineError}</div>}

          <section className="settings-section">
            <div className="settings-section-head">
              <h3 className="settings-section-title">{messages.settingsProfileSection}</h3>
              <p className="settings-section-copy">{messages.settingsProfileSectionDesc}</p>
            </div>

            <div className="settings-card-list">
              <div className="settings-card settings-profile-card">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="drop-zone-hidden-input"
                  onChange={(event) => void handleAvatarInput(event)}
                />
                <div className="settings-profile-row">
                  <div className="settings-profile-preview">
                    <Avatar
                      name={profileName || messages.appNotReady}
                      avatarDataUrl={profileAvatarDataUrl}
                      size="lg"
                    />
                    <div className="settings-profile-actions">
                      <button
                        type="button"
                        className="button button-muted"
                        onClick={handlePickAvatar}
                        disabled={busy}
                      >
                        {messages.settingsProfileChangeAvatar}
                      </button>
                      {profileAvatarDataUrl && (
                        <button
                          type="button"
                          className="button button-ghost"
                          onClick={() => setProfileAvatarDataUrl(undefined)}
                          disabled={busy}
                        >
                          {messages.settingsProfileRemoveAvatar}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="settings-profile-fields">
                    <label className="settings-label" htmlFor="settings-profile-name">
                      {messages.settingsProfileName}
                    </label>
                    <span className="settings-desc">{messages.settingsProfileNameDesc}</span>
                    <input
                      id="settings-profile-name"
                      type="text"
                      className="settings-input settings-profile-input"
                      maxLength={64}
                      value={profileName}
                      onChange={(event) => setProfileName(event.target.value)}
                    />
                    <span className="settings-desc">{messages.settingsProfileAvatarDesc}</span>
                    {profileAvatarDataUrl && (
                      <span className="settings-desc">
                        {messages.settingsProfileAvatarReady}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

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

                <div className="settings-input-row">
                  <div className="settings-toggle-text">
                    <span className="settings-label">{messages.settingsAutoAcceptMaxSize}</span>
                    <span className="settings-desc">{messages.settingsAutoAcceptMaxSizeDesc}</span>
                  </div>
                  <input
                    type="number"
                    className="settings-input"
                    min={1}
                    max={102400}
                    value={settings.autoAcceptMaxSizeMB}
                    disabled={!settings.autoAccept}
                    onChange={(e) =>
                      setSettings({ ...settings, autoAcceptMaxSizeMB: Math.max(0, Number(e.target.value)) })
                    }
                  />
                  <span className="settings-unit">{messages.settingsMaxSandboxSizeUnit}</span>
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

              <div className="settings-card">
                <div className="settings-toggle-row">
                  <div className="settings-toggle-text">
                    <span className="settings-label">{messages.settingsDesktopNotifications}</span>
                    <span className="settings-desc">{messages.settingsDesktopNotificationsDesc}</span>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle${settings.desktopNotifications ? ' is-on' : ''}`}
                    onClick={() =>
                      setSettings({ ...settings, desktopNotifications: !settings.desktopNotifications })
                    }
                    role="switch"
                    aria-checked={settings.desktopNotifications}
                    >
                      <span className="settings-toggle-knob" />
                    </button>
                  </div>
                  <div className="settings-note settings-inline-note">
                    {notificationPermission === 'granted'
                      ? messages.settingsNotificationsPermissionGranted
                      : notificationPermission === 'denied'
                        ? messages.settingsNotificationsPermissionDenied
                        : messages.settingsNotificationsPermissionDefault}
                  </div>
                  {notificationPermission === 'default' && (
                    <div className="settings-inline-actions">
                      <button
                        type="button"
                        className="button button-muted"
                        onClick={() => void handleRequestNotificationPermission()}
                      >
                        {messages.settingsNotificationsRequestPermission}
                      </button>
                    </div>
                  )}
                </div>

              <div className="settings-card">
                <span className="settings-label">{messages.settingsTrustedDevices}</span>
                <span className="settings-desc">{messages.settingsTrustedDevicesDesc}</span>

                {settings.trustedDevices.length === 0 ? (
                  <div className="settings-empty-state">{messages.settingsTrustedDevicesEmpty}</div>
                ) : (
                  <div className="settings-trusted-list">
                    {settings.trustedDevices.map((device) => (
                      <div key={device.deviceId} className="settings-trusted-item">
                        <div className="settings-trusted-copy">
                          <span className="settings-trusted-name">{device.name}</span>
                          <span className="settings-trusted-id">
                            ID {device.deviceId.slice(0, 8)} · {messages.deviceFingerprintLabel} {device.trustFingerprint}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="button button-ghost"
                          onClick={() => handleRemoveTrustedDevice(device.deviceId, device.trustFingerprint)}
                        >
                          {messages.settingsTrustedDevicesRemove}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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

                <div className="settings-usage">
                  <div className="settings-usage-top">
                    <span className="settings-usage-total">
                      {messages.settingsUsageOfLimit(formatBytes(usedBytes), formatBytes(maxBytes))}
                    </span>
                    <span className="settings-usage-percent">{usageRatio}%</span>
                  </div>
                  <div className="settings-usage-track" aria-hidden="true">
                    <div className="settings-usage-fill" style={{ width: `${usageRatio}%` }} />
                  </div>
                  <div className="settings-usage-meta">
                    <span>{messages.settingsSpaceUsed}: {formatBytes(usedBytes)}</span>
                    <span>{messages.settingsSpaceRemaining}: {formatBytes(remainingBytes)}</span>
                  </div>
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
                  {displayPath}
                </div>

                <div className="settings-inline-actions">
                  <button
                    type="button"
                    className="button button-muted"
                    onClick={() => void handleOpenSandbox()}
                    disabled={busy}
                  >
                    {messages.openSandbox}
                  </button>
                  <button
                    type="button"
                    className="button button-muted"
                    onClick={() => void handleChooseSandbox()}
                    disabled={busy}
                  >
                    {messages.settingsChangeSandboxFolder}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-head">
              <h3 className="settings-section-title">{messages.settingsMaintenanceSection}</h3>
              <p className="settings-section-copy">{messages.settingsMaintenanceSectionDesc}</p>
            </div>

            <div className="settings-card-list">
              <div className="settings-card">
                <div className="settings-maintenance-metric">
                  <span className="settings-label">{messages.settingsTransferHistoryCount}</span>
                  <span className="settings-maintenance-value">{maintenance.transferHistoryCount}</span>
                </div>
                <button
                  type="button"
                  className="button button-muted"
                  onClick={() => void handleClearTransferHistory()}
                  disabled={busy || maintenance.transferHistoryCount === 0}
                >
                  {messages.settingsClearTransferHistory}
                </button>
              </div>

              <div className="settings-card">
                <div className="settings-maintenance-metric">
                  <span className="settings-label">{messages.settingsResumeCacheCount}</span>
                  <span className="settings-maintenance-value">{maintenance.resumableTransferCount}</span>
                </div>
                <div className="settings-maintenance-metric">
                  <span className="settings-label">{messages.settingsResumeCacheBytes}</span>
                  <span className="settings-maintenance-value">
                    {formatBytes(maintenance.resumableTransferBytes)}
                  </span>
                </div>
                <button
                  type="button"
                  className="button button-muted"
                  onClick={() => void handleClearResumeCache()}
                  disabled={busy || maintenance.resumableTransferCount === 0}
                >
                  {messages.settingsClearResumeCache}
                </button>
              </div>
            </div>
          </section>
        </div>

        <div className="settings-actions">
          <button type="button" className="button button-muted" onClick={handleClose} disabled={busy}>
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

async function makeAvatarDataUrl(file: File): Promise<string> {
  const imageUrl = await readFileAsDataUrl(file);
  const image = await loadImage(imageUrl);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('failed to create avatar canvas');
  }

  let size = 72;
  let quality = 0.82;
  let output = '';
  while (size >= 32) {
    canvas.width = size;
    canvas.height = size;
    context.clearRect(0, 0, size, size);
    const cropSize = Math.min(image.width, image.height);
    const cropX = (image.width - cropSize) / 2;
    const cropY = (image.height - cropSize) / 2;
    context.drawImage(image, cropX, cropY, cropSize, cropSize, 0, 0, size, size);
    output = canvas.toDataURL('image/webp', quality);
    if (output.length <= 950) {
      return output;
    }
    size -= 8;
    quality = Math.max(0.55, quality - 0.08);
  }

  return output;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('failed to read avatar image'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('failed to read avatar image'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('failed to decode avatar image'));
    image.src = src;
  });
}
