import { forwardRef, type InputHTMLAttributes, type LabelHTMLAttributes, type ReactNode } from 'react';
import { cx } from './cx';

/* `.input`: full width, 1px input border, canvas bg, md radius, padding 8px 10px,
 * font-size 13px, inherits font family. Focus: accent border + 3px accent ring,
 * no outline. (`--accent-ring` is not a color token, so the ring is an arbitrary
 * box-shadow.) */
const inputCls =
  'w-full rounded-md border border-input bg-canvas px-2.5 py-2 text-[13px] text-fg ' +
  'font-sans focus:border-accent focus:outline-none ' +
  'focus:shadow-[0_0_0_3px_var(--accent-ring)]';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

// forwardRef so libraries that need the DOM node (react-hook-form's register, focus
// management) work — without it the ref is silently dropped and forms don't register.
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { type = 'text', className, ...rest },
  ref,
) {
  return <input ref={ref} type={type} className={cx(inputCls, className)} {...rest} />;
});

export interface FieldProps extends LabelHTMLAttributes<HTMLLabelElement> {
  /** The field label text rendered above the control (`.field > label`). */
  label: ReactNode;
  /** The control(s) — typically an <Input/>, <select>, <textarea>. */
  children: ReactNode;
}

/* `.field`: margin-bottom 12px wrapper. `.field > label`: block, 12px, weight 600,
 * secondary text, margin-bottom 6px. Rendered as a single <label> so clicking the
 * text focuses the contained control. */
export function Field({ label, children, className, ...rest }: FieldProps) {
  return (
    <label className={cx('mb-3 block', className)} {...rest}>
      <span className="mb-1.5 block text-xs font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}
