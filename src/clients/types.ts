/** Common pagination parameters. */
export interface PaginationParams {
  offset?: number;
  size?: number;
}

/** Common paginated response from DingTalk APIs. */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  hasMore: boolean;
  nextToken?: string;
}

/** Raw DingTalk API error shape. */
export interface DingTalkErrorBody {
  code?: string;
  Code?: string;
  message?: string;
  Message?: string;
  msg?: string;
  requestid?: string;
  requestId?: string;
}