# AGENTS.md

钉钉企业数据网关 — 27 个只读 MCP 工具，横跨通讯录/考勤/宜搭三域。Agent 通过 stdio/HTTP 调用，无需鉴权。

## 概述
- 本项目是什么：一个 **MCP Server**，把钉钉开放接口代理鉴权、清洗、串联后，以标准化格式暴露给本地 Agent。
- 语言：TypeScript（ESM，Node.js ≥20）
- 打包器：Vite 8（lib mode SSR build）
- 包管理器：pnpm 12

## 边界与范围
- **范围内**：从钉钉只读 API 拉取通讯录、考勤、宜搭数据，归一化后通过 MCP stdio/HTTP 返回。
- **非目标（明确排除）**：
  - **写操作**（创建/修改/删除部门、用户、表单、流程）。全部 27 个工具都是只读。
  - Web UI、REST API、GraphQL 等其他暴露方式。
  - 钉钉消息/日历/文档等不在三域之内的功能。
  - 数据持久化或缓存（Token 之外不缓存任何业务数据）。

## Agent 操作指南
- **如何理解本项目**：读取 `src/mcp/guide.ts` 中的 `SERVER_INSTRUCTIONS`——那就是 Agent 连接时收到的全局说明。
- **入口文件**：`src/index.ts` → stdio transport（`node dist/index.js`）；HTTP 模式用 `src/server.ts`。
- **架构层级**（自底向上）：`Config → Auth → Client → Service → Gateway → MCP Tools`。
- **关键约定**：
  - 每个 API 请求方法内携带**完整 URL**，不共用 baseURL（钉钉两代 API 的 baseURL 和一级 path 不同）。
  - 全部工具带 `ToolAnnotations`（readOnlyHint/idempotentHint/destructiveHint/openWorldHint）。
  - 返回统一信封 `{ success, data, error?, pagination? }`。
- **测试**：`vitest`，别名 `@` → `src/`。端到端测试脚本 `test-*.mjs` 直接 spawn dist/index.js。
- **钉钉搜索陷阱**：原生 `search_users/search_departments` 是**单 token 子串匹配**——复合名 0 命中。网关提供了 `find_department`（全量部门树路径匹配）和 `find_user`（部门花名册本地过滤）作为补救。

## 目录速查
| 路径 | 职责 |
|---|---|
| `src/index.ts` | stdio MCP 入口 |
| `src/server.ts` | HTTP MCP 入口 |
| `src/config/` | `.env.yml` 加载 + Zod 校验 |
| `src/auth/` | accessToken 获取 + 单例缓存/刷新/锁 |
| `src/clients/` | 裸 HTTP 调用钉钉 API（3 种风格：OAPI POST、OAPI GET、新 API JSON） |
| `src/services/` | 数据清洗、归一化、批处理、模糊查询算法 |
| `src/gateway/` | 统一门面：错误包装 + 分页封装 |
| `src/mcp/` | MCP 服务器 + 27 个工具定义 + instructions/Resource |
| `src/lib/` | 错误类、日志（pino）、重试、常量、工具函数 |
| `docs/` | API 速查、PRD、架构、决策记录 |
| `tests/unit/` | vitest 单元测试（含 mock） |
| `test-*.mjs` | 端到端测试脚本（真实凭证，不进 git） |
| `.env.yml` | 凭证（gitignored） |
| `.env.yml.example` | 配置模板 |