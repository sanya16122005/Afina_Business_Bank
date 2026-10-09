import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const DEFAULT_DURATION = 4000;
const ICONS = {
  success: <CheckCircle2 size={16} />,
  danger: <XCircle size={16} />,
  warning: <AlertTriangle size={16} />,
  info: <Info size={16} />,
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counterRef = useRef(0);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const push = useCallback((tone, message, opts = {}) => {
    const id = ++counterRef.current;
    const duration = opts.duration ?? DEFAULT_DURATION;
    setToasts((prev) => [...prev, { id, tone, message }]);
    if (duration > 0) {
      const timer = setTimeout(() => dismiss(id), duration);
      timersRef.current.set(id, timer);
    }
    return id;
  }, [dismiss]);

  // Очищаем таймеры при размонтировании.
  useEffect(() => () => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current.clear();
  }, []);

  // Обёртка над промисом: показываем "loading" и заменяем на success/error
  // в зависимости от исхода. Возвращаем сам промис, чтобы можно было `await`.
  const promiseHelper = useCallback(async (promise, { loading, success, error } = {}) => {
    const id = loading ? push('info', loading, { duration: 0 }) : null;
    try {
      const result = await promise;
      if (id) dismiss(id);
      const successMsg = typeof success === 'function' ? success(result) : success;
      if (successMsg) push('success', successMsg);
      return result;
    } catch (err) {
      if (id) dismiss(id);
      const errorMsg = typeof error === 'function'
        ? error(err)
        : (error || err?.response?.data?.detail || err?.response?.data?.message || 'Ошибка');
      if (errorMsg) push('danger', errorMsg);
      throw err;
    }
  }, [push, dismiss]);

  // Стабильная ссылка: иначе любой консьюмер, использующий toast в deps
  // useEffect/useCallback, перезапускается на каждом рендере провайдера.
  const toast = useMemo(() => ({
    success: (msg, opts) => push('success', msg, opts),
    danger:  (msg, opts) => push('danger', msg, opts),
    warning: (msg, opts) => push('warning', msg, opts),
    info:    (msg, opts) => push('info', msg, opts),
    promise: promiseHelper,
    dismiss,
  }), [push, promiseHelper, dismiss]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-stack" role="region" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone}`} role="status">
            <span className="toast__icon">{ICONS[t.tone] || ICONS.info}</span>
            <span className="toast__msg">{t.message}</span>
            <button
              type="button"
              className="toast__close"
              onClick={() => dismiss(t.id)}
              aria-label="Закрыть уведомление"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Безопасный fallback вне провайдера.
    const noop = () => 0;
    return {
      success: noop,
      danger: noop,
      warning: noop,
      info: noop,
      promise: async (p) => p,
      dismiss: noop,
    };
  }
  return ctx;
}
