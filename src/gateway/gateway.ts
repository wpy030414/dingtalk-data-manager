import { ContactsClient } from "../clients/contacts-client.js";
import { AttendanceClient } from "../clients/attendance-client.js";
import { YidaClient } from "../clients/yida-client.js";
import { ContactsService } from "../services/contacts-service.js";
import { AttendanceService } from "../services/attendance-service.js";
import { YidaService } from "../services/yida-service.js";
import { getLogger } from "../lib/logger.js";
import { GatewayError } from "../lib/errors.js";
import { success, error, type GatewayResponse } from "./types.js";
import type { YidaAppConfig } from "../config/schema.js";

/**
 * Unified gateway facade that composes all services.
 *
 * This is the single entry point for all business logic. MCP tools
 * call this gateway, never the individual services directly.
 */
export class Gateway {
  readonly contacts: ContactsService;
  readonly attendance: AttendanceService;
  readonly yida: YidaService;

  constructor() {
    const contactsClient = new ContactsClient();
    const attendanceClient = new AttendanceClient();
    const yidaClient = new YidaClient();

    this.contacts = new ContactsService(contactsClient);
    this.attendance = new AttendanceService(attendanceClient);
    this.yida = new YidaService(yidaClient);
  }

  /**
   * Wraps an async operation with unified error handling,
   * converting any thrown error into a GatewayResponse.
   */
  async handle<T>(
    fn: () => Promise<T>,
  ): Promise<GatewayResponse<T>> {
    try {
      const data = await fn();
      return success(data);
    } catch (err) {
      const logger = getLogger();
      logger.error({ err }, "Gateway operation failed");

      if (err instanceof GatewayError) {
        return error(
          err.code,
          err.message,
          err instanceof Error && "requestId" in err
            ? (err as { requestId?: string }).requestId
            : undefined,
        );
      }

      if (err instanceof Error) {
        return error("INTERNAL_ERROR", err.message);
      }

      return error("INTERNAL_ERROR", String(err));
    }
  }

  // -- Contacts convenience methods --

  async listDepartments(parentId?: number) {
    return this.handle(() => this.contacts.listDepartments(parentId));
  }

  async getDepartment(departmentId: number) {
    return this.handle(() => this.contacts.getDepartment(departmentId));
  }

  async listUsers(
    departmentId: number,
    options?: { includeDeactivated?: boolean },
  ) {
    return this.handle(async () => {
      const result = await this.contacts.listUsers(departmentId, options);
      return { users: result.users, pagination: { total: result.total, hasMore: result.hasMore } };
    });
  }

  async getUser(userId: string) {
    return this.handle(() => this.contacts.getUser(userId));
  }

  async listSubDepartmentIds(deptId: number) {
    return this.handle(async () => {
      const ids = await this.contacts.listSubDepartmentIds(deptId);
      return { deptIds: ids, total: ids.length };
    });
  }

  async listDepartmentUserIds(deptId: number) {
    return this.handle(async () => {
      const ids = await this.contacts.listDepartmentUserIds(deptId);
      return { userIds: ids, total: ids.length };
    });
  }

  async getUserByMobile(mobile: string) {
    return this.handle(() => this.contacts.getUserByMobile(mobile));
  }

  async getUserByUnionId(unionId: string) {
    return this.handle(() => this.contacts.getUserByUnionId(unionId));
  }

  async searchUsers(params: {
    queryWord: string;
    offset?: number;
    size?: number;
    fullMatchField?: number;
    hydrate?: boolean;
  }) {
    return this.handle(() => this.contacts.searchUsers(params));
  }

  async searchDepartments(params: {
    queryWord: string;
    offset?: number;
    size?: number;
    hydrate?: boolean;
  }) {
    return this.handle(() => this.contacts.searchDepartments(params));
  }

  async findDepartments(query: string, limit?: number) {
    return this.handle(async () => {
      const matches = await this.contacts.findDepartments(query, limit);
      return { matches, total: matches.length };
    });
  }

  async findUser(params: { name: string; deptHint?: string; limit?: number }) {
    return this.handle(() => this.contacts.findUser(params));
  }

  async listAllDepartments() {
    return this.handle(async () => {
      const departments = await this.contacts.listAllDepartments();
      return { departments, total: departments.length };
    });
  }

