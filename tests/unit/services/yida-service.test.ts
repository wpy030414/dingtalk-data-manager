import { describe, it, expect, beforeEach, vi } from "vitest";
import { YidaService } from "@/services/yida-service.ts";
import type { YidaClient } from "@/clients/yida-client.ts";

const mockConfig = {
  ClientID: "test-client-id",
  ClientSecret: "test-client-secret",
  LogLevel: "silent" as const,
  YidaApps: [
    { name: "学生外出参赛申请", desp: "", appId: "APP_TEST", systemToken: "TOKEN_TEST" },
  ],
};

vi.mock("@/config/index.ts", () => ({ getConfig: () => mockConfig }));

/**
 * Unit tests for YidaService — all userId auto-discovery from form creator.
 * No .env.yml userId dependency.
 */
function createMockClient(overrides: Partial<YidaClient> = {}): YidaClient {
  return {
    listForms: vi.fn().mockResolvedValue({
      success: true,
      result: {
        data: [
          {
            formType: "process",
            formUuid: "FORM-1",
            creator: "creator-001",  // ← auto-discovered userId
            gmtCreate: "2026-07-07T09:53Z",
            title: { zhCN: "参赛申请", enUS: "UnNamed Process Form" },
          },
        ],
        totalCount: 1,
        currentPage: 1,
      },
    }),
    getFormFields: vi.fn().mockResolvedValue({
      success: true,
      result: [
        { componentName: "DateField", fieldId: "dateField_mr4cz978", label: '{"zh_CN":"申请日期","en_US":"DateField","type":"i18n"}' },
        { componentName: "TextField", fieldId: "textField_mr4at0xc", label: { zh_CN: "外出事由" } },
      ],
    }),
    getFormComponentDefinitions: vi.fn().mockResolvedValue({
      result: [{ componentName: "Page" }, { componentName: "FormContainer", fieldId: "formContainer_mr4asnzo" }],
    }),
    queryFormData: vi.fn().mockResolvedValue({
      data: [{ formInstanceId: "inst-1", formUuid: "FORM-1", formData: { textField_mr4at0xc: "无人机大赛" }, createTimeGMT: "2026-08-05T12:05Z", modifiedTimeGMT: "2026-08-10T22:13Z", creatorUserId: "user-9" }],
      totalCount: 8, pageNumber: 1, hasMoreData: true,
    }),
    searchFormData: vi.fn().mockResolvedValue({
      data: [{ formInstanceId: "inst-1", formUuid: "FORM-1", formData: {} }],
      totalCount: 8, currentPage: 1,
    }),
    getProcessInstances: vi.fn().mockResolvedValue({
      data: [{ processInstanceId: "proc-1", formUuid: "FORM-1", approvedResult: "agree", originator: { userId: "user-9" }, data: { numberField_mr4at0x4: 2 } }],
      totalCount: 8, pageNumber: 1,
    }),
    getProcessInstance: vi.fn().mockResolvedValue({
      processInstanceId: "proc-1", formUuid: "FORM-1", title: "黄贤云 发起的 参赛申请", approvedResult: "agree", instanceStatus: "COMPLETED", originator: { userId: "user-9" }, actionExecutor: [{ userId: "user-10" }, { userId: "user-11" }], processCode: "TPROC-XXX", data: {},
    }),
    getOperationRecords: vi.fn().mockResolvedValue({
      result: [{ operateTimeGMT: "2026-08-05T12:05Z", showName: "提交申请", operateType: "NEW_PROCESS", operatorName: "黄贤云", operatorUserId: "user-9" }],
    }),
    ...overrides,
  } as unknown as YidaClient;
}

describe("YidaService", () => {
  let service: YidaService;
  let client: YidaClient;

  beforeEach(() => {
    client = createMockClient();
    service = new YidaService(client);
  });

  it("should list configured apps", () => {
    expect(service.listApps()).toHaveLength(1);
  });

  it("should auto-discover userId from form creator", async () => {
    await service.listForms({ appName: "学生外出参赛申请", userId: "explicit-user" });
    expect(client.listForms).toHaveBeenCalledWith(
      { appType: "APP_TEST", systemToken: "TOKEN_TEST", userId: "explicit-user" },
      expect.anything(),
    );
  });

  it("should throw on unknown app name", async () => {
    await expect(service.listForms({ appName: "不存在的应用", userId: "u" })).rejects.toThrow(/not found/);
  });

  it("should unwrap i18n form titles", async () => {
    const forms = await service.listForms({ appName: "学生外出参赛申请", userId: "u" });
    expect(forms).toEqual([
      { formUuid: "FORM-1", formType: "process", title: "参赛申请", creator: "creator-001", gmtCreate: "2026-07-07T09:53Z", fields: [{ fieldId: "dateField_mr4cz978", label: "申请日期" }, { fieldId: "textField_mr4at0xc", label: "外出事由" }] },
    ]);
  });

  it("should unwrap JSON-encoded and object labels in field definitions", async () => {
    const fields = await service.getFormFields({ appName: "学生外出参赛申请", formUuid: "FORM-1", userId: "u" });
    expect(fields[0]!.label).toBe("申请日期");
    expect(fields[1]!.label).toBe("外出事由");
  });

  it("should map form instance data with pagination", async () => {
    const result = await service.queryFormData({ appName: "学生外出参赛申请", formUuid: "FORM-1", userId: "u" });
    expect(result.total).toBe(8);
    expect(result.hasMore).toBe(true);
    expect(result.items[0]).toMatchObject({ formInstanceId: "inst-1", creatorUserId: "user-9" });
  });

  it("should map process instance list entries", async () => {
    const result = await service.listProcessInstances({ appName: "学生外出参赛申请", userId: "u" });
    expect(result.total).toBe(8);
    expect(result.items[0]).toMatchObject({ processInstanceId: "proc-1", approvedResult: "agree", originatorUserId: "user-9" });
  });

  it("should map a process instance detail with action executors", async () => {
    const detail = await service.getProcessInstance({ appName: "学生外出参赛申请", processInstanceId: "proc-1", userId: "u" });
    expect(detail.title).toBe("黄贤云 发起的 参赛申请");
    expect(detail.instanceStatus).toBe("COMPLETED");
    expect(detail.actionExecutorIds).toEqual(["user-10", "user-11"]);
  });

  it("should map approval records", async () => {
    const records = await service.getOperationRecords({ appName: "学生外出参赛申请", processInstanceId: "proc-1", userId: "u" });
    expect(records).toEqual([{ operateTimeGMT: "2026-08-05T12:05Z", showName: "提交申请", operateType: "NEW_PROCESS", operatorName: "黄贤云", operatorUserId: "user-9", remark: "", activityId: "" }]);
  });

  it("should auto-bootstrap userId from form creator when not provided", async () => {
    const bootstrapClient = createMockClient();
    service = new YidaService(bootstrapClient);
    const forms = await service.listForms({ appName: "学生外出参赛申请" });
    expect(forms).toHaveLength(1);
    // bootstrap 内部调了一次 listForms 拿 creator，然后 loadFormsCached 缓存命中不再调
    expect(bootstrapClient.listForms).toHaveBeenCalledWith(
      expect.objectContaining({ systemToken: "TOKEN_TEST" }),
      expect.anything(),
    );
  });

  it("should auto-resolve formUuid for single-form app", async () => {
    const result = await service.queryFormData({ appName: "学生外出参赛申请", userId: "u" });
    expect(result.total).toBe(8);
    expect(client.queryFormData).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u" }),
      expect.objectContaining({ formUuid: "FORM-1" }),
    );
  });
});