import { useState, useCallback, useEffect, createContext, useContext } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Toast, type ToastData, type ToastType } from './Toast'
import { uid } from '@/lib/utils'

interface ToasterContextValue {
  toast: (message: string, type?: ToastType, duration?: number) => void
}

const ToasterContext = createContext<ToasterContextValue>({ toast: () => {} })
export const useToast = () => useContext(ToasterContext)

export function Toaster({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback((message: string, type: ToastType = 'info', duration = 3500) => {
    const id = uid('toast')
    setToasts((prev) => [...prev, { id, type, message, duration }])
    setTimeout(() => dismiss(id), duration)
  }, [dismiss])

  return (
    <ToasterContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
        <div className="pointer-events-auto flex flex-col gap-2">
          <AnimatePresence mode="popLayout">
            {toasts.map((t) => (
              <Toast key={t.id} {...t} onDismiss={dismiss} />
            ))}
          </AnimatePresence>
        </div>
      </div>
    </ToasterContext.Provider>
  )
}