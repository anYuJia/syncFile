import { useRef, useState, type ChangeEvent, type DragEvent, type MouseEvent, type JSX } from 'react';

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

  const iconPath = {
    image: <><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></>,
    video: <><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" /><line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="2" y1="7" x2="7" y2="7" /><line x1="2" y1="17" x2="7" y2="17" /><line x1="17" y1="17" x2="22" y2="17" /><line x1="17" y1="7" x2="22" y2="7" /></>,
    audio: <><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>,
    document: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></>,
    code: <><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></>,
    archive: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></>,
    default: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>
  }[cat];

  return (
    <span className="dz-file-icon" style={{ background: `${color}18`, color }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {iconPath}
      </svg>
    </span>
  );
}

const INPUT_ID = 'dropzone-file-input';

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
    void Promise.resolve(onSend(paths)).then(() => onPendingFilesChange([]));
  };

  const hasFiles = pendingFiles.length > 0;
  const canSend =
    hasFiles &&
    selectedDevices.some((device) => device.isOnline !== false && device.reachability !== 'unreachable');
  const selectedDeviceNames = selectedDevices.map((device) => device.name).join(' · ');

  return (
    <div
      className={`drop-zone${isDragActive ? ' is-drag-active' : ''}${hasFiles ? ' has-files' : ''}`}
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
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </span>
            <span className="drop-zone-title">{messages.dropZoneTitle}</span>
            <span className="drop-zone-subtitle">{messages.dropZoneAction}</span>
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
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
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
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
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
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v1H3z" />
                    <path d="M3 10h18v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  </svg>
                </span>
                <span className="dz-file-tile-add-label">{messages.dropZoneAddFolder}</span>
              </button>
            </div>

            {isDragActive && (
              <div className="dz-drop-overlay" aria-hidden="true">
                <div className="dz-drop-overlay-card">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <span>{messages.dropZoneDropToAdd}</span>
                </div>
              </div>
            )}
          </div>

          <div className="dz-send-bar">
            <span className="dz-send-bar-info">
              {messages.dropZoneFileCount(pendingFiles.length)}
              {pendingFiles.length > 1 && (
                <button type="button" className="dz-send-bar-clear" onClick={handleClearAll}>
                  {messages.dropZoneClearAll}
                </button>
              )}
            </span>
            {selectedDevices.length > 0 && selfDevice ? (
              <span className="dz-send-bar-route">{selfDevice.name} → {selectedDeviceNames}</span>
            ) : (
              <span className="dz-send-bar-hint">{messages.dropZoneSelectDevice}</span>
            )}
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
