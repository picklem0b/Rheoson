import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Server, WifiOff, RefreshCw, X } from 'lucide-react';
import { isOnline } from '@/lib/network';
import { cn } from '@/lib/utils';

interface NetworkErrorBannerProps {
  onDismiss?: () => void;
  pollInterval?: number;
  healthEndpoint?: string;
}

export function NetworkErrorBanner({
  onDismiss,
  pollInterval = 10_000,
  healthEndpoint,
}: NetworkErrorBannerProps) {
  const [isBackendDown, setIsBackendDown] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [wasOnline, setWasOnline] = useState(isOnline());

  const checkHealth = useCallback(async () => {
    if (isChecking) return;
    setIsChecking(true);

    try {
      const baseUrl = import.meta.env.DEV ? '' : import.meta.env.VITE_API_URL ?? '';
      const url = healthEndpoint ?? `${baseUrl}/api/health`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5_000);

      const res = await fetch(url, {
        signal: controller.signal,
        cache: 'no-cache',
      });

      clearTimeout(timeoutId);
      const wasDown = isBackendDown;
      setIsBackendDown(!res.ok);
      if (wasDown && res.ok) {
        // Backend recovered
        setIsBackendDown(false);
      }
    } catch {
      setIsBackendDown(true);
    } finally {
      setIsChecking(false);
    }
  }, [healthEndpoint, isBackendDown]);

  useEffect(() => {
    // Initial check
    checkHealth();

    // Poll for backend health
    const interval = setInterval(checkHealth, pollInterval);

    // Also check when network comes back online
    const handleOnline = () => {
      setWasOnline(true);
      checkHealth();
    };
    const handleOffline = () => {
      setWasOnline(false);
      setIsBackendDown(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [checkHealth, pollInterval]);

  // Track online status
  useEffect(() => {
    const handleOnline = () => setWasOnline(true);
    const handleOffline = () => setWasOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isBackendDown) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        'fixed z-[150] flex items-center gap-3 px-4 py-3 rounded-2xl border',
        'bg-yellow-500/10 border-yellow-500/20',
        'bottom-[calc(var(--player-height,72px)+var(--nav-height,64px)+12px)] inset-x-4',
        'mx-4 mb-2 max-w-xl sm:bottom-5 sm:right-5 sm:left-auto sm:mx-0 sm:mb-0',
        'pointer-events-auto'
      )}
    >
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center">
        {wasOnline ? (
          <Server className="w-4 h-4 text-yellow-400" />
        ) : (
          <WifiOff className="w-4 h-4 text-yellow-400" />
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
          onClick={checkHealth}
          disabled={isChecking}
          className="px-3 py-1.5 rounded-full text-xs font-semibold text-[var(--text-primary)] bg-[var(--bg-elevated)] border border-[var(--border)] flex items-center gap-1.5 disabled:opacity-50"
        >
          {isChecking ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
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