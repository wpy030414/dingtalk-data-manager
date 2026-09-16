import { getConfig } from "../config/index.js";
import type { YidaAppConfig } from "../config/schema.js";
import { YidaClient, type YidaContext } from "../clients/yida-client.js";
import type {
  FormFieldDefResponse,
  FormComponentDefinitionResponse,
  OperationRecordsResponse,
  ProcessInstanceDetailResponse,
  ProcessInstanceRaw,
  FormInstanceRaw,
} from "../clients/yida-client.js";
import { ConfigError } from "../lib/errors.js";

/** 表单摘要——Agent 选择查哪个表的核心入口。含字段 ID+中文名，一步到位。 */
export interface FormSummary {
  formUuid: string;
  formType: string;
  title: string;
  creator: string;
  gmtCreate: string;
  /** 该表单的字段（fieldId + 中文标签，前 50 个），Agent 可直接拿 fieldId 构造 searchFieldJson */
  fields: FieldBrief[];
}

export interface FieldBrief {
  fieldId: string;
  label: string;
}

export interface FormField {
  fieldId: string;
  componentName: string;
  label: string;
  behavior?: string;
}

export interface FormComponent {
  componentName: string;
  fieldId?: string;
  label?: string;
}

export interface FormInstance {
  formInstanceId: string;
  formUuid: string;
  formData: Record<string, unknown>;
  createTimeGMT: string;
  modifiedTimeGMT: string;
  creatorUserId: string;
}

export interface FormDataResult {
  items: FormInstance[];
  total: number;
  currentPage: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ProcessInstance {
  processInstanceId: string;
  formUuid: string;
  title: string;
  approvedResult: string;
  instanceStatus: string;
  originatorUserId: string;
  createTimeGMT: string;
  modifiedTimeGMT: string;
  data: Record<string, unknown>;
}

export interface ProcessInstanceDetail extends ProcessInstance {
  processCode: string;
  actionExecutorIds: string[];
}

export interface OperationRecord {
  operateTimeGMT: string;
  showName: string;
  operateType: string;
  operatorName: string;
  operatorUserId: string;
  remark: string;
  activityId: string;
}

export class YidaService {
  /**
   * @param client         Yida API client
   * @param resolveBootstrapUserId  (appName) → an arbitrary DingTalk userId for the initial API call.
   *                                Called exactly once per app, when no explicit userId is available.
   *                                The result is discarded after the app creator userId is discovered.
   */
  constructor(
    private readonly client: YidaClient,
    private readonly resolveBootstrapUserId?: (appName: string) => Promise<string>,
  ) {}

  /** 表单摘要缓存：应用→表单列表（含 creator 和字段名） */
  private formCache = new Map<string, { at: number; forms: FormSummary[] }>();
  private static readonly FORM_CACHE_TTL_MS = 10 * 60_000;

  listApps(): YidaAppConfig[] {
    return getConfig().YidaApps;
  }

  // ============================================================
  // i18n helpers
  // ============================================================

  static titleOf(title: unknown): string {
    if (typeof title === "string") return title;
    if (title && typeof title === "object") {
      const t = title as Record<string, unknown>;
      return String(t["zhCN"] ?? t["enUS"] ?? "");
    }
    return "";
  }

  static labelOf(label: unknown): string {
    if (typeof label === "string") {
      try {
        const parsed = JSON.parse(label) as Record<string, unknown>;
        return String(parsed["zh_CN"] ?? parsed["zhCN"] ?? parsed["en_US"] ?? label);
      } catch { return label; }
    }
    if (label && typeof label === "object") {
      const t = label as Record<string, unknown>;
      return String(t["zh_CN"] ?? t["zhCN"] ?? t["en_US"] ?? "");
    }
    return "";
  }

  static toFormInstance(raw: FormInstanceRaw): FormInstance {
    return {
      formInstanceId: String(raw["formInstanceId"] ?? raw["formInstId"] ?? ""),
      formUuid: raw.formUuid,
      formData: raw.formData ?? {},
      createTimeGMT: String(raw["createTimeGMT"] ?? raw["createTime"] ?? ""),
      modifiedTimeGMT: String(raw["modifiedTimeGMT"] ?? raw["modifiedTime"] ?? ""),
      creatorUserId: String(raw["creatorUserId"] ?? ""),
    };
  }

