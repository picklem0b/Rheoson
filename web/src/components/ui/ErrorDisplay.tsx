import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCw, WifiOff, Server, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ErrorSeverity = 'error' | 'warning' | 'info';

export interface ErrorDisplayProps {
  message: string;
  severity?: ErrorSeverity;
  onRetry?: () => void;
  retryLabel?: string;
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
  icon?: React.ReactNode;
  details?: string;
}

const icons = {
  error: <AlertTriangle className="w-5 h-5 text-red-400" />,
  warning: <AlertCircle className="w-5 h-5 text-yellow-400" />,
  info: <Server className="w-5 h-5 text-blue-400" />,
};

const styles = {
  error: 'border-red-500/20 bg-red-500/5',
  warning: 'border-yellow-500/20 bg-yellow-500/5',
  info: 'border-blue-500/20 bg-blue-500/5',
};

export function ErrorDisplay({
  message,
  severity = 'error',
  onRetry,
  retryLabel = 'Try again',
  dismissible = false,
  onDismiss,
  className,
  icon,
  details,
}: ErrorDisplayProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.98 }}
      className={cn(
        'flex items-start gap-3 p-4 rounded-2xl border',
        styles[severity],
        className
      )}
    >
      <div className="flex-shrink-0 mt-0.5">{icon ?? icons[severity]}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)]">{message}</p>
        {details && (
          <p className="text-xs text-[var(--text-muted)] mt-1 font-mono">{details}</p>
        )}
        {(onRetry || dismissible) && (
          <div className="flex items-center gap-2 mt-3">
            {onRetry && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={onRetry}
                className="px-3 py-1.5 rounded-full text-xs font-semibold text-[var(--text-primary)] bg-[var(--bg-elevated)] border border-[var(--border)] flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {retryLabel}
              </motion.button>
            )}
            {dismissible && onDismiss && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={onDismiss}
                className="px-3 py-1.5 rounded-full text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                Dismiss
              </motion.button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function NetworkErrorBanner({
  onRetry,
  onDismiss,
  isOnline = true,
}: {
  onRetry?: () => void;
  onDismiss?: () => void;
  isOnline?: boolean;
}) {
  return (
    <ErrorDisplay
      message={isOnline ? "Can't reach the server — it may be waking up" : "You're offline"}
      severity="warning"
      icon={isOnline ? <Server className="w-5 h-5 text-yellow-400" /> : <WifiOff className="w-5 h-5 text-yellow-400" />}
      onRetry={onRetry}
      retryLabel="Retry"
      dismissible={!!onDismiss}
      onDismiss={onDismiss}
      className="fixed bottom-[calc(var(--player-height,72px)+var(--nav-height,64px)+12px)] inset-x-4 z-[150] mx-4 mb-2 max-w-xl sm:bottom-5 sm:right-5 sm:left-auto sm:mx-0 sm:mb-0"
    />
  );
}

export function InlineError({
  error,
  onRetry,
  retryLabel = 'Try again',
  fallbackMessage = 'Something went wrong',
}: {
  error: unknown;
  onRetry?: () => void;
  retryLabel?: string;
  fallbackMessage?: string;
}) {
  const message = error instanceof Error ? error.message : fallbackMessage;
  const details = error instanceof Error ? error.stack : undefined;

  return (
    <ErrorDisplay
      message={message}
      severity="error"
      onRetry={onRetry}
      retryLabel={retryLabel}
      details={details}
    />
  );
}

export function EmptyStateError({
  message = 'Failed to load',
  onRetry,
  retryLabel = 'Retry',
}: {
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-20 gap-4 text-center"
    >
      <div className="w-16 h-16 rounded-3xl bg-red-500/10 flex items-center justify-center">
        <AlertTriangle className="w-7 h-7 text-red-400" />
      </div>
      <div>
        <p className="font-semibold text-[var(--text-primary)]">{message}</p>
      </div>
      {onRetry && (
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onRetry}
          className="px-5 py-2 rounded-full bg-[var(--bg-elevated)] text-sm font-semibold text-[var(--text-primary)] border border-[var(--border)]"
        >
          {retryLabel}
        </motion.button>
      )}
    </motion.div>
  );
}