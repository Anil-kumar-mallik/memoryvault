import { Member } from "@/types";

function getMembersById(allMembers: Member[]): Map<string, Member> {
  const byId = new Map<string, Member>();
  for (const member of allMembers) {
    const memberId = member?._id?.toString();
    if (!memberId) {
      continue;
    }

    byId.set(memberId, member);
  }

  return byId;
}

function hasMemberId(memberIds: Array<string | null | undefined> | undefined, memberId: string): boolean {
  if (!memberId || !memberIds || memberIds.length === 0) {
    return false;
  }

  for (const value of memberIds) {
    if (value?.toString() === memberId) {
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

function parentLabelByGender(gender?: string): "Father" | "Mother" {
  const normalized = String(gender || "").toLowerCase();
  if (normalized === "male") {
    return "Father";
  }

  if (normalized === "female") {
    return "Mother";
  }

  return "Father";
}

function siblingLabelByGender(gender?: string): "Brother" | "Sister" | "Sibling" {
  const normalized = String(gender || "").toLowerCase();

  if (normalized === "male") {
    return "Brother";
  }

  if (normalized === "female") {
    return "Sister";
  }

  return "Sibling";
}

export function resolveRelation(target: Member, context: Member, allMembers: Member[]): string {
  const targetId = target?._id?.toString() || "";
  const contextId = context?._id?.toString() || "";

  if (targetId && targetId === contextId) {
    return "Self";
  }

  const byId = getMembersById(allMembers);
  const resolvedTarget = (targetId && byId.get(targetId)) || target;
  const resolvedContext = (contextId && byId.get(contextId)) || context;

  const normalizedTargetId = resolvedTarget?._id?.toString() || "";
  const normalizedContextId = resolvedContext?._id?.toString() || "";

  if (normalizedTargetId && normalizedTargetId === normalizedContextId) {
    return "Self";
  }

  if (!normalizedTargetId || !normalizedContextId) {
    return "Relative";
  }

  if (
    resolvedTarget.fatherId?.toString() === normalizedContextId ||
    resolvedTarget.motherId?.toString() === normalizedContextId
  ) {
    return childLabelByGender(resolvedTarget.gender);
  }

  if (
    resolvedContext.fatherId?.toString() === normalizedTargetId ||
    resolvedContext.motherId?.toString() === normalizedTargetId
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
    return siblingLabelByGender(resolvedTarget.gender);
  }

  return "Relative";
}
