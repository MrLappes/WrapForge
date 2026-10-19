import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useUiStore } from '../../lib/store/uiStore';

export function Toasts() {
  const toasts = useUiStore((state) => state.toasts);
  const dismiss = useUiStore((state) => state.dismissToast);
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => {
        const Icon =
          toast.kind === 'success'
            ? CheckCircle2
            : toast.kind === 'warning'
              ? AlertTriangle
              : toast.kind === 'error'
                ? XCircle
                : Info;
        return (
          <div className={`toast ${toast.kind}`} key={toast.id} role="status">
            <Icon size={16} style={{ flex: '0 0 auto', marginTop: 1 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{toast.title}</strong>
              {toast.detail ? <p style={{ whiteSpace: 'pre-wrap' }}>{toast.detail}</p> : null}
            </div>
            <button
              type="button"
              className="icon-btn toast-close"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
