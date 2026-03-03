export type UserRole = "admin" | "user";
export type BillingCycle = "monthly" | "yearly";
export type SubscriptionStatus = "active" | "expired" | "cancelled";

export interface User {
  _id: string;
  name: string;
  email: string;
  profileImage?: string | null;
  dateOfBirth?: string | null;
  education?: string | null;
  qualification?: string | null;
  designation?: string | null;
  addressPermanent?: string | null;
  addressCurrent?: string | null;
  phoneNumber?: string | null;
  role: UserRole;
  isEmailVerified?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthPayload {
  name?: string;
  email: string;
  password: string;
  dateOfBirth?: string | null;
  education?: string;
  qualification?: string;
  designation?: string;
  addressPermanent?: string;
  addressCurrent?: string;
  phoneNumber?: string;
}

export interface AuthResponse {
  token?: string;
  csrfToken?: string;
  message?: string;
  verificationRequired?: boolean;
  user: User;
}

export interface AccountPasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export interface AccountDeletePayload {
  currentPassword: string;
}

export interface TreeOwnerSummary {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
}

export type TreePrivacy = "public" | "private";

export interface FamilyTree {
  _id: string;
  slug?: string;
  name: string;
  description?: string;
  owner: string | TreeOwnerSummary;
  privacy: TreePrivacy;
  rootMember?: string | null;
  rootMemberId?: string | null;
  memberCount?: number;
  canEdit?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TreeDetails extends FamilyTree {
  memberCount: number;
  initialFocusMember: string | null;
  canEdit: boolean;
}

export interface TreePayload {
  name: string;
  description?: string;
  privacy: TreePrivacy;
  treePassword?: string;
}

export interface TreeSettingsPayload {
  name?: string;
  description?: string;
  privacy?: TreePrivacy;
  treePassword?: string;
}

export interface DeleteTreeResponse {
  message: string;
  treeId: string;
  deletedMembers: number;
}

export interface Plan {
  _id: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  maxMembers: number;
  maxTrees: number;
  features: string[];
  isActive: boolean;
  isDefault?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Subscription {
  _id: string;
  userId: string;
  planId: string;
  startDate: string;
  endDate: string | null;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  paymentReference: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface SubscriptionUsage {
  treesUsed: number;
  membersUsed: number;
  maxTrees: number;
  maxMembers: number;
  treesRemaining: number;
  membersRemaining: number;
  treeLimitReached: boolean;
  memberLimitReached: boolean;
}

export interface SubscriptionSummaryResponse {
  hasActiveSubscription: boolean;
  subscription: Subscription | null;
  plan: Plan | null;
  usage: SubscriptionUsage;
}

export interface RazorpayOrderResponse {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  planId: string;
  planName: string;
  billingCycle: BillingCycle;
}

export interface RazorpayVerifyPayload {
  planId: string;
  billingCycle: BillingCycle;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface NotificationItem {
  _id: string;
  userId: string;
  message: string;
  isRead: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: NotificationItem[];
  total: number;
  unread: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export type Gender = "male" | "female" | "other" | "unspecified";

export type RelationType = "none" | "father" | "mother" | "spouse" | "child" | "sibling";
export type RelationMutationType = "father" | "mother" | "spouse" | "child" | "sibling";
export type RelationMutationAction = "connect" | "disconnect";
export type RemoveRelationType = "spouse" | "sibling" | "parent" | "child";

export interface Member {
  _id: string;
  treeId: string;
  createdBy: string;
  linkedUserId?: string | null;
  isRoot?: boolean;
  name: string;
  note?: string;
  fatherId: string | null;
  motherId: string | null;
  spouses: string[];
  children: string[];
  siblings: string[];
  profileImage?: string | null;
  gender?: Gender;
  birthDate?: string;
  deathDate?: string;
  dateOfBirth?: string | null;
  anniversaryDate?: string | null;
  dateOfDeath?: string | null;
  education?: string | null;
  qualification?: string | null;
  designation?: string | null;
  addressPermanent?: string | null;
  addressCurrent?: string | null;
  importantNotes?: string | null;
  bio?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AddMemberPayload {
  name: string;
  gender?: Gender;
  note?: string;
  relationType?: RelationType;
  relatedMemberId?: string;
  dateOfBirth?: string | null;
  anniversaryDate?: string | null;
  dateOfDeath?: string | null;
  education?: string;
  qualification?: string;
  designation?: string;
  addressPermanent?: string;
  addressCurrent?: string;
  importantNotes?: string;
}

export interface RelationListMeta {
  total: number;
  loaded: number;
  limit: number;
  hasMore: boolean;
}

export interface ChildrenRelationMeta extends RelationListMeta {
  page: number;
}

export interface MemberRelationMeta {
  spouses: RelationListMeta;
  siblings: RelationListMeta;
  children: ChildrenRelationMeta;
}

export interface TreeFocusResponse {
  center: Member;
  parents: Member[];
  spouses: Member[];
  siblings: Member[];
  children: Member[];
  relationMeta?: MemberRelationMeta;
}

export interface UpdateMemberPayload {
  name?: string;
  note?: string;
  gender?: Gender | null;
  profileImage?: string | null;
  fatherId?: string | null;
  motherId?: string | null;
  spouses?: string[];
  dateOfBirth?: string | null;
  anniversaryDate?: string | null;
  dateOfDeath?: string | null;
  education?: string | null;
  qualification?: string | null;
  designation?: string | null;
  addressPermanent?: string | null;
  addressCurrent?: string | null;
  importantNotes?: string | null;
}

export interface MemberWithRelationsResponse {
  focus: Member;
  relations: {
    father: Member | null;
    mother: Member | null;
    spouses: Member[];
    children: Member[];
    siblings: Member[];
  };
  relationMeta: MemberRelationMeta;
  nodes: Member[];
}

export interface MemberRelationMutationPayload {
  action: RelationMutationAction;
  relation: RelationMutationType;
  targetMemberId: string;
  parentRole?: "father" | "mother" | "auto";
}

export interface MemberRelationMutationResponse extends MemberWithRelationsResponse {
  mutation: {
    relation: RelationMutationType;
    action: RelationMutationAction;
    targetMemberId: string;
  };
}

export interface RemoveMemberRelationPayload {
  memberId: string;
  relationType: RemoveRelationType;
  relatedMemberId: string;
}

export interface MemberGraphResponse {
  focusId: string;
  depth: number;
  limit: number;
  nodes: Member[];
  links: Array<{
    key: string;
    sourceId: string;
    targetId: string;
    relation: RelationMutationType;
  }>;
}

export interface PaginatedMembersResponse {
  members: Member[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface DeleteMemberResponse {
  message: string;
  deletedCount: number;
  deletedIds: string[];
  rootMember: string | null;
}
