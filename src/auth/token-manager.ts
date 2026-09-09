import { AuthError } from "../lib/errors.js";
import { TOKEN_REFRESH_BUFFER_SECONDS } from "../lib/constants.js";
import { getLogger } from "../lib/logger.js";
import { withRetry, defaultRetryable } from "../lib/retry.js";
import { fetchAccessToken } from "./dingtalk-auth.js";
import type { TokenCache } from "./types.js";

/**
 * Singleton token manager for DingTalk access tokens.
 *
 * Responsibilities:
 * - Fetch access tokens from DingTalk API
 * - Cache tokens in memory with expiry tracking
 * - Preemptively refresh when within the configured buffer window
 * - Prevent concurrent refresh storms using a Promise-based lock
 *
 * All client modules should call `tokenManager.getToken()` and never
 * interact with the auth API directly.
 */
class TokenManager {
  private cache: TokenCache | null = null;
  private refreshPromise: Promise<string> | null = null;

  /**
   * Returns a valid access token, fetching or refreshing if necessary.
   */
  async getToken(): Promise<string> {
    const logger = getLogger();

    // Check if cached token is still valid
    if (this.cache) {
      const remainingMs = this.cache.expiresAt - Date.now();
      const bufferMs = TOKEN_REFRESH_BUFFER_SECONDS * 1000;

      if (remainingMs > bufferMs) {
        logger.debug(
          { remainingMs },
          "Using cached access token",
        );
        return this.cache.token;
      }

      logger.debug(
        { remainingMs, bufferMs },
        "Token near expiry, refreshing...",
      );
    }

    // If a refresh is already in progress, wait for it
    if (this.refreshPromise) {
      logger.debug("Waiting for in-progress token refresh...");
      return this.refreshPromise;
    }

    // Start a new refresh
    this.refreshPromise = this.refresh();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  /**
   * Performs the actual token refresh with retry.
   */
  private async refresh(): Promise<string> {
    const logger = getLogger();

    try {
      const response = await withRetry(
        () => fetchAccessToken(),
        {
          maxRetries: 3,
          baseDelayMs: 1000,
          retryable: (err) => {
            // Don't retry on auth errors (bad credentials)
            if (err instanceof AuthError) return false;
            return defaultRetryable(err);
          },
        },
      );

      this.cache = {
        token: response.accessToken,
        // expireIn is in seconds, convert to absolute ms timestamp
        expiresAt: Date.now() + response.expireIn * 1000,
      };

      logger.info(
        { expiresAt: new Date(this.cache.expiresAt).toISOString() },
        "Access token cached",
      );

      return this.cache.token;
    } catch (err) {
      logger.error({ err }, "Failed to refresh access token");
      throw err;
    }
  }

  /**
   * Clears the cached token (useful for manual invalidation or testing).
   */
  clearCache(): void {
    this.cache = null;
    this.refreshPromise = null;
  }

  /**
   * Returns the current cache state (useful for testing).
   */
  getCache(): TokenCache | null {
    return this.cache;
  }
}

/** Singleton instance. */
export const tokenManager = new TokenManager();