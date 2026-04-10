import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import type { Messages } from '../i18n';

interface DropZoneProps {
  disabled?: boolean;
  onFileDropped: (filePath: string) => void;
  messages: Messages;
  selectedDeviceName?: string | null;
  selfDeviceName?: string | null;
}

function fileToPath(file: File): string | null {
  const electronFile = file as File & { path?: string };
  if (typeof electronFile.path === 'string' && electronFile.path.length > 0) {
    return electronFile.path;
  }
  return null;
}

function pickFirstPath(fileList: FileList): string | null {
  if (fileList.length === 0) {
    return null;
  }
  return fileToPath(fileList[0]);
}

export function DropZone({
  disabled = false,
  onFileDropped,
  messages,
  selectedDeviceName,
  selfDeviceName
}: DropZoneProps): JSX.Element {
  const [isDragActive, setIsDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleDragOver = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    if (!disabled) {
      setIsDragActive(true);
    }
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

    if (disabled) {
      return;
    }

    const filePath = pickFirstPath(event.dataTransfer.files);
    if (filePath) {
      onFileDropped(filePath);
    }
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>): void => {
    if (disabled || !event.target.files) {
      return;
    }
    const filePath = pickFirstPath(event.target.files);
    if (filePath) {
      onFileDropped(filePath);
    }
    event.target.value = '';
  };

  return (
    <div
      className={`drop-zone${isDragActive ? ' is-drag-active' : ''}${disabled ? ' is-disabled' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => {
        if (!disabled) {
          inputRef.current?.click();
        }
      }}
      aria-disabled={disabled}
    >
      <input ref={inputRef} type="file" className="drop-zone-input" onChange={handleFileInput} />
      <div className="drop-zone-ticket">
        <span className="drop-zone-passport">{messages.dropZonePassport}</span>
        <div className="drop-zone-route">
          <span className="drop-zone-route-pill">{selfDeviceName ?? messages.selfDeviceLabel}</span>
          <span className="drop-zone-route-line" />
          <span className="drop-zone-route-pill is-target">
            {selectedDeviceName ?? messages.dropZoneTargetFallback}
          </span>
        </div>
        <p className="drop-zone-title">{messages.dropZoneTitle}</p>
        <p className="drop-zone-target">
          {selectedDeviceName
            ? messages.dropZoneTargetReady(selectedDeviceName)
            : messages.dropZoneTargetFallback}
        </p>
        <p className="drop-zone-subtitle">
          {disabled ? messages.dropZoneSelectDeviceFirst : messages.dropZoneHint}
        </p>
        <div className="drop-zone-footer">
          <span className="drop-zone-action">{messages.dropZoneAction}</span>
          {!disabled && <span className="drop-zone-caption">{messages.dropZonePickFromDisk}</span>}
        </div>
      </div>
    </div>
  );
}
