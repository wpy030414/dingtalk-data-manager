/** Normalized department object exposed to consumers. */
export interface Department {
  id: number;
  name: string;
  parentId: number;
  createDeptGroup: boolean;
  autoAddUser: boolean;
}

/** Normalized user object exposed to consumers. */
export interface User {
  userId: string;
  unionId: string;
  name: string;
  avatar: string;
  stateCode: string;
  mobile: string;
  email: string;
  orgEmail: string;
  title: string;
  workPlace: string;
  deptIdList: number[];
  deptOrderList: number[];
  active: boolean;
  admin: boolean;
  boss: boolean;
  leaderInDept: { deptId: number; leader: boolean }[];
}

/** Normalized organization info. */
export interface Organization {
  orgName: string;
  orgLogo: string;
}

/** Department tree node (with children). */
export interface DepartmentTreeNode extends Department {
  children: DepartmentTreeNode[];
}

/** Paginated user list. */
export interface PaginatedUsers {
  users: User[];
  total: number;
  hasMore: boolean;
  nextToken?: string;
}

/** A department matched by fuzzy path query, with its full ancestor path. */
export interface DepartmentMatch {
  id: number;
  name: string;
  parentId: number;
  /** Ancestor names joined by " / ", e.g. "东校 / 中学 / 2025级". */
  path: string;
  depth: number;
}