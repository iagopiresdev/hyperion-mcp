/**
 * Metrics utility for hyperion-mcp
 * Provides simple performance metrics tracking
 */

import { logger } from "./logger";

const metricsLogger = logger.child({ component: "metrics" });

/**
 * Metrics data structure
 */
interface MetricsData {
  // Request metrics
  requestCount: number;
  requestsPerSecond: number;
  requestDurations: number[];

  // Tool metrics
  toolCalls: Map<string, number>;
  toolDurations: Map<string, number[]>;

  // Error metrics
  errorCount: number;
  errorsByType: Map<string, number>;

  // System metrics
  startTime: number;
  memory: {
    lastUsage: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
    };
    max: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
    };
  };
}

/**
 * Simple in-memory metrics collector
 */
class MetricsCollector {
  private data: MetricsData;
  private readonly maxSamples: number = 1000;
  private intervalId?: NodeJS.Timeout;

  constructor() {
    // Initialize metrics data
    this.data = {
      requestCount: 0,
      requestsPerSecond: 0,
      requestDurations: [],

      toolCalls: new Map(),
      toolDurations: new Map(),

      errorCount: 0,
      errorsByType: new Map(),

      startTime: Date.now(),
      memory: {
        lastUsage: {
          rss: 0,
          heapTotal: 0,
          heapUsed: 0,
          external: 0,
        },
        max: {
          rss: 0,
          heapTotal: 0,
          heapUsed: 0,
          external: 0,
        },
      },
    };

    // Start periodic collection
    this.startCollection();
  }

  /**
   * Start periodic metrics collection
   */
  private startCollection() {
    // Sample system metrics every 10 seconds
    this.intervalId = setInterval(() => {
      this.collectSystemMetrics();
      this.updateRates();
    }, 10000);

    metricsLogger.info("Metrics collection started");
  }

  /**
   * Stop metrics collection
   */
  public stopCollection() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      metricsLogger.info("Metrics collection stopped");
    }
  }

  /**
   * Collect system metrics
   */
  private collectSystemMetrics() {
    try {
      // Get memory usage
      const memoryUsage = process.memoryUsage();

      // Update current usage
      this.data.memory.lastUsage = {
        rss: memoryUsage.rss / 1024 / 1024, // MB
        heapTotal: memoryUsage.heapTotal / 1024 / 1024, // MB
        heapUsed: memoryUsage.heapUsed / 1024 / 1024, // MB
        external: memoryUsage.external / 1024 / 1024, // MB
      };

      // Update max usage
      this.data.memory.max = {
        rss: Math.max(this.data.memory.max.rss, this.data.memory.lastUsage.rss),
        heapTotal: Math.max(
          this.data.memory.max.heapTotal,
          this.data.memory.lastUsage.heapTotal
        ),
        heapUsed: Math.max(
          this.data.memory.max.heapUsed,
          this.data.memory.lastUsage.heapUsed
        ),
        external: Math.max(
          this.data.memory.max.external,
          this.data.memory.lastUsage.external
        ),
      };
    } catch (error) {
      metricsLogger.error("Error collecting system metrics", error as Error);
    }
  }

  /**
   * Update rate-based metrics
   */
  private updateRates() {
    try {
      // Calculate uptime in seconds
      const uptime = (Date.now() - this.data.startTime) / 1000;

      // Calculate requests per second
      this.data.requestsPerSecond = this.data.requestCount / uptime;
    } catch (error) {
      metricsLogger.error("Error updating rate metrics", error as Error);
    }
  }

  /**
   * Track request start
   * @returns A function to call when the request ends
   */
  public trackRequest(): () => void {
    const startTime = performance.now();
    this.data.requestCount++;

    return () => {
      const duration = performance.now() - startTime;
      this.addDuration(duration);
    };
  }

  /**
   * Track tool execution
   * @param toolName The name of the tool
   * @returns A function to call when the tool execution ends
   */
  public trackTool(toolName: string): () => void {
    const startTime = performance.now();

    // Increment tool call count
    const currentCount = this.data.toolCalls.get(toolName) || 0;
    this.data.toolCalls.set(toolName, currentCount + 1);

    return () => {
      const duration = performance.now() - startTime;
      this.addToolDuration(toolName, duration);
    };
  }

  /**
   * Track an error
   * @param errorType The type of error
   */
  public trackError(errorType: string): void {
    this.data.errorCount++;

    // Increment error type count
    const currentCount = this.data.errorsByType.get(errorType) || 0;
    this.data.errorsByType.set(errorType, currentCount + 1);
  }

  /**
   * Add a request duration sample
   * @param duration The duration in milliseconds
   */
  private addDuration(duration: number): void {
    this.data.requestDurations.push(duration);

    // Keep the array at a reasonable size
    if (this.data.requestDurations.length > this.maxSamples) {
      this.data.requestDurations.shift();
    }
  }

  /**
   * Add a tool duration sample
   * @param toolName The name of the tool
   * @param duration The duration in milliseconds
   */
  private addToolDuration(toolName: string, duration: number): void {
    // Create array for tool if it doesn't exist
    if (!this.data.toolDurations.has(toolName)) {
      this.data.toolDurations.set(toolName, []);
    }

    // Add duration
    const durations = this.data.toolDurations.get(toolName)!;
    durations.push(duration);

    // Keep the array at a reasonable size
    if (durations.length > this.maxSamples) {
      durations.shift();
    }
  }

  /**
   * Get metrics summary
   * @returns Metrics summary object
   */
  public getMetrics() {
    try {
      // Calculate average request duration
      const avgRequestDuration =
        this.data.requestDurations.length > 0
          ? this.data.requestDurations.reduce((a, b) => a + b, 0) /
            this.data.requestDurations.length
          : 0;

      // Prepare tool metrics
      const toolMetrics: Record<
        string,
        { calls: number; avgDuration: number }
      > = {};
      this.data.toolCalls.forEach((count, tool) => {
        const durations = this.data.toolDurations.get(tool) || [];
        const avgDuration =
          durations.length > 0
            ? durations.reduce((a, b) => a + b, 0) / durations.length
            : 0;

        toolMetrics[tool] = {
          calls: count,
          avgDuration,
        };
      });

      // Prepare error metrics
      const errorMetrics: Record<string, number> = {};
      this.data.errorsByType.forEach((count, type) => {
        errorMetrics[type] = count;
      });

      // Calculate uptime
      const uptime = (Date.now() - this.data.startTime) / 1000;

      return {
        uptime: Math.round(uptime),
        requests: {
          total: this.data.requestCount,
          perSecond: this.data.requestsPerSecond.toFixed(2),
          avgDuration: avgRequestDuration.toFixed(2),
        },
        tools: toolMetrics,
        errors: {
          total: this.data.errorCount,
          byType: errorMetrics,
        },
        memory: {
          current: {
            rss: this.data.memory.lastUsage.rss.toFixed(2),
            heapTotal: this.data.memory.lastUsage.heapTotal.toFixed(2),
            heapUsed: this.data.memory.lastUsage.heapUsed.toFixed(2),
          },
          max: {
            rss: this.data.memory.max.rss.toFixed(2),
            heapTotal: this.data.memory.max.heapTotal.toFixed(2),
            heapUsed: this.data.memory.max.heapUsed.toFixed(2),
          },
        },
      };
    } catch (error) {
      metricsLogger.error("Error generating metrics summary", error as Error);
      return { error: "Failed to generate metrics" };
    }
  }
}

// Export the metrics collector singleton
export const metrics = new MetricsCollector();
