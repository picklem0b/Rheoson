import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { HardDrives, WifiSlash, ArrowClockwise, X } from '@phosphor-icons/react';
import { isOnline, checkNow, onStatusChange } from '@/lib/network';
import { cn } from '@/lib/utils';

interface NetworkErrorBannerProps {
  onDismiss?: () => void;
}

/**
 * Backend-down banner. Pure display — all detection lives in the single
 * health poller in lib/network.ts (14-min cadence, fast recovery backoff).
 * This component just mirrors that state and offers a Retry button.
 */
export function NetworkErrorBanner({
  onDismiss,
}: NetworkErrorBannerProps) {
  const [isBackendDown, setIsBackendDown] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [wasOnline, setWasOnline] = useState(isOnline());

  // Mirror the shared poller's status instead of running a private one.
  useEffect(
    () =>
      onStatusChange((online) => {
        setIsBackendDown(!online);
        setWasOnline(online);
      }),
    []
  );

  const checkHealth = useCallback(async () => {
    if (isChecking) return;
    setIsChecking(true);
    checkNow(); // pings immediately; onStatusChange above updates state
    // Hold the spinner briefly so the tap always gives visible feedback.
    setTimeout(() => setIsChecking(false), 800);
  }, [isChecking]);

  if (!isBackendDown) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        'fixed z-[150] flex items-center gap-3 px-4 py-3 rounded-2xl border',
        'bg-[var(--warning-bg)] border-[var(--warning)]/20',
        'bottom-[calc(var(--player-height,72px)+var(--nav-height,64px)+12px)] inset-x-4',
        'mx-4 mb-2 max-w-xl sm:bottom-5 sm:right-5 sm:left-auto sm:mx-0 sm:mb-0',
        'pointer-events-auto'
      )}
    >
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--warning)]/20 flex items-center justify-center">
        {wasOnline ? (
          <HardDrives className="w-4 h-4 text-[var(--warning-text)]" />
        ) : (
          <WifiSlash className="w-4 h-4 text-[var(--warning-text)]" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)]">
          {wasOnline ? "Can't reach the server" : "You're offline"}
        </p>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          {wasOnline
            ? 'The backend may be waking up. Retrying automatically…'
            : 'Check your connection. Changes will sync when online.'}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => void checkHealth()}
          disabled={isChecking}
          className="px-3 py-1.5 rounded-full text-xs font-semibold text-[var(--text-primary)] bg-[var(--bg-elevated)] border border-[var(--border)] flex items-center gap-1.5 disabled:opacity-50"
        >
          {isChecking ? (
            <ArrowClockwise className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <ArrowClockwise className="w-3.5 h-3.5" />
          )}
          {isChecking ? 'Checking…' : 'Retry'}
        </motion.button>
        {onDismiss && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onDismiss}
            className="p-1.5 rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
          >
            <X className="w-4 h-4" />
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}