  static toProcessInstance(raw: ProcessInstanceRaw): ProcessInstance {
    return {
      processInstanceId: raw.processInstanceId,
      formUuid: raw.formUuid,
      title: raw.title ?? "",
      approvedResult: String(raw["approvedResult"] ?? ""),
      instanceStatus: String(raw["instanceStatus"] ?? ""),
      originatorUserId: String(raw.originator?.userId ?? ""),
      createTimeGMT: String(raw["createTimeGMT"] ?? ""),
      modifiedTimeGMT: String(raw["modifiedTimeGMT"] ?? ""),
      data: raw.data ?? {},
    };
  }

  // ============================================================
  // userId bootstrap — auto-discover from form creator, zero env config
  // ============================================================

  /**
   * Resolve userId for API calls.
   * Priority: explicit userId → cached form creator → auto-bootstrap via listForms.
   * The Agent never sees userId — it's entirely internal.
   */
  private async resolveAppAuth(
    appName: string,
    userId?: string,
  ): Promise<{ app: YidaAppConfig; ctx: YidaContext }> {
    // Level 1: explicit userId from internal caller
    if (userId) return this.makeAuth(appName, userId);

    // Level 2: cached creator from previous listForms call
    const c = this.formCache.get(appName);
    if (c && c.forms[0]) return this.makeAuth(appName, c.forms[0].creator);

    // Level 3: auto-bootstrap — call listForms to discover creator, then retry
    await this.bootstrapAuth(appName);
    const c2 = this.formCache.get(appName);
    if (c2 && c2.forms[0]) return this.makeAuth(appName, c2.forms[0].creator);

    throw new ConfigError(
      `Cannot discover creator userId for "${appName}". ` +
      `The Yida forms listing API may require a valid userId for the first call.`,
    );
  }

  /** Call listForms to warm the cache and discover the app creator's userId. */
  private async bootstrapAuth(appName: string): Promise<void> {
    const apps = getConfig().YidaApps;
    const app = apps.find((a) => a.name === appName);
    if (!app) {
      throw new ConfigError(
        `Yida app "${appName}" not found. Available: ` +
        `${apps.map((a) => a.name).join(", ") || "(none)"}`,
      );
    }
    // 从通讯录模块拿任意一个管理员的 userId 做种子调用，拿到 creator 后缓存
    const seedUserId = this.resolveBootstrapUserId
      ? await this.resolveBootstrapUserId(appName)
      : undefined;
    const ctx: YidaContext = { appType: app.appId, systemToken: app.systemToken, userId: seedUserId };
    await this.loadFormsCached(appName, ctx);
  }

  private makeAuth(
    appName: string,
    userId: string,
  ): { app: YidaAppConfig; ctx: YidaContext } {
    const apps = getConfig().YidaApps;
    const app = apps.find((a) => a.name === appName);
    if (!app) {
      throw new ConfigError(
        `Yida app "${appName}" not found. Available: ` +
        `${apps.map((a) => a.name).join(", ") || "(none)"}`,
      );
    }
    return { app, ctx: { appType: app.appId, systemToken: app.systemToken, userId } };
  }

  // ============================================================
  // Auto-resolve formUuid (userId implicitly from cache)
  // ============================================================

  async resolveAuto(
    appName: string,
    userId?: string,
    formUuid?: string,
  ): Promise<{ app: YidaAppConfig; ctx: YidaContext; formUuid: string }> {
    const { app, ctx } = await this.resolveAppAuth(appName, userId);

    if (formUuid) return { app, ctx, formUuid };

    const forms = await this.loadFormsCached(appName, ctx);
    if (forms.length === 1) return { app, ctx, formUuid: forms[0]!.formUuid };
    if (forms.length > 1) {
      const list = forms
        .map((f) => `${f.title} [${f.fields.slice(0, 8).map((fb) => fb.label).join(", ")}${f.fields.length > 8 ? "..." : ""}] (${f.formUuid})`)
        .join("\n  ");
      throw new ConfigError(`App "${appName}" has ${forms.length} forms. Pick one:\n  ${list}`);
    }
    throw new ConfigError(`No forms in "${appName}".`);
  }

