//
// Lightweight in-memory retry queue for Google Wallet API calls.
//
// Unlike the Apple service (which has SQLite persistence), the Google service
// is stateless. This queue retries transient failures in-process only.
// It covers network blips and rate-limit (429) responses during broadcasts.
//

export type RetryEntry = {
  id: number;
  operation: () => Promise<void>;
  description: string;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: number;
  lastError?: string;
  createdAt: number;
};

export class RetryQueue {
  private queue: RetryEntry[] = [];
  private nextId = 1;
  private timer: ReturnType<typeof setInterval> | null = null;
  private intervalMs: number;
  private maxAttempts: number;

  constructor(opts?: { intervalMs?: number; maxAttempts?: number }) {
    this.intervalMs = opts?.intervalMs ?? 15_000;
    this.maxAttempts = opts?.maxAttempts ?? 4;
  }

  start(): void {
    if (this.timer) return;
    console.log(`[gw-retry] Starting retry loop (interval: ${this.intervalMs}ms)`);
    this.timer = setInterval(() => this.processQueue(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("[gw-retry] Stopped retry loop");
    }
  }

  enqueue(operation: () => Promise<void>, description: string, error: string): void {
    const now = Date.now();
    this.queue.push({
      id: this.nextId++,
      operation,
      description,
      attempts: 0,
      maxAttempts: this.maxAttempts,
      nextRetryAt: now + this.backoffDelay(0),
      lastError: error,
      createdAt: now,
    });
  }

  private backoffDelay(attempt: number): number {
    return Math.pow(2, attempt) * 3_000;
  }

  async processQueue(): Promise<{ retried: number; succeeded: number; failed: number }> {
    const now = Date.now();
    const ready = this.queue.filter(e => e.nextRetryAt <= now && e.attempts < e.maxAttempts);
    if (ready.length === 0) return { retried: 0, succeeded: 0, failed: 0 };

    console.log(`[gw-retry] Processing ${ready.length} retry entries`);
    let succeeded = 0;
    let failed = 0;

    for (const entry of ready) {
      try {
        await entry.operation();
        this.queue = this.queue.filter(e => e.id !== entry.id);
        succeeded++;
      } catch (err: any) {
        entry.attempts++;
        entry.lastError = err.message;
        entry.nextRetryAt = now + this.backoffDelay(entry.attempts);
        failed++;

        if (entry.attempts >= entry.maxAttempts) {
          console.warn(`[gw-retry] "${entry.description}" exhausted after ${entry.attempts} attempts: ${err.message}`);
        }
      }
    }

    // Purge exhausted entries.
    this.queue = this.queue.filter(e => e.attempts < e.maxAttempts);

    console.log(`[gw-retry] Retry results: ${succeeded} succeeded, ${failed} failed`);
    return { retried: ready.length, succeeded, failed };
  }

  status(): { pending: number; descriptions: string[] } {
    const pending = this.queue.filter(e => e.attempts < e.maxAttempts);
    return {
      pending: pending.length,
      descriptions: pending.map(e => `${e.description} (attempt ${e.attempts}/${e.maxAttempts})`),
    };
  }
}
