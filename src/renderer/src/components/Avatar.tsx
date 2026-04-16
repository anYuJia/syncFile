interface AvatarProps {
  name: string;
  avatarDataUrl?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Avatar({ name, avatarDataUrl, size = 'md' }: AvatarProps): JSX.Element {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';

  return (
    <span className={`avatar avatar-${size}`}>
      {avatarDataUrl ? (
        <img src={avatarDataUrl} alt={name} className="avatar-image" />
      ) : (
        <span className="avatar-fallback" aria-hidden="true">
          {initials}
        </span>
      )}
    </span>
  );
}
