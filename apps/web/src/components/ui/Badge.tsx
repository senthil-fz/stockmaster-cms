import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

export type BadgeTone = 'published' | 'draft' | 'neutral';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  children?: ReactNode;
}

/* Replicates `.work-card .status`: inline-flex, items-center, gap 6px, weight 600.
 * Despite the name "pill", the legacy element has NO background / border / padding /
 * radius — it's just bold text preceded by a 7px LED dot. */
const base = 'inline-flex items-center gap-1.5 font-semibold';

/* `.status .led`: 7px round dot. published → green, draft → amber.
 * `neutral` has NO legacy equivalent — added here with a faint dot. */
const dotTone: Record<BadgeTone, string> = {
  published: 'bg-green',
  draft: 'bg-amber',
  neutral: 'bg-faint',
};

export function Badge({ tone = 'neutral', className, children, ...rest }: BadgeProps) {
  return (
    <span className={cx(base, className)} {...rest}>
      <span className={cx('size-[7px] rounded-full', dotTone[tone])} />
      {children}
    </span>
  );
}
