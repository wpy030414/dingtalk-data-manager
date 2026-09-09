import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { READ_ONLY } from "./annotations.js";
import { gateway } from "../../gateway/gateway.js";

/**
 * Register all Attendance (考勤) MCP tools.
 *
 * 考勤横跨两代 API，baseURL 与一级 path 都不一致：
 *   旧版 OAPI : https://oapi.dingtalk.com/topapi/attendance/...（表单编码 + access_token）
 *   新版 API  : https://api.dingtalk.com/v1.0/attendance/...（JSON + x-acs-dingtalk-access-token）
 */
export function registerAttendanceTools(server: McpServer): void {
  server.tool(
    "dingtalk_get_attendance",
    "查询指定用户在某一天的考勤打卡结果（上班/下班打卡时间、是否迟到早退、打卡地点结果）。" +
      "传 userIds 数组即可——钉钉底层接口只支持单用户，网关已自动逐个拉取并合并。" +
      "注意：需要先有 userId，可用 dingtalk_find_user 或 dingtalk_search_users 获取",
    {
      userIds: z
        .array(z.string().min(1))
        .min(1)
        .max(50)
        .describe("用户 ID 列表（1-50 个）。每个用户一次底层调用，人数多时耗时线性增长"),
      workDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "格式: YYYY-MM-DD")
        .describe("查询日期，格式 YYYY-MM-DD，如 2026-09-09"),
    },
    READ_ONLY,
    async ({ userIds, workDate }) => {
      const result = await gateway.getAttendanceList({ userIds, workDate });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "dingtalk_get_leave_status",
    "查询用户在指定时间段内的请假/缺勤记录（请假类型、时长、审批状态）。" +
      "适合回答「某人今天为什么没打卡」「这周谁请假了」",
    {
      userIds: z.array(z.string().min(1)).min(1).max(50).describe("用户 ID 列表（1-50 个）"),
      fromDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "格式: YYYY-MM-DD")
        .describe("起始日期（含），格式 YYYY-MM-DD"),
      toDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "格式: YYYY-MM-DD")
        .describe("结束日期（含），格式 YYYY-MM-DD"),
      offset: z.number().int().min(0).default(0).describe("分页偏移，默认 0"),
      size: z.number().int().min(1).max(100).default(20).describe("每页条数（1-100，默认 20）"),
    },
    READ_ONLY,
    async ({ userIds, fromDate, toDate, offset, size }) => {
      const result = await gateway.getLeaveStatus({ userIds, fromDate, toDate, offset, size });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "dingtalk_list_attendance_groups",
    "获取考勤组列表（旧版 API）——返回考勤组名称、班次说明、默认班次 ID、是否允许自选班次等。" +
      "用于了解公司有哪些考勤规则；要看某考勤组有多少成员请用 dingtalk_get_attendance_group_details",
    {
      offset: z.number().int().min(0).default(0).describe("分页偏移，默认 0"),
      size: z.number().int().min(1).max(100).default(20).describe("每页条数（1-100，默认 20）"),
    },
    READ_ONLY,
    async ({ offset, size }) => {
      const result = await gateway.listAttendanceGroups({ offset, size });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "dingtalk_list_attendance_schedule",
    "获取指定日期全公司的排班信息（旧版 API）——返回每个人当天所属考勤组、班次和计划打卡时间。" +
      "适合回答「某人今天几点该打卡」；要看实际打卡结果请用 dingtalk_get_attendance",
    {
      workDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "格式: YYYY-MM-DD")
        .describe("查询日期，格式 YYYY-MM-DD，如 2026-09-09"),
      offset: z.number().int().min(0).default(0).describe("分页偏移，默认 0"),
      size: z.number().int().min(1).max(100).default(20).describe("每页条数（1-100，默认 20）"),
    },
    READ_ONLY,
    async ({ workDate, offset, size }) => {
      const result = await gateway.listAttendanceSchedule({ workDate, offset, size });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "dingtalk_get_attendance_group_details",
    "获取考勤组详情（新版 API，游标分页）——含成员数、考勤类型（FIXED 固定班制等）、班次列表。" +
      "与 dingtalk_list_attendance_groups 数据同源但为新一代接口，字段命名和分页方式不同（游标而非偏移）",
    {
      nextToken: z.number().int().min(0).default(0).describe("游标，首次传 0；返回 hasMore=true 时用返回的 nextToken 继续"),
      maxResults: z.number().int().min(1).max(100).default(20).describe("每页条数（1-100，默认 20）"),
    },
    READ_ONLY,
    async ({ nextToken, maxResults }) => {
      const result = await gateway.getAttendanceGroupDetails({ nextToken, maxResults });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );
}
