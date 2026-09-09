import { BaseClient } from "./base-client.js";

// 考勤同样横跨两代 API，baseURL 与一级 path 都不一致：
//   旧版 OAPI : https://oapi.dingtalk.com/topapi/attendance/...  表单编码 + access_token 表单参数
//   新版 API  : https://api.dingtalk.com/v1.0/attendance/...     JSON body + x-acs-dingtalk-access-token
const OAPI = "https://oapi.dingtalk.com";
const NEW_API = "https://api.dingtalk.com";

export class AttendanceClient extends BaseClient {
  /** 获取单个用户考勤打卡结果 */
  async getAttendance(userId: string, workDate: string): Promise<AttendanceListResponse> {
    return this.oapiRequest<AttendanceListResponse>(
      `${OAPI}/topapi/attendance/getupdatedata`,
      { userid: userId, work_date: workDate },
    );
  }

  /** 获取请假状态 */
  async getLeaveStatus(params: {
    userIds: string[];
    startTime: number;
    endTime: number;
    offset?: number;
    size?: number;
  }): Promise<LeaveStatusResponse> {
    return this.oapiRequest<LeaveStatusResponse>(
      `${OAPI}/topapi/attendance/getleavestatus`,
      {
        userid_list: params.userIds.join(","),
        start_time: params.startTime,
        end_time: params.endTime,
        offset: params.offset ?? 0,
        size: params.size ?? 20,
      },
    );
  }

  /** 获取考勤组列表（旧版） */
  async getSimpleGroups(params: { offset?: number; size?: number } = {}): Promise<SimpleGroupsResponse> {
    return this.oapiRequest<SimpleGroupsResponse>(
      `${OAPI}/topapi/attendance/getsimplegroups`,
      { offset: params.offset ?? 0, size: params.size ?? 20 },
    );
  }

  /** 获取排班信息（旧版，按天查询全公司排班） */
  async listSchedule(params: {
    workDate: string;
    offset?: number;
    size?: number;
  }): Promise<ScheduleListResponse> {
    return this.oapiRequest<ScheduleListResponse>(
      `${OAPI}/topapi/attendance/listschedule`,
      { workDate: params.workDate, offset: params.offset ?? 0, size: params.size ?? 20 },
    );
  }

  /** 获取考勤组详情（新版，游标分页） */
  async getGroupDetails(params: { nextToken?: number; maxResults?: number } = {}): Promise<GroupDetailsResponse> {
    const search = new URLSearchParams({
      nextToken: String(params.nextToken ?? 0),
      maxResults: String(params.maxResults ?? 20),
    });
    return this.newApiRequest<GroupDetailsResponse>(
      "GET",
      `${NEW_API}/v1.0/attendance/groupDetails?${search.toString()}`,
    );
  }
}

export interface AttendanceListResponse {
  errcode: number; errmsg: string;
  result: {
    attendance_result_list: AttendanceRaw[];
    approve_list: unknown[];
    check_record_list: Array<{ check_type: string; location_result: string; plan_check_time: string; time_result: string; user_check_time: string; [key: string]: unknown }>;
  };
}

export interface AttendanceRaw {
  check_type: string;
  class_id: number;
  group_id: number;
  location_method: string;
  location_result: string;
  plan_check_time: string;
  plan_id: number;
  record_id: number;
  source_type: string;
  time_result: string;
  user_address: string;
  user_check_time: string;
  [key: string]: unknown;
}

export interface LeaveStatusResponse {
  errcode: number; errmsg: string;
  result: { has_more: boolean; list: LeaveRaw[]; };
}

export interface LeaveRaw {
  userid: string;
  start_time: number;
  end_time: number;
  duration_unit: string;
  duration: number;
  leave_type: string;
  status: string;
  [key: string]: unknown;
}

export interface SimpleGroupsResponse {
  errcode: number; errmsg: string;
  result: {
    groups: Array<{
      group_id: number;
      group_name: string;
      classes_list: string[];
      default_class_id: number;
      enable_emp_select_class: boolean;
      disable_check_when_rest: boolean;
      disable_check_without_schedule: boolean;
      freecheck_day_start_min_offset: number;
      [key: string]: unknown;
    }>;
  };
}

export interface ScheduleListResponse {
  errcode: number; errmsg: string;
  result: {
    has_more: boolean;
    schedules: Array<{
      userid: string;
      group_id: number;
      class_id: number;
      plan_id: number;
      plan_check_time: string;
      check_type: string;
      [key: string]: unknown;
    }>;
  };
}

export interface GroupDetailsResponse {
  result: {
    hasMore: boolean;
    nextToken?: number;
    groups: Array<{
      groupId: number;
      groupName?: string;
      memberCount: number;
      defaultClassId: number;
      type: string;
      classesList: string[];
      enableEmpSelectClass: boolean;
      disableCheckWithoutSchedule: boolean;
      [key: string]: unknown;
    }>;
  };
}