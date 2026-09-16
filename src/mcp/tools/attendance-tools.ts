import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { READ_ONLY } from "./annotations.js";
import { gateway } from "../../gateway/gateway.js";

/**
 * Register all Attendance (考勤) MCP tools — 4 tools.
 */
export function registerAttendanceTools(server: McpServer): void {
  server.tool(
    "dingtalk_get_attendance",
    "查询指定用户在某一天的考勤打卡结果（打卡时间、迟到早退、地点）。支持批量 userIds",
    {
      userIds: z.array(z.string().min(1)).min(1).max(50).describe("用户 ID 列表（1-50 个）"),
      workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("查询日期 YYYY-MM-DD"),
    },
    READ_ONLY,
    async ({ userIds, workDate }) => {
      const result = await gateway.getAttendanceList({ userIds, workDate });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "dingtalk_get_leave_status",
    "查询用户在时间段内的请假/缺勤记录（类型、时长、审批状态）",
    {
      userIds: z.array(z.string().min(1)).min(1).max(50).describe("用户 ID 列表（1-50 个）"),
      fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("起始日期（含） YYYY-MM-DD"),
      toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("结束日期（含） YYYY-MM-DD"),
      offset: z.number().int().min(0).default(0).describe("分页偏移"),
      size: z.number().int().min(1).max(100).default(20).describe("每页条数"),
    },
    READ_ONLY,
    async ({ userIds, fromDate, toDate, offset, size }) => {
      const result = await gateway.getLeaveStatus({ userIds, fromDate, toDate, offset, size });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "dingtalk_list_attendance_schedule",
    "获取指定日期全公司排班信息（每人当天考勤组、班次、计划打卡时间）",
    {
      workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("查询日期 YYYY-MM-DD"),
      offset: z.number().int().min(0).default(0).describe("分页偏移"),
      size: z.number().int().min(1).max(100).default(20).describe("每页条数"),
    },
    READ_ONLY,
    async ({ workDate, offset, size }) => {
      const result = await gateway.listAttendanceSchedule({ workDate, offset, size });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "dingtalk_get_attendance_group_details",
    "获取考勤组详情（成员数、考勤类型、班次列表），游标分页",
    {
      cursor: z.number().int().min(0).optional()
        .describe("⚠️ 分页游标，必须传上一页响应中的 nextCursor 字段值，严禁自行加 offset 推算。首次查询不传此参数"),
      size: z.number().int().min(1).max(100).default(20).describe("每页条数"),
    },
    READ_ONLY,
    async ({ cursor, size }) => {
      const result = await gateway.getAttendanceGroupDetails({ cursor, size });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );
}
