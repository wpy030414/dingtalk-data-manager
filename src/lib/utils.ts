/**
 * Converts a snake_case string to camelCase.
 */
export function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter: string) =>
    letter.toUpperCase(),
  );
}

/**
 * Deep converts all object keys from snake_case to camelCase.
 */
export function camelCaseKeys<T>(obj: unknown): T {
  if (Array.isArray(obj)) {
    return obj.map(camelCaseKeys) as T;
  }
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([key, value]) => [
        toCamelCase(key),
        camelCaseKeys(value),
      ]),
    ) as T;
  }
  return obj as T;
}

/**
 * Formats a Date to ISO date string (YYYY-MM-DD).
 */
export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Formats a Date to ISO 8601 string.
 */
export function toISOString(date: Date): string {
  return date.toISOString();
}

/**
 * Builds a URL query string from a params object.
 * Filters out undefined/null values.
 */
export function buildQueryString(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null,
  );
  if (entries.length === 0) return "";
  return (
    "?" +
    entries
      .map(
        ([k, v]) =>
          `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
      )
      .join("&")
  );
}

/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}