import { z } from "zod";

/** Common pagination parameters for tools. */
export const PaginationParams = {
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Pagination offset"),
  size: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Page size (1-100)"),
};

/** Common date range parameters for attendance tools. */
export const DateRangeParams = {
  fromDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format")
    .describe("Start date (YYYY-MM-DD)"),
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format")
    .describe("End date (YYYY-MM-DD)"),
};

/** Common user IDs parameter. */
export const UserIdsParam = {
  userIds: z
    .array(z.string().min(1))
    .min(1)
    .max(50)
    .describe("List of user IDs (1-50)"),
};