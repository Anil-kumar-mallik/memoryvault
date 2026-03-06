import { resolveMemberImportantDates } from "@/lib/importantDates";
import { Member } from "@/types";

export type FamilyEvent = {
  memberId: string;
  memberName: string;
  label: string;
  date: string;
  daysLeft: number;
};

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function labelForEvent(type: string, label?: string): string {
  const normalizedLabel = String(label || "").trim();
  if (normalizedLabel) {
    return normalizedLabel;
  }

  switch (String(type || "").toLowerCase()) {
    case "dob":
      return "Birthday";
    case "anniversary":
      return "Marriage Anniversary";
    case "death":
      return "Death Anniversary";
    default:
      return "Custom Event";
  }
}

export function resolveUpcomingEvents(members: Member[], daysAhead: number = 7): FamilyEvent[] {
  const today = startOfDay(new Date());
  const events: FamilyEvent[] = [];

  for (const member of members) {
    const importantDates = resolveMemberImportantDates(member);
    if (!importantDates.length) {
      continue;
    }

    for (const entry of importantDates) {
      const eventDate = new Date(entry.value);
      if (Number.isNaN(eventDate.getTime())) {
        continue;
      }

      const nextOccurrence = new Date(today.getFullYear(), eventDate.getMonth(), eventDate.getDate());
      if (nextOccurrence < today) {
        nextOccurrence.setFullYear(today.getFullYear() + 1);
      }

      const diff = Math.round((nextOccurrence.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diff < 0 || diff > daysAhead) {
        continue;
      }

      events.push({
        memberId: String(member._id),
        memberName: member.name,
        label: labelForEvent(entry.type, entry.label),
        date: entry.value,
        daysLeft: diff
      });
    }
  }

  return events.sort((left, right) => {
    if (left.daysLeft !== right.daysLeft) {
      return left.daysLeft - right.daysLeft;
    }

    if (left.memberName !== right.memberName) {
      return left.memberName.localeCompare(right.memberName);
    }

    return left.label.localeCompare(right.label);
  });
}
