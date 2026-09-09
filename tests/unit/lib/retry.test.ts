import { describe, it, expect } from "vitest";
import { withRetry, defaultRetryable } from "@/lib/retry.ts";
import { RateLimitError, DingTalkAPIError } from "@/lib/errors.ts";

describe("withRetry", () => {
  it("should return the result on first success", async () => {
    const fn = () => Promise.resolve("ok");
    const result = await withRetry(fn, { maxRetries: 2 });
    expect(result).toBe("ok");
  });

  it("should retry on failure and succeed eventually", async () => {
    let calls = 0;
    const fn = () => {
      calls++;
      if (calls < 3) return Promise.reject(new Error("fail"));
      return Promise.resolve("recovered");
    };
    const result = await withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 10,
      jitter: 0,
    });
    expect(result).toBe("recovered");
    expect(calls).toBe(3);
  });

  it("should throw after exhausting all retries", async () => {
    const fn = () => Promise.reject(new Error("always fail"));
    await expect(
      withRetry(fn, { maxRetries: 2, baseDelayMs: 10, jitter: 0 }),
    ).rejects.toThrow("always fail");
  });

  it("should not retry if predicate returns false", async () => {
    let calls = 0;
    const fn = () => {
      calls++;
      return Promise.reject(new Error("no retry"));
    };
    await expect(
      withRetry(fn, {
        maxRetries: 3,
        baseDelayMs: 10,
        retryable: () => false,
      }),
    ).rejects.toThrow("no retry");
    expect(calls).toBe(1);
  });

  it("should respect the retryable predicate", async () => {
    let calls = 0;
    const fn = () => {
      calls++;
      if (calls < 2) return Promise.reject(new Error("retry me"));
      return Promise.reject(new Error("stop"));
    };
    await expect(
      withRetry(fn, {
        maxRetries: 3,
        baseDelayMs: 10,
        jitter: 0,
        retryable: (err) => (err as Error).message !== "stop",
      }),
    ).rejects.toThrow("stop");
    expect(calls).toBe(2);
  });
});

describe("defaultRetryable", () => {
  it("should retry on 429", () => {
    expect(
      defaultRetryable(new RateLimitError("rate limited")),
    ).toBe(true);
  });

  it("should retry on 5xx", () => {
    expect(
      defaultRetryable(new DingTalkAPIError("server error", 500)),
    ).toBe(true);
    expect(
      defaultRetryable(new DingTalkAPIError("bad gateway", 502)),
    ).toBe(true);
  });

  it("should not retry on 4xx (except 429)", () => {
    expect(
      defaultRetryable(new DingTalkAPIError("not found", 404)),
    ).toBe(false);
    expect(
      defaultRetryable(new DingTalkAPIError("bad request", 400)),
    ).toBe(false);
  });
});