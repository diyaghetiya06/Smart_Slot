import { createContext, useCallback, useContext, useState } from "react";

// ── Context ───────────────────────────────────────────────────────────────────
const ToastContext = createContext(null);

let _id = 0;

// ── Provider ──────────────────────────────────────────────────────────────────
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(({ type = "info", message, duration = 4000 }) => {
    const id = ++_id;
    setToasts((prev) => [...prev, { id, type, message }]);
    if (duration > 0) setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");

  return {
    success: (message, opts) => ctx({ type: "success", message, ...opts }),
    error:   (message, opts) => ctx({ type: "error",   message, ...opts }),
    info:    (message, opts) => ctx({ type: "info",    message, ...opts }),
    warn:    (message, opts) => ctx({ type: "warn",    message, ...opts }),
    dismiss: ctx,
  };
}

// ── Styles per type ───────────────────────────────────────────────────────────
const STYLES = {
  success: "border-green-300 bg-green-50 text-green-800 dark:bg-green-950/50 dark:text-green-300 dark:border-green-700",
  error:   "border-red-300 bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-300 dark:border-red-700",
  warn:    "border-yellow-300 bg-yellow-50 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300 dark:border-yellow-700",
  info:    "border-blue-300 bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-700",
};

const ICONS = {
  success: "✓",
  error:   "✕",
  warn:    "⚠",
  info:    "ℹ",
};

// ── Toaster ───────────────────────────────────────────────────────────────────
function Toaster({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]"
    >
      {toasts.map(({ id, type, message }) => (
        <div
          key={id}
          className={[
            "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg",
            "animate-in slide-in-from-right-4 fade-in duration-300",
            STYLES[type] ?? STYLES.info,
          ].join(" ")}
          role="alert"
        >
          <span className="mt-0.5 shrink-0 font-bold">{ICONS[type]}</span>
          <span className="flex-1 leading-snug">{message}</span>
          <button
            onClick={() => onDismiss(id)}
            className="ml-1 shrink-0 opacity-60 hover:opacity-100 transition-opacity text-base leading-none"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
