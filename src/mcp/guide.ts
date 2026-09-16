/**
 * 服务器级说明（MCP `initialize` 的 instructions 字段）。
 * 客户端会把它注入模型上下文，是 Agent 了解「本服务能做什么、该怎么串」的入口。
 */
export const SERVER_INSTRUCTIONS = `钉钉企业数据网关（只读）。18 个工具，三个域：

【通讯录 · 10】find_department / find_user / search_users / search_departments / list_users / list_department_user_ids / get_user / get_user_by_mobile / get_user_by_unionid / list_all_departments

【考勤 · 4】get_attendance / get_leave_status / list_attendance_schedule / get_attendance_group_details

【宜搭 · 4】list_forms / query_form_data / list_process_instances / get_process_instance

── 推荐链路 ──
找部门：find_department("东校中学2025级") → 取 deptId
找人：find_user({name:"张", deptHint:"东校"}) → 取 userId → get_attendance / get_user
查宜搭：list_forms({appName:"外出申请"}) → 拿 formUuid + fieldId → query_form_data({appName, formUuid, searchFieldJson})
查审批：list_process_instances → get_process_instance({processInstanceId, includeRecords:true})
留空 appName：list_forms({}) → 返回全部应用及其表单列表

── 关键约定 ──
- 返回统一信封 { success, data, error?, pagination? }
- 宜搭 searchFieldJson 是包含匹配（模糊），格式 '{"textField_xxx":"关键词"}'
- 宜搭 userId 由网关自动获取，Agent 无需关心
- 部门/用户搜索只返回直属成员；需要下级时用 list_all_departments 拿完整树`;

/**
 * 通过 MCP Resource 暴露的完整接口清单（Agent 可按需读取，不占用初始上下文）。
 */
export const GUIDE_MARKDOWN = `# 钉钉数据网关 · 接口速查

## 通讯录（10 工具）
| 工具 | 说明 |
|---|---|
| find_department | 模糊路径名定位部门，支持复合名 |
| find_user | 模糊人名+部门线索定位用户 |
| search_users | 按姓名/拼音/工号搜人（单token子串匹配） |
| search_departments | 按关键词搜部门（单token子串匹配） |
| list_users | 列出部门直属成员及完整档案 |
| list_department_user_ids | 获取部门下全部用户ID（仅ID） |
| get_user | 获取单个用户完整档案 |
| get_user_by_mobile | 按手机号查用户 |
| get_user_by_unionid | 按 unionId 查用户 |
| list_all_departments | 全公司部门树（缓存5分钟） |

## 考勤（4 工具）
| 工具 | 说明 |
|---|---|
| get_attendance | 某天的考勤打卡结果，支持批量 |
| get_leave_status | 时间段内请假/缺勤记录 |
| list_attendance_schedule | 指定日期全公司排班 |
| get_attendance_group_details | 考勤组详情（游标分页） |

## 宜搭（4 工具）
| 工具 | 说明 |
|---|---|
| list_forms | 列出应用及表单（含 fieldId+标签+组件类型）。appName 留空返回全部应用 |
| query_form_data | 查询表单实例数据（分页，searchFieldJson 模糊搜索） |
| list_process_instances | 查询流程实例列表 |
| get_process_instance | 流程实例详情 + 可选审批记录（includeRecords） |

## 搜索语义
- search_users / search_departments：单 token 子串匹配，复合查询用 find_*
- 宜搭 searchFieldJson：包含匹配（模糊）
- find_department：切词后在部门树上按祖先路径匹配
- find_user：有部门线索时先取花名册再本地匹配
`;
