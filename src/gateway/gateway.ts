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
 *
 * All public methods cache successful results for 12 hours (keyed by
 * method name + stable serialized params). Failed results are never cached.
 * Cache uses LRU eviction (max 1000 entries) and supports manual invalidation.
 */
export class Gateway {
  readonly contacts: ContactsService;
  readonly attendance: AttendanceService;
  readonly yida: YidaService;

  private static readonly CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
  private static readonly MAX_CACHE_SIZE = 1000;
  private cache = new Map<string, { at: number; data: unknown }>();

  constructor() {
    const contactsClient = new ContactsClient();
    const attendanceClient = new AttendanceClient();
    const yidaClient = new YidaClient();

    this.contacts = new ContactsService(contactsClient);
    this.attendance = new AttendanceService(attendanceClient);
    // 宜搭 bootstrap：从通讯录拿任意管理员 userId 做种子调用，自动发现应用创建者后缓存
    this.yida = new YidaService(yidaClient, async (appName: string) => {
      await this.contacts.listAllDepartments(); // 确保部门缓存已预热
      const rootUsers = await this.contacts.listUsers(1, { includeDeactivated: false });
      const admin = rootUsers.users.find((u) => u.admin || u.boss) ?? rootUsers.users[0];
      if (!admin) {
        throw new Error(
          `Cannot bootstrap Yida auth for "${appName}": no active user found in root department. ` +
          `Please verify DingTalk API credentials are correct.`,
        );
      }
      return admin.userId;
    });
  }

  /**
   * Deep stable serialization: recursively sorts object keys so that
   * {a:1,b:{d:2,c:1}} and {b:{c:1,d:2},a:1} produce identical strings.
   */
  private static stableStringify(val: unknown): string {
    if (val === null || val === undefined) return String(val);
    if (typeof val !== "object") return JSON.stringify(val);
    if (Array.isArray(val)) {
      return `[${val.map((v) => Gateway.stableStringify(v)).join(",")}]`;
    }
    const obj = val as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${Gateway.stableStringify(obj[k])}`).join(",")}}`;
  }

  /**
   * Build a stable cache key from method name + params.
   */
  private static cacheKey(method: string, params?: unknown): string {
    if (params === undefined) return method;
    return `${method}:${Gateway.stableStringify(params)}`;
  }

