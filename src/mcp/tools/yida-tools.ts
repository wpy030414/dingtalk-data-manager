import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { READ_ONLY } from "./annotations.js";
import { gateway } from "../../gateway/gateway.js";

/**
 * Register all Yida (宜搭) MCP tools.
 *
 * 端点速查（均已对真实接口验证）：
 *   GET    /v1.0/yida/forms                                    → 表单列表
 *   GET    /v1.0/yida/forms/formFields                         → 字段定义（字段ID ↔ 中文标签）
 *   GET    /v1.0/yida/forms/definitions/{appType}/{formUuid}   → 组件树定义
 *   POST   /v1.0/yida/forms/instances/query                    → 表单数据查询
 *   POST   /v1.0/yida/forms/instances/search                   → 表单数据搜索
 *   POST   /v1.0/yida/processes/instances                      → 流程实例列表
 *   GET    /v1.0/yida/processes/instancesInfos/{id}            → 流程实例详情
 *   GET    /v1.0/yida/processes/operationRecords               → 审批记录
 */

/** 每个参数都新建 zod 实例，避免 zod→JSON Schema 时生成 $ref（部分客户端不解析 $ref）。 */
const P = {
  appName: () =>
    z
      .string()
      .min(1)
      .describe("宜搭应用名，须与 .env.yml 中 YidaApps[].name 完全一致。可先用 dingtalk_yida_list_apps 查看有哪些应用"),
  formUuid: () =>
    z
      .string()
      .min(1)
      .optional()
      .describe("表单 UUID（FORM- 开头）。可选——不传时，若应用只有一个表单则自动取。先用 dingtalk_yida_list_forms 查看"),
  userId: () =>
    z
      .string()
      .min(1)
      .optional()
      .describe("操作人 userId（须有该应用数据权限）。首次调用需传，之后网关从表单创建者自动获取"),
  searchFieldJson: (fuzzy: boolean) =>
    z
      .string()
      .optional()
      .describe(
        fuzzy
          ? "字段过滤条件，JSON 字符串格式 '{\"字段ID\":\"关键词\"}'。" +
            "注意：钉钉做的是【包含匹配】（模糊），如 '{\"textField_mr4at0xc\":\"无人机\"}' 能命中长文本。" +
            "字段ID 必须先用 dingtalk_yida_get_form_fields 获取"
          : "字段过滤条件，JSON 字符串格式 '{\"字段ID\":\"关键词\"}'。字段ID 必须先用 dingtalk_yida_get_form_fields 获取",
      ),
  originatorId: (label: string) =>
    z.string().optional().describe(`${label}（钉钉 userId）`),
  gmtFrom: (label: string) =>
    z.string().optional().describe(`${label}。GMT 时间字符串，如 "2026-08-01T00:00Z"`),
  gmtTo: (label: string) =>
    z.string().optional().describe(`${label}。GMT 时间字符串，如 "2026-08-31T23:59Z"`),
  pageSize: (max = 100) =>
    z.number().int().min(1).max(max).default(20).describe(`每页条数（1-${max}，默认 20）`),
  pageNumber: (label = "页码") =>
    z.number().int().min(1).default(1).describe(`${label}，从 1 开始，默认 1`),
  processInstanceId: () =>
    z
      .string()
      .min(1)
      .describe("流程实例 ID。来自 dingtalk_yida_list_process_instances 或表单数据的 formInstanceId"),
};

function json(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}

