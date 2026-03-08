/* eslint-disable react-refresh/only-export-components */
import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
    id: string;
    type: ToastType;
    message: string;
    action?: { label: string; onClick: () => void };
    duration: number;
}

interface ToastContextType {
    addToast: (toast: Omit<Toast, 'id'>) => void;
}

const ToastContext = createContext<ToastContextType>({ addToast: () => { } });

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
        const id = Date.now().toString();
        setToasts((prev) => [...prev, { ...toast, id }]);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ addToast }}>
            {children}
            <div className="toast-container">
                {toasts.map((toast) => (
                    <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
                ))}
            </div>

            <style>{`
        .toast-container {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column-reverse;
          gap: 8px;
          z-index: 300;
          pointer-events: none;
        }
        .toast {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 280px;
          max-width: 420px;
          padding: 12px 16px;
          background: var(--color-text-1);
          color: var(--color-surface);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-lg);
          font-size: var(--text-sm);
          font-family: var(--font-ui);
          pointer-events: auto;
          animation: toast-slide-in 300ms var(--spring-bouncy);
          position: relative;
          overflow: hidden;
        }
        @keyframes toast-slide-in {
          from {
            opacity: 0;
            transform: translateY(100%);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .toast-leaving {
          animation: toast-slide-out 200ms ease forwards;
        }
        @keyframes toast-slide-out {
          to {
            opacity: 0;
            transform: translateY(8px);
          }
        }
        .toast-icon { flex-shrink: 0; }
        .toast-message { flex: 1; }
        .toast-action {
          border: none;
          background: transparent;
          color: var(--color-accent);
          font-weight: 600;
          font-size: var(--text-sm);
          font-family: var(--font-ui);
          cursor: pointer;
          padding: 0;
          flex-shrink: 0;
        }
        .toast-close {
          border: none;
          background: transparent;
          color: inherit;
          opacity: 0.5;
          cursor: pointer;
          padding: 2px;
          display: flex;
          flex-shrink: 0;
        }
        .toast-close:hover { opacity: 1; }
        .toast-progress {
          position: absolute;
          bottom: 0;
          left: 0;
          height: 2px;
          background: var(--color-accent);
          border-radius: 0 0 var(--radius-md) 0;
        }
      `}</style>
        </ToastContext.Provider>
    );
}

function ToastItem({
    toast,
    onRemove,
}: {
    toast: Toast;
    onRemove: (id: string) => void;
}) {
    const [leaving, setLeaving] = useState(false);
    const [progress, setProgress] = useState(100);

    useEffect(() => {
        const interval = setInterval(() => {
            setProgress((p) => {
                const next = p - 100 / (toast.duration / 50);
                if (next <= 0) {
                    clearInterval(interval);
                    setLeaving(true);
                    setTimeout(() => onRemove(toast.id), 200);
                    return 0;
                }
                return next;
            });
        }, 50);
        return () => clearInterval(interval);
    }, [toast.duration, toast.id, onRemove]);

    const Icon =
        toast.type === 'success'
            ? CheckCircle
            : toast.type === 'error'
                ? XCircle
                : toast.type === 'warning'
                    ? AlertTriangle
                    : Info;

    const iconColor =
        toast.type === 'success'
            ? 'var(--color-teal)'
            : toast.type === 'error'
                ? 'var(--color-red)'
                : toast.type === 'warning'
                    ? 'var(--color-amber)'
                    : 'var(--color-accent)';

    return (
        <div className={`toast ${leaving ? 'toast-leaving' : ''}`}>
            <Icon size={16} className="toast-icon" color={iconColor} />
            <span className="toast-message">{toast.message}</span>
            {toast.action && (
                <button className="toast-action" onClick={toast.action.onClick}>
                    {toast.action.label}
                </button>
            )}
            <button
                className="toast-close"
                onClick={() => {
                    setLeaving(true);
                    setTimeout(() => onRemove(toast.id), 200);
                }}
            >
                <X size={14} />
            </button>
            <div
                className="toast-progress"
                style={{ width: `${progress}%`, transition: 'width 50ms linear' }}
            />
        </div>
    );
}
