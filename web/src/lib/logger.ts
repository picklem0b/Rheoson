type LogLevel = 'debug' | 'info' | 'warning' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 500;
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private isProd = import.meta.env.PROD;
  private remoteEndpoint = import.meta.env.VITE_ERROR_ENDPOINT;

  constructor() {
    if (this.isProd && this.remoteEndpoint) {
      this.flushInterval = setInterval(() => this.flush(), 30_000);
    }
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    if (!this.isProd) {
      const style = level === 'error' ? 'color: #ef4444' : level === 'warning' ? 'color: #f59e0b' : 'color: #64748b';
      const consoleLevel = level === 'warning' ? 'warn' : level;
      console[consoleLevel](`%c[${level.toUpperCase()}] ${message}`, style, context ?? '');
    }

    if (level === 'error' && this.isProd && this.remoteEndpoint) {
      this.sendToRemote(entry);
    }
  }

  private async sendToRemote(entry: LogEntry) {
    try {
      await fetch(this.remoteEndpoint!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
        keepalive: true,
      });
    } catch {
      // Silently fail - don't want logging to break the app
    }
  }

  private async flush() {
    if (!this.remoteEndpoint || this.logs.length === 0) return;
    const toSend = [...this.logs];
    this.logs = [];
    try {
      await fetch(this.remoteEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs: toSend }),
        keepalive: true,
      });
    } catch {
      // Silently fail
    }
  }

  debug(message: string, context?: Record<string, unknown>) {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>) {
    this.log('info', message, context);
  }

  warning(message: string, context?: Record<string, unknown>) {
    this.log('warning', message, context);
  }

  error(message: string, context?: Record<string, unknown>) {
    this.log('error', message, context);
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  destroy() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.flush();
  }
}

export const logger = new Logger();