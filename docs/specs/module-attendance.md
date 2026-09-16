# Spec — 考勤模块（Attendance）

## 要构建什么
- **目标**：通过 5 个只读 MCP 工具暴露钉钉考勤数据——打卡结果、请假状态、考勤组、排班。

## 行为
- 按日期查询打卡结果（自动批处理单用户接口）
- 按时间段查询请假/缺勤状态
- 考勤组列表（旧版 API，含班次名称）
- 排班查询（旧版 API，按天全公司）
- 考勤组详情（新版 API，游标分页：cursor 取上一页 nextCursor 回传，首次不传）

## 输入 / 输出
- **输入**：userIds（数组）、workDate/fromDate/toDate（YYYY-MM-DD）、时间戳（毫秒）、游标 cursor
- **输出**：`{ success, data: { records/leaves/groups/schedules }, pagination? }`
  - 打卡记录：checkType（OnDuty/OffDuty）、timeResult（Normal/Late/Early/...）、计划/实际打卡时间
  - 请假：leaveType、duration、startTime/endTime（ISO 字符串）
  - 排班：planCheckTime、groupId、classId

## 约束
- 横跨两代 API：旧版 `oapi.dingtalk.com/topapi/attendance/...`（表单编码） + 新版 `api.dingtalk.com/v1.0/attendance/...`（JSON）
- **最关键的约束**：`getupdatedata` 只接受**单个** userid，网关内部 for 循环逐人调用、跳过失败的
- `getleavestatus` 的 `start_time`/`end_time` 是毫秒时间戳
- 考勤组新旧两版字段命名和分页方式不同（`offset/size` vs 游标 `cursor/size`）
- `checkin/records/query` 需要 `qyapi_checkin_read` 权限——未接入

## 边界条件
- 单用户考勤接口一次调用约 60ms，44 人部门约 2.6s——Agent 应有所预期
- 请假记录 `duration_unit` 为 "day" / "hour"
- 排班接口可能返回 `group_id: -1`（自由班制）

## 验收标准
- [x] 5 个工具全部通过真实企业数据验证
- [x] 东校中学 2025 级 44 人考勤正确识别 2 人迟到（叶宇恒、夏星辰）
- [x] 考勤组「章芳妹哺乳假」等真实数据可读
- [x] 单元测试覆盖 6 个用例（含单用户失败跳过）

## 完成定义
- [x] 全部工具定义、参数描述、只读注解就位
- [x] 批处理逻辑在 Agent 侧透明——Agent 只管传 userIds 数组