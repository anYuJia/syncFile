import { useRef, useState, type ChangeEvent, type DragEvent, type MouseEvent, type JSX } from 'react';
import type { Messages } from '../i18n';

/* ── Types ────────────────────────────────────────────────────── */

interface PendingFile {
  path: string;
  name: string;
  size: number;
}

interface DropZoneProps {
  onSend: (filePaths: string[]) => void | Promise<void>;
  messages: Messages;
  selectedDeviceName?: string | null;
  selfDeviceName?: string | null;
}

/* ── Helpers ──────────────────────────────────────────────────── */

function fileToEntry(file: File): PendingFile | null {
  const ef = file as File & { path?: string };
  if (typeof ef.path === 'string' && ef.path.length > 0) {
    return { path: ef.path, name: file.name, size: file.size };
  }
  return null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/* ── File type icon system ────────────────────────────────────── */

type FileCategory = 'image' | 'video' | 'audio' | 'document' | 'code' | 'archive' | 'default';

const EXT_MAP: Record<string, FileCategory> = {
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', svg: 'image', webp: 'image', bmp: 'image', ico: 'image', tiff: 'image',
  mp4: 'video', mov: 'video', avi: 'video', mkv: 'video', wmv: 'video', flv: 'video', webm: 'video',
  mp3: 'audio', wav: 'audio', flac: 'audio', aac: 'audio', ogg: 'audio', wma: 'audio', m4a: 'audio',
  pdf: 'document', doc: 'document', docx: 'document', txt: 'document', md: 'document', rtf: 'document', xls: 'document', xlsx: 'document', ppt: 'document', pptx: 'document', csv: 'document',
  js: 'code', ts: 'code', jsx: 'code', tsx: 'code', py: 'code', go: 'code', rs: 'code', java: 'code', c: 'code', cpp: 'code', h: 'code', html: 'code', css: 'code', json: 'code', yaml: 'code', yml: 'code', xml: 'code', sh: 'code', sql: 'code',
  zip: 'archive', tar: 'archive', gz: 'archive', rar: 'archive', '7z': 'archive', bz2: 'archive', xz: 'archive', dmg: 'archive', iso: 'archive',
};

const CATEGORY_COLORS: Record<FileCategory, string> = {
  image: '#a855f7',
  video: '#ef4444',
  audio: '#f97316',
  document: '#3b82f6',
  code: '#10b981',
  archive: '#eab308',
  default: '#94a3b8',
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
    default: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>,
  }[cat];

  return (
    <span className="dz-file-icon" style={{ background: `${color}18`, color }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {iconPath}
      </svg>
    </span>
  );
}

/* ── Component ────────────────────────────────────────────────── */

const INPUT_ID = 'dropzone-file-input';

export function DropZone({
  onSend,
  messages,
  selectedDeviceName,
  selfDeviceName
}: DropZoneProps): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);

  const addFiles = (fileList: FileList): void => {
    const entries: PendingFile[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const entry = fileToEntry(fileList[i]);
      if (entry) entries.push(entry);
    }
    if (entries.length === 0) return;
    setPendingFiles((prev) => {
      const existing = new Set(prev.map((f) => f.path));
      return [...prev, ...entries.filter((e) => !existing.has(e.path))];
    });
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsDragActive(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setIsDragActive(false);
    addFiles(event.dataTransfer.files);
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>): void => {
    if (event.target.files) addFiles(event.target.files);
    event.target.value = '';
  };

  const openFilePicker = (): void => {
    fileInputRef.current?.click();
  };

  const handleRemove = (event: MouseEvent, path: string): void => {
    event.preventDefault();
    event.stopPropagation();
    setPendingFiles((prev) => prev.filter((f) => f.path !== path));
  };

  const handleClearAll = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    setPendingFiles([]);
  };

  const handleSend = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (pendingFiles.length === 0 || !selectedDeviceName) return;
    const paths = pendingFiles.map((f) => f.path);
    void Promise.resolve(onSend(paths)).then(() => setPendingFiles([]));
  };

  const canSend = pendingFiles.length > 0 && Boolean(selectedDeviceName);
  const hasFiles = pendingFiles.length > 0;

  return (
    <div
      className={`drop-zone${isDragActive ? ' is-drag-active' : ''}${hasFiles ? ' has-files' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        id={INPUT_ID}
        type="file"
        multiple
        className="drop-zone-hidden-input"
        onChange={handleFileInput}
      />

      {!hasFiles ? (
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
      ) : (
        <div className="dz-files">
          <div className="dz-file-stage">
            <div className="dz-file-grid">
              {pendingFiles.map((file) => (
                <div key={file.path} className="dz-file-tile">
                  <FileIcon name={file.name} />
                  <span className="dz-file-tile-name" title={file.name}>{file.name}</span>
                  <span className="dz-file-tile-size">{formatSize(file.size)}</span>
                  <button
                    type="button"
                    className="dz-file-tile-remove"
                    onClick={(e) => handleRemove(e, file.path)}
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
                title={messages.dropZoneAction}
                aria-label={messages.dropZoneAction}
              >
                <span className="dz-file-tile-add-icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </span>
                <span className="dz-file-tile-add-label">{messages.dropZoneAddMore}</span>
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
            {selectedDeviceName && selfDeviceName ? (
              <span className="dz-send-bar-route">{selfDeviceName} → {selectedDeviceName}</span>
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
