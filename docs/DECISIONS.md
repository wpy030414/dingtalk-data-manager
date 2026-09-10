# DECISIONS

决策记录（ADR）——捕获开发过程中对架构/技术/约定的关键选择及当时的权衡。

---

## ADR-01：每个请求必须携带完整 URL，禁止共用 baseURL

- **日期**：2026-09-08
- **状态**：已采纳
- **背景**：钉钉 API 横跨两代：`oapi.dingtalk.com/topapi/...`（表单编码 POST）和 `api.dingtalk.com/v1.0/...`（JSON），baseURL 和一级 path 都不同。共用 baseURL 会迫使代码在每个方法里硬拼前缀、极易出错。
- **考虑过的方案**：
  1. 配置 `BaseURL` 并在 Client 里拼 path → 被用户否：钉钉 API 版本繁多，baseURL 不可共用。
  2. 每个请求方法内硬编码完整 URL → **采纳**。
- **决策**：BaseClient 不持有 baseURL 属性；每个 `oapiRequest()`/`newApiRequest()`/`oapiGet()` 调用者传入完整 URL。Client 文件内部声明私有常量（如 `const OAPI = "https://oapi.dingtalk.com"`）只是为了可读性，不是共享设施。
- **为什么选这个**：URL 和请求风格（表单 vs JSON）强绑定，硬编码在一起让新增端点时立刻看到岔路。
- **后果**：新增一个端点要同时写入完整 URL + 参数。好处是代码自文档化——读 Client 文件就能看到全部调用链路，无需跳转查配置。

---

## ADR-02：用 Hono + `http.createServer` 双模运行

- **日期**：2026-09-08
- **状态**：已采纳
- **背景**：MCP SDK 的 `StreamableHTTPServerTransport` 需要 Node.js 原生的 `IncomingMessage`/`ServerResponse`，而 Hono 的 `@hono/node-server` 的 `serve` 包装不直接暴露给 transport。同时 stdio 模式用于本地 Agent（Claude Code 拉起子进程），HTTP 模式用于远程调试/Pi。
- **决策**：`src/index.ts` 用 stdio transport；`src/server.ts` 用 Hono app + `http.createServer`，路由 `/health` → Hono handler，其余全部 forward 给 MCP transport 的 `handleRequest`。
- **后果**：两个入口文件，但共享同一个 `createMcpServer()` 工厂。HTTP 模式需要 Node.js 原生 API 来处理请求，不能纯粹用 Hono 中间件。

---

## ADR-03：宜搭所有接口强制 userId，由网关自动从表单创建者获取

- **日期**：2026-09-09
- **状态**：已采纳（后续被 ADR-10 增强——userId 完全透明化）
- **背景**：实测发现宜搭所有服务端 API 必须传 `userId`——一个对该应用数据有权限的用户。用张思杰（普通管理员）查返回 0 条，用应用创建者返回 8 条。且 `formUuid` 也是强制参数。
- **考虑过的方案**：
  1. 从 Auth token 反查当前用户 → 不可行，Token 是应用级别的，不是用户级别。
  2. 在 tool 调用时每次传 userId → **采纳为可选覆盖**。
  3. 在 `.env.yml` 为每个宜搭应用配置默认 userId → **最初采纳，后被 ADR-10 废弃**。
- **最终决策（ADR-10 后）**：`resolveAppAuth()` 自动从表单列表的 `creator` 字段获取 userId，无需任何配置。首次调用 `list_forms` 时自动 bootstrap——creator 缓存 10 分钟。
- **后果**：userId 对 Agent 和配置完全透明。`.env.yml` 不再需要 `userId` 字段。

---

## ADR-04：组件 `userId` 修正为 `appId` 配置项

- **日期**：2026-09-08
- **状态**：已采纳
- **背景**：用户最初把宜搭配置项命名为 `appType`。经确认，这个名字实际上就是宜搭的 APPLICATION ID（格式 `APP_XXXXXXXX`），语义上叫 `appId` 才对。
- **决策**：`schema.ts` 中 `YidaAppSchema.appId = z.string().min(1).describe("Yida application ID")`。
- **后果**：`.env.yml` 和配置模板统一使用 `appId`。

---

## ADR-05：`TokenRefreshBuffer` 固定为官方默认 7200 秒

- **日期**：2026-09-08
- **状态**：已采纳
- **背景**：钉钉官方文档中 accessToken `expires_in` 默认 7200 秒。用户要求 "TokenRefreshBuffer 固定为 7200"——实际上 `expires_in` 是 7200，而不是 refresh buffer。
- **决策**：`expires_in` 由 API 返回决定（不硬编码），刷新缓冲固定 300 秒（距过期前 5 分钟刷新），Token 缓存 7200 秒。`TOKEN_EXPIRE_SECONDS = 7200` 作为常量保留但不参与缓存逻辑——缓存 TTL 由 API 返回的 `expires_in` 动态决定。
- **后果**：TokenManager 使用 `expiresIn * 1000 - TOKEN_REFRESH_BUFFER_MS` 计算提前刷新时机。

---

## ADR-06：BaseClient 的 `oapiGet` 方法——为唯一走 GET 的 OAPI 端点适配

