import { describe, it, expect } from "vitest";
import {
  GatewayError,
  ConfigError,
  DingTalkAPIError,
  AuthError,
  RateLimitError,
  TimeoutError,
} from "@/lib/errors.ts";

describe("GatewayError", () => {
  it("should create a base gateway error", () => {
    const err = new GatewayError("test", "TEST_CODE");
    expect(err.message).toBe("test");
    expect(err.code).toBe("TEST_CODE");
    expect(err.name).toBe("GatewayError");
  });
});

describe("ConfigError", () => {
  it("should have CONFIG_ERROR code", () => {
    const err = new ConfigError("bad config");
    expect(err.code).toBe("CONFIG_ERROR");
    expect(err.name).toBe("ConfigError");
  });
});

describe("DingTalkAPIError", () => {
  it("should include status code and dingtalk code", () => {
    const err = new DingTalkAPIError("api error", 400, "INVALID_PARAM", "req-123");
    expect(err.statusCode).toBe(400);
    expect(err.dingtalkCode).toBe("INVALID_PARAM");
    expect(err.requestId).toBe("req-123");
    expect(err.code).toBe("DINGTALK_API_ERROR");
  });
});

describe("AuthError", () => {
  it("should have AUTH_ERROR code", () => {
    const err = new AuthError("bad credentials", 401);
    expect(err.code).toBe("AUTH_ERROR");
    expect(err.statusCode).toBe(401);
  });
});

describe("RateLimitError", () => {
  it("should include retryAfter", () => {
    const err = new RateLimitError("too many requests", 60, "req-456");
    expect(err.retryAfter).toBe(60);
    expect(err.code).toBe("RATE_LIMIT_ERROR");
    expect(err.statusCode).toBe(429);
  });
});

describe("TimeoutError", () => {
  it("should have TIMEOUT_ERROR code", () => {
    const err = new TimeoutError("timed out");
    expect(err.code).toBe("TIMEOUT_ERROR");
  });
});