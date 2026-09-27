import React from 'react'
import { motion } from 'framer-motion'
import ErrorPage from '@/pages/errors/ErrorPage'

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
 *
 * The fallback is the app's one ErrorPage treatment (500-shaped — a render
 * crash *is* "something broke"), not a second visual style for errors. The
 * boundary mounts outside <RouterProvider>, so navigation buttons are
 * replaced by a reload action and the ⓘ panel carries the underlying message.
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
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="min-h-screen w-full bg-[var(--bg-base)] flex items-center justify-center"
        >
          <ErrorPage
            status={500}
            message={this.state.error?.message}
            onRetry={this.handleReset}
            actions={
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={this.handleReload}
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[var(--bg-elevated)]
                           text-sm font-semibold text-[var(--text-primary)] border border-[var(--border)]
                           active:bg-[var(--bg-surface)] transition-colors
                           focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              >
                Reload app
              </motion.button>
            }
          />
        </motion.div>
      )
    }

    return this.props.children
  }
}
