# Spec — 通讯录模块（Contacts）

## 要构建什么
- **目标**：通过 13 个只读 MCP 工具暴露钉钉通讯录数据，支持模糊姓名/部门名定位。

## 行为
- 部门列表/详情/子部门 ID/全量部门树（含缓存）
- 成员列表（含详情档案）/ 成员 ID（仅 ID，快）
- 按手机号 / unionId 查用户（网关内部串联：ID 查询 → 详情补全）
- 关键词搜索用户/部门（新版 API，支持中文/拼音）
- **模糊定位**：
  - `find_department(query)`：切词 → 全量部门树祖先路径匹配 → 返回最具体候选
  - `find_user(name, deptHint?)`：有部门线索时先取部门花名册再本地按姓名过滤（回退到搜索接口）

## 输入 / 输出
- **输入**：deptId（数字）、userId（字符串）、name/queryWord（中文/拼音片段）、mobile、unionId
- **输出**：`{ success, data: { users/departments/matches }, pagination? }`

## 约束
- 横跨两代 API：旧版 `oapi.dingtalk.com/topapi/...`（表单编码） + 新版 `api.dingtalk.com/v1.0/contact/...`（JSON）
- 唯一 GET OAPI：`/department/list`（旧版域但走 GET，access_token 为 query 参数）
- 部门/用户接口只返回**直属**成员/子部门，不含孙级
- `search_users` / `search_departments` 是单 token 子串匹配——复合名 0 命中

## 边界条件
- 根部门（deptId=1）通常只有管理员本人
- 用户搜索 `size` 限制 20，命中数可能远大于此（如「张」→ 1744）
- `get_user_by_mobile` / `get_user_by_unionid` 查不到时抛 `NotFoundError`
- 部门树缓存 TTL 5 分钟

## 验收标准
- [x] 13 个工具全部通过真实企业数据验证
- [x] `find_department("东校中学2025级")` 返回「东校 / 中学 / 2025级」，含完整路径
- [x] `find_user({name:"夏", deptHint:"东校中学2025级"})` 返回夏星辰
- [x] 单元测试覆盖 19 个用例

## 完成定义
- [x] 全部工具定义、参数描述、只读注解就位
- [x] Agent 可通过全局 instructions 了解推荐链路