import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Test helpers for MSW-based HTTP mocking.
 *
 * We use a simple fetch mock approach via vitest instead of MSW
 * to keep things lightweight and avoid MSW's server setup complexity.
 */

/**
 * Creates a mock fetch that returns the given response.
 */
export function mockFetch(
  responseBody: unknown,
  status = 200,
  headers: Record<string, string> = { "content-type": "application/json" },
): void {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: () => Promise.resolve(responseBody),
    text: () =>
      Promise.resolve(
        typeof responseBody === "string"
          ? responseBody
          : JSON.stringify(responseBody),
      ),
  });
}

/**
 * Creates a mock fetch that throws an error.
 */
export function mockFetchError(error: Error): void {
  globalThis.fetch = vi.fn().mockRejectedValue(error);
}

/**
 * Resets the fetch mock and other global state.
 */
export function resetMocks(): void {
  vi.restoreAllMocks();
}