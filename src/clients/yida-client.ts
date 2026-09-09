import { BaseClient } from "./base-client.js";

const NEW_API = "https://api.dingtalk.com";

/**
 * Credential triple required by every Yida server-side API.
 * `userId` must be a DingTalk userId that has permission on the app's data.
 */
export interface YidaContext {
  appType: string;
  systemToken: string;
  userId: string;
}

/** Build a query string, skipping undefined/null values. */
function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const str = search.toString();
  return str ? `?${str}` : "";
}

export class YidaClient extends BaseClient {
  /**
   * 分页获取应用下的表单列表
   * GET https://api.dingtalk.com/v1.0/yida/forms
   */
  async listForms(
    ctx: YidaContext,
    params: { formTypes?: string; pageSize?: number; pageNumber?: number } = {},
  ): Promise<FormListResponse> {
    const url =
      `${NEW_API}/v1.0/yida/forms` +
      qs({
        appType: ctx.appType,
        systemToken: ctx.systemToken,
        userId: ctx.userId,
        formTypes: params.formTypes,
        pageSize: params.pageSize,
        pageNumber: params.pageNumber,
      });
    return this.newApiRequest<FormListResponse>("GET", url);
  }

  /**
   * 获取表单字段定义（含字段 ID、标签、组件类型）
   * GET https://api.dingtalk.com/v1.0/yida/forms/formFields
   */
  async getFormFields(
    ctx: YidaContext,
    formUuid: string,
  ): Promise<FormFieldDefResponse> {
    const url =
      `${NEW_API}/v1.0/yida/forms/formFields` +
      qs({
        appType: ctx.appType,
        formUuid,
        systemToken: ctx.systemToken,
        userId: ctx.userId,
      });
    return this.newApiRequest<FormFieldDefResponse>("GET", url);
  }

  /**
   * 获取表单定义（完整组件树，含布局与子表单）
   * GET https://api.dingtalk.com/v1.0/yida/forms/definitions/{appType}/{formUuid}
   */
  async getFormComponentDefinitions(
    ctx: YidaContext,
    formUuid: string,
    version?: number,
  ): Promise<FormComponentDefinitionResponse> {
    const url =
      `${NEW_API}/v1.0/yida/forms/definitions/${encodeURIComponent(ctx.appType)}/${encodeURIComponent(formUuid)}` +
      qs({
        systemToken: ctx.systemToken,
        userId: ctx.userId,
        version,
      });
    return this.newApiRequest<FormComponentDefinitionResponse>("GET", url);
  }

  /**
   * 查询表单实例数据（不返回子表单组件数据）
   * POST https://api.dingtalk.com/v1.0/yida/forms/instances/query
   */
  async queryFormData(
    ctx: YidaContext,
    params: {
      formUuid: string;
      searchFieldJson?: string;
      originatorId?: string;
      createFromTimeGMT?: string;
      createToTimeGMT?: string;
      modifiedFromTimeGMT?: string;
      modifiedToTimeGMT?: string;
      orderConfigJson?: string;
      pageSize?: number;
      pageNumber?: number;
    },
  ): Promise<FormDataResponse> {
    const body: Record<string, unknown> = {
      appType: ctx.appType,
      systemToken: ctx.systemToken,
      userId: ctx.userId,
      formUuid: params.formUuid,
      pageSize: params.pageSize ?? 20,
      pageNumber: params.pageNumber ?? 1,
    };
    if (params.searchFieldJson) body["searchFieldJson"] = params.searchFieldJson;
    if (params.originatorId) body["originatorId"] = params.originatorId;
    if (params.createFromTimeGMT) body["createFromTimeGMT"] = params.createFromTimeGMT;
    if (params.createToTimeGMT) body["createToTimeGMT"] = params.createToTimeGMT;
    if (params.modifiedFromTimeGMT) body["modifiedFromTimeGMT"] = params.modifiedFromTimeGMT;
    if (params.modifiedToTimeGMT) body["modifiedToTimeGMT"] = params.modifiedToTimeGMT;
    if (params.orderConfigJson) body["orderConfigJson"] = params.orderConfigJson;
    return this.newApiRequest<FormDataResponse>(
      "POST",
      `${NEW_API}/v1.0/yida/forms/instances/query`,
      body,
    );
  }

  /**
   * 根据条件搜索表单实例详情列表（返回字段更丰富）
   * POST https://api.dingtalk.com/v1.0/yida/forms/instances/search
   */
  async searchFormData(
    ctx: YidaContext,
    params: {
      formUuid: string;
      searchFieldJson?: string;
      originatorId?: string;
      createFromTimeGMT?: string;
      createToTimeGMT?: string;
      modifiedFromTimeGMT?: string;
      modifiedToTimeGMT?: string;
      dynamicOrder?: string;
      logicOperator?: string;
      pageSize?: number;
      currentPage?: number;
    },
  ): Promise<SearchFormDataResponse> {
    const body: Record<string, unknown> = {
      appType: ctx.appType,
      systemToken: ctx.systemToken,
      userId: ctx.userId,
      formUuid: params.formUuid,
      pageSize: params.pageSize ?? 20,
      currentPage: params.currentPage ?? 1,
    };
    if (params.searchFieldJson) body["searchFieldJson"] = params.searchFieldJson;
    if (params.originatorId) body["originatorId"] = params.originatorId;
    if (params.createFromTimeGMT) body["createFromTimeGMT"] = params.createFromTimeGMT;
    if (params.createToTimeGMT) body["createToTimeGMT"] = params.createToTimeGMT;
    if (params.modifiedFromTimeGMT) body["modifiedFromTimeGMT"] = params.modifiedFromTimeGMT;
    if (params.modifiedToTimeGMT) body["modifiedToTimeGMT"] = params.modifiedToTimeGMT;
    if (params.dynamicOrder) body["dynamicOrder"] = params.dynamicOrder;
    if (params.logicOperator) body["logicOperator"] = params.logicOperator;
    return this.newApiRequest<SearchFormDataResponse>(
      "POST",
      `${NEW_API}/v1.0/yida/forms/instances/search`,
      body,
    );
  }

