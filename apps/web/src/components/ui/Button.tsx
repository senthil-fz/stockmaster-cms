import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

export type ButtonVariant = 'secondary' | 'primary' | 'ghost' | 'danger';
export type ButtonSize = 'sm';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Optional small modifier (replicates `.btn-sm`). */
  size?: ButtonSize;
  children?: ReactNode;
}

/* Base `.btn`: inline-flex, gap 8px, weight 600, letter-spacing -0.01em, md radius,
 * transparent 1px border, nowrap, child svgs sized to 16px. */
/* Note: base intentionally sets NO background and NO text color — each variant owns
 * both, so duplicate `background-color`/`color` utilities never fight (Tailwind
 * resolves duplicates by stylesheet source order, not className order). */
const base =
  'inline-flex items-center gap-2 rounded-md border border-transparent ' +
  'font-semibold tracking-[-0.01em] whitespace-nowrap ' +
  'transition-[background-color,border-color,box-shadow,opacity] duration-[120ms] ' +
  '[&_svg]:size-4';

/* `.btn-*` skins. Each owns its background. Disabled styling only exists on
 * primary/danger in the legacy CSS. */
const variants: Record<ButtonVariant, string> = {
  // .btn-secondary
  secondary: 'bg-canvas border-line-strong text-fg shadow-xs hover:bg-hover',
  // .btn-primary (+ :disabled opacity .6 / default cursor)
  primary:
    'bg-primary text-onprimary shadow-xs hover:bg-primary-hover ' +
    'disabled:opacity-60 disabled:cursor-default',
  // .btn-ghost
  ghost: 'bg-transparent text-muted hover:bg-hover hover:text-fg',
  // .btn-danger (hardcoded hex in source — not tokenized, so matched literally)
  danger:
    'bg-[#c0392b] text-white shadow-xs hover:bg-[#a93226] ' +
    'disabled:opacity-60 disabled:cursor-default',
};

/* Sizes are emitted conditionally (never both) so padding/font-size don't conflict.
 * Default `.btn`: padding 8px 14px, font-size 13px. `.btn-sm`: padding 5px 11px, 12.5px. */
const sizes = {
  default: 'px-3.5 py-2 text-[13px]',
  sm: 'px-[11px] py-[5px] text-[12.5px]',
};

export function Button({
  variant = 'secondary',
  size,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(base, variants[variant], size === 'sm' ? sizes.sm : sizes.default, className)}
      {...rest}
    >
      {children}
    </button>
  );
}
