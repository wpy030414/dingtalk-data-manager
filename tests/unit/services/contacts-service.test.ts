import { describe, it, expect, beforeEach, vi } from "vitest";
import { ContactsService } from "@/services/contacts-service.ts";
import type { ContactsClient, UserRaw } from "@/clients/contacts-client.ts";

/** Simpler raw-like department structure for listAllDepartments mock. */
function makeDept(id: number, name: string, parentid: number) {
  return { id, name, parentid };
}

/** Build a raw OAPI user payload (snake_case, as returned by DingTalk). */
function userRaw(overrides: Partial<UserRaw> = {}): UserRaw {
  return {
    userid: "user001",
    unionid: "union001",
    name: "张三",
    avatar: "",
    state_code: "86",
    mobile: "13800138000",
    email: "",
    org_email: "",
    title: "工程师",
    work_place: "杭州",
    dept_id_list: [1],
    dept_order_list: [1],
    active: true,
    admin: false,
    boss: false,
    leader_in_dept: [],
    ...overrides,
  } as UserRaw;
}

/**
 * Unit tests for ContactsService with mocked client.
 * We mock the client directly rather than the network layer.
 */
function createMockClient(overrides: Partial<ContactsClient> = {}): ContactsClient {
  return {
    getDepartmentList: vi.fn().mockResolvedValue({ errcode: 0, errmsg: "ok", result: [] }),
    getDepartmentDetail: vi
      .fn()
      .mockResolvedValue({ errcode: 0, errmsg: "ok", result: { dept_id: 1, name: "根部门" } }),
    getUserList: vi.fn().mockResolvedValue({
      errcode: 0,
      errmsg: "ok",
      result: {
        has_more: false,
        next_cursor: 0,
        list: [
          userRaw(),
          userRaw({ userid: "user002", unionid: "union002", name: "李四", title: "经理", active: false, admin: true }),
        ],
      },
    }),
    getUserDetail: vi
      .fn()
      .mockResolvedValue({ errcode: 0, errmsg: "ok", result: userRaw() }),
    getSubDepartmentIds: vi
      .fn()
      .mockResolvedValue({ errcode: 0, errmsg: "ok", result: { dept_id_list: [10, 20, 30] } }),
    getDepartmentUserIds: vi
      .fn()
      .mockResolvedValue({ errcode: 0, errmsg: "ok", result: { userid_list: ["u1", "u2"] } }),
    getUserIdByMobile: vi
      .fn()
      .mockResolvedValue({ errcode: 0, errmsg: "ok", result: { userid: "user001" } }),
    getUserIdByUnionId: vi
      .fn()
      .mockResolvedValue({ errcode: 0, errmsg: "ok", result: { contact_type: 0, userid: "user001" } }),
    searchUsers: vi
      .fn()
      .mockResolvedValue({ hasMore: true, totalCount: 1744, list: ["user001", "user002"] }),
    searchDepartments: vi
      .fn()
      .mockResolvedValue({ hasMore: false, totalCount: 2, list: [7, 8] }),
    getAllDepartments: vi.fn().mockResolvedValue({
      errcode: 0,
      errmsg: "ok",
      department: [
        makeDept(1, "根部门", 0),
        makeDept(-7, "家校通讯录", 1),
        makeDept(-8, "一年级家长", -7),
        makeDept(-9, "1班家长", -8),
        makeDept(10, "东校", 1),
        makeDept(100, "中学", 10),
        makeDept(1000, "2025级", 100),
        makeDept(101, "小学", 10),
        makeDept(1010, "2025级", 101),
        makeDept(20, "繁华校区", 1),
        makeDept(200, "中学", 20),
        makeDept(2000, "2025级", 200),
      ],
    }),
    ...overrides,
  } as unknown as ContactsClient;
}

