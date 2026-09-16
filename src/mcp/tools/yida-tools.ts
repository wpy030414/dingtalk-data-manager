import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { READ_ONLY } from "./annotations.js";
import { gateway } from "../../gateway/gateway.js";

/**
 * Register all Yida (宜搭) MCP tools — 4 tools.
 *
 * appName 留空 → list_forms 返回全部应用列表（替代原 list_apps）。
 * query_form_data 内部统一调 searchFormData（返回更丰富元数据）。
 * get_process_instance 合并审批记录（includeRecords=true）。
 */

/** 每个参数都新建 zod 实例，避免 zod→JSON Schema 时生成 $ref。 */
const P = {
  appName: () =>
    z.string().min(1).optional().describe("宜搭应用名。留空返回全部应用及其表单列表"),
  appNameReq: () =>
    z.string().min(1).describe("宜搭应用名，须与 .env.yml 中 YidaApps[].name 一致"),
  formUuid: () =>
    z.string().min(1).optional().describe("表单 UUID（FORM- 开头），不传时自动取第一个"),
  searchFieldJson: () =>
    z.string().optional().describe("字段过滤，JSON 格式 '{\"字段ID\":\"关键词\"}'，包含匹配。字段ID 从 list_forms 获取"),
  originatorId: () =>
    z.string().optional().describe("按提交人过滤（钉钉 userId）"),
  gmtFrom: (label: string) =>
    z.string().optional().describe(`${label}，GMT 如 "2026-08-01T00:00Z"`),
  gmtTo: (label: string) =>
    z.string().optional().describe(`${label}，GMT 如 "2026-08-31T23:59Z"`),
  pageSize: (max = 100) =>
    z.number().int().min(1).max(max).default(20).describe(`每页条数（1-${max}）`),
  pageNumber: () =>
    z.number().int().min(1).default(1).describe("页码，从 1 开始"),
  processInstanceId: () =>
    z.string().min(1).describe("流程实例 ID"),
};

function json(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}

export function registerYidaTools(server: McpServer): void {
  // ── 发现 + 选表（合一）──

  server.tool(
    "dingtalk_yida_list_forms",
    "列出应用下全部表单（含 fieldId+中文标签+组件类型）。appName 留空返回全部应用列表",
    {
      appName: P.appName(),
      pageSize: P.pageSize(),
      pageNumber: P.pageNumber(),
    },
    READ_ONLY,
    async ({ appName, pageSize, pageNumber }) =>
      json(await gateway.listYidaForms({ appName, pageSize, pageNumber })),
  );

  // ── 数据查询（合并 query + search）──

  server.tool(
    "dingtalk_yida_query_form_data",
    "查询宜搭表单实例数据（分页），searchFieldJson 为包含匹配的模糊搜索",
    {
      appName: P.appNameReq(),
      formUuid: P.formUuid(),
      searchFieldJson: P.searchFieldJson(),
      originatorId: P.originatorId(),
      createFromTimeGMT: P.gmtFrom("提交时间下限"),
      createToTimeGMT: P.gmtTo("提交时间上限"),
      pageSize: P.pageSize(),
      pageNumber: P.pageNumber(),
    },
    READ_ONLY,
    async (args) =>
      json(await gateway.queryYidaFormData(args)),
  );

  // ── 流程列表 ──

  server.tool(
    "dingtalk_yida_list_process_instances",
    "查询宜搭流程实例列表，可按状态/结果/发起人/时间过滤",
    {
      appName: P.appNameReq(),
      formUuid: P.formUuid(),
      instanceStatus: z.string().optional().describe("RUNNING / TERMINATED / COMPLETED"),
      approvedResult: z.string().optional().describe("agree / refuse"),
      originatorId: P.originatorId(),
      createFromTimeGMT: P.gmtFrom("发起时间下限"),
      createToTimeGMT: P.gmtTo("发起时间上限"),
      searchFieldJson: P.searchFieldJson(),
      pageSize: P.pageSize(),
      pageNumber: P.pageNumber(),
    },
    READ_ONLY,
    async (args) =>
      json(await gateway.listYidaProcessInstances(args)),
  );

  // ── 流程详情 + 审批记录（合一）──

  server.tool(
    "dingtalk_yida_get_process_instance",
    "获取流程实例详情。includeRecords=true 时一并返回审批链路记录",
    {
      appName: P.appNameReq(),
      processInstanceId: P.processInstanceId(),
      includeRecords: z.boolean().default(false).describe("true 时一并返回审批操作记录"),
    },
    READ_ONLY,
    async ({ appName, processInstanceId, includeRecords }) =>
      json(await gateway.getYidaProcessInstance({ appName, processInstanceId, includeRecords })),
  );
}
