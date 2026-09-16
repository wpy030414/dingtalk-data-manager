# 钉钉数据网关 — 接口清单

所有接口均通过真实企业凭证验证。**每个请求方法内携带完整 URL，不共用 baseURL**（钉钉 API 版本繁多）。

---

## 认证

| 用途 | 方法 | 完整 URL |
|---|---|---|
| 获取企业内部应用 access_token | GET | `https://oapi.dingtalk.com/gettoken?appkey={ClientID}&appsecret={ClientSecret}` |

- 返回 `{access_token, expires_in}`；`expires_in` 官方默认 7200 秒
- 由 `TokenManager` 单例统一缓存/刷新（Promise 锁 + 300s 提前刷新缓冲），业务层无感

---

## 通讯录（Contacts）

通讯录**横跨两代 API**，baseURL 与一级 path 都不一致：

| 代次 | baseURL + 一级 path | 请求风格 | 认证 |
|---|---|---|---|
| 旧版 OAPI | `https://oapi.dingtalk.com/topapi/...` | `application/x-www-form-urlencoded` | `access_token` 表单参数 |
| 新版 API | `https://api.dingtalk.com/v1.0/contact/...` | JSON body | `x-acs-dingtalk-access-token` header |

### 旧版 OAPI

| MCP 工具 | 方法 | 完整 URL | 关键参数 |
|---|---|---|---|
| `dingtalk_list_departments` | POST | `https://oapi.dingtalk.com/topapi/v2/department/listsub` | `dept_id` |
| `dingtalk_get_department` | POST | `https://oapi.dingtalk.com/topapi/v2/department/get` | `dept_id` |
| `dingtalk_list_sub_department_ids` | POST | `https://oapi.dingtalk.com/topapi/v2/department/listsubid` | `dept_id`（仅 ID，不分页） |
| `dingtalk_list_all_departments` | **GET** | `https://oapi.dingtalk.com/department/list` | 无（一次返回全公司，约 900 条，缓存 5 分钟） |
| `dingtalk_list_users` | POST | `https://oapi.dingtalk.com/topapi/v2/user/list` | `dept_id`, `cursor`, `size` |
| `dingtalk_list_department_user_ids` | POST | `https://oapi.dingtalk.com/topapi/user/listid` | `dept_id`（仅 ID，不分页） |
| `dingtalk_get_user` | POST | `https://oapi.dingtalk.com/topapi/v2/user/get` | `userid` |
| `dingtalk_get_user_by_mobile` | POST | `https://oapi.dingtalk.com/topapi/v2/user/getbymobile` | `mobile` |
| `dingtalk_get_user_by_unionid` | POST | `https://oapi.dingtalk.com/topapi/user/getbyunionid` | `unionid` |

> ⚠️ `/department/list` 是**唯一走 GET 的 OAPI 端点**（`access_token` 作为 query 参数），其余 OAPI 都是表单编码 POST。
> 它返回的字段是 `id / name / parentid`，而 v2 接口是 `dept_id / name / parent_id` —— 命名不统一，网关负责归一化。

> `get_user_by_mobile` / `get_user_by_unionid` 是**多接口串联**：网关先查 ID，再自动补全完整用户详情。

### 新版 API

| MCP 工具 | 方法 | 完整 URL | 关键参数 |
|---|---|---|---|
| `dingtalk_search_users` | POST | `https://api.dingtalk.com/v1.0/contact/users/search` | `queryWord`, `offset`, `size`(≤20), `fullMatchField` |
| `dingtalk_search_departments` | POST | `https://api.dingtalk.com/v1.0/contact/departments/search` | `queryWord`, `offset`, `size`(≤20) |
| `dingtalk_find_department` | —（网关本地） | 基于 `/department/list` 全量缓存做路径匹配 | `query`, `limit` |
| `dingtalk_find_user` | —（网关本地） | 部门花名册 + 姓名本地匹配（回退到搜索接口） | `name`, `deptHint?`, `limit` |

> 两个搜索接口原生只返回 ID 列表，网关默认**并发补全**每条命中的完整详情（`hydrate=false` 可关闭以提速）。
> `fullMatchField`：`0`=姓名 精确匹配，`1`=工号，`2`=手机号；不传为模糊搜索。

### ⚠️ 搜索语义（实测）

**钉钉原生部门/用户搜索是「单 token 子串匹配」，不做分词：**

| 查询 | 结果 |
|---|---|
| `东校` | 853 命中 |
| `2025级` | 168 命中 |
| `中学` | 8 命中 |
| **`东校中学2025级`** | **0 命中** ❌ |
| **`东校 中学`** | **0 命中** ❌ |

用户说的「东校中学2025级」在钉钉里其实是三层部门 `东校 / 中学 / 2025级`，字面量不存在于任何部门名。

**`dingtalk_find_department` 就是为此而生**：切词（无空格时用已知部门名做最长匹配）→ 在全量部门树上按祖先路径匹配 → 返回带完整路径的候选（最具体优先）。

```
find_department("东校中学2025级")
→ 合肥一六八玫瑰园学校东校 / 东校 / 中学 / 2025级 (id=1061751754)
   合肥一六八玫瑰园学校东校 / 繁华校区 / 中学 / 2025级 (id=1061751768)
```