  // -- Attendance convenience methods --

  async getAttendanceList(params: {
    userIds: string[];
    workDate: string;
  }) {
    return this.handle(async () => {
      const result = await this.attendance.getAttendanceList(params);
      return { records: result.records, total: result.total };
    });
  }

  async getLeaveStatus(params: {
    userIds: string[];
    fromDate: string;
    toDate: string;
    offset?: number;
    size?: number;
  }) {
    return this.handle(async () => {
      const startMs = new Date(params.fromDate + "T00:00:00+08:00").getTime();
      const endMs = new Date(params.toDate + "T23:59:59+08:00").getTime();
      const result = await this.attendance.getLeaveStatus({
        userIds: params.userIds,
        startTime: startMs,
        endTime: endMs,
        offset: params.offset,
        size: params.size,
      });
      return this.wrapPaginated(result.leaves, result.leaves.length, params.offset ?? 0, params.size ?? 20);
    });
  }

  async listAttendanceGroups(params: { offset?: number; size?: number } = {}) {
    return this.handle(async () => {
      const groups = await this.attendance.listGroups(params);
      return { groups, total: groups.length };
    });
  }

  async listAttendanceSchedule(params: {
    workDate: string;
    offset?: number;
    size?: number;
  }) {
    return this.handle(async () => {
      const result = await this.attendance.listSchedule(params);
      return { schedules: result.schedules, total: result.schedules.length, hasMore: result.hasMore };
    });
  }

  async getAttendanceGroupDetails(params: { nextToken?: number; maxResults?: number } = {}) {
    return this.handle(() => this.attendance.getGroupDetails(params));
  }

  // -- Yida convenience methods --

  async listYidaApps(): Promise<GatewayResponse<YidaAppConfig[]>> {
    return this.handle(() => Promise.resolve(this.yida.listApps()));
  }

  async listYidaForms(params: {
    appName: string;
    pageSize?: number;
    pageNumber?: number;
  }) {
    return this.handle(() => this.yida.listForms(params));
  }

  async getYidaFormFields(params: {
    appName: string;
    formUuid?: string;
  }) {
    return this.handle(() => this.yida.getFormFields(params));
  }

  async getYidaFormComponents(params: {
    appName: string;
    formUuid?: string;
  }) {
    return this.handle(() => this.yida.getFormComponents(params));
  }

  async queryYidaFormData(params: {
    appName: string;
    formUuid?: string;
    searchFieldJson?: string;
    originatorId?: string;
    createFromTimeGMT?: string;
    createToTimeGMT?: string;
    pageSize?: number;
    pageNumber?: number;
  }) {
    return this.handle(() => this.yida.queryFormData(params));
  }

  async searchYidaFormData(params: {
    appName: string;
    formUuid?: string;
    searchFieldJson?: string;
    originatorId?: string;
    createFromTimeGMT?: string;
    createToTimeGMT?: string;
    pageSize?: number;
    currentPage?: number;
  }) {
    return this.handle(() => this.yida.searchFormData(params));
  }

  async listYidaProcessInstances(params: {
    appName: string;
    formUuid?: string;
    instanceStatus?: string;
    approvedResult?: string;
    originatorId?: string;
    createFromTimeGMT?: string;
    createToTimeGMT?: string;
    searchFieldJson?: string;
    pageSize?: number;
    pageNumber?: number;
  }) {
    return this.handle(() => this.yida.listProcessInstances(params));
  }

  async getYidaProcessInstance(params: {
    appName: string;
    processInstanceId: string;
  }) {
    return this.handle(() => this.yida.getProcessInstance(params));
  }

  async getYidaOperationRecords(params: {
    appName: string;
    processInstanceId: string;
  }) {
    return this.handle(() => this.yida.getOperationRecords(params));
  }

  /**
   * Wraps paginated data with pagination metadata.
   */
  private wrapPaginated<T>(
    data: T,
    total: number,
    page: number,
    pageSize: number,
  ): GatewayResponse<T> {
    return {
      success: true,
      data,
      pagination: { total, page, pageSize },
    };
  }
}

/** Singleton gateway instance. */
export const gateway = new Gateway();