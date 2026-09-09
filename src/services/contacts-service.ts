import { ContactsClient } from "../clients/contacts-client.js";
import type {
  DepartmentRaw,
  UserRaw,
  UserListResponse,
} from "../clients/contacts-client.js";
import { NotFoundError } from "../lib/errors.js";
import type {
  Department,
  User,
  PaginatedUsers,
  DepartmentMatch,
} from "./types.js";

/**
 * Contacts service — normalizes old-style DingTalk Contacts API data.
 */
export class ContactsService {
  /** Cache of the full org department list (one API call, reused for path resolution). */
  private deptCache: { at: number; list: Array<{ id: number; name: string; parentId: number }> } | null = null;

  private static readonly DEPT_CACHE_TTL_MS = 5 * 60_000;

  constructor(private readonly client: ContactsClient) {}

  /**
   * List all departments, optionally filtered by parent.
   */
  async listDepartments(deptId = 1): Promise<Department[]> {
    const raw = await this.client.getDepartmentList(deptId);
    return (raw.result ?? []).map(this.normalizeDepartment);
  }

  /**
   * Get a single department's details.
   */
  async getDepartment(deptId: number): Promise<Department> {
    const raw = await this.client.getDepartmentDetail(deptId);
    return this.normalizeDepartment(raw.result);
  }

  /**
   * List users in a department, with optional filtering of deactivated users.
   */
  async listUsers(
    deptId: number,
    options: {
      includeDeactivated?: boolean;
    } = {},
  ): Promise<PaginatedUsers> {
    const { includeDeactivated = false } = options;

    const raw = await this.client.getUserList(deptId, 0, 100);
    const result = raw.result ?? { has_more: false, next_cursor: 0, list: [] };
    let users = (result.list ?? []).map(this.normalizeUser);

    if (!includeDeactivated) {
      users = users.filter((u) => u.active);
    }

    return {
      users,
      total: users.length,
      hasMore: result.has_more ?? false,
    };
  }

  /**
   * Get a single user's details.
   */
  async getUser(userId: string): Promise<User> {
    const raw = await this.client.getUserDetail(userId);
    return this.normalizeUser(raw.result);
  }

  /** List child department IDs (IDs only, no pagination). */
  async listSubDepartmentIds(deptId = 1): Promise<number[]> {
    const raw = await this.client.getSubDepartmentIds(deptId);
    return raw.result?.dept_id_list ?? [];
  }

  /** List user IDs inside a department (IDs only, no pagination). */
  async listDepartmentUserIds(deptId: number): Promise<string[]> {
    const raw = await this.client.getDepartmentUserIds(deptId);
    return raw.result?.userid_list ?? [];
  }

  /** Look up a user by mobile number, then hydrate the full profile. */
  async getUserByMobile(mobile: string): Promise<User> {
    const lookup = await this.client.getUserIdByMobile(mobile);
    const userId = lookup.result?.userid;
    if (!userId) {
      throw new NotFoundError(`No DingTalk user found for mobile ${mobile}`);
    }
    return this.getUser(userId);
  }

  /** Look up a user by unionId, then hydrate the full profile. */
  async getUserByUnionId(unionId: string): Promise<User> {
    const lookup = await this.client.getUserIdByUnionId(unionId);
    const userId = lookup.result?.userid;
    if (!userId) {
      throw new NotFoundError(`No DingTalk user found for unionId ${unionId}`);
    }
    return this.getUser(userId);
  }

  /**
   * Keyword-search users (new-style API) and, by default, hydrate each hit
   * into a full user profile — the search endpoint itself only returns IDs.
   */
  async searchUsers(params: {
    queryWord: string;
    offset?: number;
    size?: number;
    fullMatchField?: number;
    hydrate?: boolean;
  }): Promise<{ users: User[]; total: number; hasMore: boolean; userIds: string[] }> {
    const raw = await this.client.searchUsers({
      queryWord: params.queryWord,
      offset: params.offset,
      size: params.size,
      fullMatchField: params.fullMatchField,
    });
    const userIds = raw.list ?? [];
    const hydrate = params.hydrate ?? true;
    const users = hydrate
      ? await Promise.all(
          userIds.map(async (id) => {
            try {
              return await this.getUser(id);
            } catch {
              return null;
            }
          }),
        ).then((list) => list.filter((u): u is User => u !== null))
      : [];
    return { users, userIds, total: raw.totalCount ?? 0, hasMore: raw.hasMore ?? false };
  }

