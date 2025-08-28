/**
 * Token bucket rate limiter implementation
 * Allows burst requests up to the bucket capacity, then enforces rate limit
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number; // tokens per millisecond
  private readonly refillInterval: number; // milliseconds between refills

  constructor(
    tokensPerSecond: number = 2,
    capacity: number = 10,
    refillInterval: number = 1000 // 1 second
  ) {
    this.capacity = capacity;
    this.tokens = capacity; // Start with full bucket
    this.refillRate = tokensPerSecond / (1000 / refillInterval);
    this.refillInterval = refillInterval;
    this.lastRefill = Date.now();
  }

  /**
   * Attempts to consume tokens from the bucket
   * @param tokens - Number of tokens to consume (default: 1)
   * @returns Promise that resolves when tokens are available
   */
  async removeTokens(tokens: number = 1): Promise<void> {
    return new Promise((resolve) => {
      const checkTokens = () => {
        this.refillTokens();

        if (this.tokens >= tokens) {
          this.tokens -= tokens;
          resolve();
          return;
        }

        // Not enough tokens, wait and try again
        const waitTime = this.calculateWaitTime(tokens);
        setTimeout(checkTokens, waitTime);
      };

      checkTokens();
    });
  }

  /**
   * Checks if tokens are immediately available without consuming them
   * @param tokens - Number of tokens to check for
   * @returns True if tokens are available, false otherwise
   */
  hasTokens(tokens: number = 1): boolean {
    this.refillTokens();
    return this.tokens >= tokens;
  }

  /**
   * Gets the current number of available tokens
   * @returns Current token count
   */
  getAvailableTokens(): number {
    this.refillTokens();
    return Math.floor(this.tokens);
  }

  /**
   * Gets the estimated wait time for a number of tokens
   * @param tokens - Number of tokens needed
   * @returns Wait time in milliseconds
   */
  getWaitTime(tokens: number = 1): number {
    this.refillTokens();
    
    if (this.tokens >= tokens) {
      return 0;
    }
    
    return this.calculateWaitTime(tokens);
  }

  /**
   * Resets the rate limiter to full capacity
   */
  reset(): void {
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Refills tokens based on elapsed time
   * @private
   */
  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;

    if (elapsed >= this.refillInterval) {
      const tokensToAdd = this.refillRate * elapsed;
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  /**
   * Calculates the wait time needed for a number of tokens
   * @param tokens - Number of tokens needed
   * @returns Wait time in milliseconds
   * @private
   */
  private calculateWaitTime(tokens: number): number {
    const tokensNeeded = tokens - this.tokens;
    const timeNeeded = tokensNeeded / this.refillRate;
    return Math.max(100, Math.ceil(timeNeeded)); // Minimum 100ms wait
  }
}

/**
 * Singleton instance of the rate limiter for API requests
 * Configured for 2 requests per second with burst capacity of 10
 */
export const apiRateLimiter = new RateLimiter(2, 10, 1000);

/**
 * Creates a rate-limited version of a function
 * @param fn - Function to rate limit
 * @param limiter - Rate limiter instance to use
 * @returns Rate-limited function
 */
export function rateLimit<T extends (...args: any[]) => any>(
  fn: T,
  limiter: RateLimiter = apiRateLimiter
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    await limiter.removeTokens(1);
    return fn(...args);
  }) as T;
}