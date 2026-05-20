import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent, type MouseEvent, type JSX } from 'react';
import {
  Archive,
  File,
  FileCode,
  FileText,
  FolderPlus,
  Image as ImageIcon,
  Monitor,
  Music,
  Plus,
  UploadCloud,
  Video,
  X
} from 'lucide-react';

import type { Device, PeerReachabilityStatus } from '@shared/types';
import type { Messages } from '../i18n';
import { formatBytes } from '../utils/format';
import { fileNameFromPath, isLikelyAbsolutePath } from '../utils/native-path';
import { Avatar } from './Avatar';

export interface PendingFile {
  path: string;
  name: string;
  label: string;
  size: number;
}

type DataTransferItemWithEntry = DataTransferItem & {
  webkitGetAsEntry?: () => FileSystemEntry | null;
};

interface DropZoneProps {
  onSend: (filePaths: string[]) => void | Promise<void>;
  messages: Messages;
  selectedDevices: Array<Device & { isOnline?: boolean; reachability?: PeerReachabilityStatus; reachabilityError?: string }>;
  selfDevice?: Device | null;
  pendingFiles: PendingFile[];
  onPendingFilesChange: (files: PendingFile[]) => void;
  onRemoveRecipient: (deviceId: string) => void;
}

function fileToEntry(file: File): PendingFile | null {
  const ef = file as File & { path?: string };
  const filePath =
    (typeof ef.path === 'string' && ef.path.length > 0
      ? ef.path
      : typeof window.syncFile.getPathForFile === 'function'
        ? window.syncFile.getPathForFile(file)
        : '') || '';
  const relativePath =
    typeof file.webkitRelativePath === 'string' && file.webkitRelativePath.length > 0
      ? file.webkitRelativePath
      : file.name;

  if (filePath.length > 0 && isLikelyAbsolutePath(filePath)) {
    return { path: filePath, name: file.name, label: relativePath, size: file.size };
  }
  return null;
}

export function pathToPendingFile(path: string): PendingFile | null {
  if (!path) {
    return null;
  }
  if (!isLikelyAbsolutePath(path)) {
    return null;
  }
  const name = fileNameFromPath(path);
  return {
    path,
    name,
    label: name,
    size: 0
  };
}

function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

type FileCategory = 'image' | 'video' | 'audio' | 'document' | 'code' | 'archive' | 'default';

const EXT_MAP: Record<string, FileCategory> = {
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', svg: 'image', webp: 'image', bmp: 'image', ico: 'image', tiff: 'image',
  mp4: 'video', mov: 'video', avi: 'video', mkv: 'video', wmv: 'video', flv: 'video', webm: 'video',
  mp3: 'audio', wav: 'audio', flac: 'audio', aac: 'audio', ogg: 'audio', wma: 'audio', m4a: 'audio',
  pdf: 'document', doc: 'document', docx: 'document', txt: 'document', md: 'document', rtf: 'document', xls: 'document', xlsx: 'document', ppt: 'document', pptx: 'document', csv: 'document',
  js: 'code', ts: 'code', jsx: 'code', tsx: 'code', py: 'code', go: 'code', rs: 'code', java: 'code', c: 'code', cpp: 'code', h: 'code', html: 'code', css: 'code', json: 'code', yaml: 'code', yml: 'code', xml: 'code', sh: 'code', sql: 'code',
  zip: 'archive', tar: 'archive', gz: 'archive', rar: 'archive', '7z': 'archive', bz2: 'archive', xz: 'archive', dmg: 'archive', iso: 'archive'
};

const CATEGORY_COLORS: Record<FileCategory, string> = {
  image: 'oklch(56% 0.095 305)',
  video: 'var(--danger)',
  audio: 'oklch(58% 0.105 62)',
  document: 'var(--accent)',
  code: 'var(--success)',
  archive: 'var(--warning)',
  default: 'var(--text-tertiary)'
};

