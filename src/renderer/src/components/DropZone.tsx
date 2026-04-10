import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';

interface DropZoneProps {
  disabled?: boolean;
  onFileDropped: (filePath: string) => void;
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

export function DropZone({ disabled = false, onFileDropped }: DropZoneProps): JSX.Element {
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
      <p className="drop-zone-title">Drop a file here</p>
      <p className="drop-zone-subtitle">
        {disabled ? 'Select a target device first.' : 'Or click to pick from disk.'}
      </p>
    </div>
  );
}