export function registerYidaTools(server: McpServer): void {
  server.tool(
    "dingtalk_yida_list_apps",
    "列出 .env.yml 中配置的全部宜搭应用。查宜搭的第 1 步——后续工具传这里返回的 name 作为 appName。" +
      "注意：配置中不再含 userId（网关自动从表单创建者获取）",
    {},
    READ_ONLY,
    async () => json(await gateway.listYidaApps()),
  );

  server.tool(
    "dingtalk_yida_list_forms",
    "列出应用下全部表单——**含每个表单的字段名列表**（如「申请日期、教师姓名、申请校区……」）。" +
      "Agent 应通过字段名语义判断哪个表单是自己需要的，从中选择对应 formUuid。userId 可选——首次调用后自动缓存",
    {
      appName: P.appName(),
      userId: P.userId(),
      pageSize: P.pageSize(),
      pageNumber: P.pageNumber(),
    },
    READ_ONLY,
    async ({ appName, userId, pageSize, pageNumber }) =>
      json(await gateway.listYidaForms({ appName, userId, pageSize, pageNumber })),
  );

  server.tool(
    "dingtalk_yida_get_form_fields",
    "获取宜搭表单的字段定义（fieldId / 中文标签 / 组件类型）。" +
      "formUuid 可选：不传则自动取应用的第一个表单。用途：把 formData 的原始 key 翻译成中文标签、构造 searchFieldJson 时确定字段 ID",
    {
      appName: P.appName(),
      formUuid: P.formUuid(),
      userId: P.userId(),
    },
    READ_ONLY,
    async ({ appName, formUuid, userId }) =>
      json(await gateway.getYidaFormFields({ appName, formUuid, userId })),
  );

  server.tool(
    "dingtalk_yida_get_form_components",
    "获取宜搭表单的完整组件树（布局/子表单/组件配置），formUuid 可选（不传自动取第一个表单）。只要字段名用 get_form_fields 更轻量",
    {
      appName: P.appName(),
      formUuid: P.formUuid(),
      userId: P.userId(),
    },
    READ_ONLY,
    async ({ appName, formUuid, userId }) =>
      json(await gateway.getYidaFormComponents({ appName, formUuid, userId })),
  );

  server.tool(
    "dingtalk_yida_query_form_data",
    "查询宜搭表单实例数据（分页，formUuid 可选——不传自动取第一个表单）。" +
      "需对照 dingtalk_yida_get_form_fields 的中文标签解读。" +
      "searchFieldJson 为【包含匹配】的模糊搜索，可用内容片段反查记录",
    {
      appName: P.appName(),
      formUuid: P.formUuid(),
      userId: P.userId(),
      searchFieldJson: P.searchFieldJson(true),
      originatorId: P.originatorId("按提交人过滤"),
      createFromTimeGMT: P.gmtFrom("提交时间下限"),
      createToTimeGMT: P.gmtTo("提交时间上限"),
      pageSize: P.pageSize(),
      pageNumber: P.pageNumber(),
    },
    READ_ONLY,
    async (args) =>
      json(
        await gateway.queryYidaFormData({
          appName: args.appName,
          formUuid: args.formUuid,
          userId: args.userId,
          searchFieldJson: args.searchFieldJson,
          originatorId: args.originatorId,
          createFromTimeGMT: args.createFromTimeGMT,
          createToTimeGMT: args.createToTimeGMT,
          pageSize: args.pageSize,
          pageNumber: args.pageNumber,
        }),
      ),
  );

  server.tool(
    "dingtalk_yida_search_form_data",
    "搜索宜搭表单实例（比 query 多了提交人/修改时间元数据），formUuid 可选。searchFieldJson 是包含匹配的模糊搜索",
    {
      appName: P.appName(),
      formUuid: P.formUuid(),
      userId: P.userId(),
      searchFieldJson: P.searchFieldJson(true),
      originatorId: P.originatorId("按提交人过滤"),
      createFromTimeGMT: P.gmtFrom("提交时间下限"),
      createToTimeGMT: P.gmtTo("提交时间上限"),
      pageSize: P.pageSize(),
      currentPage: P.pageNumber("页码"),
    },
    READ_ONLY,
    async (args) =>
      json(
        await gateway.searchYidaFormData({
          appName: args.appName,
          formUuid: args.formUuid,
          userId: args.userId,
          searchFieldJson: args.searchFieldJson,
          originatorId: args.originatorId,
          createFromTimeGMT: args.createFromTimeGMT,
          createToTimeGMT: args.createToTimeGMT,
          pageSize: args.pageSize,
          currentPage: args.currentPage,
        }),
      ),
  );

  server.tool(
    "dingtalk_yida_list_process_instances",
    "查询宜搭流程实例列表（formUuid 可选——不传自动取第一个表单），可按状态/结果/发起人/时间过滤。" +
      "查审批进度第 1 步 → get_process_instance 看详情 → get_operation_records 看链路",
    {
      appName: P.appName(),
      userId: P.userId(),
      formUuid: P.formUuid(),
      instanceStatus: z
        .string()
        .optional()
        .describe("流程状态，如 RUNNING（审批中）/ TERMINATED（已终止）/ COMPLETED（已完成）"),
      approvedResult: z.string().optional().describe("审批结果，如 agree（同意）/ refuse（拒绝）"),
      originatorId: P.originatorId("按发起人过滤"),
      createFromTimeGMT: P.gmtFrom("发起时间下限"),
      createToTimeGMT: P.gmtTo("发起时间上限"),
      searchFieldJson: P.searchFieldJson(false),
      pageSize: P.pageSize(),
      pageNumber: P.pageNumber(),
    },
    READ_ONLY,
    async (args) =>
      json(
        await gateway.listYidaProcessInstances({
          appName: args.appName,
          userId: args.userId,
          formUuid: args.formUuid,
          instanceStatus: args.instanceStatus,
          approvedResult: args.approvedResult,
          originatorId: args.originatorId,
          createFromTimeGMT: args.createFromTimeGMT,
          createToTimeGMT: args.createToTimeGMT,
          searchFieldJson: args.searchFieldJson,
          pageSize: args.pageSize,
          pageNumber: args.pageNumber,
        }),
      ),
  );

  server.tool(
    "dingtalk_yida_get_process_instance",
    "按 processInstanceId 获取单个宜搭流程实例的完整详情" +
      "（标题、审批结果、当前状态、发起人、抄送/执行人、全部表单数据）",
    {
      appName: P.appName(),
      processInstanceId: P.processInstanceId(),
      userId: P.userId(),
    },
    READ_ONLY,
    async ({ appName, processInstanceId, userId }) =>
      json(await gateway.getYidaProcessInstance({ appName, processInstanceId, userId })),
  );

  server.tool(
    "dingtalk_yida_get_operation_records",
    "获取宜搭流程实例的审批记录（审批链路：谁在什么时候做了什么操作、写了什么意见）。" +
      "回答「审批到哪一步了」「谁还没批」这类问题的第 3 步",
    {
      appName: P.appName(),
      processInstanceId: P.processInstanceId(),
      userId: P.userId(),
    },
    READ_ONLY,
    async ({ appName, processInstanceId, userId }) =>
      json(await gateway.getYidaOperationRecords({ appName, processInstanceId, userId })),
  );
}