function FileIcon({ name }: { name: string }): JSX.Element {
  const ext = extOf(name);
  const cat = EXT_MAP[ext] ?? 'default';
  const color = CATEGORY_COLORS[cat];
  const Icon = {
    image: ImageIcon,
    video: Video,
    audio: Music,
    document: FileText,
    code: FileCode,
    archive: Archive,
    default: File
  }[cat];

  return (
    <span className="dz-file-icon" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>
      <Icon aria-hidden="true" />
    </span>
  );
}

const INPUT_ID = 'dropzone-file-input';

function hasTauriRuntime(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const internals = (window as Window & { __TAURI_INTERNALS__?: { invoke?: unknown } }).__TAURI_INTERNALS__;
  return typeof internals?.invoke === 'function';
}

function hasNativeFileAccess(): boolean {
  return hasTauriRuntime();
}

function hasUsableRecipientRoute(
  device: Device & { isOnline?: boolean; reachability?: PeerReachabilityStatus; reachabilityError?: string }
): boolean {
  return device.address.trim().length > 0 && device.port > 0;
}

function canAttemptRecipientSend(
  device: Device & { isOnline?: boolean; reachability?: PeerReachabilityStatus; reachabilityError?: string }
): boolean {
  return (
    device.reachability !== 'unreachable' &&
    (device.isOnline !== false || hasUsableRecipientRoute(device))
  );
}

