const ABSOLUTE_PATH_PATTERN = /^(?:\/|[a-zA-Z]:[\\/]|\\\\|\/\/)/;

export function isLikelyAbsolutePath(path: string): boolean {
  return ABSOLUTE_PATH_PATTERN.test(path.trim());
}

export function fileNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  return normalized.split('/').pop() || path;
}
