import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { motion } from 'framer-motion'

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * ErrorBoundary — catches React rendering errors and shows a recovery UI.
 * Wraps critical sections like the player, search results, etc.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Rheoson] ErrorBoundary caught:', error, info.componentStack)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-12 px-6 text-center gap-4"
        >
          <div className="w-16 h-16 rounded-3xl bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-red-400" />
          </div>
          <div>
            <h3 className="font-bold text-[var(--text-primary)]">Something went wrong</h3>
            <p className="text-sm text-[var(--text-muted)] mt-1 max-w-xs">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
          </div>
          <div className="flex gap-2">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={this.handleReset}
              className="px-4 py-2 rounded-full bg-[var(--bg-elevated)] text-sm font-semibold text-[var(--text-primary)] border border-[var(--border)]"
            >
              Try again
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={this.handleReload}
              className="px-4 py-2 rounded-full bg-[var(--accent)] text-sm font-semibold text-white flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reload
            </motion.button>
          </div>
        </motion.div>
      )
    }

    return this.props.children
  }
}
