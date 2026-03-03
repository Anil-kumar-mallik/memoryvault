import { Member } from "@/types";

const membersByArrayRefCache = new WeakMap<Member[], Map<string, Member>>();

function normalizeId(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function getMembersById(allMembers: Member[]): Map<string, Member> {
  const cached = membersByArrayRefCache.get(allMembers);
  if (cached) {
    return cached;
  }

  const byId = new Map<string, Member>();
  for (const member of allMembers) {
    const memberId = normalizeId(member?._id);
    if (!memberId) {
      continue;
    }

    byId.set(memberId, member);
  }

  membersByArrayRefCache.set(allMembers, byId);
  return byId;
}

function hasMemberId(memberIds: string[] | undefined, memberId: string): boolean {
  if (!memberId || !memberIds || memberIds.length === 0) {
    return false;
  }

  for (const value of memberIds) {
    if (normalizeId(value) === memberId) {
      return true;
    }
  }

  return false;
}

function childLabelByGender(gender?: string): "Son" | "Daughter" | "Child" {
  const normalized = String(gender || "").toLowerCase();
  if (normalized === "male") {
    return "Son";
  }

  if (normalized === "female") {
    return "Daughter";
  }

  return "Child";
}

function parentLabelByGender(gender?: string): "Father" | "Mother" | "Parent" {
  const normalized = String(gender || "").toLowerCase();
  if (normalized === "male") {
    return "Father";
  }

  if (normalized === "female") {
    return "Mother";
  }

  return "Parent";
}

export function resolveRelation(target: Member, context: Member, allMembers: Member[]): string {
  const targetId = normalizeId(target?._id);
  const contextId = normalizeId(context?._id);

  if (targetId && targetId === contextId) {
    return "Self";
  }

  const byId = getMembersById(allMembers);
  const resolvedTarget = (targetId && byId.get(targetId)) || target;
  const resolvedContext = (contextId && byId.get(contextId)) || context;

  const normalizedTargetId = normalizeId(resolvedTarget?._id);
  const normalizedContextId = normalizeId(resolvedContext?._id);

  if (normalizedTargetId && normalizedTargetId === normalizedContextId) {
    return "Self";
  }

  if (!normalizedTargetId || !normalizedContextId) {
    return "Relative";
  }

  if (
    normalizeId(resolvedTarget.fatherId) === normalizedContextId ||
    normalizeId(resolvedTarget.motherId) === normalizedContextId
  ) {
    return childLabelByGender(resolvedTarget.gender);
  }

  if (
    normalizeId(resolvedContext.fatherId) === normalizedTargetId ||
    normalizeId(resolvedContext.motherId) === normalizedTargetId
  ) {
    return parentLabelByGender(resolvedTarget.gender);
  }

  if (
    hasMemberId(resolvedTarget.spouses, normalizedContextId) ||
    hasMemberId(resolvedContext.spouses, normalizedTargetId)
  ) {
    return "Spouse";
  }

  if (
    hasMemberId(resolvedTarget.siblings, normalizedContextId) ||
    hasMemberId(resolvedContext.siblings, normalizedTargetId)
  ) {
    return "Sibling";
  }

  return "Relative";
}
