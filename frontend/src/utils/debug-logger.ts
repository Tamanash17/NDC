/**
 * Debug logger that sends logs to backend for file storage
 */

const API_BASE = 'https://ndc-production.up.railway.app';

interface LogData {
  [key: string]: any;
}

export class DebugLogger {
  private component: string;

  constructor(component: string) {
    this.component = component;
  }

  /**
   * Log a message with optional data to both console and file
   */
  async log(message: string, data?: LogData): Promise<void> {
    // Log to console
    console.log(`[${this.component}] ${message}`);
    if (data) {
      console.log(`[${this.component}] Data:`, data);
    }

    // Send to backend for file logging
    try {
      await fetch(`${API_BASE}/api/debug/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          component: this.component,
          message,
          data: data || {}
        })
      });
    } catch (error) {
      console.error('[DebugLogger] Failed to send log to backend:', error);
    }
  }

  /**
   * Log multiple related entries as a group
   */
  async logGroup(title: string, entries: Array<{ label: string; value: any }>): Promise<void> {
    console.group(`[${this.component}] ${title}`);
    entries.forEach(({ label, value }) => {
      console.log(`${label}:`, value);
    });
    console.groupEnd();

    // Send to backend
    const data = entries.reduce((acc, { label, value }) => {
      acc[label] = value;
      return acc;
    }, {} as LogData);

    await this.log(title, data);
  }

  /**
   * Log an error
   */
  async error(message: string, error?: Error | any): Promise<void> {
    console.error(`[${this.component}] ERROR: ${message}`, error);

    await this.log(`ERROR: ${message}`, {
      error: error?.message || String(error),
      stack: error?.stack
    });
  }

  /**
   * Log a warning
   */
  async warn(message: string, data?: LogData): Promise<void> {
    console.warn(`[${this.component}] WARNING: ${message}`, data);
    await this.log(`WARNING: ${message}`, data);
  }
}

/**
 * Create a logger instance for a component
 */
export function createLogger(component: string): DebugLogger {
  return new DebugLogger(component);
}
