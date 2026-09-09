import { getConfig } from "../config/index.js";
import { DINGTALK_BASE_URL } from "../lib/constants.js";
import { AuthError, DingTalkAPIError } from "../lib/errors.js";
import { getLogger } from "../lib/logger.js";
import type { AccessTokenResponse } from "./types.js";

/**
 * Low-level DingTalk auth client.
 * Calls the gettoken endpoint (old-style OAPI) to obtain a fresh token.
 *
 * GET https://oapi.dingtalk.com/gettoken?appkey=XXX&appsecret=XXX
 */
export async function fetchAccessToken(): Promise<AccessTokenResponse> {
  const config = getConfig();
  const logger = getLogger();

  const params = new URLSearchParams({
    appkey: config.ClientID,
    appsecret: config.ClientSecret,
  });
  const url = `${DINGTALK_BASE_URL}/gettoken?${params.toString()}`;

  logger.debug("Fetching new access token from DingTalk...");

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Network error fetching access token: ${message}`);
    throw new AuthError(
      `Failed to connect to DingTalk auth endpoint: ${message}`,
      0,
    );
  }

  let data: Record<string, unknown>;
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new AuthError(
      `Invalid JSON response from DingTalk auth endpoint (status ${response.status})`,
      response.status,
    );
  }

  if (!response.ok || data["errcode"] !== 0) {
    const errCode = String(data["errcode"] ?? "UNKNOWN");
    const errMsg = String(data["errmsg"] ?? "Unknown error");

    logger.error(
      { status: response.status, errCode, errMsg },
      "DingTalk access token request failed",
    );

    if (response.status === 401 || response.status === 403) {
      throw new AuthError(
        `Invalid credentials: ${errMsg} (code: ${errCode})`,
        response.status,
        errCode,
      );
    }

    throw new DingTalkAPIError(
      `Access token request failed: ${errMsg} (code: ${errCode})`,
      response.status,
      errCode,
    );
  }

  const result: AccessTokenResponse = {
    accessToken: String(data["access_token"]),
    expireIn: Number(data["expires_in"] ?? 7200),
  };

  logger.info(
    { expireIn: result.expireIn },
    "Successfully obtained access token",
  );

  return result;
}