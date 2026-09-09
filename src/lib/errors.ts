/**
 * Base error for all gateway-specific errors.
 */
export class GatewayError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.code = code;
    this.name = "GatewayError";
  }
}

/**
 * Thrown when .env.yml is missing, unparseable, or fails validation.
 */
export class ConfigError extends GatewayError {
  constructor(message: string) {
    super(message, "CONFIG_ERROR");
    this.name = "ConfigError";
  }
}

/**
 * Thrown when DingTalk API returns an error response.
 */
export class DingTalkAPIError extends GatewayError {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly dingtalkCode?: string,
    public readonly requestId?: string,
  ) {
    super(message, "DINGTALK_API_ERROR");
    this.name = "DingTalkAPIError";
  }
}

/**
 * Thrown when authentication fails (bad credentials, token expired).
 */
export class AuthError extends DingTalkAPIError {
  constructor(
    message: string,
    statusCode: number,
    dingtalkCode?: string,
    requestId?: string,
  ) {
    super(message, statusCode, dingtalkCode, requestId);
    this.name = "AuthError";
    (this as { code: string }).code = "AUTH_ERROR";
  }
}

/**
 * Thrown when rate-limited by DingTalk API (429).
 */
export class RateLimitError extends DingTalkAPIError {
  constructor(
    message: string,
    public readonly retryAfter?: number,
    requestId?: string,
  ) {
    super(message, 429, "RATE_LIMITED", requestId);
    this.name = "RateLimitError";
    (this as { code: string }).code = "RATE_LIMIT_ERROR";
  }
}

/**
 * Thrown when a request times out.
 */
export class TimeoutError extends GatewayError {
  constructor(message: string) {
    super(message, "TIMEOUT_ERROR");
    this.name = "TimeoutError";
  }
}

/**
 * Thrown when a lookup finds no matching entity (e.g. no user for a mobile).
 */
export class NotFoundError extends GatewayError {
  constructor(message: string) {
    super(message, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}