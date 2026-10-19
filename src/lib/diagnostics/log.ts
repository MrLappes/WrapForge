export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  detail?: string;
}

let snapshot: LogEntry[] = [];
const listeners = new Set<() => void>();

export function logEvent(level: LogLevel, message: string, detail?: string): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    detail,
  };
  snapshot = [...snapshot, entry].slice(-300);
  for (const listener of listeners) listener();
}

export function subscribeLogs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLogSnapshot(): LogEntry[] {
  return snapshot;
}

export function clearLogs(): void {
  snapshot = [];
  for (const listener of listeners) listener();
}

export function installGlobalErrorLogging(): () => void {
  const onError = (event: ErrorEvent) => {
    logEvent('error', event.message || 'Unhandled error', event.error?.stack);
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    logEvent(
      'error',
      'Unhandled promise rejection',
      reason instanceof Error ? reason.stack ?? reason.message : String(reason),
    );
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
