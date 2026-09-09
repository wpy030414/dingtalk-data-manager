import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

/**
 * 本网关是**只读**的——全部 27 个工具都只查询，不写入/删除任何数据。
 * 统一声明给 MCP 客户端，客户端可据此减少确认弹窗、并让 Agent 知道可以安全重试。
 */
export const READ_ONLY: ToolAnnotations = {
  /** 只读：不修改任何状态 */
  readOnlyHint: true,
  /** 非破坏性：不会删除或覆盖数据 */
  destructiveHint: false,
  /** 幂等：同样参数重复调用结果一致，失败可安全重试 */
  idempotentHint: true,
  /** 开放世界：会访问外部系统（钉钉），结果可能随时间变化 */
  openWorldHint: true,
};
