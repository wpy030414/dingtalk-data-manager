# Spec — 宜搭模块（Yida）

## 要构建什么
- **目标**：通过 9 个只读 MCP 工具暴露宜搭表单数据和流程审批数据，支持按内容片段模糊搜索。formUuid 和 userId **自动补全**，单表单应用只需 appName。

## 行为
- 列出配置的应用 / 表单 / 字段定义 / 组件树
- 表单数据查询 + 搜索（分页，支持 `searchFieldJson` 模糊过滤）—— formUuid 可选
- 流程实例列表 + 单实例详情 + 审批记录链—— formUuid 可选

## 输入 / 输出
- **输入**：appName（来自 .env.yml）、formUuid（可选——单表单自动取）、userId（可选——网关自动从表单创建者获取，显式传入可覆盖）、searchFieldJson（JSON 字符串 `{"字段ID":"关键词"}`）、时间过滤（GMT 字符串）
- **输出**：`{ success, data }`
  - 字段定义：fieldId、componentName、label（中文）
  - 表单数据：items[{formInstanceId, formData, createTimeGMT, ...}]
  - 流程实例：processInstanceId、approvedResult、instanceStatus、originatorUserId
  - 审批记录：[{operateTimeGMT, operatorName, showName, operateType}]

## 约束
- 全部走新版 API：`https://api.dingtalk.com/v1.0/yida/...`（JSON + `x-acs-dingtalk-access-token`）
- userId 自动补全：1)显式传入 2)表单 creator（自动 bootstrap，缓存 10 分钟）——对 Agent 和 .env.yml 配置完全透明
- formUuid 自动补全：单表单自动取；多表单抛清晰列出选项
- `searchFieldJson` 是**包含匹配**的模糊搜索（实测 `津` 能命中 `天津`）
- 表单数据以字段 ID 为 key（如 `textField_mr4at0xc`），必须先调 `get_form_fields` 做翻译
- `query_form_data` 不返回子表单数据；`search_form_data` 返回更丰富的元数据（提交人/修改时间）

## 边界条件
- 表单类型分 `process`（流程表单、有审批链）和 `receipt`（数据表单、无审批）
- 流程实例 ID = 表单实例 ID（宜搭的 processInstanceId 就是 formInstanceId）
- 字段 label 可能是 JSON 字符串或纯文本——Service 层统一解包
- `get_form_components` 是唯一需要 `appType/formUuid` 作为路径段的宜搭端点

## 验收标准
- [x] 9 个工具全部通过真实企业数据验证
- [x] `query_form_data({appName})` 只传 appName → total=8
- [x] `get_form_fields({appName})` 只传 appName → 16 字段
- [x] `search_form_data({searchFieldJson:'{"textField_mr4at0x6":"天津"}'})` → 1 条
- [x] 反向对照「不存在的城市xyz」→ 0 命中
- [x] 流程实例审批记录 5 条完整链路可读
- [x] 单元测试覆盖 12 个用例（含 auto-resolve）

## 完成定义
- [x] 全部工具定义、参数描述、只读注解就位
- [x] formUuid/userId 自动补全（Agent 只需 appName）
- [x] `$ref` 问题已修复——每个 GMT 参数独立 zod 实例