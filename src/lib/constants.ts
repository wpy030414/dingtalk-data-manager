/** DingTalk old-style OAPI base URL (通讯录、考勤 etc.). */
export const DINGTALK_BASE_URL = "https://oapi.dingtalk.com";

/** DingTalk new-style API base URL (宜搭 etc.). */
export const NEW_DINGTALK_BASE_URL = "https://api.dingtalk.com";

/** Access token expiry in seconds (DingTalk default). */
export const TOKEN_EXPIRE_SECONDS = 7200;

/** Seconds before token expiry to trigger refresh. */
export const TOKEN_REFRESH_BUFFER_SECONDS = 300;

/** Default request timeout in milliseconds. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/** Maximum retry attempts for API calls. */
export const MAX_RETRY_ATTEMPTS = 3;

/** Base retry delay in milliseconds. */
export const RETRY_BASE_DELAY_MS = 1000;