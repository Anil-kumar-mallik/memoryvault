import { Member } from "@/types";

const membersByArrayRefCache = new WeakMap<Member[], Map<string, Member>>();

function getMembersById(allMembers: Member[]): Map<string, Member> {
  const cached = membersByArrayRefCache.get(allMembers);
  if (cached) {
    return cached;
  }

  const byId = new Map<string, Member>();
  for (const member of allMembers) {
    byId.set(member._id, member);
  }

  membersByArrayRefCache.set(allMembers, byId);
  return byId;
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
  if (target._id === context._id) {
    return "Self";
  }

  const byId = getMembersById(allMembers);
  const resolvedTarget = byId.get(target._id) || target;
  const resolvedContext = byId.get(context._id) || context;

  if (resolvedTarget.fatherId === resolvedContext._id || resolvedTarget.motherId === resolvedContext._id) {
    return childLabelByGender(resolvedTarget.gender);
  }

  if (resolvedContext.fatherId === resolvedTarget._id || resolvedContext.motherId === resolvedTarget._id) {
    return parentLabelByGender(resolvedTarget.gender);
  }

  if (resolvedTarget.spouses.includes(resolvedContext._id)) {
    return "Spouse";
  }

  if (resolvedTarget.siblings.includes(resolvedContext._id)) {
    return "Sibling";
  }

  return "Relative";
}