**`dingtalk_find_user` 解决「东校的张老师」**：有 `deptHint` 时先取该部门**花名册**（一次调用即含完整档案）再本地按姓名过滤——比「先全库搜人再过滤」更准，因为后者受搜索分页限制（`size≤20`），目标可能不在前几页里。本地匹配不到时回退到搜索接口（覆盖拼音/工号）。

```
find_user({name:"夏", deptHint:"东校中学2025级"})
→ 夏星辰 | 主任助理 | 175465313922757056
   （部门：合肥一六八玫瑰园学校东校 / 东校 / 中学 / 2025级）
```

**宜搭 `searchFieldJson` 则是「包含匹配」的真模糊搜索**（实测）：`津` → 命中 `天津`，`无人机` → 命中长文本事由，反向对照 `不存在的城市xyz` → 0 命中。

---

## 考勤（Attendance）

同样横跨两代 API：

| 代次 | baseURL + 一级 path | 请求风格 |
|---|---|---|
| 旧版 OAPI | `https://oapi.dingtalk.com/topapi/attendance/...` | 表单编码 + `access_token` |
| 新版 API | `https://api.dingtalk.com/v1.0/attendance/...` | JSON + `x-acs-dingtalk-access-token` |

| MCP 工具 | 方法 | 完整 URL | 关键参数 |
|---|---|---|---|
| `dingtalk_get_attendance` | POST | `https://oapi.dingtalk.com/topapi/attendance/getupdatedata` | `userid`（**仅支持单个用户**）, `work_date` |
| `dingtalk_get_leave_status` | POST | `https://oapi.dingtalk.com/topapi/attendance/getleavestatus` | `userid_list`（逗号分隔）, `start_time`, `end_time`（毫秒时间戳） |
| `dingtalk_list_attendance_groups` | POST | `https://oapi.dingtalk.com/topapi/attendance/getsimplegroups` | `offset`, `size` |
| `dingtalk_list_attendance_schedule` | POST | `https://oapi.dingtalk.com/topapi/attendance/listschedule` | `workDate`, `offset`, `size` |
| `dingtalk_get_attendance_group_details` | GET | `https://api.dingtalk.com/v1.0/attendance/groupDetails` | `cursor`（游标，首次不传）, `size` |

> `getupdatedata` 只接受单用户，`AttendanceService` 内部自动遍历 `userIds` 逐个拉取并合并结果。
> `getsimplegroups`（旧版）与 `groupDetails`（新版）都返回考勤组，但字段命名与分页方式不同（`offset/size` vs 游标 `cursor/size`）——两者都保留以覆盖不同场景。

### 已探明但未接入（通讯录 / 考勤）

以下路径均已用真实凭证探测确认存在（返回「缺参数」而非「不合法ApiName」），但按**只读网关**的定位未暴露为工具：

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/topapi/v2/department/create` | 创建部门 |
| POST | `/topapi/v2/department/update` | 更新部门 |
| POST | `/topapi/v2/department/delete` | 删除部门 |
| POST | `/topapi/v2/user/create` | 创建用户 |
| POST | `/topapi/v2/user/update` | 更新用户 |
| POST | `/topapi/v2/user/delete` | 删除用户 |
| POST | `/topapi/attendance/schedule/listbyday` | 按天查询个人排班（需 `op_user_id` + `user_id` + `date_time`） |
| GET | `/v1.0/attendance/shifts` | 查询班次详情（需 `shiftId`） |
| POST | `/v1.0/attendance/checkin/records/query` | 打卡记录查询（**需申请 `qyapi_checkin_read` 权限**） |
| POST | `/v1.0/attendance/vacations/records/query` | 请假记录查询（需有效 `leaveCode`） |
| GET | `/v1.0/contact/empLeaveRecords` | 离职记录（需 `maxResults`） |
| GET | `/v1.0/contact/users/{unionId}` | 按 unionId 取用户（**需申请 `Contact.User.Read` 权限**） |

---

## 宜搭（Yida）

域名 `https://api.dingtalk.com`，**新版 API 风格**：JSON body，`x-acs-dingtalk-access-token` header。

**所有宜搭接口都强制要求 `userId`** —— 网关自动从表单创建者获取（`list_forms` 返回的 `creator`），对 Agent 和配置完全透明。不需要在 `.env.yml` 中配置 userId。

> ⚡ **formUuid 和 userId 均可自动补全**（2026-09-09）：需要表单 ID 的工具（`get_form_fields` / `query_form_data` / `search_form_data` / `get_form_components` / `list_process_instances`）现均支持不传 `formUuid` 和 `userId`。
> 网关自动：①取表单列表的 `creator` 作为 userId（表单创建者一定有数据权限）；②若应用仅 1 个表单则自动取 formUuid。单一表单应用只需传 `appName`：
> ```
> query_form_data({appName:"学生外出参赛申请"}) → total=8 ✅
> ```

### 表单与字段

