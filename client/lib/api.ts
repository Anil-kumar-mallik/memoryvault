import {
  AccountDeletePayload,
  AccountPasswordPayload,
  AddMemberPayload,
  AuthPayload,
  AuthResponse,
  BillingCycle,
  DeleteMemberResponse,
  DeleteTreeResponse,
  FamilyTree,
  MemberGraphResponse,
  MemberRelationMutationPayload,
  MemberRelationMutationResponse,
  NotificationsResponse,
  Plan,
  RazorpayOrderResponse,
  RazorpayVerifyPayload,
  SubscriptionSummaryResponse,
  TreeFocusResponse,
  MemberWithRelationsResponse,
  PaginatedMembersResponse,
  RemoveMemberRelationPayload,
  TreeDetails,
  TreePayload,
  TreeSettingsPayload,
  UpdateMemberPayload,
  User
} from "@/types";
import { getCsrfToken, getToken } from "@/lib/auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api/v1";

const treePasswordKey = (treeId: string) => `memoryvault_tree_password_${treeId}`;
const treeAccessTokenKey = (treeId: string) => `memoryvault_tree_access_token_${treeId}`;

export function setTreeAccessPassword(treeId: string, password: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(treePasswordKey(treeId), password);
}

export function getTreeAccessPassword(treeId: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage.getItem(treePasswordKey(treeId));
}

export function clearTreeAccessPassword(treeId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(treePasswordKey(treeId));
}

export function setTreeAccessToken(treeId: string, token: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(treeAccessTokenKey(treeId), token);
}

export function getTreeAccessToken(treeId: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage.getItem(treeAccessTokenKey(treeId));
}

export function clearTreeAccessToken(treeId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(treeAccessTokenKey(treeId));
}

type RequestConfig = {
  useFormData?: boolean;
  treeIdForAccess?: string;
  treePassword?: string;
  treeAccessToken?: string;
};

type MemberRelationsQuery = {
  childrenPage?: number;
  childrenLimit?: number;
  spouseLimit?: number;
  siblingLimit?: number;
};

async function request<T>(path: string, options: RequestInit = {}, config: RequestConfig = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const primaryToken = getToken();
  const legacyToken = typeof window !== "undefined" ? window.localStorage.getItem("token") : null;
  const authToken = primaryToken ?? legacyToken;
  const method = String(options.method || "GET").toUpperCase();
  const isUnsafeMethod = !["GET", "HEAD", "OPTIONS"].includes(method);

  if (!config.useFormData) {
    headers.set("Content-Type", "application/json");
  }

  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  if (authToken) {
    if (isUnsafeMethod) {
      const csrfToken = getCsrfToken();
      if (csrfToken) {
        headers.set("x-csrf-token", csrfToken);
      }
    }
  }

  const resolvedTreePassword = config.treePassword || (config.treeIdForAccess ? getTreeAccessPassword(config.treeIdForAccess) : null);
  if (resolvedTreePassword) {
    headers.set("x-tree-password", resolvedTreePassword);
  }

  const resolvedTreeAccessToken =
    config.treeAccessToken || (config.treeIdForAccess ? getTreeAccessToken(config.treeIdForAccess) : null);
  if (resolvedTreeAccessToken) {
    headers.set("x-tree-access-token", resolvedTreeAccessToken);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    cache: "no-store"
  });

  if (config.treeIdForAccess) {
    const refreshedTreeAccessToken = response.headers.get("x-tree-access-token");
    if (refreshedTreeAccessToken) {
      setTreeAccessToken(config.treeIdForAccess, refreshedTreeAccessToken);
    }
  }

  const isJson = (response.headers.get("content-type") ?? "").includes("application/json");
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    throw new Error(payload?.message ?? `Request failed with status ${response.status}`);
  }

  return payload as T;
}

export function register(payload: AuthPayload): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function login(payload: AuthPayload): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function verifyEmailToken(token: string): Promise<{ message: string }> {
  const safeToken = encodeURIComponent(token);
  return request<{ message: string }>(`/auth/verify-email?token=${safeToken}`);
}

export function requestPasswordReset(email: string): Promise<{ message: string }> {
  return request<{ message: string }>("/auth/password-reset/request", {
    method: "POST",
    body: JSON.stringify({ email })
  });
}

export function resetPasswordWithToken(token: string, password: string): Promise<{ message: string }> {
  return request<{ message: string }>("/auth/password-reset/confirm", {
    method: "POST",
    body: JSON.stringify({ token, password })
  });
}

export function getMyAccount(): Promise<User> {
  return request<User>("/account");
}

export function updateMyAccount(payload: { name?: string }, imageFile?: File | null): Promise<User> {
  const formData = new FormData();

  if (payload.name !== undefined) {
    formData.append("name", payload.name);
  }

  if (imageFile) {
    formData.append("profileImage", imageFile);
  }

  return request<User>(
    "/account/update",
    {
      method: "PUT",
      body: formData
    },
    { useFormData: true }
  );
}

