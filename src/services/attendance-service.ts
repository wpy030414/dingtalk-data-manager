import { AttendanceClient } from "../clients/attendance-client.js";

export interface AttendanceRecord {
  userId: string;
  checkType: string;
  timeResult: string;
  planCheckTime: string;
  userCheckTime: string;
  locationResult: string;
  groupId: number;
  recordId: number;
}

export interface AttendanceListResult {
  records: AttendanceRecord[];
  total: number;
}

export interface LeaveStatus {
  userId: string;
  startTime: string;
  endTime: string;
  durationUnit: string;
  duration: number;
  leaveType: string;
  status: string;
}

export interface LeaveStatusResult {
  leaves: LeaveStatus[];
  hasMore: boolean;
}

export interface AttendanceGroup {
  groupId: number;
  groupName: string;
  classesList: string[];
  defaultClassId: number;
  enableEmpSelectClass: boolean;
  disableCheckWhenRest: boolean;
  disableCheckWithoutSchedule: boolean;
}

export interface AttendanceSchedule {
  userId: string;
  groupId: number;
  classId: number;
  planId: number;
  planCheckTime: string;
  checkType: string;
}

export interface AttendanceGroupDetail {
  groupId: number;
  groupName: string;
  memberCount: number;
  defaultClassId: number;
  type: string;
  classesList: string[];
  enableEmpSelectClass: boolean;
  disableCheckWithoutSchedule: boolean;
}

export class AttendanceService {
  constructor(private readonly client: AttendanceClient) {}

  async getAttendanceList(params: {
    userIds: string[];
    workDate: string;
  }): Promise<AttendanceListResult> {
    // This API only supports single userid, batch manually
    const allRecords: AttendanceRecord[] = [];
    for (const userId of params.userIds) {
      try {
        const raw = await this.client.getAttendance(userId, params.workDate);
        for (const r of (raw.result?.attendance_result_list ?? [])) {
          allRecords.push({
            checkType: r.check_type,
            timeResult: r.time_result,
            planCheckTime: r.plan_check_time,
            userCheckTime: r.user_check_time,
            locationResult: r.location_result,
            groupId: r.group_id,
            recordId: r.record_id,
            userId,
          });
        }
      } catch {
        // skip failed users
      }
    }
    return { records: allRecords, total: allRecords.length };
  }

  async getLeaveStatus(params: {
    userIds: string[];
    startTime: number;
    endTime: number;
    offset?: number;
    size?: number;
  }): Promise<LeaveStatusResult> {
    const raw = await this.client.getLeaveStatus(params);
    return {
      leaves: (raw.result?.list ?? []).map((l) => ({
        userId: l.userid,
        startTime: new Date(l.start_time).toISOString(),
        endTime: new Date(l.end_time).toISOString(),
        durationUnit: l.duration_unit,
        duration: l.duration,
        leaveType: l.leave_type,
        status: l.status,
      })),
      hasMore: raw.result?.has_more ?? false,
    };
  }

  /** 考勤组列表（旧版 API） */
  async listGroups(params: { offset?: number; size?: number } = {}): Promise<AttendanceGroup[]> {
    const raw = await this.client.getSimpleGroups(params);
    return (raw.result?.groups ?? []).map((g) => ({
      groupId: g.group_id,
      groupName: g.group_name,
      classesList: g.classes_list ?? [],
      defaultClassId: g.default_class_id,
      enableEmpSelectClass: g.enable_emp_select_class,
      disableCheckWhenRest: g.disable_check_when_rest,
      disableCheckWithoutSchedule: g.disable_check_without_schedule,
    }));
  }

  /** 排班信息（旧版 API，按天全公司） */
  async listSchedule(params: {
    workDate: string;
    offset?: number;
    size?: number;
  }): Promise<{ schedules: AttendanceSchedule[]; hasMore: boolean }> {
    const raw = await this.client.listSchedule(params);
    return {
      schedules: (raw.result?.schedules ?? []).map((s) => ({
        userId: s.userid,
        groupId: s.group_id,
        classId: s.class_id,
        planId: s.plan_id,
        planCheckTime: s.plan_check_time,
        checkType: s.check_type,
      })),
      hasMore: raw.result?.has_more ?? false,
    };
  }

  /** 考勤组详情（新版 API，游标分页） */
  async getGroupDetails(params: { nextToken?: number; maxResults?: number } = {}): Promise<{
    groups: AttendanceGroupDetail[];
    hasMore: boolean;
    nextCursor?: number;
  }> {
    const raw = await this.client.getGroupDetails(params);
    return {
      groups: (raw.result?.groups ?? []).map((g) => ({
        groupId: g.groupId,
        groupName: g.groupName ?? "",
        memberCount: g.memberCount,
        defaultClassId: g.defaultClassId,
        type: g.type,
        classesList: g.classesList ?? [],
        enableEmpSelectClass: g.enableEmpSelectClass,
        disableCheckWithoutSchedule: g.disableCheckWithoutSchedule,
      })),
      hasMore: raw.result?.hasMore ?? false,
      nextCursor: raw.result?.nextToken,
    };
  }
}