export function DropZone({
  onSend,
  messages,
  selectedDevices,
  selfDevice,
  pendingFiles,
  onPendingFilesChange,
  onRemoveRecipient
}: DropZoneProps): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const directoryInputRef = useRef<HTMLInputElement>(null);
  const pendingFilesRef = useRef(pendingFiles);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [pickerMode, setPickerMode] = useState<'files' | 'folder' | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  useEffect(() => {
    pendingFilesRef.current = pendingFiles;
  }, [pendingFiles]);

  useEffect(() => {
    if (!confirmClearAll) {
      return;
    }
    const timer = window.setTimeout(() => setConfirmClearAll(false), 3600);
    return () => window.clearTimeout(timer);
  }, [confirmClearAll]);

  const commitPendingFiles = useCallback(
    (files: PendingFile[]): void => {
      pendingFilesRef.current = files;
      onPendingFilesChange(files);
    },
    [onPendingFilesChange]
  );

  const addPendingEntries = useCallback(
    (entries: PendingFile[]): void => {
      if (isSending) {
        return;
      }
      if (entries.length === 0) {
        return;
      }

      const current = pendingFilesRef.current;
      const existing = new Set(current.map((file) => file.path));
      const nextEntries = entries.filter((entry) => !existing.has(entry.path));
      if (nextEntries.length === 0) {
        return;
      }

      setConfirmClearAll(false);
      commitPendingFiles([...current, ...nextEntries]);
    },
    [commitPendingFiles, isSending]
  );

  const addFiles = (fileList: FileList): void => {
    const entries: PendingFile[] = [];
    for (let i = 0; i < fileList.length; i += 1) {
      const entry = fileToEntry(fileList[i]);
      if (entry) {
        entries.push(entry);
      }
    }
    addPendingEntries(entries);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    if (isSending) {
      return;
    }
    setIsDragActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setIsDragActive(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(false);
    if (isSending) {
      return;
    }
    void collectDataTransferEntries(event.dataTransfer).then(addPendingEntries);
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>): void => {
    if (event.target.files) {
      addFiles(event.target.files);
    }
    event.target.value = '';
  };

  const openFilePicker = (): void => {
    if (pickerMode !== null || isSending) {
      return;
    }

    if (hasNativeFileAccess() && typeof window.syncFile.selectFiles === 'function') {
      setPickerMode('files');
      void window.syncFile
        .selectFiles()
        .then((paths) => {
          const entries = paths
            .map(pathToPendingFile)
            .filter((entry): entry is PendingFile => Boolean(entry));
          addPendingEntries(entries);
        })
        .catch(() => {
          fileInputRef.current?.click();
        })
        .finally(() => {
          setPickerMode(null);
        });
      return;
    }
    fileInputRef.current?.click();
  };

  const openDirectoryPicker = (): void => {
    if (pickerMode !== null || isSending) {
      return;
    }

    if (hasNativeFileAccess() && typeof window.syncFile.selectFolderFiles === 'function') {
      setPickerMode('folder');
      void window.syncFile
        .selectFolderFiles()
        .then((paths) => {
          const entries = paths
            .map(pathToPendingFile)
            .filter((entry): entry is PendingFile => Boolean(entry));
          addPendingEntries(entries);
        })
        .catch(() => {
          directoryInputRef.current?.click();
        })
        .finally(() => {
          setPickerMode(null);
        });
      return;
    }
    directoryInputRef.current?.click();
  };

  const handleRemove = (event: MouseEvent, path: string): void => {
    event.preventDefault();
    event.stopPropagation();
    if (isSending) {
      return;
    }
    setConfirmClearAll(false);
    commitPendingFiles(pendingFilesRef.current.filter((file) => file.path !== path));
  };

  const handleClearAll = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (isSending) {
      return;
    }
    if (!confirmClearAll) {
      setConfirmClearAll(true);
      return;
    }
    setConfirmClearAll(false);
    commitPendingFiles([]);
  };

  const hasFiles = pendingFiles.length > 0;
  const totalBytes = pendingFiles.reduce((sum, file) => sum + file.size, 0);
  const readyRecipients = selectedDevices.filter(
    (device) => canAttemptRecipientSend(device) && device.reachability !== 'checking'
  ).length;
  const checkingRecipients = selectedDevices.filter(
    (device) => device.isOnline !== false && device.reachability === 'checking'
  ).length;
  const sendableRecipients = selectedDevices.filter(canAttemptRecipientSend).length;
  const selectedRecipientCount = selectedDevices.length;
  const canSend =
    hasFiles &&
    sendableRecipients > 0;
  const selectedDeviceNames = selectedDevices.map((device) => device.name).join(' · ');
  const hasSelectedDevices = selectedDevices.length > 0;
  const EmptyStateIcon = hasSelectedDevices ? UploadCloud : Monitor;
  const emptyTitle = hasSelectedDevices ? messages.dropZoneTitle : messages.dropZoneWaitingTitle;
  const emptySubtitle = hasSelectedDevices ? messages.dropZoneAction : messages.dropZoneWaitingBody;
  const sendStatusLabel =
    selectedRecipientCount === 0
      ? messages.sendQueueStatusNoRecipients
      : readyRecipients > 0
        ? checkingRecipients > 0
          ? messages.sendQueueStatusReadyWithChecking(readyRecipients, checkingRecipients, selectedRecipientCount)
          : messages.sendQueueStatusReady(readyRecipients, selectedRecipientCount)
        : checkingRecipients > 0
          ? messages.sendQueueStatusChecking(checkingRecipients)
          : messages.sendQueueStatusNoReadyRecipients;
  const sendSummary = `${messages.dropZoneFileCount(pendingFiles.length)} · ${formatBytes(totalBytes)}`;
  const isPicking = pickerMode !== null;
  const isQueueLocked = isSending || isPicking;
  const sendButtonLabel =
    isSending
      ? messages.dropZoneSending
      : canSend && readyRecipients === 0
        ? messages.dropZoneTrySend
        : messages.dropZoneSend;

  const handleSend = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (!canSend || isQueueLocked) {
      return;
    }

    const paths = pendingFiles.map((file) => file.path);
    setIsSending(true);
    void Promise.resolve(onSend(paths)).finally(() => setIsSending(false));
  };

  return (
    <div
      className={`drop-zone${isDragActive ? ' is-drag-active' : ''}${hasFiles ? ' has-files' : ''}${hasSelectedDevices ? '' : ' is-awaiting-target'}${isQueueLocked ? ' is-queue-locked' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      aria-busy={isQueueLocked}
    >
      <input
        ref={fileInputRef}
        id={INPUT_ID}
        type="file"
        multiple
        className="drop-zone-hidden-input"
        onChange={handleFileInput}
      />
      <input
        ref={directoryInputRef}
        type="file"
        multiple
        className="drop-zone-hidden-input"
        onChange={handleFileInput}
        {...({
          webkitdirectory: '',
          directory: ''
        } as unknown as Record<string, string>)}
      />

      <div className="dz-recipient-strip">
        <span className="dz-recipient-label">
          {selectedDevices.length > 0
            ? messages.dispatchTargetReady(selectedDevices.length === 1 ? selectedDevices[0].name : selectedDeviceNames)
            : messages.dispatchTargetIdle}
        </span>
        {selectedDevices.length > 0 && (
          <div className="dz-recipient-list">
            {selectedDevices.map((device) => (
              <button
                key={device.deviceId}
                type="button"
                className={`dz-recipient-chip${device.isOnline === false ? ' is-offline' : ''}${device.reachability === 'unreachable' ? ' is-unreachable' : ''}`}
                onClick={() => onRemoveRecipient(device.deviceId)}
                disabled={isQueueLocked}
                title={device.name}
                aria-label={messages.dropZoneRemoveRecipient(device.name)}
              >
                <Avatar name={device.name} avatarDataUrl={device.avatarDataUrl} size="sm" />
                <span className="dz-recipient-chip-copy">
                  <span className="dz-recipient-chip-name">{device.name}</span>
                  <span className="dz-recipient-chip-status">
                    {device.isOnline === false
                      ? messages.recipientOfflineLabel
                      : device.reachability === 'unreachable'
                        ? messages.deviceReachabilityUnreachable
                        : device.reachability === 'checking'
                          ? messages.deviceReachabilityChecking
                          : messages.deviceReachabilityReachable}
                  </span>
                </span>
                <span className="dz-recipient-chip-remove" aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {!hasFiles ? (
        <>
          <button
            type="button"
            className="drop-zone-label"
            onClick={openFilePicker}
            disabled={isQueueLocked}
            aria-busy={pickerMode === 'files'}
          >
            <span className="drop-zone-icon" aria-hidden="true">
              <EmptyStateIcon aria-hidden="true" />
            </span>
            <span className="drop-zone-title">{emptyTitle}</span>
            <span className="drop-zone-subtitle">{emptySubtitle}</span>
          </button>
          <div className="drop-zone-quick-actions">
            <button
              type="button"
              className="button button-ghost drop-zone-quick-action"
              onClick={openFilePicker}
              disabled={isQueueLocked}
              aria-busy={pickerMode === 'files'}
            >
              {messages.dropZonePickFromDisk}
            </button>
            <button
              type="button"
              className="button button-ghost drop-zone-quick-action"
              onClick={openDirectoryPicker}
              disabled={isQueueLocked}
              aria-busy={pickerMode === 'folder'}
            >
              {messages.dropZoneAddFolder}
            </button>
          </div>
        </>
      ) : (
        <div className="dz-files">
          <div className="dz-file-stage">
            <div className="dz-file-grid">
              {pendingFiles.map((file) => (
                <div key={file.path} className="dz-file-tile">
                  <FileIcon name={file.name} />
                  <span className="dz-file-tile-name" title={file.label}>{file.label}</span>
                  <span className="dz-file-tile-size">{formatBytes(file.size)}</span>
                  <button
                    type="button"
                    className="dz-file-tile-remove"
                    onClick={(event) => handleRemove(event, file.path)}
                    disabled={isQueueLocked}
                    title={messages.dropZoneRemoveFile}
                    aria-label={`${messages.dropZoneRemoveFile} ${file.name}`}
                  >
                    <X aria-hidden="true" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                className="dz-file-tile dz-file-tile-add"
                onClick={openFilePicker}
                disabled={isQueueLocked}
                aria-busy={pickerMode === 'files'}
                title={messages.dropZonePickFromDisk}
                aria-label={messages.dropZonePickFromDisk}
              >
                <span className="dz-file-tile-add-icon" aria-hidden="true">
                  <Plus aria-hidden="true" />
                </span>
                <span className="dz-file-tile-add-label">{messages.dropZoneAddMore}</span>
              </button>
              <button
                type="button"
                className="dz-file-tile dz-file-tile-add"
                onClick={openDirectoryPicker}
                disabled={isQueueLocked}
                aria-busy={pickerMode === 'folder'}
                title={messages.dropZoneAddFolder}
                aria-label={messages.dropZoneAddFolder}
              >
                <span className="dz-file-tile-add-icon" aria-hidden="true">
                  <FolderPlus aria-hidden="true" />
                </span>
                <span className="dz-file-tile-add-label">{messages.dropZoneAddFolder}</span>
              </button>
            </div>

            {isDragActive && (
              <div className="dz-drop-overlay" aria-hidden="true">
                <div className="dz-drop-overlay-card">
                  <UploadCloud aria-hidden="true" />
                  <span>{messages.dropZoneDropToAdd}</span>
                </div>
              </div>
            )}
          </div>

          <div className="dz-send-bar">
            <span className="dz-send-bar-info">
              <span className="dz-send-bar-summary">{sendSummary}</span>
              {pendingFiles.length > 1 && (
                <button
                  type="button"
                  className={`dz-send-bar-clear${confirmClearAll ? ' is-confirming' : ''}`}
                  onClick={handleClearAll}
                  disabled={isQueueLocked}
                >
                  {confirmClearAll ? messages.dropZoneClearAllConfirm : messages.dropZoneClearAll}
                </button>
              )}
            </span>
            <span className={`dz-send-bar-status${canSend ? ' is-ready' : ' is-blocked'}`}>
              {sendStatusLabel}
            </span>
            <span className="dz-send-bar-route-wrap">
              {selectedDevices.length > 0 && selfDevice ? (
                <span className="dz-send-bar-route">{selfDevice.name} → {selectedDeviceNames}</span>
              ) : (
                <span className="dz-send-bar-hint">{messages.dropZoneSelectDevice}</span>
              )}
            </span>
            <button
              type="button"
              className={`dz-send-bar-button${isSending ? ' is-busy' : ''}`}
              disabled={!canSend || isQueueLocked}
              onClick={handleSend}
              aria-busy={isSending}
            >
              {sendButtonLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export async function collectDataTransferEntries(dataTransfer: DataTransfer): Promise<PendingFile[]> {
  const items = Array.from(dataTransfer.items ?? []) as DataTransferItemWithEntry[];
  const entries = items
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => Boolean(entry));

  if (entries.length === 0) {
    return collectFileEntries(dataTransfer.files);
  }

  const files = await Promise.all(entries.map((entry) => readEntryFiles(entry)));
  return files.flat();
}

function collectFileEntries(fileList: FileList): PendingFile[] {
  const entries: PendingFile[] = [];
  for (let i = 0; i < fileList.length; i += 1) {
    const entry = fileToEntry(fileList[i]);
    if (entry) {
      entries.push(entry);
    }
  }
  return entries;
}

async function readEntryFiles(entry: FileSystemEntry): Promise<PendingFile[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      try {
        (entry as FileSystemFileEntry).file((nextFile) => resolve(nextFile));
      } catch (error) {
        reject(error);
      }
    });
    const pending = fileToEntry(file);
    return pending ? [pending] : [];
  }

  if (!entry.isDirectory) {
    return [];
  }

  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const nestedEntries = await readDirectoryEntries(reader);
  const files = await Promise.all(nestedEntries.map((nestedEntry) => readEntryFiles(nestedEntry)));
  return files.flat();
}

async function readDirectoryEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const entries: FileSystemEntry[] = [];

  while (true) {
    const chunk = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      try {
        reader.readEntries((nextEntries) => resolve(nextEntries));
      } catch (error) {
        reject(error);
      }
    });

    if (chunk.length === 0) {
      return entries;
    }
    entries.push(...chunk);
  }
}