export function updateMyPassword(payload: AccountPasswordPayload): Promise<{ message: string }> {
  return request<{ message: string }>("/account/password", {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function deleteMyAccount(
  payload: AccountDeletePayload
): Promise<{ message: string; deletedTrees: number; deletedMembers: number; unlinkedRootMembers: number }> {
  return request<{ message: string; deletedTrees: number; deletedMembers: number; unlinkedRootMembers: number }>("/account", {
    method: "DELETE",
    body: JSON.stringify(payload)
  });
}

export function getMyTrees(): Promise<FamilyTree[]> {
  return request<FamilyTree[]>("/trees");
}

export function getTreeById(treeId: string, treePassword?: string): Promise<TreeDetails> {
  return request<TreeDetails>(`/trees/${treeId}`, {}, { treeIdForAccess: treeId, treePassword });
}

export async function getPublicTreeBySlug(slug: string, treePassword?: string): Promise<TreeDetails> {
  const headers = new Headers();
  const primaryToken = getToken();
  const legacyToken = typeof window !== "undefined" ? window.localStorage.getItem("token") : null;
  const authToken = primaryToken ?? legacyToken;
  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  if (treePassword) {
    headers.set("x-tree-password", treePassword);
  }

  const response = await fetch(`${API_BASE_URL}/public/tree/${encodeURIComponent(slug)}`, {
    method: "GET",
    headers,
    cache: "no-store"
  });

  const isJson = (response.headers.get("content-type") ?? "").includes("application/json");
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    throw new Error(payload?.message ?? `Request failed with status ${response.status}`);
  }

  const tree = payload as TreeDetails;
  if (tree._id) {
    if (treePassword) {
      setTreeAccessPassword(tree._id, treePassword);
    }

    const refreshedTreeAccessToken = response.headers.get("x-tree-access-token");
    if (refreshedTreeAccessToken) {
      setTreeAccessToken(tree._id, refreshedTreeAccessToken);
    }
  }

  return tree;
}

export function createTree(payload: TreePayload): Promise<FamilyTree> {
  return request<FamilyTree>("/trees", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateTreeSettings(treeId: string, payload: TreeSettingsPayload): Promise<FamilyTree> {
  return request<FamilyTree>(
    `/trees/${treeId}`,
    {
      method: "PUT",
      body: JSON.stringify(payload)
    },
    { treeIdForAccess: treeId }
  );
}

export function deleteTree(treeId: string): Promise<DeleteTreeResponse> {
  return request<DeleteTreeResponse>(
    `/trees/${treeId}`,
    {
      method: "DELETE"
    },
    { treeIdForAccess: treeId }
  );
}

export function getMembers(treeId: string, page: number, limit: number = 20): Promise<PaginatedMembersResponse> {
  return request<PaginatedMembersResponse>(`/trees/${treeId}/members?page=${page}&limit=${limit}`, {}, { treeIdForAccess: treeId });
}

export function searchMembers(
  treeId: string,
  search: string,
  page: number = 1,
  limit: number = 40
): Promise<PaginatedMembersResponse> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit)
  });

  if (search.trim()) {
    params.set("search", search.trim());
  }

  return request<PaginatedMembersResponse>(
    `/trees/${treeId}/members?${params.toString()}`,
    {},
    { treeIdForAccess: treeId }
  );
}

