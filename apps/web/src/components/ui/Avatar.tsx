export function Avatar({ name, size = 36 }: { name: string; color?: string; size?: number }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flex: 'none',
        background: 'linear-gradient(135deg,#c9b79c,#7d8b6a)',
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
