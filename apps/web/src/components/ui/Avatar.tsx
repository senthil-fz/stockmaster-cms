export function Avatar({ name, color, size = 36 }: { name: string; color?: string; size?: number }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  // Honor the per-user avatarColor when given — each author gets a distinct identity hue,
  // rendered as a subtle light→solid gradient so it keeps depth. Falls back to the neutral
  // house gradient when no color is supplied.
  // Keep the light end only lightly lifted (20% white) so white initials stay legible even on
  // a paler hue; the solid end anchors the identity color. avatarColor is a pinned #rrggbb.
  const background = color
    ? `linear-gradient(140deg, color-mix(in oklch, ${color} 80%, #fff) 0%, ${color} 78%)`
    : 'linear-gradient(135deg,#c9b79c,#7d8b6a)';
  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flex: 'none',
        background,
        color: '#fff',
        display: 'grid',
        placeItems: 'center',
        fontWeight: 700,
        fontSize: size * 0.36,
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06)',
      }}
    >
      {initials}
    </div>
  );
}