  /**
   * Keyword-search departments (new-style API) and, by default, hydrate each
   * hit into a full department record.
   */
  async searchDepartments(params: {
    queryWord: string;
    offset?: number;
    size?: number;
    hydrate?: boolean;
  }): Promise<{ departments: Department[]; total: number; hasMore: boolean; deptIds: number[] }> {
    const raw = await this.client.searchDepartments({
      queryWord: params.queryWord,
      offset: params.offset,
      size: params.size,
    });
    const deptIds = raw.list ?? [];
    const hydrate = params.hydrate ?? true;
    const departments = hydrate
      ? await Promise.all(
          deptIds.map(async (id) => {
            try {
              return await this.getDepartment(id);
            } catch {
              return null;
            }
          }),
        ).then((list) => list.filter((d): d is Department => d !== null))
      : [];
    return { departments, deptIds, total: raw.totalCount ?? 0, hasMore: raw.hasMore ?? false };
  }

  /**
   * 把模糊的人名（+可选部门线索）解析成用户。
   *
   * 钉钉用户搜索只按姓名/拼音/工号做子串匹配，无法按部门过滤；
   * 这里先搜人，再用部门成员名单做交叉过滤，把「东校的张老师」这类查询落地。
   */
  async findUser(params: {
    name: string;
    deptHint?: string;
    limit?: number;
  }): Promise<{
    users: User[];
    total: number;
    dept?: { id: number; path: string };
    hint?: string;
  }> {
    const limit = params.limit ?? 10;

    // 没有部门线索：直接按姓名搜（钉钉按姓名/拼音/工号子串匹配）
    if (!params.deptHint) {
      const search = await this.searchUsers({
        queryWord: params.name,
        size: Math.min(limit * 2, 20),
      });
      return { users: search.users.slice(0, limit), total: search.total };
    }

    const depts = await this.findDepartments(params.deptHint, 1);
    const dept = depts[0];
    if (!dept) {
      return {
        users: [],
        total: 0,
        hint: `部门线索「${params.deptHint}」未匹配到任何部门，请改用 dingtalk_find_department 确认`,
      };
    }

    // 有部门线索：先取该部门花名册（一次调用即含完整档案），在本地按姓名过滤。
    // 比「先全库搜人再过滤」更准——后者受搜索分页限制，目标可能不在前几页里。
    const roster = await this.listUsers(dept.id);
    let matched = roster.users.filter((u) => u.name.includes(params.name));

    // 本地姓名匹配不到时，回退到搜索接口（可覆盖拼音、工号等非姓名匹配）
    if (matched.length === 0) {
      const search = await this.searchUsers({
        queryWord: params.name,
        size: Math.min(limit * 2, 20),
      });
      const memberIds = new Set(roster.users.map((u) => u.userId));
      matched = search.users.filter((u) => memberIds.has(u.userId));
    }

    return {
      users: matched.slice(0, limit),
      total: matched.length,
      dept: { id: dept.id, path: dept.path },
      hint:
        matched.length === 0
          ? `「${dept.path}」的直属成员里没有匹配「${params.name}」的人。` +
            (roster.hasMore ? "该部门成员超过一页，可能有遗漏；" : "") +
            `若有下级部门，请先用 dingtalk_list_sub_department_ids 递归，或把 deptHint 指向更具体的部门`
          : undefined,
    };
  }