  // ============================================================
  // Form listing (ENRICHED — fields populated, cached)
  // ============================================================

  private async loadFormsCached(
    appName: string,
    ctx?: YidaContext,
  ): Promise<FormSummary[]> {
    const cached = this.formCache.get(appName);
    if (cached && Date.now() - cached.at < YidaService.FORM_CACHE_TTL_MS) return cached.forms;
    const forms = await this.loadForms(appName, ctx);
    this.formCache.set(appName, { at: Date.now(), forms });
    return forms;
  }

  /** Internal: load forms without going through resolveAppAuth again. */
  private async loadForms(
    appName: string,
    ctx?: YidaContext,
  ): Promise<FormSummary[]> {
    if (!ctx) {
      const boot = await this.resolveAppAuth(appName);
      ctx = boot.ctx;
    }
    const raw = await this.client.listForms(ctx, { pageSize: 50, pageNumber: 1 });
    const forms: FormSummary[] = (raw.result?.data ?? []).map((f) => ({
      formUuid: f.formUuid,
      formType: f.formType,
      title: YidaService.titleOf(f.title),
      creator: f.creator,
      gmtCreate: f.gmtCreate,
      fields: [] as FieldBrief[],
    }));
    await Promise.all(forms.map(async (f) => {
      try {
        const fd = await this.client.getFormFields(ctx!, f.formUuid);
        f.fields = (fd.result ?? []).map((fld) => ({
          fieldId: fld.fieldId,
          label: YidaService.labelOf(fld.label),
        }));
      } catch { /* skip */ }
    }));
    return forms;
  }

  /**
   * 列出应用下全部表单——**自动补全字段名**。Agent 语义分析入口。
   * userId：首次调用必须传，之后从缓存自动拿。
   */
  async listForms(params: {
    appName: string;
    userId?: string;
    pageSize?: number;
    pageNumber?: number;
  }): Promise<FormSummary[]> {
    const { ctx } = await this.resolveAppAuth(params.appName, params.userId);
    return this.loadFormsCached(params.appName, ctx);
  }

  // ============================================================
  // Form fields & components
  // ============================================================

  async getFormFields(params: {
    appName: string;
    formUuid?: string;
    userId?: string;
  }): Promise<FormField[]> {
    const { ctx, formUuid } = await this.resolveAuto(params.appName, params.userId, params.formUuid);
    const raw: FormFieldDefResponse = await this.client.getFormFields(ctx, formUuid);
    return (raw.result ?? []).map((f) => ({
      fieldId: f.fieldId,
      componentName: f.componentName,
      label: YidaService.labelOf(f.label),
      behavior: f.behavior,
    }));
  }

  async getFormComponents(params: {
    appName: string;
    formUuid?: string;
    userId?: string;
  }): Promise<FormComponent[]> {
    const { ctx, formUuid } = await this.resolveAuto(params.appName, params.userId, params.formUuid);
    const raw: FormComponentDefinitionResponse =
      await this.client.getFormComponentDefinitions(ctx, formUuid);
    return (raw.result ?? []).map((c) => ({
      componentName: c.componentName,
      fieldId: c.fieldId,
      label: c.label ? YidaService.labelOf(c.label) : undefined,
    }));
  }

  // ============================================================
  // Form data
  // ============================================================

  async queryFormData(params: {
    appName: string;
    formUuid?: string;
    userId?: string;
    searchFieldJson?: string;
    originatorId?: string;
    createFromTimeGMT?: string;
    createToTimeGMT?: string;
    pageSize?: number;
    pageNumber?: number;
  }): Promise<FormDataResult> {
    const { ctx, formUuid } = await this.resolveAuto(params.appName, params.userId, params.formUuid);
    const raw = await this.client.queryFormData(ctx, {
      formUuid,
      searchFieldJson: params.searchFieldJson,
      originatorId: params.originatorId,
      createFromTimeGMT: params.createFromTimeGMT,
      createToTimeGMT: params.createToTimeGMT,
      pageSize: params.pageSize,
      pageNumber: params.pageNumber,
    });
    return {
      items: (raw.data ?? []).map(YidaService.toFormInstance),
      total: raw.totalCount ?? 0,
      currentPage: raw.pageNumber ?? params.pageNumber ?? 1,
      pageSize: params.pageSize ?? 20,
      hasMore: raw.hasMoreData ?? false,
    };
  }

