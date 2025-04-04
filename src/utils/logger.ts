/**
 * Simple structured logger for hyperion-mcp
 * Provides consistent log format with timestamps, levels, and structured data
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LoggerOptions {
  minLevel: LogLevel;
  enableColors: boolean;
  includeTimestamp: boolean;
  context?: Record<string, any>;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  debug: "\x1b[36m", // cyan
  info: "\x1b[32m", // green
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
  bold: "\x1b[1m",
};

export class Logger {
  private options: LoggerOptions;
  private context: Record<string, any>;

  constructor(options?: Partial<LoggerOptions>) {
    const envLogLevel = process.env.LOG_LEVEL as LogLevel;
    let minLevel: LogLevel = "info";

    if (envLogLevel && LOG_LEVELS[envLogLevel] !== undefined) {
      minLevel = envLogLevel;
    }

    this.options = {
      minLevel: options?.minLevel ?? minLevel,
      enableColors: options?.enableColors ?? true,
      includeTimestamp: options?.includeTimestamp ?? true,
      context: options?.context,
    };
    this.context = options?.context ?? {};
  }

  /**
   * Set the minimum log level
   */
  setMinLevel(level: LogLevel): void {
    this.options.minLevel = level;
  }

  /**
   * Create a child logger with additional context
   */
  child(context: Record<string, any>): Logger {
    return new Logger({
      ...this.options,
      context: {
        ...this.context,
        ...context,
      },
    });
  }

  /**
   * Log a debug message
   */
  debug(message: string, data?: Record<string, any>): void {
    this.log("debug", message, data);
  }

  /**
   * Log an info message
   */
  info(message: string, data?: Record<string, any>): void {
    this.log("info", message, data);
  }

  /**
   * Log a warning message
   */
  warn(message: string, data?: Record<string, any>): void {
    this.log("warn", message, data);
  }

  /**
   * Log an error message
   */
  error(message: string, error?: Error, data?: Record<string, any>): void {
    const errorData = error
      ? {
          message: error.message,
          stack: error.stack,
          ...data,
        }
      : data;

    this.log("error", message, errorData);
  }

  /**
   * Internal method to actually perform the logging
   */
  private log(
    level: LogLevel,
    message: string,
    data?: Record<string, any>
  ): void {
    if (LOG_LEVELS[level] < LOG_LEVELS[this.options.minLevel]) {
      return;
    }

    const timestamp = this.options.includeTimestamp
      ? new Date().toISOString()
      : undefined;
    const context =
      Object.keys(this.context).length > 0 ? this.context : undefined;

    const logEntry = {
      timestamp,
      level,
      message,
      ...(context && { context }),
      ...(data && { data }),
    };

    if (this.options.enableColors) {
      const color = COLORS[level];
      const levelString = `${color}${level.toUpperCase()}${COLORS.reset}`;
      const timestampString = timestamp
        ? `${COLORS.dim}${timestamp}${COLORS.reset} `
        : "";
      const messageString = `${color}${message}${COLORS.reset}`;

      console.log(`${timestampString}${levelString}: ${messageString}`);
      if (context || data) {
        console.log(JSON.stringify({ ...context, ...data }, null, 2));
      }
    } else {
      console.log(JSON.stringify(logEntry));
    }
  }
}

const getLogLevel = (): LogLevel => {
  const level = process.env.LOG_LEVEL as LogLevel;
  return LOG_LEVELS[level] !== undefined ? level : "info";
};

export const logger = new Logger({
  minLevel: getLogLevel(),
  enableColors: process.env.NODE_ENV !== "production",
  includeTimestamp: true,
});
