import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type MouseEvent, type JSX } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
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

  if (filePath.length > 0) {
    return { path: filePath, name: file.name, label: relativePath, size: file.size };
  }
  return null;
}

function pathToPendingFile(path: string): PendingFile | null {
  if (!path) {
    return null;
  }
  const normalized = path.replace(/\\/g, '/');
  const name = normalized.split('/').pop() || path;
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
  image: '#a855f7',
  video: '#ef4444',
  audio: '#f97316',
  document: '#3b82f6',
  code: '#10b981',
  archive: '#eab308',
  default: '#94a3b8'
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
    <span className="dz-file-icon" style={{ background: `${color}18`, color }}>
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
  const [isDragActive, setIsDragActive] = useState(false);

  useEffect(() => {
    if (!hasTauriRuntime()) {
      return undefined;
    }

    let disposed = false;
    let unlisten: (() => void) | undefined;

    try {
      void getCurrentWebviewWindow().onDragDropEvent((event) => {
        if (disposed) {
          return;
        }

        if (event.payload.type === 'enter' || event.payload.type === 'over') {
          setIsDragActive(true);
          return;
        }

        if (event.payload.type === 'leave') {
          setIsDragActive(false);
          return;
        }

        if (event.payload.type === 'drop') {
          setIsDragActive(false);
          const entries = event.payload.paths
            .map(pathToPendingFile)
            .filter((entry): entry is PendingFile => Boolean(entry));
          addPendingEntries(entries);
        }
      })
        .then((nextUnlisten) => {
          unlisten = nextUnlisten;
        })
        .catch(() => {
          // Window-level drag and drop is best-effort; HTML5 handlers remain as fallback.
        });
    } catch {
      // Standalone browser previews do not have Tauri internals.
    }

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [pendingFiles]);

  const addPendingEntries = (entries: PendingFile[]): void => {
    if (entries.length === 0) {
      return;
    }
    const existing = new Set(pendingFiles.map((file) => file.path));
    onPendingFilesChange([...pendingFiles, ...entries.filter((entry) => !existing.has(entry.path))]);
  };

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
    setIsDragActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setIsDragActive(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setIsDragActive(false);
    void collectDataTransferEntries(event.dataTransfer).then(addPendingEntries);
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>): void => {
    if (event.target.files) {
      addFiles(event.target.files);
    }
    event.target.value = '';
  };

  const openFilePicker = (): void => {
    fileInputRef.current?.click();
  };

  const openDirectoryPicker = (): void => {
    directoryInputRef.current?.click();
  };

  const handleRemove = (event: MouseEvent, path: string): void => {
    event.preventDefault();
    event.stopPropagation();
    onPendingFilesChange(pendingFiles.filter((file) => file.path !== path));
  };

  const handleClearAll = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    onPendingFilesChange([]);
  };

  const handleSend = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (pendingFiles.length === 0 || selectedDevices.length === 0) {
      return;
    }
    const paths = pendingFiles.map((file) => file.path);
    void Promise.resolve(onSend(paths));
  };

  const hasFiles = pendingFiles.length > 0;
  const totalBytes = pendingFiles.reduce((sum, file) => sum + file.size, 0);
  const readyRecipients = selectedDevices.filter(
    (device) => device.isOnline !== false && device.reachability !== 'unreachable' && device.reachability !== 'checking'
  ).length;
  const checkingRecipients = selectedDevices.filter(
    (device) => device.isOnline !== false && device.reachability === 'checking'
  ).length;
  const selectedRecipientCount = selectedDevices.length;
  const canSend =
    hasFiles &&
    selectedDevices.some((device) => device.isOnline !== false && device.reachability !== 'unreachable');
  const selectedDeviceNames = selectedDevices.map((device) => device.name).join(' · ');
  const hasSelectedDevices = selectedDevices.length > 0;
  const EmptyStateIcon = hasSelectedDevices ? UploadCloud : Monitor;
  const emptyTitle = hasSelectedDevices ? messages.dropZoneTitle : messages.dropZoneWaitingTitle;
  const emptySubtitle = hasSelectedDevices ? messages.dropZoneAction : messages.dropZoneWaitingBody;
  const sendStatusLabel =
    selectedRecipientCount === 0
      ? messages.sendQueueStatusNoRecipients
      : readyRecipients > 0
        ? messages.sendQueueStatusReady(readyRecipients, selectedRecipientCount)
        : checkingRecipients > 0
          ? messages.sendQueueStatusChecking(checkingRecipients)
          : messages.sendQueueStatusNoReadyRecipients;
  const sendSummary = `${messages.dropZoneFileCount(pendingFiles.length)} · ${formatBytes(totalBytes)}`;

  return (
    <div
      className={`drop-zone${isDragActive ? ' is-drag-active' : ''}${hasFiles ? ' has-files' : ''}${hasSelectedDevices ? '' : ' is-awaiting-target'}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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
                title={device.name}
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
          <button type="button" className="drop-zone-label" onClick={openFilePicker}>
            <span className="drop-zone-icon" aria-hidden="true">
              <EmptyStateIcon aria-hidden="true" />
            </span>
            <span className="drop-zone-title">{emptyTitle}</span>
            <span className="drop-zone-subtitle">{emptySubtitle}</span>
          </button>
          <div className="drop-zone-quick-actions">
            <button type="button" className="button button-ghost drop-zone-quick-action" onClick={openFilePicker}>
              {messages.dropZonePickFromDisk}
            </button>
            <button type="button" className="button button-ghost drop-zone-quick-action" onClick={openDirectoryPicker}>
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
                <button type="button" className="dz-send-bar-clear" onClick={handleClearAll}>
                  {messages.dropZoneClearAll}
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
              className="dz-send-bar-button"
              disabled={!canSend}
              onClick={handleSend}
            >
              {messages.dropZoneSend}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

async function collectDataTransferEntries(dataTransfer: DataTransfer): Promise<PendingFile[]> {
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
