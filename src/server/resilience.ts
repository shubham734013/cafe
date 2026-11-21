/**
 * Resilience utilities for CafeOS:
 * - Exponential backoff with jitter
 * - Bounded retries for idempotent calls
 * - Circuit breaker pattern for external third parties (Cashfree, Brevo)
 * - Safe fallback execution ensuring external failures never block core POS or customer flows
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 200,
    maxDelayMs = 2000,
    backoffFactor = 2,
  } = options;

  let attempt = 0;
  let delay = initialDelayMs;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      attempt++;
      if (attempt >= maxRetries) {
        throw error;
      }
      // Add full jitter to prevent thundering herd
      const jitter = Math.random() * delay;
      await new Promise((resolve) => setTimeout(resolve, jitter));
      delay = Math.min(delay * backoffFactor, maxDelayMs);
    }
  }
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  failureThreshold?: number; // Failures before opening circuit
  resetTimeoutMs?: number;   // Time to wait before testing (half-open)
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  public readonly name: string;

  constructor(name: string, options: CircuitBreakerOptions = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30_000;
  }

  public getState(): CircuitState {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
      }
    }
    return this.state;
  }

  public async execute<T>(action: () => Promise<T>, fallback?: () => Promise<T> | T): Promise<T> {
    const currentState = this.getState();

    if (currentState === 'OPEN') {
      if (fallback) {
        return fallback();
      }
      throw new Error(`CircuitBreaker [${this.name}] is OPEN. Fast failing external request.`);
    }

    try {
      const result = await action();
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failureCount = 0;
      }
      return result;
    } catch (err) {
      this.failureCount++;
      this.lastFailureTime = Date.now();
      if (this.failureCount >= this.failureThreshold || this.state === 'HALF_OPEN') {
        this.state = 'OPEN';
        console.warn(`[CircuitBreaker] ${this.name} tripped to OPEN after ${this.failureCount} consecutive failures.`);
      }
      if (fallback) {
        return fallback();
      }
      throw err;
    }
  }
}

export const cashfreeCircuitBreaker = new CircuitBreaker('CashfreeGateway', {
  failureThreshold: 3,
  resetTimeoutMs: 20_000,
});

export const brevoCircuitBreaker = new CircuitBreaker('BrevoEmail', {
  failureThreshold: 3,
  resetTimeoutMs: 30_000,
});

export const zomatoCircuitBreaker = new CircuitBreaker('ZomatoPartnerAPI', {
  failureThreshold: 3,
  resetTimeoutMs: 30_000,
});

export const swiggyCircuitBreaker = new CircuitBreaker('SwiggyPartnerAPI', {
  failureThreshold: 3,
  resetTimeoutMs: 30_000,
});
