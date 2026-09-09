import { getLogger } from "./logger.js";

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3). */
  maxRetries?: number;
  /** Base delay in milliseconds (default: 1000). */
  baseDelayMs?: number;
  /** Backoff multiplier (default: 2). */
  backoffMultiplier?: number;
  /** Maximum jitter as a fraction of the delay (default: 0.2). */
  jitter?: number;
  /**
   * Predicate: return true if the error is retryable.
   * Default: retries on any error.
   */
  retryable?: (error: unknown) => boolean;
}

/**
 * Executes an async function with exponential backoff retry.
 *
 * @param fn          The async function to retry
 * @param options     Retry configuration
 * @returns           The function's resolved value
 * @throws            The last error if all retries are exhausted
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    backoffMultiplier = 2,
    jitter = 0.2,
    retryable = () => true,
  } = options;

  const logger = getLogger();
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !retryable(error)) {
        throw error;
      }

      const delay =
        baseDelayMs * Math.pow(backoffMultiplier, attempt);
      const jitterAmount = delay * jitter * (Math.random() * 2 - 1);
      const waitMs = Math.round(delay + jitterAmount);

      logger.warn(
        { attempt: attempt + 1, maxRetries, waitMs },
        `Request failed, retrying in ${waitMs}ms...`,
      );

      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  throw lastError;
}

/**
 * Default retryable predicate: retries on rate limit (429), server errors (5xx),
 * and network/abort errors.
 */
export function defaultRetryable(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }
  if (error instanceof TypeError) {
    return true; // network errors
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error
  ) {
    const status = (error as { statusCode: number }).statusCode;
    return status === 429 || status >= 500;
  }
  return false;
}