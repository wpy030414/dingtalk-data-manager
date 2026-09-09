import { describe, it, expect, beforeEach, vi } from "vitest";
import { AttendanceService } from "@/services/attendance-service.ts";
import type { AttendanceClient } from "@/clients/attendance-client.ts";

/**
 * Unit tests for AttendanceService with a mocked client.
 * Covers the single-user batch loop and the group/schedule normalizers.
 */
function createMockClient(overrides: Partial<AttendanceClient> = {}): AttendanceClient {
  return {
    getAttendance: vi.fn().mockResolvedValue({
      errcode: 0,
      errmsg: "ok",
      result: {
        attendance_result_list: [
          {
            check_type: "OnDuty",
            time_result: "Late",
            plan_check_time: "2026-09-09 08:00:00",
            user_check_time: "2026-09-09 08:12:00",
            location_result: "Normal",
            group_id: 1,
            record_id: 100,
          },
        ],
        approve_list: [],
        check_record_list: [],
      },
    }),
    getLeaveStatus: vi.fn().mockResolvedValue({
      errcode: 0,
      errmsg: "ok",
      result: {
        has_more: false,
        list: [
          {
            userid: "u1",
            start_time: 1756684800000,
            end_time: 1756771200000,
            duration_unit: "day",
            duration: 1,
            leave_type: "事假",
            status: "agree",
          },
        ],
      },
    }),
    getSimpleGroups: vi.fn().mockResolvedValue({
      errcode: 0,
      errmsg: "ok",
      result: {
        groups: [
          {
            group_id: 1426660566,
            group_name: "东校教师哺乳假",
            classes_list: ["周一至周五 07:50-16:00", "周六、日 休息"],
            default_class_id: 1508365078,
            enable_emp_select_class: true,
            disable_check_when_rest: false,
            disable_check_without_schedule: false,
            freecheck_day_start_min_offset: 300,
          },
        ],
      },
    }),
    listSchedule: vi.fn().mockResolvedValue({
      errcode: 0,
      errmsg: "ok",
      result: {
        has_more: true,
        schedules: [
          {
            userid: "u1",
            group_id: -1,
            class_id: 1,
            plan_id: 996966904816,
            plan_check_time: "2026-09-09 06:17:04",
            check_type: "OnDuty",
          },
        ],
      },
    }),
    getGroupDetails: vi.fn().mockResolvedValue({
      result: {
        hasMore: true,
        nextToken: 20,
        groups: [
          {
            groupId: 1426660566,
            groupName: "东校教师哺乳假",
            memberCount: 1,
            defaultClassId: 1508365078,
            type: "FIXED",
            classesList: ["周一至周五 07:50-16:00"],
            enableEmpSelectClass: true,
            disableCheckWithoutSchedule: false,
          },
        ],
      },
    }),
    ...overrides,
  } as unknown as AttendanceClient;
}

describe("AttendanceService", () => {
  let client: AttendanceClient;
  let service: AttendanceService;

  beforeEach(() => {
    client = createMockClient();
    service = new AttendanceService(client);
  });

  it("should batch single-user attendance calls and merge results", async () => {
    const result = await service.getAttendanceList({ userIds: ["u1", "u2"], workDate: "2026-09-09" });
    expect(client.getAttendance).toHaveBeenCalledTimes(2);
    expect(result.total).toBe(2);
    expect(result.records[0]).toMatchObject({
      userId: "u1",
      checkType: "OnDuty",
      timeResult: "Late",
      planCheckTime: "2026-09-09 08:00:00",
    });
  });

  it("should skip users whose attendance call fails", async () => {
    const flaky = createMockClient({
      getAttendance: vi
        .fn()
        .mockResolvedValueOnce({
          errcode: 0,
          errmsg: "ok",
          result: { attendance_result_list: [], approve_list: [], check_record_list: [] },
        })
        .mockRejectedValueOnce(new Error("boom")),
    });
    service = new AttendanceService(flaky);
    const result = await service.getAttendanceList({ userIds: ["u1", "u2"], workDate: "2026-09-09" });
    expect(result.total).toBe(0);
  });

  it("should convert leave timestamps to ISO strings", async () => {
    const result = await service.getLeaveStatus({
      userIds: ["u1"],
      startTime: 1756684800000,
      endTime: 1756771200000,
    });
    expect(result.hasMore).toBe(false);
    expect(result.leaves[0]).toMatchObject({ userId: "u1", leaveType: "事假", duration: 1 });
    expect(result.leaves[0]!.startTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("should normalize the old-style attendance group list", async () => {
    const groups = await service.listGroups({ size: 10 });
    expect(groups).toEqual([
      {
        groupId: 1426660566,
        groupName: "东校教师哺乳假",
        classesList: ["周一至周五 07:50-16:00", "周六、日 休息"],
        defaultClassId: 1508365078,
        enableEmpSelectClass: true,
        disableCheckWhenRest: false,
        disableCheckWithoutSchedule: false,
      },
    ]);
  });

  it("should normalize the schedule list", async () => {
    const result = await service.listSchedule({ workDate: "2026-09-09" });
    expect(result.hasMore).toBe(true);
    expect(result.schedules[0]).toEqual({
      userId: "u1",
      groupId: -1,
      classId: 1,
      planId: 996966904816,
      planCheckTime: "2026-09-09 06:17:04",
      checkType: "OnDuty",
    });
  });

  it("should normalize the new-style group details with cursor pagination", async () => {
    const result = await service.getGroupDetails({ maxResults: 10 });
    expect(result.hasMore).toBe(true);
    expect(result.nextToken).toBe(20);
    expect(result.groups[0]).toEqual({
      groupId: 1426660566,
      groupName: "东校教师哺乳假",
      memberCount: 1,
      defaultClassId: 1508365078,
      type: "FIXED",
      classesList: ["周一至周五 07:50-16:00"],
      enableEmpSelectClass: true,
      disableCheckWithoutSchedule: false,
    });
  });
});
