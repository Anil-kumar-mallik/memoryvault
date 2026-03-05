import { Member } from "@/types";

export function resolveGenerationLevels(focusId: string, members: Member[]): Map<string, number> {
  const levels = new Map<string, number>();
  const map = new Map<string, Member>();

  members.forEach((member) => {
    map.set(String(member._id), member);
  });

  const queue: { id: string; level: number }[] = [{ id: focusId, level: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const member = map.get(current.id);
    if (!member) {
      continue;
    }

    if (!levels.has(current.id)) {
      levels.set(current.id, current.level);
    }

    if (member.fatherId && !levels.has(member.fatherId)) {
      queue.push({ id: member.fatherId, level: current.level - 1 });
    }

    if (member.motherId && !levels.has(member.motherId)) {
      queue.push({ id: member.motherId, level: current.level - 1 });
    }

    if (member.children) {
      member.children.forEach((childId) => {
        if (!levels.has(childId)) {
          queue.push({ id: childId, level: current.level + 1 });
        }
      });
    }
  }

  return levels;
}
