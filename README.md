# dingtalk-data-manager

钉钉企业数据管理器 — 一个把钉钉开放接口代理鉴权、清洗、串联后，通过 **MCP** 暴露给本地 Agent 的**只读网关**。

## 这是什么？
- **定位**：MCP Server（Node.js 子进程），Agent 通过 stdio/HTTP 连接，27 个只读工具覆盖通讯录、考勤、宜搭。
- **解决的核心问题**：钉钉 API 版本混乱、搜索语义简陋、单用户接口需批处理、宜搭数据看不懂——网关全部掩盖。

## 为什么存在？
- **背景**：企业内部管理员希望用 Claude Code 等 Agent 查钉钉数据（「今天谁迟到了」「那个请款单批到哪了」），但钉钉 API 对 Agent 极其不友好——两代 API 混用、搜索是单 token 子串匹配、宜搭返回 `textField_mr4at0xc` 而非「外出事由」。
- **动机**：做一个「Agent 能理解的钉钉数据适配层」——代理鉴权、归一化输出、弥补搜索缺陷、串联多步调用。

## 如何安装和运行？

```bash
pnpm install
cp .env.yml.example .env.yml   # 填入 ClientID / ClientSecret / 宜搭应用
pnpm build
node dist/index.js             # stdio 模式（MCP 客户端拉起）
```

HTTP 模式（调试用）：`pnpm start:http` → `POST http://localhost:3000/mcp`

## 配置 `.env.yml`

```yaml
ClientID: "dingxxxxxxxxxxxxx"
ClientSecret: "xxxxxxxxxxxx"
LogLevel: "info"
YidaApps:
  - name: "学生外出参赛申请"
    desp: "学生外出参赛申请"
    appId: "APP_FXFBNB47UKEYKJ0194BT"
    systemToken: "xxxxxxxxxxxxxxxx"
```

`BaseURL` 硬编码不可配；Token 缓存 TTL 由 API 返回的 `expires_in` 动态决定（默认 7200s），提前 300s 刷新。

## 接入 MCP 客户端

`.mcp.json`（Claude Code / Claude Desktop）：

```json
{
  "mcpServers": {
    "dingtalk-data-gateway": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/absolute/path/to/dingtalk-data-manager"
    }
  }
}
```

## 能力范围

| 模块 | 工具数 | 说明 |
|---|---|---|
| 通讯录 | 13 | 部门列表/详情/子部门ID/全量部门树/**模糊路径定位**、成员列表/详情/成员ID、手机号/unionId 查人、关键词搜索用户/部门、**姓名+部门线索定位用户** |
| 考勤 | 5 | 打卡结果（自动批处理单用户接口）、请假状态、考勤组（新旧两版）、排班查询 |
| 宜搭 | 9 | 应用/表单/字段/表单数据/流程实例/审批记录 |

完整接口清单见 [`docs/API.md`](docs/API.md)。

### Agent 接入须知

- 服务器通过 MCP `instructions` 提供**全局使用指南**（推荐链路 + 关键约定），Agent 连接即可见
- 另有 Resource `dingtalk://guide` 提供完整接口速查（按需读取，不占初始上下文）
- 全部 27 个工具及其**每一个参数**都有中文描述（含格式、取值范围、与其他工具的衔接提示）
- 全部工具带**只读注解** `readOnlyHint: true` / `destructiveHint: false` / `idempotentHint: true`，
  客户端可据此减少确认弹窗，Agent 也可安全重试
- ⚠️ **钉钉原生部门/用户搜索是单 token 子串匹配**：「东校中学2025级」直接搜会 0 命中
  → 用 `dingtalk_find_department`（切词 + 全量部门树祖先路径匹配）
  → 用 `dingtalk_find_user`（姓名 + 部门线索，先取部门花名册再本地匹配）
- ✅ **宜搭 `searchFieldJson` 是包含匹配的真模糊搜索**：`津` 能命中 `天津`

> 通讯录与考勤都横跨**两代 API**：旧版 `oapi.dingtalk.com/topapi/...`（表单编码）与新版 `api.dingtalk.com/v1.0/...`（JSON）。baseURL 与一级 path 均不一致，因此每个请求方法内都携带完整 URL。`/department/list` 更是唯一走 GET 的 OAPI 端点。

## 开发

```bash
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run
pnpm build        # vite build
node test-mcp.mjs   # 通讯录 + 考勤端到端
node test-yida.mjs  # 宜搭端到端
```

## 架构

```
MCP Client ──stdio/HTTP──▶ MCP Server（工具定义 + Zod 校验）
                              │
                           Gateway（统一门面 + 错误包装）
                              │
                           Service（数据清洗/归一化/批处理）
                              │
                           Client（完整 URL + 请求风格适配）
                              │
                           Auth（Token 缓存/刷新/锁）
```
