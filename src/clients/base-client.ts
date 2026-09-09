import { tokenManager } from "../auth/token-manager.js";
import {
  DingTalkAPIError,
  RateLimitError,
  TimeoutError,
} from "../lib/errors.js";
import { getLogger } from "../lib/logger.js";
import { withRetry, defaultRetryable } from "../lib/retry.js";

export interface OldApiRequestOptions {
  body?: Record<string, string | number | boolean | undefined | null>;
  timeout?: number;
  skipRetry?: boolean;
}

export interface NewApiRequestOptions {
  timeout?: number;
  skipRetry?: boolean;
}

export abstract class BaseClient {
  protected get logger() {
    return getLogger();
  }

  /**
   * Old-style OAPI: form-encoded POST, access_token as form param.
   * Caller must provide the FULL URL (no shared baseURL).
   */
  protected async oapiRequest<T = unknown>(
    fullUrl: string,
    body: Record<string, string | number | boolean | undefined | null> = {},
    options: OldApiRequestOptions = {},
  ): Promise<T> {
    const { timeout = 30_000, skipRetry = false } = options;

    const execute = async (): Promise<T> => {
      const token = await tokenManager.getToken();
      const formBody = new URLSearchParams();
      formBody.set("access_token", token);
      for (const [key, value] of Object.entries(body)) {
        if (value !== undefined && value !== null) formBody.set(key, String(value));
      }
      this.logger.debug({ url: fullUrl }, "DingTalk OAPI request");
      const response = await fetch(fullUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
        body: formBody.toString(),
        signal: AbortSignal.timeout(timeout),
      });
      const data = await response.json() as Record<string, unknown>;
      const errcode = Number(data["errcode"] ?? -1);
      if (!response.ok || errcode !== 0) {
        throw new DingTalkAPIError(
          `${data["errmsg"] ?? "Unknown error"} (errcode: ${errcode})`,
          response.status,
          String(errcode),
        );
      }
      return data as T;
    };

    if (skipRetry) return execute();
    return withRetry(execute, { maxRetries: 3, baseDelayMs: 1000 });
  }

  /**
   * Old-style OAPI over GET: access_token as query param.
   * Some legacy OAPI endpoints (e.g. /department/list) only accept GET,
   * even though the rest of the OAPI family is form-encoded POST.
   * Caller must provide the FULL URL.
   */
  protected async oapiGet<T = unknown>(
    fullUrl: string,
    params: Record<string, string | number | boolean | undefined | null> = {},
    options: OldApiRequestOptions = {},
  ): Promise<T> {
    const { timeout = 30_000, skipRetry = false } = options;

    const execute = async (): Promise<T> => {
      const token = await tokenManager.getToken();
      const search = new URLSearchParams();
      search.set("access_token", token);
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) search.set(key, String(value));
      }
      const url = fullUrl.includes("?") ? `${fullUrl}&${search}` : `${fullUrl}?${search}`;
      this.logger.debug({ url: fullUrl }, "DingTalk OAPI GET request");
      const response = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(timeout),
      });
      const data = await response.json() as Record<string, unknown>;
      const errcode = Number(data["errcode"] ?? -1);
      if (!response.ok || errcode !== 0) {
        throw new DingTalkAPIError(
          `${data["errmsg"] ?? "Unknown error"} (errcode: ${errcode})`,
          response.status,
          String(errcode),
        );
      }
      return data as T;
    };

    if (skipRetry) return execute();
    return withRetry(execute, { maxRetries: 3, baseDelayMs: 1000 });
  }

  /**
   * New-style API: JSON body, x-acs-dingtalk-access-token header.
   * Caller must provide the FULL URL.
   */
  protected async newApiRequest<T = unknown>(
    method: string,
    fullUrl: string,
    body?: unknown,
    options: NewApiRequestOptions = {},
  ): Promise<T> {
    const { timeout = 30_000, skipRetry = false } = options;

    const execute = async (): Promise<T> => {
      const token = await tokenManager.getToken();
      this.logger.debug({ method, url: fullUrl }, "DingTalk new API request");
      const response = await fetch(fullUrl, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-acs-dingtalk-access-token": token,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeout),
      });
      const data = await response.json() as Record<string, unknown>;
      if (!response.ok) {
        throw new DingTalkAPIError(
          `${data["message"] ?? data["msg"] ?? "Unknown error"} (code: ${data["code"] ?? "UNKNOWN"})`,
          response.status,
          String(data["code"] ?? ""),
          String(data["requestid"] ?? data["requestId"] ?? ""),
        );
      }
      return data as T;
    };

    if (skipRetry) return execute();
    return withRetry(execute, { maxRetries: 3, baseDelayMs: 1000 });
  }
}