/** Response from DingTalk's getAccessToken API. */
export interface AccessTokenResponse {
  accessToken: string;
  expireIn: number; // seconds
}

/** Internal token cache entry. */
export interface TokenCache {
  token: string;
  expiresAt: number; // Unix timestamp in milliseconds
}