export function getMemberWithRelations(
  treeId: string,
  memberId: string,
  query: MemberRelationsQuery = {}
): Promise<MemberWithRelationsResponse> {
  const params = new URLSearchParams();

  if (query.childrenPage) {
    params.set("childrenPage", String(query.childrenPage));
  }

  if (query.childrenLimit) {
    params.set("childrenLimit", String(query.childrenLimit));
  }

  if (query.spouseLimit) {
    params.set("spouseLimit", String(query.spouseLimit));
  }

  if (query.siblingLimit) {
    params.set("siblingLimit", String(query.siblingLimit));
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";

  return request<MemberWithRelationsResponse>(
    `/trees/${treeId}/members/${memberId}/relations${suffix}`,
    {},
    { treeIdForAccess: treeId }
  );
}

export function getTreeFocus(treeId: string, memberId: string, query: MemberRelationsQuery = {}): Promise<TreeFocusResponse> {
  const params = new URLSearchParams();

  if (query.childrenPage) {
    params.set("childrenPage", String(query.childrenPage));
  }

  if (query.childrenLimit) {
    params.set("childrenLimit", String(query.childrenLimit));
  }

  if (query.spouseLimit) {
    params.set("spouseLimit", String(query.spouseLimit));
  }

  if (query.siblingLimit) {
    params.set("siblingLimit", String(query.siblingLimit));
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return request<TreeFocusResponse>(`/tree/${treeId}/focus/${memberId}${suffix}`, {}, { treeIdForAccess: treeId });
}

export function createMember(
  treeId: string,
  payload: AddMemberPayload,
  imageFile?: File | null
): Promise<MemberWithRelationsResponse> {
  const formData = new FormData();

  formData.append("name", payload.name);

  if (payload.note) {
    formData.append("note", payload.note);
  }

  if (payload.gender) {
    formData.append("gender", payload.gender);
  }

  if (payload.relationType) {
    formData.append("relationType", payload.relationType);
  }

  if (payload.relatedMemberId) {
    formData.append("relatedMemberId", payload.relatedMemberId);
  }

  if (imageFile) {
    formData.append("profileImage", imageFile);
  }

  return request<MemberWithRelationsResponse>(
    `/trees/${treeId}/members`,
    {
      method: "POST",
      body: formData
    },
    { useFormData: true, treeIdForAccess: treeId }
  );
}

export function updateMember(
  treeId: string,
  memberId: string,
  payload: UpdateMemberPayload,
  imageFile?: File | null
): Promise<MemberWithRelationsResponse> {
  const formData = new FormData();

  if (payload.name !== undefined) {
    formData.append("name", payload.name);
  }

  if (payload.note !== undefined) {
    formData.append("note", payload.note ?? "");
  }

  if (payload.fatherId !== undefined) {
    formData.append("fatherId", payload.fatherId ?? "");
  }

  if (payload.motherId !== undefined) {
    formData.append("motherId", payload.motherId ?? "");
  }

  if (payload.spouses !== undefined) {
    formData.append("spouses", JSON.stringify(payload.spouses));
  }

  if (imageFile) {
    formData.append("profileImage", imageFile);
  }

  return request<MemberWithRelationsResponse>(
    `/trees/${treeId}/members/${memberId}`,
    {
      method: "PUT",
      body: formData
    },
    { useFormData: true, treeIdForAccess: treeId }
  );
}

export function deleteMember(treeId: string, memberId: string, subtree: boolean): Promise<DeleteMemberResponse> {
  return request<DeleteMemberResponse>(
    `/trees/${treeId}/members/${memberId}?subtree=${subtree}`,
    {
      method: "DELETE"
    },
    { treeIdForAccess: treeId }
  );
}

export function updateMemberRelation(
  treeId: string,
  memberId: string,
  payload: MemberRelationMutationPayload
): Promise<MemberRelationMutationResponse> {
  return request<MemberRelationMutationResponse>(
    `/trees/${treeId}/members/${memberId}/relations`,
    {
      method: "PATCH",
      body: JSON.stringify(payload)
    },
    { treeIdForAccess: treeId }
  );
}

export function removeMemberRelation(
  payload: RemoveMemberRelationPayload
): Promise<MemberRelationMutationResponse & { message: string }> {
  return request<MemberRelationMutationResponse & { message: string }>("/member/remove-relation", {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function getMemberGraph(
  treeId: string,
  memberId: string,
  depth: number = 2,
  limit: number = 250
): Promise<MemberGraphResponse> {
  return request<MemberGraphResponse>(
    `/trees/${treeId}/members/${memberId}/graph?depth=${depth}&limit=${limit}`,
    {},
    { treeIdForAccess: treeId }
  );
}

export function getAvailablePlans(): Promise<Plan[]> {
  return request<Plan[]>("/subscription/plans");
}

export function createRazorpayOrder(planId: string, billingCycle: BillingCycle): Promise<RazorpayOrderResponse> {
  return request<RazorpayOrderResponse>("/payment/create-order", {
    method: "POST",
    body: JSON.stringify({
      planId,
      billingCycle
    })
  });
}

export function verifyRazorpayPayment(
  payload: RazorpayVerifyPayload
): Promise<SubscriptionSummaryResponse & { message: string; duplicate?: boolean }> {
  return request<SubscriptionSummaryResponse & { message: string; duplicate?: boolean }>("/payment/verify", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getMySubscription(): Promise<SubscriptionSummaryResponse> {
  return request<SubscriptionSummaryResponse>("/subscription/my");
}

export function cancelMySubscription(): Promise<SubscriptionSummaryResponse & { message: string }> {
  return request<SubscriptionSummaryResponse & { message: string }>("/subscription/cancel", {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function getNotifications(page: number = 1, limit: number = 20): Promise<NotificationsResponse> {
  return request<NotificationsResponse>(`/notifications?page=${page}&limit=${limit}`);
}

export function markNotificationAsRead(notificationId: string): Promise<{ message: string; unread: number }> {
  return request<{ message: string; unread: number }>(`/notifications/read/${notificationId}`, {
    method: "PUT",
    body: JSON.stringify({})
  });
}

export function exportTreeFull(treeId: string): Promise<unknown> {
  return request<unknown>(`/tree/${treeId}/export-full`);
}

export function importTreeFull(payload: unknown): Promise<unknown> {
  return request<unknown>("/tree/import", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
