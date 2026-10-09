import Modal from './Modal';

export default function ConfirmModal({
  open,
  title = 'Подтверждение',
  message,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  tone = 'danger',
  onConfirm,
  onCancel,
  busy = false,
}) {
  if (!open) return null;

  const confirmClass = tone === 'danger'
    ? 'btn btn--danger'
    : tone === 'warning'
      ? 'btn btn--warning'
      : 'btn btn--primary';

  return (
    <Modal
      title={title}
      onClose={busy ? () => {} : onCancel}
      footer={
        <div className="u-actions u-actions--8">
          <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className={confirmClass} onClick={onConfirm} disabled={busy}>
            {busy ? 'Выполнение...' : confirmLabel}
          </button>
        </div>
      }
    >
      <div className="confirm-modal__body">
        {typeof message === 'string' ? <p>{message}</p> : message}
      </div>
    </Modal>
  );
}