  /**
   * Wraps an async operation with unified error handling AND caching.
   * Only successful results are cached; failures bypass the cache entirely.
   * LRU eviction: on cache miss, moves accessed entries to end of iteration order.
   */
  async handle<T>(
    fn: () => Promise<T>,
    cacheName: string,
    cacheParams?: unknown,
  ): Promise<GatewayResponse<T>> {
    const key = Gateway.cacheKey(cacheName, cacheParams);

    // Check cache (LRU: delete + re-insert to move to end)
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < Gateway.CACHE_TTL_MS) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached.data as GatewayResponse<T>;
    }

    // Evict expired entry if any
    if (cached) this.cache.delete(key);

    try {
      const data = await fn();
      const result = success(data);

      // Evict oldest entry if at capacity (Map iterates in insertion order)
      if (this.cache.size >= Gateway.MAX_CACHE_SIZE) {
        const oldest = this.cache.keys().next().value;
        if (oldest !== undefined) this.cache.delete(oldest);
      }

      this.cache.set(key, { at: Date.now(), data: result });
      return result;
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

  /**
   * Invalidate all cached results, or only those matching a method name prefix.
   * Example: invalidateCache("findUser") clears all findUser caches.
   *         invalidateCache() clears everything.
   */
  invalidateCache(prefix?: string): void {
    if (!prefix) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key === prefix || key.startsWith(`${prefix}:`)) {
        this.cache.delete(key);
      }
    }
  }

  // -- Contacts convenience methods --

  async listDepartments(parentId?: number) {
    return this.handle(() => this.contacts.listDepartments(parentId), "listDepartments", { parentId });
  }

  async getDepartment(departmentId: number) {
    return this.handle(() => this.contacts.getDepartment(departmentId), "getDepartment", { departmentId });
  }

  async listUsers(
    departmentId: number,
    options?: { includeDeactivated?: boolean },
  ) {
    return this.handle(async () => {
      const result = await this.contacts.listUsers(departmentId, options);
      return { users: result.users, pagination: { total: result.total, hasMore: result.hasMore } };
    }, "listUsers", { departmentId, options });
  }

  async getUser(userId: string) {
    return this.handle(() => this.contacts.getUser(userId), "getUser", { userId });
  }

  async listSubDepartmentIds(deptId: number) {
    return this.handle(async () => {
      const ids = await this.contacts.listSubDepartmentIds(deptId);
      return { deptIds: ids, total: ids.length };
    }, "listSubDepartmentIds", { deptId });
  }

  async listDepartmentUserIds(deptId: number) {
    return this.handle(async () => {
      const ids = await this.contacts.listDepartmentUserIds(deptId);
      return { userIds: ids, total: ids.length };
    }, "listDepartmentUserIds", { deptId });
  }

  async getUserByMobile(mobile: string) {
    return this.handle(() => this.contacts.getUserByMobile(mobile), "getUserByMobile", { mobile });
  }

  async getUserByUnionId(unionId: string) {
    return this.handle(() => this.contacts.getUserByUnionId(unionId), "getUserByUnionId", { unionId });
  }

  async searchUsers(params: {
    queryWord: string;
    offset?: number;
    size?: number;
    fullMatchField?: number;
    hydrate?: boolean;
  }) {
    return this.handle(() => this.contacts.searchUsers(params), "searchUsers", params);
  }

  async searchDepartments(params: {
    queryWord: string;
    offset?: number;
    size?: number;
    hydrate?: boolean;
  }) {
    return this.handle(() => this.contacts.searchDepartments(params), "searchDepartments", params);
  }

  async findDepartments(query: string, limit?: number) {
    return this.handle(async () => {
      const matches = await this.contacts.findDepartments(query, limit);
      return { matches, total: matches.length };
    }, "findDepartments", { query, limit });
  }

  async findUser(params: { name: string; deptHint?: string; limit?: number }) {
    return this.handle(() => this.contacts.findUser(params), "findUser", params);
  }

  async listAllDepartments() {
    return this.handle(async () => {
      const departments = await this.contacts.listAllDepartments();
      return { departments, total: departments.length };
    }, "listAllDepartments");
  }

  // -- Attendance convenience methods --

  async getAttendanceList(params: {
    userIds: string[];
    workDate: string;
  }) {
    return this.handle(async () => {
      const result = await this.attendance.getAttendanceList(params);
      return { records: result.records, total: result.total };
    }, "getAttendanceList", params);
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
    }, "getLeaveStatus", params);
  }

  async listAttendanceGroups(params: { offset?: number; size?: number } = {}) {
    return this.handle(async () => {
      const groups = await this.attendance.listGroups(params);
      return { groups, total: groups.length };
    }, "listAttendanceGroups", params);
  }

  async listAttendanceSchedule(params: {
    workDate: string;
    offset?: number;
    size?: number;
  }) {
    return this.handle(async () => {
      const result = await this.attendance.listSchedule(params);
      return { schedules: result.schedules, total: result.schedules.length, hasMore: result.hasMore };
    }, "listAttendanceSchedule", params);
  }

  async getAttendanceGroupDetails(params: { nextToken?: number; maxResults?: number } = {}) {
    return this.handle(() => this.attendance.getGroupDetails(params), "getAttendanceGroupDetails", params);
  }

  // -- Yida convenience methods --

  async listYidaApps(): Promise<GatewayResponse<YidaAppConfig[]>> {
    return this.handle(() => Promise.resolve(this.yida.listApps()), "listYidaApps");
  }

  async listYidaForms(params: {
    appName?: string;
    pageSize?: number;
    pageNumber?: number;
  }) {
    return this.handle(async () => {
      // appName 留空 → 返回全部应用的表单摘要（替代 list_apps）
      if (!params.appName) {
        const apps = this.yida.listApps();
        const all: Record<string, unknown> = {};
        for (const app of apps) {
          try {
            all[app.name] = await this.yida.listForms({ appName: app.name, pageSize: params.pageSize, pageNumber: params.pageNumber });
          } catch (e) {
            all[app.name] = { error: e instanceof Error ? e.message : String(e) };
          }
        }
        return { apps, forms: all };
      }
      return this.yida.listForms({ appName: params.appName, pageSize: params.pageSize, pageNumber: params.pageNumber });
    }, "listYidaForms", params);
  }

  /** Unified query — uses searchFormData (richer metadata) under the hood. */
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
    return this.handle(() => this.yida.searchFormData({
      ...params,
      currentPage: params.pageNumber,
    }), "queryYidaFormData", params);
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
    return this.handle(() => this.yida.listProcessInstances(params), "listYidaProcessInstances", params);
  }

  /** Merged: instance detail + optional approval records in one call. */
  async getYidaProcessInstance(params: {
    appName: string;
    processInstanceId: string;
    includeRecords?: boolean;
  }) {
    return this.handle(async () => {
      const detail = await this.yida.getProcessInstance({ appName: params.appName, processInstanceId: params.processInstanceId });
      if (!params.includeRecords) return detail;
      const records = await this.yida.getOperationRecords({ appName: params.appName, processInstanceId: params.processInstanceId });
      return { ...detail, operationRecords: records };
    }, "getYidaProcessInstance", params);
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