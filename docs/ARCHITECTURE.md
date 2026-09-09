# ARCHITECTURE — 钉钉数据网关

## 系统概述

```
┌─────────┐  stdio/HTTP   ┌───────────────────────────────┐
│ MCP     │ ────────────▶ │ dingtalk-data-gateway         │
│ Client  │               │                               │
│(Claude) │ ◀──────────── │ McpServer (26 个 tool)        │
└─────────┘  JSON-RPC     │   + instructions + Resource   │
                          │   + ToolAnnotations           │
                          ├───────────────────────────────┤
                          │ Gateway                       │
                          │   统一错误包装 + 分页封装       │
                          ├───────────────────────────────┤
                          │ Service                       │
                          │   数据清洗/归一化              │
                          │   批处理(getAttendance x N)   │
                          │   模糊算法(部门树最长匹配切词) │
                          ├───────────────────────────────┤
                          │ Client                        │
                          │   裸 HTTP 调用钉钉 API        │
                          │   3 种风格适配                │
                          ├───────────────────────────────┤
                          │ Auth (TokenManager)            │
                          │   Promise 锁 + 7200s 缓存     │
                          │   300s 提前刷新缓冲            │
                          ├───────────────────────────────┤
                          │ Config (.env.yml → Zod)       │
                          └───────────────┬───────────────┘
                                          │
                              ┌───────────┴───────────┐
                              │   钉钉开放平台         │
                              │  ┌─────────────────┐  │
                              │  │ oapi.dingtalk.com│  │  ← 旧版 OAPI
                              │  │ (form-encoded)   │  │    通讯录/考勤
                              │  ├─────────────────┤  │
                              │  │ api.dingtalk.com │  │  ← 新版 API
                              │  │ (JSON)           │  │    通讯录搜索/考勤组详情/宜搭
                              │  └─────────────────┘  │
                              └───────────────────────┘
```

## 核心模块
| 模块 | 路径 | 职责 |
|---|---|---|
| MCP 服务器 | `src/mcp/server.ts` | 创建 McpServer，注册 instructions/Resource/全部工具 |
| 工具定义 | `src/mcp/tools/` | 27 个 MCP tool（Zod 参数校验 + 注解） |
| 工具注解 | `src/mcp/tools/annotations.ts` | 统一只读声明 |
| Agent 指南 | `src/mcp/guide.ts` | `SERVER_INSTRUCTIONS`（2061 字符）+ `GUIDE_MARKDOWN`（Resource） |
| Gateway | `src/gateway/gateway.ts` | 单例门面：try/catch → `{success, data/error}` + 分页 |
| 认证 | `src/auth/token-manager.ts` | 单例：缓存 + Promise 锁 + 提前刷新 |
| 配置 | `src/config/` | `.env.yml` → YAML parse → Zod validate → frozen export |
| 客户端 | `src/clients/` | 每种 Client 一个文件，每个方法带完整 URL |
| BaseClient | `src/clients/base-client.ts` | `oapiRequest`（表单 POST）、`oapiGet`（query 参数 GET）、`newApiRequest`（JSON POST/GET） |
| 服务 | `src/services/` | 数据归一化 + 模糊算法 + 批量串行 |
| 工具库 | `src/lib/` | 错误类、pino 日志、指数退避重试、常量 |

## 模块关系
```
Config ──（单例获取）──▶ TokenManager
                            │
                ┌───────────┴────────────┐
                │  BaseClient (abstract)  │
                │  oapiRequest()          │  ← form-encoded POST
                │  oapiGet()              │  ← query-param GET
                │  newApiRequest()        │  ← JSON POST/GET
                └───┬──────┬──────┬──────┘
                    │      │      │
            Contacts  Attendance  Yida
             Client    Client    Client
                │        │        │
                ▼        ▼        ▼
            Service   Service   Service
            (归一化)  (批处理)  (i18n 解包)
                │        │        │
                └────────┼────────┘
                         ▼
                      Gateway
                         │
                         ▼
                   MCP 工具定义
                   (Zod 校验 + 注解)
                         │
                         ▼
                    McpServer
```

## 数据流（一次典型调用）
```
用户: "东校中学2025级今天谁迟到了"
  → Agent: dingtalk_find_department({query:"东校中学2025级"})
    → Gateway → Service → getAllDepartments（缓存命中 → 本地切词匹配）
    → 返回 [{id:1061751754, path:".../东校/中学/2025级"}]
  → Agent: dingtalk_list_department_user_ids({deptId:1061751754})
    → Gateway → Service → Client.getDepartmentUserIds()
    → 返回 {userIds:[...44个]}
  → Agent: dingtalk_get_attendance({userIds:[...44个], workDate:"2026-09-09"})
    → Gateway → Service → for each userId: Client.getAttendance()
    → 合并 44 次结果 → 过滤 Late + OnDuty → 返回迟到列表
```

## 外部系统
| 系统 | 关系 | 请求风格 |
|---|---|---|
| `oapi.dingtalk.com` | 旧版 OAPI | `application/x-www-form-urlencoded` POST，`access_token` 表单参数 |
| `api.dingtalk.com` | 新版 API | JSON body，`x-acs-dingtalk-access-token` header |
| `oapi.dingtalk.com/department/list` | 唯一 OAPI GET | `access_token` 作为 query 参数 |

## 重要技术边界
1. **完整 URL**：baseURL 不准共享——每个 Client 方法内硬编码完整 URL（`const OAPI = "https://oapi.dingtalk.com"` + path）。
2. **两代 API 共存**：旧版 OAPI 用 `errcode/errmsg/result` 信封，新版用 HTTP status + `code/message`——BaseClient 各自处理。
3. **单用户接口批处理**：`getupdatedata` 只接受一个 `userid`，AttendanceService 内部 `for...of` 遍历，失败用户 skip。
4. **部门树缓存**：`/department/list` 返回全公司 875 个部门，ContactsService 缓存 5 分钟。
5. **宜搭 userId 强制**：所有宜搭接口必须传一个有数据权限的 userId，配置在 `.env.yml` 的 `YidaApps[].userId`。
6. **无持久化**：Token 和部门树是唯二的运行时缓存，不落盘。
7. **只读网关**：27 个工具全部标注 `readOnlyHint: true` / `destructiveHint: false`。