  async searchFormData(params: {
    appName: string;
    formUuid?: string;
    userId?: string;
    searchFieldJson?: string;
    originatorId?: string;
    createFromTimeGMT?: string;
    createToTimeGMT?: string;
    pageSize?: number;
    currentPage?: number;
  }): Promise<FormDataResult> {
    const { ctx, formUuid } = await this.resolveAuto(params.appName, params.userId, params.formUuid);
    const raw = await this.client.searchFormData(ctx, {
      formUuid,
      searchFieldJson: params.searchFieldJson,
      originatorId: params.originatorId,
      createFromTimeGMT: params.createFromTimeGMT,
      createToTimeGMT: params.createToTimeGMT,
      pageSize: params.pageSize,
      currentPage: params.currentPage,
    });
    return {
      items: (raw.data ?? []).map(YidaService.toFormInstance),
      total: raw.totalCount ?? 0,
      currentPage: raw.currentPage ?? params.currentPage ?? 1,
      pageSize: params.pageSize ?? 20,
      hasMore: false,
    };
  }

  // ============================================================
  // Processes
  // ============================================================

  async listProcessInstances(params: {
    appName: string;
    userId?: string;
    formUuid?: string;
    instanceStatus?: string;
    approvedResult?: string;
    originatorId?: string;
    createFromTimeGMT?: string;
    createToTimeGMT?: string;
    searchFieldJson?: string;
    pageSize?: number;
    pageNumber?: number;
  }): Promise<{ items: ProcessInstance[]; total: number; pageNumber: number }> {
    const { ctx, formUuid } = await this.resolveAuto(params.appName, params.userId, params.formUuid);
    const raw = await this.client.getProcessInstances(ctx, {
      formUuid,
      instanceStatus: params.instanceStatus,
      approvedResult: params.approvedResult,
      originatorId: params.originatorId,
      createFromTimeGMT: params.createFromTimeGMT,
      createToTimeGMT: params.createToTimeGMT,
      searchFieldJson: params.searchFieldJson,
      pageSize: params.pageSize,
      pageNumber: params.pageNumber,
    });
    return {
      items: (raw.data ?? []).map(YidaService.toProcessInstance),
      total: raw.totalCount ?? 0,
      pageNumber: raw.pageNumber ?? params.pageNumber ?? 1,
    };
  }

  async getProcessInstance(params: {
    appName: string;
    processInstanceId: string;
    userId?: string;
  }): Promise<ProcessInstanceDetail> {
    const { ctx } = await this.resolveAppAuth(params.appName, params.userId);
    const raw: ProcessInstanceDetailResponse =
      await this.client.getProcessInstance(ctx, params.processInstanceId);
    return {
      processInstanceId: raw.processInstanceId,
      formUuid: raw.formUuid,
      title: raw.title ?? "",
      approvedResult: String(raw["approvedResult"] ?? ""),
      instanceStatus: String(raw["instanceStatus"] ?? ""),
      originatorUserId: String(raw.originator?.userId ?? ""),
      createTimeGMT: String(raw["createTimeGMT"] ?? ""),
      modifiedTimeGMT: String(raw["modifiedTimeGMT"] ?? ""),
      data: raw.data ?? {},
      processCode: String(raw["processCode"] ?? ""),
      actionExecutorIds: (raw.actionExecutor ?? []).map((a) => String(a.userId ?? "")),
    };
  }

  async getOperationRecords(params: {
    appName: string;
    processInstanceId: string;
    userId?: string;
  }): Promise<OperationRecord[]> {
    const { ctx } = await this.resolveAppAuth(params.appName, params.userId);
    const raw: OperationRecordsResponse =
      await this.client.getOperationRecords(ctx, params.processInstanceId);
    return (raw.result ?? []).map((r) => ({
      operateTimeGMT: String(r.operateTimeGMT ?? ""),
      showName: String(r.showName ?? ""),
      operateType: String(r.operateType ?? ""),
      operatorName: String(r.operatorName ?? ""),
      operatorUserId: String(r.operatorUserId ?? ""),
      remark: String(r.remark ?? ""),
      activityId: String(r.activityId ?? ""),
    }));
  }
}