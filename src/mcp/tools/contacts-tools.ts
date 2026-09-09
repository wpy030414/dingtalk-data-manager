import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { READ_ONLY } from "./annotations.js";
import { gateway } from "../../gateway/gateway.js";

/**
 * Register all Contacts (通讯录) MCP tools.
 *
 * 通讯录横跨两代 API，baseURL 与一级 path 都不一致：
 *   - 旧版 OAPI: https://oapi.dingtalk.com/topapi/...  （表单编码 + access_token 表单参数）
 *   - 新版 API : https://api.dingtalk.com/v1.0/contact/...（JSON + x-acs-dingtalk-access-token）
 */
export function registerContactsTools(server: McpServer): void {
  server.tool(
    "dingtalk_list_departments",
    "列出某个部门的**直接下级部门**（不含孙级）。要按模糊名字找部门请用 dingtalk_find_department；" +
      "要一次性拿全公司部门树请用 dingtalk_list_all_departments",
    {
      deptId: z
        .number()
        .int()
        .default(1)
        .describe("父部门 ID，默认 1（根部门）。传 1 即列出最顶层部门"),
    },
    READ_ONLY,
    async ({ deptId }) => {
      const result = await gateway.listDepartments(deptId);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    "dingtalk_get_department",
    "获取单个部门的详细信息（名称、父部门 ID、是否创建群、是否自动加人）",
    {
      deptId: z
        .number()
        .int()
        .min(1)
        .describe("部门 ID。可来自 dingtalk_find_department / dingtalk_list_departments / dingtalk_list_sub_department_ids"),
    },
    READ_ONLY,
    async ({ deptId }) => {
      const result = await gateway.getDepartment(deptId);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    "dingtalk_list_users",
    "列出部门成员及其完整档案（姓名、职位、手机号、邮箱、所属部门列表、是否管理员等）。" +
      "只含该部门的**直属成员**，不含下级部门；默认排除已停用用户。" +
      "只要 ID 不要档案时用更快的 dingtalk_list_department_user_ids",
    {
      deptId: z
        .number()
        .int()
        .min(1)
        .describe("部门 ID。传 1 表示根部门（通常只有管理员本人）"),
      includeDeactivated: z
        .boolean()
        .default(false)
        .describe("是否包含已停用（离职）用户，默认 false 只返回在职"),
    },
    READ_ONLY,
    async ({ deptId, includeDeactivated }) => {
      const result = await gateway.listUsers(deptId, {
        includeDeactivated,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    "dingtalk_get_user",
    "获取单个用户的完整档案（姓名、职位、手机号、邮箱、所属部门列表、是否管理员/主管等）。" +
      "只要姓名时先用 dingtalk_find_user 或 dingtalk_search_users 拿到 userId",
    {
      userId: z.string().min(1).describe("钉钉 userId。来自 dingtalk_find_user / dingtalk_search_users / dingtalk_list_department_user_ids 等"),
    },
    READ_ONLY,
    async ({ userId }) => {
      const result = await gateway.getUser(userId);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    "dingtalk_list_sub_department_ids",
    "获取指定部门下的子部门ID列表（仅ID，不分页）——适合快速遍历部门树",
    {
      deptId: z.number().int().min(1).default(1).describe("父部门ID（默认: 1 为根部门）"),
    },
    READ_ONLY,
    async ({ deptId }) => {
      const result = await gateway.listSubDepartmentIds(deptId);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "dingtalk_list_department_user_ids",
    "获取指定部门下的用户ID列表（仅ID，不分页）——适合快速取全量成员后批量查询",
    {
      deptId: z.number().int().min(1).describe("部门ID（使用 1 表示根部门）"),
    },
    READ_ONLY,
    async ({ deptId }) => {
      const result = await gateway.listDepartmentUserIds(deptId);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "dingtalk_get_user_by_mobile",
    "根据手机号查询用户完整信息（网关内部先查ID再补全详情）",
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
    "根据 unionId 查询用户完整信息（网关内部先查ID再补全详情）",
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
    "dingtalk_search_users",
    "按关键词搜人（新版 API，支持中文姓名/拼音/工号）。⚠️ 钉钉做的是**单 token 子串匹配**，不做分词：" +
      "「张」能命中所有姓张的人（实测 1744 条），但「东校的张老师」这种带部门线索的查询请改用 dingtalk_find_user。" +
      "默认自动补全每个命中的完整用户详情（hydrate=false 则只返回 ID 列表，更快）",
    {
      queryWord: z.string().min(1).describe("搜索关键词：姓名片段、拼音或工号，如「张」「zhang」「A1234」"),
      offset: z.number().int().min(0).default(0).describe("偏移量，默认 0"),
      size: z.number().int().min(1).max(20).default(10).describe("每页条数（1-20，默认 10）。命中数可能远大于此值"),
      fullMatchField: z
        .number()
        .int()
        .optional()
        .describe("精确匹配字段：0=姓名 1=工号 2=手机号（不传为模糊搜索）"),
      hydrate: z
        .boolean()
        .default(true)
        .describe("是否自动补全完整用户详情（false 则只返回 userId 列表，更快）"),
    },
    READ_ONLY,
    async ({ queryWord, offset, size, fullMatchField, hydrate }) => {
      const result = await gateway.searchUsers({ queryWord, offset, size, fullMatchField, hydrate });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "dingtalk_search_departments",
    "按关键词搜部门（新版 API）。⚠️ **单 token 子串匹配**，复合名会 0 命中：" +
      "「东校」853 条、「2025级」168 条，但「东校中学2025级」查不到任何部门。" +
      "要按模糊路径名找部门请用 dingtalk_find_department。默认自动补全每个命中的完整部门详情",
    {
      queryWord: z.string().min(1).describe("搜索关键词：单个部门名片段，如「东校」「2025级」「校长室」"),
      offset: z.number().int().min(0).default(0).describe("偏移量，默认 0"),
      size: z.number().int().min(1).max(20).default(10).describe("每页条数（1-20，默认 10）。命中数可能远大于此值"),
      hydrate: z
        .boolean()
        .default(true)
        .describe("是否自动补全完整部门详情（false 则只返回 deptId 列表，更快）"),
    },
    READ_ONLY,
    async ({ queryWord, offset, size, hydrate }) => {
      const result = await gateway.searchDepartments({ queryWord, offset, size, hydrate });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "dingtalk_find_department",
    "【推荐】用模糊路径名定位部门——支持复合名（如「东校中学2025级」「东校 2025级」）和部分名。" +
      "钉钉原生部门搜索只做单 token 子串匹配，复合名会 0 命中；本工具会切词后在全量部门树上按祖先路径匹配，" +
      "返回带完整路径的候选（最具体的排最前）。拿到 deptId 后再调 list_users / list_department_user_ids",
    {
      query: z.string().min(1).describe("模糊部门名，如「东校中学2025级」「东校 2025级」「校长室」"),
      limit: z.number().int().min(1).max(50).default(10).describe("最多返回条数"),
    },
    READ_ONLY,
    async ({ query, limit }) => {
      const result = await gateway.findDepartments(query, limit);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "dingtalk_find_user",
    "【推荐】用模糊人名（+可选部门线索）定位用户——解决「东校的张老师」这类查询。" +
      "钉钉用户搜索只按姓名/拼音/工号做子串匹配、无法按部门过滤；本工具在有部门线索时先取该部门花名册再本地匹配" +
      "（比全库搜人再过滤更准，不受搜索分页限制）。返回的 userId 可直接用于 dingtalk_get_attendance / dingtalk_get_user 等",
    {
      name: z.string().min(1).describe("人名或姓名片段，如「张」「张思杰」（支持拼音）"),
      deptHint: z
        .string()
        .optional()
        .describe("部门线索，如「东校中学2025级」「校长室」。留空则只按姓名搜，不做部门过滤"),
      limit: z.number().int().min(1).max(20).default(10).describe("最多返回条数（1-20，默认 10）"),
    },
    READ_ONLY,
    async ({ name, deptHint, limit }) => {
      const result = await gateway.findUser({ name, deptHint, limit });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "dingtalk_list_all_departments",
    "一次性获取全公司部门树（id/name/parentId，约 900 个，结果缓存 5 分钟）——适合需要整体视图或自行做路径匹配的场景",
    {},
    READ_ONLY,
    async () => {
      const result = await gateway.listAllDepartments();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );
}