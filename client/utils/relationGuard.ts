import { Member } from "@/types";

export function wouldCreateCircularRelation(sourceId: string, targetId: string, members: Member[]): boolean {
  const map = new Map<string, Member>();
  members.forEach((member) => map.set(String(member._id), member));

  function isAncestor(currentId: string, searchId: string, visited: Set<string>): boolean {
    if (visited.has(currentId)) {
      return false;
    }

    visited.add(currentId);
    const current = map.get(currentId);

    if (!current) {
      return false;
    }

    if (current.fatherId === searchId || current.motherId === searchId) {
      return true;
    }

    return (
      (current.fatherId ? isAncestor(current.fatherId, searchId, visited) : false) ||
      (current.motherId ? isAncestor(current.motherId, searchId, visited) : false)
    );
  }

  return isAncestor(targetId, sourceId, new Set<string>());
}
