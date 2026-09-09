/**
 * 服务器级说明（MCP `initialize` 的 instructions 字段）。
 * 客户端会把它注入模型上下文，是 Agent 了解「本服务能做什么、该怎么串」的入口。
 */
export const SERVER_INSTRUCTIONS = `钉钉企业数据网关（只读，无任何写/删操作）。27 个工具，覆盖三个域：

【通讯录 · 13 个】
  dingtalk_find_department  ← 模糊部门名定位（推荐）
  dingtalk_find_user        ← 模糊人名 + 部门线索定位（推荐）
  dingtalk_list_departments / get_department / list_sub_department_ids / list_all_departments
  dingtalk_list_users / list_department_user_ids / get_user
  dingtalk_get_user_by_mobile / get_user_by_unionid
  dingtalk_search_users / search_departments

【考勤 · 5 个】
  dingtalk_get_attendance / get_leave_status
  dingtalk_list_attendance_groups / list_attendance_schedule / get_attendance_group_details

【宜搭 · 9 个】
  dingtalk_yida_list_apps / list_forms / get_form_fields / get_form_components
  dingtalk_yida_query_form_data / search_form_data
  dingtalk_yida_list_process_instances / get_process_instance / get_operation_records

── 推荐链路 ──
1. 模糊找部门：「东校中学2025级」→ dingtalk_find_department(query)，返回带完整路径的候选，取 deptId
   ⚠️ 不要用 search_departments 搜复合名——钉钉原生搜索是单 token 子串匹配，「东校中学2025级」会 0 命中
2. 模糊找人：「东校的张老师」→ dingtalk_find_user({name:"张", deptHint:"东校"})
   只要姓名片段：dingtalk_search_users(queryWord)；要精确同名加 fullMatchField=0
3. 部门成员：dingtalk_list_department_user_ids（仅 ID，快）或 dingtalk_list_users（含详情）
4. 某人某天考勤：dingtalk_get_attendance({userIds:[...], workDate:"YYYY-MM-DD"})
5. 宜搭查数据（formUuid 和 userId 均可选——网关自动补全）：
   单表单应用只需 dingtalk_yida_query_form_data({appName}) 即可拿数据
   需要字段翻译时调 dingtalk_yida_get_form_fields(formUuid可选)
   需要搜索时调 search_form_data(searchFieldJson='{"字段ID":"关键词"}')
6. 审批进度：dingtalk_yida_list_process_instances → get_process_instance / get_operation_records

── 关键约定 ──
- 所有返回统一信封 { success, data, error?, pagination? }；success=false 时读 error.code / error.message
- 宜搭所有接口必须传 appName（来自 .env.yml 配置）；userId 通常已在配置里，无需传
- 宜搭 searchFieldJson 是【包含匹配】的模糊搜索，格式 '{"字段ID":"关键词"}'（如 '{"textField_mr4at0xc":"无人机"}'）
  字段 ID 必须先调 get_form_fields 获取，不能凭猜
- 宜搭表单数据的 key 是字段 ID（如 textField_mr4at0xc），对照 get_form_fields 的中文标签解读
- 考勤打卡接口只支持单用户，网关已自动批处理，直接传 userIds 数组
- 大结果集优先用「仅 ID」工具（list_department_user_ids / list_sub_department_ids）再按需补详情
- 部门/用户接口只返回**直属**成员，不含下级部门；需要下级时用 list_sub_department_ids 递归
- 全部工具均标注 readOnlyHint=true / destructiveHint=false / idempotentHint=true，可安全重试`;

/**
 * 通过 MCP Resource 暴露的完整接口清单（Agent 可按需读取，不占用初始上下文）。
 */
export const GUIDE_MARKDOWN = `# 钉钉数据网关 · 接口速查

## 认证
GET https://oapi.dingtalk.com/gettoken?appkey={ClientID}&appsecret={ClientSecret}
→ {access_token, expires_in}；网关内部自动缓存/刷新，业务层无感。

## 通讯录（两代 API 混用）
| 工具 | 方法 | 完整 URL |
|---|---|---|
| list_departments | POST | https://oapi.dingtalk.com/topapi/v2/department/listsub |
| get_department | POST | https://oapi.dingtalk.com/topapi/v2/department/get |
| list_sub_department_ids | POST | https://oapi.dingtalk.com/topapi/v2/department/listsubid |
| list_all_departments | GET  | https://oapi.dingtalk.com/department/list  ← 唯一走 GET 的 OAPI |
| find_department | —（本地） | 基于 /department/list 全量缓存做路径匹配 |
| find_user | —（本地） | search_users + 部门成员名单交叉过滤 |
| list_users | POST | https://oapi.dingtalk.com/topapi/v2/user/list |
| list_department_user_ids | POST | https://oapi.dingtalk.com/topapi/user/listid |
| get_user | POST | https://oapi.dingtalk.com/topapi/v2/user/get |
| get_user_by_mobile | POST | https://oapi.dingtalk.com/topapi/v2/user/getbymobile |
| get_user_by_unionid | POST | https://oapi.dingtalk.com/topapi/user/getbyunionid |
| search_users | POST | https://api.dingtalk.com/v1.0/contact/users/search |
| search_departments | POST | https://api.dingtalk.com/v1.0/contact/departments/search |

## 考勤（两代 API 混用）
| 工具 | 方法 | 完整 URL |
|---|---|---|
| get_attendance | POST | https://oapi.dingtalk.com/topapi/attendance/getupdatedata |
| get_leave_status | POST | https://oapi.dingtalk.com/topapi/attendance/getleavestatus |
| list_attendance_groups | POST | https://oapi.dingtalk.com/topapi/attendance/getsimplegroups |
| list_attendance_schedule | POST | https://oapi.dingtalk.com/topapi/attendance/listschedule |
| get_attendance_group_details | GET | https://api.dingtalk.com/v1.0/attendance/groupDetails |

## 宜搭（全部新版 API，域名 https://api.dingtalk.com）
| 工具 | 方法 | 完整 URL |
|---|---|---|
| yida_list_forms | GET | /v1.0/yida/forms |
| yida_get_form_fields | GET | /v1.0/yida/forms/formFields |
| yida_get_form_components | GET | /v1.0/yida/forms/definitions/{appType}/{formUuid} |
| yida_query_form_data | POST | /v1.0/yida/forms/instances/query |
| yida_search_form_data | POST | /v1.0/yida/forms/instances/search |
| yida_list_process_instances | POST | /v1.0/yida/processes/instances |
| yida_get_process_instance | GET | /v1.0/yida/processes/instancesInfos/{id} |
| yida_get_operation_records | GET | /v1.0/yida/processes/operationRecords |

宜搭所有接口都强制要求 userId（有该应用数据权限的用户），配置在 .env.yml 的 YidaApps[].userId。

## 搜索语义（重要）
- **通讯录 search_users / search_departments**：单 token 子串匹配。复合查询如「东校中学2025级」会 0 命中 → 用 dingtalk_find_department
- **dingtalk_find_user**：先按姓名搜人，再用部门成员名单交叉过滤，解决「东校的张老师」
- **宜搭 searchFieldJson**：包含匹配（模糊）。"津" 能命中 "天津"，"无人机" 能命中长文本事由
`;

