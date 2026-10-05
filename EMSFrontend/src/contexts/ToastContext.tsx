import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ToastContainer } from '../components/ui/Toast'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
}

interface ToastContextValue {
  toasts: Toast[]
  addToast: (type: ToastType, message: string) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

/**
 * EMS toast bus (EMSFrontend.md §10). Ported verbatim from the sibling
 * `ToastContext` — same 4s auto-dismiss, same portal container mounted inside
 * the provider so toasts are never silently dropped.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = crypto.randomUUID()
    setToasts((prev) => [...prev, { id, type, message }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

/** Test hook — resets the toast queue between tests. */
export function __resetToastsForTests() {
  return []
}

export function useToastQueue() {
  return useToast()
}

export type { Toast }

export function useToastListener(_handler: (toast: Toast) => void) {
  const ref = useRef(_handler)
  useEffect(() => {
    ref.current = _handler
  }, [_handler])
  return ref
}
