import { motion } from 'framer-motion'
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastData {
  id: string
  type: ToastType
  message: string
  duration?: number
}

interface ToastProps extends ToastData {
  onDismiss: (id: string) => void
}

const icons = {
  success: <CheckCircle className="w-4 h-4 text-green-400" />,
  error:   <XCircle     className="w-4 h-4 text-red-400" />,
  info:    <Info        className="w-4 h-4 text-blue-400" />,
  warning: <AlertTriangle className="w-4 h-4 text-yellow-400" />,
}

const styles = {
  success: 'border-green-500/20',
  error:   'border-red-500/20',
  info:    'border-blue-500/20',
  warning: 'border-yellow-500/20',
}

export function Toast({ id, type, message, onDismiss }: ToastProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0,  scale: 1 }}
      exit={{   opacity: 0, y: -10, scale: 0.95 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border',
        'glass-strong min-w-[280px] max-w-sm',
        styles[type]
      )}
    >
      {icons[type]}
      <p className="flex-1 text-sm font-medium text-[var(--text-primary)]">{message}</p>
      <button
        onClick={() => onDismiss(id)}
        className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  )
}