describe("ContactsService", () => {
  let service: ContactsService;
  let client: ContactsClient;

  beforeEach(() => {
    client = createMockClient();
    service = new ContactsService(client);
  });

  it("should filter deactivated users by default", async () => {
    const result = await service.listUsers(1);
    expect(result.users).toHaveLength(1);
    expect(result.users[0]!.name).toBe("张三");
    expect(result.users[0]!.active).toBe(true);
  });

  it("should include deactivated users when requested", async () => {
    const result = await service.listUsers(1, { includeDeactivated: true });
    expect(result.users).toHaveLength(2);
    expect(result.users[1]!.name).toBe("李四");
    expect(result.users[1]!.active).toBe(false);
  });

  it("should normalize user fields", async () => {
    const client = createMockClient({
      getUserDetail: vi.fn().mockResolvedValue({
        errcode: 0,
        errmsg: "ok",
        result: userRaw({
          userid: "user003",
          name: "  王五  ",
          avatar: undefined,
          state_code: undefined,
          mobile: undefined,
          email: undefined,
          org_email: undefined,
          title: undefined,
          work_place: undefined,
          dept_id_list: undefined,
          dept_order_list: undefined,
          active: undefined,
          admin: undefined,
          boss: undefined,
          leader_in_dept: undefined,
        }),
      }),
    });
    service = new ContactsService(client);

    const user = await service.getUser("user003");
    expect(user.userId).toBe("user003");
    expect(user.name).toBe("王五");
    expect(user.mobile).toBe("");
    expect(user.active).toBe(false);
    expect(user.deptIdList).toEqual([]);
    expect(user.leaderInDept).toEqual([]);
  });

  it("should surface pagination from the API response", async () => {
    const client = createMockClient({
      getUserList: vi.fn().mockResolvedValue({
        errcode: 0,
        errmsg: "ok",
        result: { has_more: true, next_cursor: 42, list: [userRaw()] },
      }),
    });
    service = new ContactsService(client);

    const result = await service.listUsers(1);
    expect(result.total).toBe(1);
    expect(result.hasMore).toBe(true);
  });

  it("should normalize department fields", async () => {
    const client = createMockClient({
      getDepartmentDetail: vi.fn().mockResolvedValue({
        errcode: 0,
        errmsg: "ok",
        result: {
          dept_id: 7,
          name: "东校",
          parent_id: 1,
          create_dept_group: true,
          auto_add_user: false,
        },
      }),
    });
    service = new ContactsService(client);

    const dept = await service.getDepartment(7);
    expect(dept).toEqual({
      id: 7,
      name: "东校",
      parentId: 1,
      createDeptGroup: true,
      autoAddUser: false,
    });
  });

  it("should list child department ids", async () => {
    const ids = await service.listSubDepartmentIds(1);
    expect(ids).toEqual([10, 20, 30]);
  });

  it("should list department user ids", async () => {
    const ids = await service.listDepartmentUserIds(1);
    expect(ids).toEqual(["u1", "u2"]);
  });

  it("should hydrate a user looked up by mobile", async () => {
    const user = await service.getUserByMobile("13800138000");
    expect(user.userId).toBe("user001");
    expect(user.name).toBe("张三");
  });

  it("should throw when a mobile has no matching user", async () => {
    const client = createMockClient({
      getUserIdByMobile: vi
        .fn()
        .mockResolvedValue({ errcode: 0, errmsg: "ok", result: { userid: "" } }),
    });
    service = new ContactsService(client);
    await expect(service.getUserByMobile("13900000000")).rejects.toThrow(/No DingTalk user found/);
  });

  it("should hydrate a user looked up by unionId", async () => {
    const user = await service.getUserByUnionId("union001");
    expect(user.userId).toBe("user001");
  });

  it("should search users and hydrate each hit by default", async () => {
    const result = await service.searchUsers({ queryWord: "张", size: 2 });
    expect(result.total).toBe(1744);
    expect(result.hasMore).toBe(true);
    expect(result.userIds).toEqual(["user001", "user002"]);
    expect(result.users).toHaveLength(2);
  });

  it("should skip hydration when searchUsers hydrate=false", async () => {
    const result = await service.searchUsers({ queryWord: "张", size: 2, hydrate: false });
    expect(result.users).toEqual([]);
    expect(result.userIds).toEqual(["user001", "user002"]);
  });

  it("should search departments and hydrate each hit", async () => {
    const result = await service.searchDepartments({ queryWord: "东校" });
    expect(result.total).toBe(2);
    expect(result.deptIds).toEqual([7, 8]);
    expect(result.departments).toHaveLength(2);
  });

  describe("findDepartments (fuzzy path resolution)", () => {
    it("should segment a compound name and return the most specific match", async () => {
      const matches = await service.findDepartments("东校中学2025级");
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({
        id: 1000,
        name: "2025级",
        parentId: 100,
        path: "根部门 / 东校 / 中学 / 2025级",
        depth: 4,
      });
    });

    it("should handle a space-separated query", async () => {
      const matches = await service.findDepartments("东校 2025级");
      // both 小学/2025级 and 中学/2025级 are under 东校
      expect(matches.map((m) => m.id).sort()).toEqual([1000, 1010]);
    });

    it("should return empty when nothing matches", async () => {
      const matches = await service.findDepartments("校长室不存在");
      expect(matches).toEqual([]);
    });

    it("should match by path when a token only appears in an ancestor", async () => {
      const matches = await service.findDepartments("东校 中学");
      // 中学 under 东校, plus its descendant 2025级 — but not 中学 under 繁华校区
      expect(matches.map((m) => m.id).sort()).toEqual([100, 1000]);
    });

    it("should return empty for an empty query", async () => {
      expect(await service.findDepartments("   ")).toEqual([]);
    });

    it("should cache the full department list across calls", async () => {
      await service.findDepartments("东校");
      await service.findDepartments("中学");
      expect(client.getAllDepartments).toHaveBeenCalledTimes(1);
    });
  });

  describe("findUser (name + department hint)", () => {
    /** Department roster: only 张一 is a direct member of 东校/中学/2025级. */
    function twoZhangClient() {
      return createMockClient({
        searchUsers: vi.fn().mockResolvedValue({
          hasMore: false,
          totalCount: 2,
          list: ["user001", "user002"],
        }),
        getUserDetail: vi.fn().mockImplementation(async (id: string) => ({
          errcode: 0,
          errmsg: "ok",
          result: userRaw({
            userid: id,
            name: id === "user001" ? "张一" : "张二",
            dept_id_list: id === "user001" ? [1000] : [2000],
          }),
        })),
        getUserList: vi.fn().mockResolvedValue({
          errcode: 0,
          errmsg: "ok",
          result: {
            has_more: false,
            next_cursor: 0,
            list: [userRaw({ userid: "user001", name: "张一" })],
          },
        }),
      });
    }

    it("should return all name matches when no department hint is given", async () => {
      service = new ContactsService(twoZhangClient());
      const result = await service.findUser({ name: "张" });
      expect(result.total).toBe(2);
      expect(result.users.map((u) => u.name).sort()).toEqual(["张一", "张二"]);
      expect(result.dept).toBeUndefined();
    });

    it("should match against the department roster when a hint is given", async () => {
      service = new ContactsService(twoZhangClient());
      const result = await service.findUser({ name: "张", deptHint: "东校中学2025级" });
      expect(result.users).toHaveLength(1);
      expect(result.users[0]!.name).toBe("张一");
      expect(result.dept).toMatchObject({ id: 1000, path: "根部门 / 东校 / 中学 / 2025级" });
    });

    it("should explain when the department hint matches nothing", async () => {
      service = new ContactsService(twoZhangClient());
      const result = await service.findUser({ name: "张", deptHint: "不存在的部门" });
      expect(result.users).toEqual([]);
      expect(result.hint).toMatch(/未匹配到任何部门/);
    });

    it("should explain when the hint department has no matching member", async () => {
      const c = createMockClient({
        getUserList: vi.fn().mockResolvedValue({
          errcode: 0,
          errmsg: "ok",
          result: { has_more: false, next_cursor: 0, list: [userRaw({ userid: "u9", name: "李四" })] },
        }),
        searchUsers: vi.fn().mockResolvedValue({ hasMore: false, totalCount: 1, list: ["user001"] }),
        getUserDetail: vi.fn().mockResolvedValue({
          errcode: 0,
          errmsg: "ok",
          result: userRaw({ userid: "user001", name: "张三" }),
        }),
      });
      service = new ContactsService(c);
      const result = await service.findUser({ name: "张", deptHint: "东校中学2025级" });
      expect(result.users).toEqual([]);
      expect(result.hint).toMatch(/没有匹配/);
    });
  });

  describe("家校通讯录过滤", () => {
    it("listAllDepartments 默认排除家校通讯录整棵子树", async () => {
      const list = await service.listAllDepartments();
      const ids = list.map((d) => d.id);
      expect(ids).not.toContain(-7);
      expect(ids).not.toContain(-8);
      expect(ids).not.toContain(-9);
      // 行政部门的部门应该还在
      expect(ids).toContain(10);  // 东校
      expect(ids).toContain(1000); // 2025级
    });

    it("listAllDepartments includeHomeSchool=true 时包含家校通讯录", async () => {
      const list = await service.listAllDepartments(false, true);
      const ids = list.map((d) => d.id);
      expect(ids).toContain(-7);
      expect(ids).toContain(-8);
      expect(ids).toContain(-9);
    });

    it("findDepartments 默认不匹配家校通讯录内的部门", async () => {
      const matches = await service.findDepartments("家长");
      expect(matches.map((m) => m.id)).not.toContain(-8);
      expect(matches.map((m) => m.id)).not.toContain(-9);
    });

    it("findDepartments includeHomeSchool=true 时匹配家校通讯录部门", async () => {
      const matches = await service.findDepartments("家长", 10, true);
      expect(matches.map((m) => m.id)).toContain(-8);
    });

    it("findUser deptHint 默认不解析到家校通讯录部门", async () => {
      const result = await service.findUser({ name: "张", deptHint: "家长" });
      expect(result.hint).toMatch(/未匹配到任何部门/);
    });

    it("findUser deptHint includeHomeSchool=true 时解析到家校通讯录部门", async () => {
      // 家校通讯录→一年级家长(-8)→1班家长(-9)，findDepartments 按深度降序返回
      // "家长" 匹配到 -8 和 -9，-9 更深排在前面
      const result = await service.findUser({ name: "张", deptHint: "家长", includeHomeSchool: true });
      expect(result.dept).toBeDefined();
      expect(result.dept!.id).toBe(-9);
    });
  });
});
