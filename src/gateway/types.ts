/** Standard gateway response wrapper. */
export interface GatewayResponse<T = unknown> {
  success: boolean;
  data?: T;
  pagination?: {
    total: number;
    page: number;
    pageSize: number;
  };
  error?: {
    code: string;
    message: string;
    requestId?: string;
    details?: unknown;
  };
}

/** Helper to create a success response. */
export function success<T>(
  data: T,
  pagination?: GatewayResponse["pagination"],
): GatewayResponse<T> {
  return {
    success: true,
    data,
    ...(pagination && { pagination }),
  };
}

/** Helper to create an error response. */
export function error(
  code: string,
  message: string,
  requestId?: string,
  details?: unknown,
): GatewayResponse<never> {
  const err: GatewayResponse["error"] = { code, message };
  if (requestId) err.requestId = requestId;
  if (details) err.details = details;
  return { success: false, error: err };
}