  /**
   * 批量获取流程实例列表
   * POST https://api.dingtalk.com/v1.0/yida/processes/instances
   */
  async getProcessInstances(
    ctx: YidaContext,
    params: {
      formUuid?: string;
      instanceStatus?: string;
      approvedResult?: string;
      originatorId?: string;
      createFromTimeGMT?: string;
      createToTimeGMT?: string;
      modifiedFromTimeGMT?: string;
      modifiedToTimeGMT?: string;
      searchFieldJson?: string;
      orderConfigJson?: string;
      taskId?: string;
      pageSize?: number;
      pageNumber?: number;
    } = {},
  ): Promise<ProcessInstancesResponse> {
    const body: Record<string, unknown> = {
      appType: ctx.appType,
      systemToken: ctx.systemToken,
      userId: ctx.userId,
      pageSize: params.pageSize ?? 20,
      pageNumber: params.pageNumber ?? 1,
    };
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") body[key] = value;
    }
    return this.newApiRequest<ProcessInstancesResponse>(
      "POST",
      `${NEW_API}/v1.0/yida/processes/instances`,
      body,
    );
  }

  /**
   * 根据流程实例 ID 获取流程实例详情
   * GET https://api.dingtalk.com/v1.0/yida/processes/instancesInfos/{id}
   */
  async getProcessInstance(
    ctx: YidaContext,
    processInstanceId: string,
  ): Promise<ProcessInstanceDetailResponse> {
    const url =
      `${NEW_API}/v1.0/yida/processes/instancesInfos/${encodeURIComponent(processInstanceId)}` +
      qs({
        appType: ctx.appType,
        systemToken: ctx.systemToken,
        userId: ctx.userId,
      });
    return this.newApiRequest<ProcessInstanceDetailResponse>("GET", url);
  }

  /**
   * 获取流程实例的审批记录
   * GET https://api.dingtalk.com/v1.0/yida/processes/operationRecords
   */
  async getOperationRecords(
    ctx: YidaContext,
    processInstanceId: string,
  ): Promise<OperationRecordsResponse> {
    const url =
      `${NEW_API}/v1.0/yida/processes/operationRecords` +
      qs({
        appType: ctx.appType,
        processInstanceId,
        systemToken: ctx.systemToken,
        userId: ctx.userId,
      });
    return this.newApiRequest<OperationRecordsResponse>("GET", url);
  }
}

// -- Response shapes (only the fields the gateway consumes) --

export interface FormListResponse {
  success: boolean;
  result: {
    data: Array<{
      formType: string;
      formUuid: string;
      creator: string;
      gmtCreate: string;
      title: { zhCN?: string; enUS?: string } | string;
      [key: string]: unknown;
    }>;
    totalCount: number;
    currentPage: number;
  };
}

export interface FormFieldDefResponse {
  success: boolean;
  result: Array<{
    componentName: string;
    fieldId: string;
    label: unknown;
    behavior?: string;
    props?: Record<string, unknown>;
    [key: string]: unknown;
  }>;
}

export interface FormComponentDefinitionResponse {
  result: Array<{
    componentName: string;
    fieldId?: string;
    label?: string;
    props?: Record<string, unknown>;
    children?: unknown[];
    [key: string]: unknown;
  }>;
}

export interface FormDataResponse {
  data: FormInstanceRaw[];
  totalCount: number;
  pageNumber: number;
  hasMoreData?: boolean;
}

export interface FormInstanceRaw {
  formInstId?: string;
  formInstanceId?: string;
  formUuid: string;
  formData: Record<string, unknown>;
  createTimeGMT?: string;
  modifiedTimeGMT?: string;
  creatorUserId?: string;
  modifier?: string;
  [key: string]: unknown;
}

export interface SearchFormDataResponse {
  data: FormInstanceRaw[];
  totalCount: number;
  currentPage: number;
}

export interface ProcessInstancesResponse {
  data: ProcessInstanceRaw[];
  totalCount: number;
  pageNumber: number;
}

export interface ProcessInstanceRaw {
  processInstanceId: string;
  formUuid: string;
  title?: string;
  approvedResult?: string;
  instanceStatus?: string;
  originator?: { userId?: string; name?: unknown; [key: string]: unknown };
  createTimeGMT?: string;
  modifiedTimeGMT?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ProcessInstanceDetailResponse {
  processInstanceId: string;
  formUuid: string;
  title?: string;
  approvedResult?: string;
  instanceStatus?: string;
  originator?: { userId?: string; name?: unknown; [key: string]: unknown };
  actionExecutor?: Array<{ userId?: string; name?: unknown; [key: string]: unknown }>;
  createTimeGMT?: string;
  modifiedTimeGMT?: string;
  processCode?: string;
  version?: number;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OperationRecordsResponse {
  result: Array<{
    processInstanceId?: string;
    operateTimeGMT?: string;
    showName?: string;
    operateType?: string;
    remark?: string;
    type?: string;
    operatorName?: string;
    operatorUserId?: string;
    operatorDisplayName?: string;
    actionExit?: string;
    activityId?: string;
    [key: string]: unknown;
  }>;
}
