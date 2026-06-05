import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Replicates `.icon-btn.bordered` — adds the canvas surface, strong border and xs shadow. */
  bordered?: boolean;
  children?: ReactNode;
}

/* `.icon-btn`: 34x34 grid-centered, transparent 1px border, md radius, secondary text,
 * hover surface + main text, child svgs sized to 18px. */
const base =
  'grid size-[34px] place-items-center rounded-md border border-transparent ' +
  'bg-transparent text-muted transition-[background-color,border-color,box-shadow,opacity] ' +
  'duration-[120ms] hover:bg-hover hover:text-fg [&_svg]:size-[18px]';

// .icon-btn.bordered
const borderedCls = 'border-line-strong bg-canvas shadow-xs';

export function IconButton({
  bordered = false,
  type = 'button',
  className,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button type={type} className={cx(base, bordered && borderedCls, className)} {...rest}>
      {children}
    </button>
  );
}
