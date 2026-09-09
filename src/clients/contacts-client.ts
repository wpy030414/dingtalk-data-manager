import { BaseClient } from "./base-client.js";

// Full API URLs (钉钉 API 版本繁多，禁止共用 baseURL)
//
// 通讯录横跨两代 API，baseURL 与一级 path 都不一致：
//   旧版 OAPI : https://oapi.dingtalk.com/topapi/...   表单编码 + access_token 表单参数
//   新版 API  : https://api.dingtalk.com/v1.0/contact/...  JSON body + x-acs-dingtalk-access-token
const OAPI = "https://oapi.dingtalk.com";
const NEW_API = "https://api.dingtalk.com";

export class ContactsClient extends BaseClient {
  /** 获取部门列表 */
  async getDepartmentList(deptId = 1): Promise<DepartmentListResponse> {
    return this.oapiRequest<DepartmentListResponse>(
      `${OAPI}/topapi/v2/department/listsub`,
      { dept_id: deptId },
    );
  }

  /** 获取部门详情 */
  async getDepartmentDetail(deptId: number): Promise<DepartmentDetailResponse> {
    return this.oapiRequest<DepartmentDetailResponse>(
      `${OAPI}/topapi/v2/department/get`,
      { dept_id: deptId },
    );
  }

  /** 获取部门用户列表 */
  async getUserList(deptId: number, cursor = 0, size = 100): Promise<UserListResponse> {
    return this.oapiRequest<UserListResponse>(
      `${OAPI}/topapi/v2/user/list`,
      { dept_id: deptId, cursor, size },
    );
  }

  /** 获取用户详情 */
  async getUserDetail(userId: string): Promise<UserDetailResponse> {
    return this.oapiRequest<UserDetailResponse>(
      `${OAPI}/topapi/v2/user/get`,
      { userid: userId },
    );
  }

  /** 获取子部门 ID 列表（只返回 ID，不分页） */
  async getSubDepartmentIds(deptId: number): Promise<SubDepartmentIdResponse> {
    return this.oapiRequest<SubDepartmentIdResponse>(
      `${OAPI}/topapi/v2/department/listsubid`,
      { dept_id: deptId },
    );
  }

  /**
   * 一次性拉取全公司部门（含 id/name/parentid）。
   * 注意：这是唯一走 GET 的 OAPI 端点，access_token 作为 query 参数。
   */
  async getAllDepartments(): Promise<AllDepartmentsResponse> {
    return this.oapiGet<AllDepartmentsResponse>(`${OAPI}/department/list`);
  }

  /** 获取部门用户的 userid 列表（只返回 ID，不分页） */
  async getDepartmentUserIds(deptId: number): Promise<DepartmentUserIdResponse> {
    return this.oapiRequest<DepartmentUserIdResponse>(
      `${OAPI}/topapi/user/listid`,
      { dept_id: deptId },
    );
  }

  /** 根据手机号获取用户 ID */
  async getUserIdByMobile(mobile: string): Promise<UserIdByMobileResponse> {
    return this.oapiRequest<UserIdByMobileResponse>(
      `${OAPI}/topapi/v2/user/getbymobile`,
      { mobile },
    );
  }

  /** 根据 unionid 获取用户 ID */
  async getUserIdByUnionId(unionId: string): Promise<UserIdByUnionIdResponse> {
    return this.oapiRequest<UserIdByUnionIdResponse>(
      `${OAPI}/topapi/user/getbyunionid`,
      { unionid: unionId },
    );
  }

  /** 按关键词搜索用户（新版 API，返回 userid 列表） */
  async searchUsers(params: {
    queryWord: string;
    offset?: number;
    size?: number;
    fullMatchField?: number;
  }): Promise<SearchUsersResponse> {
    const body: Record<string, unknown> = {
      queryWord: params.queryWord,
      offset: params.offset ?? 0,
      size: params.size ?? 10,
    };
    if (params.fullMatchField !== undefined) body["fullMatchField"] = params.fullMatchField;
    return this.newApiRequest<SearchUsersResponse>(
      "POST",
      `${NEW_API}/v1.0/contact/users/search`,
      body,
    );
  }

  /** 按关键词搜索部门（新版 API，返回 deptId 列表） */
  async searchDepartments(params: {
    queryWord: string;
    offset?: number;
    size?: number;
  }): Promise<SearchDepartmentsResponse> {
    return this.newApiRequest<SearchDepartmentsResponse>(
      "POST",
      `${NEW_API}/v1.0/contact/departments/search`,
      {
        queryWord: params.queryWord,
        offset: params.offset ?? 0,
        size: params.size ?? 10,
      },
    );
  }
}

export interface DepartmentListResponse { errcode: number; errmsg: string; result: DepartmentRaw[]; }
export interface DepartmentDetailResponse { errcode: number; errmsg: string; result: DepartmentRaw; }
export interface DepartmentRaw { dept_id: number; name: string; parent_id: number; create_dept_group: boolean; auto_add_user: boolean; [key: string]: unknown; }

export interface UserListResponse { errcode: number; errmsg: string; result: { has_more: boolean; next_cursor: number; list: UserRaw[]; }; }
export interface UserDetailResponse { errcode: number; errmsg: string; result: UserRaw; }
export interface UserRaw { userid: string; unionid: string; name: string; avatar: string; state_code: string; mobile: string; email: string; org_email: string; title: string; work_place: string; dept_id_list: number[]; dept_order_list: number[]; active: boolean; admin: boolean; boss: boolean; leader_in_dept: { dept_id: number; leader: boolean }[]; [key: string]: unknown; }

export interface SubDepartmentIdResponse { errcode: number; errmsg: string; result: { dept_id_list: number[]; }; }
export interface DepartmentUserIdResponse { errcode: number; errmsg: string; result: { userid_list: string[]; }; }
export interface UserIdByMobileResponse { errcode: number; errmsg: string; result: { userid: string; }; }
export interface UserIdByUnionIdResponse { errcode: number; errmsg: string; result: { contact_type: number; userid: string; }; }

/** 全量部门（旧版 GET /department/list），字段是 id/name/parentid 而非 dept_id/name/parent_id。 */
export interface AllDepartmentsResponse {
  errcode: number; errmsg: string;
  department?: Array<{ id: number; name: string; parentid: number; [key: string]: unknown }>;
  result?: Array<{ id: number; name: string; parentid: number; [key: string]: unknown }>;
}

export interface SearchUsersResponse { hasMore: boolean; totalCount: number; list: string[]; }
export interface SearchDepartmentsResponse { hasMore: boolean; totalCount: number; list: number[]; }