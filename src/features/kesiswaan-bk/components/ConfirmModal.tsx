type Props = {
  open: boolean;
  title: string;
  message: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ConfirmModal({ open, title, message, busy = false, onCancel, onConfirm }: Props) {
  if (!open) return null;
  return (
    <div className="kb-modal-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget && !busy) onCancel();
    }}>
      <section className="kb-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="kb-confirm-title">
        <h2 id="kb-confirm-title">{title}</h2>
        <p>{message}</p>
        <div className="kb-modal-actions">
          <button className="kb-secondary" type="button" onClick={onCancel} disabled={busy}>Batal</button>
          <button className="kb-mini danger" type="button" onClick={onConfirm} disabled={busy}>{busy ? "Memproses..." : "Ya, hapus"}</button>
        </div>
      </section>
    </div>
  );
}
