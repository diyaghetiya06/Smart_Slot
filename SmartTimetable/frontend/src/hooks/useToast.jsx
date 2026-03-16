import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toastClass } from "@/components/ui/toast";

const ToastContext = createContext(null);

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((payload) => {
    const id = ++toastId;
    const item = {
      id,
      title: payload?.title || "Notice",
      description: payload?.description || "",
      variant: payload?.variant || "default",
    };

    setToasts((prev) => [...prev, item]);
    setTimeout(() => dismiss(id), payload?.duration ?? 3500);
    return id;
  }, [dismiss]);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  useEffect(() => {
    const handler = (event) => {
      toast(event.detail || {});
    };

    window.addEventListener("app-toast", handler);
    return () => window.removeEventListener("app-toast", handler);
  }, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2 px-3 md:px-0">
        {toasts.map((item) => (
          <div
            key={item.id}
            role="status"
            className={`rounded-lg border p-3 shadow-lg backdrop-blur ${toastClass(item.variant)}`}
          >
            <p className="text-sm font-semibold">{item.title}</p>
            {item.description ? <p className="mt-1 text-sm opacity-90">{item.description}</p> : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider.");
  }
  return context;
}
