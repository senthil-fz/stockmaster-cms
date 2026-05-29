import type { WorkSummary } from '@blockpress/shared';

const TONES: Record<string, string> = {
  sand: 'linear-gradient(160deg,#d8c4a0,#b89b6e)',
  sage: 'linear-gradient(160deg,#aebd9e,#7d9170)',
  default: 'linear-gradient(160deg,#c2c2bb,#8f8f86)',
};

export function BookCover({
  work,
  className,
}: {
  work: Pick<WorkSummary, 'coverUrl' | 'coverTone' | 'title'>;
  className?: string;
}) {
  if (work.coverUrl) {
    return <img src={work.coverUrl} className={className} alt="" />;
  }
  const bg = TONES[work.coverTone] ?? TONES.default;
  return (
    <div
      className={className}
      style={{ background: bg, display: 'grid', placeItems: 'center', position: 'relative', overflow: 'hidden' }}
    >
      <span
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'repeating-linear-gradient(180deg,transparent,transparent 6px,rgba(255,255,255,0.06) 6px,rgba(255,255,255,0.06) 7px)',
        }}
      />
      <span
        style={{
          color: 'rgba(255,255,255,0.92)',
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textAlign: 'center',
          padding: '0 4px',
          lineHeight: 1.1,
          position: 'relative',
        }}
      >
        {work.title.split(' ').slice(0, 3).join(' ')}
      </span>
    </div>
  );
}
