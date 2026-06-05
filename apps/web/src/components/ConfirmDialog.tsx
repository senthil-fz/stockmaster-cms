import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Small modal confirmation for destructive actions (delete work / chapter / page).
 * Escape or an overlay click cancels; the confirm button is styled as a danger action.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onCancel();
      }}
      role="alertdialog"
      aria-label={title}
    >
      <h3 className="m-0 mb-2 text-[16px] font-semibold tracking-[-0.01em] text-fg">{title}</h3>
      <p className="m-0 text-[13.5px] leading-[1.5] text-muted">{message}</p>
      <Modal.Actions>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={busy}>
          {busy ? 'Deleting…' : confirmLabel}
        </Button>
      </Modal.Actions>
    </Modal>
  );
}
