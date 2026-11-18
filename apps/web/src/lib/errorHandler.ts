import { logger } from './logger';

let _initialized = false;

export function initErrorHandler() {
  if (_initialized) return;
  _initialized = true;

  // Global unhandled promise rejection handler
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (reason instanceof Error) {
      logger.error('Unhandled promise rejection', { error: reason, stack: reason.stack });
    } else {
      logger.error('Unhandled promise rejection', { reason: String(reason) });
    }
    // Prevent default browser behavior (logging to console)
    event.preventDefault();
  });

  // Global error handler for synchronous errors
  window.addEventListener('error', (event) => {
    logger.error('Global error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error,
    });
  });

  // React component error handler (catches errors not caught by ErrorBoundary)
  const originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    originalConsoleError(...args);
    // Log to our logger if it looks like a real error (not just a warning)
    const firstArg = args[0];
    if (firstArg && typeof firstArg === 'string' && firstArg.includes('Error')) {
      logger.error('Console error', { args: args.map(String) });
    }
  };
}

export function captureException(error: unknown, context?: Record<string, unknown>) {
  if (error instanceof Error) {
    logger.error('Captured exception', { error, stack: error.stack, ...context });
  } else {
    logger.error('Captured exception', { error: String(error), ...context });
  }
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info', context?: Record<string, unknown>) {
  logger[level](message, context);
}