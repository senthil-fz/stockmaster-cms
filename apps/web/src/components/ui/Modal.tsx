import { useEffect, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from './cx';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Accessible label for the dialog (maps to aria-label). */
  ['aria-label']?: string;
  /** ARIA role — use 'alertdialog' for destructive confirmations. Defaults to 'dialog'. */
  role?: 'dialog' | 'alertdialog';
  /** Extra classes merged onto the `.modal` panel. */
  className?: string;
}

/* `.modal-overlay`: fixed inset-0, z-1000, grid place-items-center, 16px padding,
 * translucent ink backdrop (NO blur — unlike the bespoke VersionViewer overlay). */
const overlayCls = 'fixed inset-0 z-[1000] grid place-items-center p-4 bg-[rgba(28,28,26,0.45)]';

/* `.modal`: min(420px,100%) wide, canvas surface, strong 1px border, lg radius,
 * lg shadow, padding 22px 22px 18px. */
const panelCls =
  'w-[min(420px,100%)] rounded-lg border border-line-strong bg-canvas shadow-lg ' +
  'pt-[22px] px-[22px] pb-[18px]';

function ModalRoot({ open, onClose, children, className, role = 'dialog', ...rest }: ModalProps) {
  const ariaLabel = rest['aria-label'];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={overlayCls} onClick={onClose}>
      <div
        className={cx(panelCls, className)}
        role={role}
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

/* `.modal-actions`: flex, justify-end, gap 8px, margin-top 20px. */
function ModalActions({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('mt-5 flex justify-end gap-2', className)} {...rest}>
      {children}
    </div>
  );
}

export const Modal = Object.assign(ModalRoot, { Actions: ModalActions });
