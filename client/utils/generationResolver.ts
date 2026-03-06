import { Member } from "@/types";

export type GenerationMap = Map<string, number>;

export function resolveGenerations(focus: Member, members: Member[]): GenerationMap {
  const generations: GenerationMap = new Map();

  const byId = new Map<string, Member>();
  members.forEach((m) => byId.set(String(m._id), m));

  const queue: { id: string; level: number }[] = [];

  const focusId = String(focus._id);

  generations.set(focusId, 0);
  queue.push({ id: focusId, level: 0 });

  while (queue.length) {
    const current = queue.shift()!;
    const member = byId.get(current.id);
    if (!member) continue;

    const level = current.level;

    const father = member.fatherId?.toString();
    const mother = member.motherId?.toString();

    if (father && !generations.has(father)) {
      generations.set(father, level - 1);
      queue.push({ id: father, level: level - 1 });
    }

    if (mother && !generations.has(mother)) {
      generations.set(mother, level - 1);
      queue.push({ id: mother, level: level - 1 });
    }

    members.forEach((child) => {
      const childId = String(child._id);

      if (child.fatherId?.toString() === current.id || child.motherId?.toString() === current.id) {
        if (!generations.has(childId)) {
          generations.set(childId, level + 1);
          queue.push({ id: childId, level: level + 1 });
        }
      }
    });
  }

  return generations;
}