- **日期**：2026-09-09
- **状态**：已采纳
- **背景**：探测部门搜索语义时发现 `GET https://oapi.dingtalk.com/department/list` 是一次性拿全公司 875 个部门的唯一方式——但它**必须走 GET**（POST 返回 43001），且 `access_token` 要走 query 参数而非表单 body。原有的 `oapiRequest()` 只能处理表单编码 POST。
- **决策**：在 BaseClient 新增 `oapiGet(fullUrl, params)` 方法，把 `access_token` 拼进 URL query string。不把 `department/list` 走后门混进 newApiRequest——它不是新 API。
- **后果**：BaseClient 现在有三种请求风格：`oapiRequest`（表单 POST）、`oapiGet`（query GET）、`newApiRequest`（JSON）。`department/list` 来自旧版 `oapi` 域但请求方式不同，这种不一致是钉钉 API 设计的真实反映。

---

## ADR-07：`find_department` 和 `find_user`——网关层弥补钉钉搜索缺陷

- **日期**：2026-09-09
- **状态**：已采纳
- **背景**：实测钉钉 `search_departments` 搜索语义为**单 token 子串匹配**，「东校中学2025级」→ 0 命中（因为字面量不存在）；但「东校」→ 853 命中、「2025级」→ 168 命中。Agent 说的自然语言（「东校中学2025级今天谁迟到了」）和 API 的能力存在沟壑。
- **考虑过的方案**：
  1. 让 Agent 自己分步：先搜「东校」→ 再搜「2025级」→ 自己求交集 → 放弃（Agent 做不好这个）。
  2. 网关替 Agent 做 → **采纳**。
- **决策**：
  - `find_department`：拉全量 875 个部门（缓存 5 分钟）→ 用已知部门名做最长匹配切词（「东校中学2025级」→ `[东校, 中学, 2025级]`）→ 在每节点的祖先路径上匹配全部 token → 按深度降序返回。
  - `find_user`：有部门线索时先取该部门花名册（一次调用即含完整档案）再本地按姓名过滤；匹配不到时回退到搜索接口（覆盖拼音/工号）。
- **后果**：增加约 40ms 部门树遍历开销（可忽略，因为是一次缓存拉取 + Set `has` 内存操作）。这两个工具描述里用 ⚠️ 明确警示了不推荐原生搜索替代。

---

## ADR-08：只读网关——明确不暴露写操作

- **日期**：2026-09-09
- **状态**：已采纳
- **背景**：通讯录/考勤的写操作接口（部门增删改、用户增删改、打卡补签）路径均已探测确认存在，但 MCP 无鉴权——任何链接本网关的 Agent 都能调。暴露写操作的安全风险远大于收益。
- **考虑过的方案**：
  1. 全部 CRUD → 风险不可控，MCP 无鉴权层。
  2. 只读 + 增改（不含删除）→ 增改也可能产生脏数据。
  3. **纯粹只读** → **采纳**。
- **决策**：27 个工具全部标注 `readOnlyHint: true` / `destructiveHint: false`。已探明的写操作路径记录在 `docs/API.md` 的「已探明但未接入」节，供未来做权限层后参考。
- **何时重新审视**：当 MCP 协议支持 per-tool auth、或网关外部加了认证中间件时。

---

## ADR-09：每个 Zod 参数实例独立创建，避免 `$ref`

- **日期**：2026-09-09
- **状态**：已采纳
- **背景**：宜搭工具中 `createFromTimeGMT` 和 `createToTimeGMT` 最初复用了同一个 zod 实例 `$ref`，导致 JSON Schema 中 `createToTimeGMT` 引用 `#/properties/createFromTimeGMT`——部分 MCP 客户端不解析 `$ref`，参数变成无类型。
- **决策**：用工厂函数 `P.gmtFrom()` / `P.gmtTo()` 每次都返回新的 zod 实例，schema 中各自独立。
- **后果**：每个参数描述独立，但确保了跨客户端兼容性。
---

## ADR-10：formUuid 和 userId 自动补全——让 Agent 不关心这两项

- **日期**：2026-09-09

- **状态**：已采纳

- **背景**：宜搭所有服务端 API 强制要求 userId 和 formUuid。公司管理员需要知道「这个应用的 creator 的 userId 是多少」「这个应用的 formUuid 是什么」，而这是 Admin 才有的上帝视角——普通 Agent 不该关心。

- **考虑过的方案**：

  1. 保持 formUuid 为必填、userId 靠配置 → API 能查但 Agent 必须自己串 list_forms。

  2. 工具参数全部可选，网关自动补全 → **采纳**。

- **决策**：

  - 5 个需要 formUuid 的工具（get_form_fields / get_form_components / query_form_data / search_form_data / list_process_instances）全部把 formUuid 改为可选。

  - resolveAuto(appName, userId?, formUuid?) 统一处理：userId 优先级 1)显式传入 2)表单 creator（自动 bootstrap，缓存 10 分钟）；formUuid 1)传入 2)单表单自动取 3)多表单抛列清单。

  - resolveAppAuth() 首次调用时自动 bootstrap：调 list_forms 取 creator 作为 userId，无需 .env.yml 配置。

- **为什么选这个**：Agent 说的「查一下参赛申请的数据」天然对应「appName=学生外出参赛申请」，不应额外要求「请先去查 formUuid 再回来告诉我」。

- **后果**：单一表单应用（大多数场景）现只需 appName 即可拉全部数据。多表单应用会被清晰告知「请从以下 X 个表单中选择」。