| MCP 工具 | 方法 | 完整 URL | 关键参数 |
|---|---|---|---|
| `dingtalk_yida_list_forms` | GET | `https://api.dingtalk.com/v1.0/yida/forms` | `appName`, `pageSize`, `pageNumber`。返回每个表单的 `formUuid` + `fields[{fieldId, label}]`，一步拿到字段 ID 和中文名 |
| `dingtalk_yida_get_form_fields` | GET | `https://api.dingtalk.com/v1.0/yida/forms/formFields` | `appName`, `formUuid`（可选） |
| `dingtalk_yida_get_form_components` | GET | `https://api.dingtalk.com/v1.0/yida/forms/definitions/{appType}/{formUuid}` | `appName`, `formUuid`（可选） |

> `formFields` 返回字段 ID → 中文标签映射。**通常不需要调这个工具**——`list_forms` 已自带 `fieldId` + 中文标签（一步到位），仅当需要组件类型/`behavior` 等额外元数据时才用。

### 表单数据

| MCP 工具 | 方法 | 完整 URL | 关键参数 |
|---|---|---|---|
| `dingtalk_yida_query_form_data` | POST | `https://api.dingtalk.com/v1.0/yida/forms/instances/query` | `appName`, `formUuid`（可选）, `searchFieldJson`, `originatorId`, `createFromTimeGMT`, `createToTimeGMT`, `pageSize`, `pageNumber` |
| `dingtalk_yida_search_form_data` | POST | `https://api.dingtalk.com/v1.0/yida/forms/instances/search` | 同上，另支持 `dynamicOrder`, `logicOperator`, `currentPage` |

### 流程实例与审批

| MCP 工具 | 方法 | 完整 URL | 关键参数 |
|---|---|---|---|
| `dingtalk_yida_list_process_instances` | POST | `https://api.dingtalk.com/v1.0/yida/processes/instances` | `appName`, `formUuid`（可选）, `instanceStatus`, `approvedResult`, `originatorId`, `createFromTimeGMT`, `createToTimeGMT`, `searchFieldJson`, `pageSize`, `pageNumber` |
| `dingtalk_yida_get_process_instance` | GET | `https://api.dingtalk.com/v1.0/yida/processes/instancesInfos/{processInstanceId}` | `appName`, `processInstanceId` |
| `dingtalk_yida_get_operation_records` | GET | `https://api.dingtalk.com/v1.0/yida/processes/operationRecords` | `appName`, `processInstanceId` |

> 注意区分：`processes/instances`（复数，列表，POST）vs `processes/instancesInfos/{id}`（单实例详情，GET）。

---

## 已探明但尚未接入的宜搭接口

来自官方 SDK `@alicloud/dingtalk`（`yida_1.0`）的完整路径表，共 100 个。常用候选：

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/v1.0/yida/forms/instances` | 新增表单数据（SaveFormData） |
| PUT | `/v1.0/yida/forms/instances` | 更新表单数据（UpdateFormData） |
| DELETE | `/v1.0/yida/forms/instances` | 删除表单数据（DeleteFormData） |
| GET | `/v1.0/yida/forms/instances/{id}` | 按实例 ID 取表单数据（GetFormDataByID） |
| POST | `/v1.0/yida/forms/instances/ids/query` | 批量按 ID 取表单数据 |
| POST | `/v1.0/yida/forms/instances/search` | 条件搜索表单实例 |
| POST | `/v1.0/yida/forms/instances/advances/query` | 高级查询（不含子表单） |
| POST | `/v1.0/yida/forms/instances/advances/queryAll` | 高级查询（含子表单） |
| POST | `/v1.0/yida/processes/instances/start` | 发起流程 |
| PUT | `/v1.0/yida/processes/instances/terminate` | 终止流程 |
| DELETE | `/v1.0/yida/processes/instances` | 删除流程实例 |
| GET | `/v1.0/yida/tasks/runningTasks/query` | 查询运行中任务 |
| POST | `/v1.0/yida/tasks/execute` | 执行任务（同意/拒绝） |
| GET | `/v1.0/yida/processes/tasks/getRunningTasks` | 获取运行中任务 |
| GET | `/v1.0/yida/apps/navigations` | 获取应用导航 |
| POST | `/v1.0/yida/apps/customApi/execute` | 执行自定义 API |
| GET | `/v1.0/yida/forms/remarks/query` | 查询表单评论 |

> `/v1.0/yida/apps/forms/query` 需要宜搭应用的 `appKey`（不是钉钉 ClientID），当前未接入。

---

## 错误码速查

| 错误 | 含义 | 处理 |
|---|---|---|
| `errcode: 88` | IP 不在白名单 | 到钉钉开放平台后台添加出口 IP |
| `errcode: 40014/42001` | access_token 无效/过期 | TokenManager 自动刷新 |
| `errcode: 22` | 不合法 ApiName | 检查 URL 路径 |
| `MissinguserId` | 宜搭接口缺 userId | 网关自动从表单创建者获取，通常不会出现 |
| `MissingformUuid` | 宜搭接口缺 formUuid | 先调 `dingtalk_yida_list_forms` 取 |
| `InvalidAction.NotFound` | 路径/方法错误 | 对照本文档核对完整 URL |
