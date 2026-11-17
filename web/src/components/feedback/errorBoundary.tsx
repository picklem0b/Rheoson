import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ErrorCodeChip } from './errorCodeChip'

interface State {
  failed: boolean
}

/**
 * The last net.
 *
 * A render error is a bug, so it is reported with the generic code and a reload
 * rather than a stack trace. Everything recoverable is handled where it happened;
 * this exists so a blank page never becomes the whole answer.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      JSON.stringify({ level: 'error', message: 'render failed', error: error.message, stack: info.componentStack }),
    )
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-semibold">This screen could not be drawn</h1>
        <p className="text-sm text-muted-foreground">
          Reloading usually fixes it. If it comes back, the code below names the failure.
        </p>
        <ErrorCodeChip code="CEX01" />
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="text-sm text-primary underline underline-offset-4"
        >
          Reload
        </button>
      </main>
    )
  }
}