  /**
   * 全公司部门（一次性拉取并缓存 5 分钟）。
   * 旧版 /department/list 返回 id/name/parentid，与 v2 接口的 dept_id/parent_id 命名不同。
   */
  async listAllDepartments(force = false): Promise<Array<{ id: number; name: string; parentId: number }>> {
    if (!force && this.deptCache && Date.now() - this.deptCache.at < ContactsService.DEPT_CACHE_TTL_MS) {
      return this.deptCache.list;
    }
    const raw = await this.client.getAllDepartments();
    const list = (raw.department ?? raw.result ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      parentId: d.parentid,
    }));
    this.deptCache = { at: Date.now(), list };
    return list;
  }

  /**
   * 用模糊路径名定位部门。
   *
   * 钉钉部门搜索是**单 token 子串匹配**，"东校中学2025级" 这种复合名直接搜是 0 命中。
   * 这里改为：把查询切成 token（有空格按空格切；无空格则用已知部门名做最长匹配切分），
   * 再在全量部门树里找「祖先路径包含全部 token」的部门，按路径深度降序返回最具体的。
   */
  async findDepartments(query: string, limit = 10): Promise<DepartmentMatch[]> {
    const all = await this.listAllDepartments();
    const byId = new Map(all.map((d) => [d.id, d]));
    const nameSet = new Set(all.map((d) => d.name));
    const tokens = ContactsService.segmentQuery(query, nameSet);
    if (tokens.length === 0) return [];

    const pathOf = (d: { id: number; name: string; parentId: number }): string[] => {
      const names: string[] = [];
      let cur: { id: number; name: string; parentId: number } | undefined = d;
      let guard = 0;
      while (cur && guard++ < 32) {
        names.unshift(cur.name);
        cur = byId.get(cur.parentId);
      }
      return names;
    };

    const matches: DepartmentMatch[] = [];
    for (const d of all) {
      const names = pathOf(d);
      if (tokens.every((t) => names.some((n) => n.includes(t)))) {
        matches.push({
          id: d.id,
          name: d.name,
          parentId: d.parentId,
          path: names.join(" / "),
          depth: names.length,
        });
      }
    }
    matches.sort((a, b) => b.depth - a.depth || a.id - b.id);
    return matches.slice(0, limit);
  }

  /**
   * 把模糊查询切成 token：
   * - 含空格 → 直接按空格切
   * - 无空格 → 用已知部门名集合做**最长匹配**切分（"东校中学2025级" → ["东校","中学","2025级"]）
   * - 完全切不出来 → 退回整串
   */
  private static segmentQuery(query: string, nameSet: Set<string>): string[] {
    const q = query.trim();
    if (!q) return [];
    const bySpace = q.split(/\s+/).filter(Boolean);
    if (bySpace.length > 1) return bySpace;

    const tokens: string[] = [];
    let i = 0;
    while (i < q.length) {
      let matched = "";
      for (let len = q.length - i; len >= 2; len--) {
        const candidate = q.slice(i, i + len);
        if (nameSet.has(candidate)) { matched = candidate; break; }
      }
      if (matched) { tokens.push(matched); i += matched.length; }
      else { i += 1; }
    }
    return tokens.length > 0 ? tokens : [q];
  }

  private normalizeDepartment(raw: DepartmentRaw): Department {
    return {
      id: raw.dept_id,
      name: raw.name,
      parentId: raw.parent_id,
      createDeptGroup: raw.create_dept_group,
      autoAddUser: raw.auto_add_user,
    };
  }

  private normalizeUser(raw: UserRaw): User {
    return {
      userId: raw.userid ?? "",
      unionId: raw.unionid ?? "",
      name: (raw.name ?? "").trim(),
      avatar: raw.avatar ?? "",
      stateCode: raw.state_code ?? "",
      mobile: raw.mobile ?? "",
      email: raw.email ?? "",
      orgEmail: raw.org_email ?? "",
      title: (raw.title ?? "").trim(),
      workPlace: raw.work_place ?? "",
      deptIdList: raw.dept_id_list ?? [],
      deptOrderList: raw.dept_order_list ?? [],
      active: raw.active ?? false,
      admin: raw.admin ?? false,
      boss: raw.boss ?? false,
      leaderInDept: (raw.leader_in_dept ?? []).map((l) => ({
        deptId: l.dept_id,
        leader: l.leader,
      })),
    };
  }
}