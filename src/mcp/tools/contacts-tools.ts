import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { READ_ONLY } from "./annotations.js";
import { gateway } from "../../gateway/gateway.js";

/**
 * Register all Contacts (通讯录) MCP tools — 10 tools.
 */
export function registerContactsTools(server: McpServer): void {
  server.tool(
    "dingtalk_find_department",
    "模糊路径名定位部门，支持复合名如「东校中学2025级」。返回候选列表含完整路径",
    {
      query: z.string().min(1).describe("模糊部门名，如「东校中学2025级」「校长室」"),
      limit: z.number().int().min(1).max(50).default(10).describe("最多返回条数"),
      includeHomeSchool: z.boolean().default(false).describe("默认 false，排除家校通讯录子树；true 则包含"),
    },
    READ_ONLY,
    async ({ query, limit, includeHomeSchool }) => {
      const result = await gateway.findDepartments(query, limit, includeHomeSchool);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "dingtalk_find_user",
    "模糊人名+可选部门线索定位用户。有部门线索时先取该部门花名册再本地匹配，比全库搜更准",
    {
      name: z.string().min(1).describe("人名或姓名片段，如「张」「张思杰」（支持拼音）"),
      deptHint: z.string().optional().describe("部门线索，如「东校中学2025级」。留空则只按姓名搜"),
      limit: z.number().int().min(1).max(20).default(10).describe("最多返回条数"),
      includeHomeSchool: z.boolean().default(false).describe("默认 false，deptHint 不匹配家校通讯录部门；true 则包含"),
    },
    READ_ONLY,
    async ({ name, deptHint, limit, includeHomeSchool }) => {
      const result = await gateway.findUser({ name, deptHint, limit, includeHomeSchool });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "dingtalk_search_users",
    "按姓名/拼音/工号搜人。⚠️ 单token子串匹配，复合查询请用 find_user",
    {
      queryWord: z.string().min(1).describe("搜索关键词，如「张」「zhang」「A1234」"),
      offset: z.number().int().min(0).default(0).describe("分页偏移"),
      size: z.number().int().min(1).max(20).default(10).describe("每页条数（1-20）"),
      fullMatchField: z.number().int().optional().describe("精确匹配：0=姓名 1=工号 2=手机号"),
      hydrate: z.boolean().default(true).describe("false 则只返回 userId 列表，更快"),
    },
    READ_ONLY,
    async ({ queryWord, offset, size, fullMatchField, hydrate }) => {
      const result = await gateway.searchUsers({ queryWord, offset, size, fullMatchField, hydrate });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "dingtalk_search_departments",
    "按关键词搜部门。⚠️ 单token子串匹配，复合名请用 find_department",
    {
      queryWord: z.string().min(1).describe("搜索关键词，单个部门名片段，如「东校」「校长室」"),
      offset: z.number().int().min(0).default(0).describe("分页偏移"),
      size: z.number().int().min(1).max(20).default(10).describe("每页条数（1-20）"),
      hydrate: z.boolean().default(true).describe("false 则只返回 deptId 列表，更快"),
    },
    READ_ONLY,
    async ({ queryWord, offset, size, hydrate }) => {
      const result = await gateway.searchDepartments({ queryWord, offset, size, hydrate });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "dingtalk_list_users",
    "列出部门的直属成员及完整档案。不含下级部门成员",
    {
      deptId: z.number().int().min(1).describe("部门 ID"),
      includeDeactivated: z.boolean().default(false).describe("是否包含已停用（离职）用户"),
    },
    READ_ONLY,
    async ({ deptId, includeDeactivated }) => {
      const result = await gateway.listUsers(deptId, { includeDeactivated });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "dingtalk_list_department_user_ids",
    "获取部门下全部用户ID列表（仅ID，不分页）",
    {
      deptId: z.number().int().min(1).describe("部门 ID"),
    },
    READ_ONLY,
    async ({ deptId }) => {
      const result = await gateway.listDepartmentUserIds(deptId);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "dingtalk_get_user",
    "获取单个用户的完整档案（姓名、职位、手机号、邮箱、所属部门等）",
    {
      userId: z.string().min(1).describe("钉钉 userId"),
    },
    READ_ONLY,
    async ({ userId }) => {
      const result = await gateway.getUser(userId);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "dingtalk_get_user_by_mobile",
    "根据手机号查询用户完整信息",
    {
      mobile: z.string().min(1).describe("手机号，如 13800138000"),
    },
    READ_ONLY,
    async ({ mobile }) => {
      const result = await gateway.getUserByMobile(mobile);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "dingtalk_get_user_by_unionid",
    "根据 unionId 查询用户完整信息",
    {
      unionId: z.string().min(1).describe("用户 unionId"),
    },
    READ_ONLY,
    async ({ unionId }) => {
      const result = await gateway.getUserByUnionId(unionId);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "dingtalk_list_all_departments",
    "一次性获取全公司部门树（id/name/parentId，约900个，缓存5分钟）。默认排除家校通讯录子树",
    {
      includeHomeSchool: z.boolean().default(false).describe("默认 false，排除家校通讯录子树；true 则包含"),
    },
    READ_ONLY,
    async ({ includeHomeSchool }) => {
      const result = await gateway.listAllDepartments(includeHomeSchool);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );
}
