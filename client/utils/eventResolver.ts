import { formatCalendarDate, parseImportantDateValue, resolveMemberImportantDates } from "@/lib/importantDates";
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

function resolveUpcomingOccurrence(value: string, fromDate: Date): Date | null {
  const parsed = parseImportantDateValue(value, "auto");
  if (!parsed) {
    return null;
  }

  const start = startOfDay(fromDate);

  for (let yearOffset = 0; yearOffset <= 8; yearOffset += 1) {
    const occurrence = new Date(start.getFullYear() + yearOffset, parsed.month - 1, parsed.day);
    if (
      Number.isNaN(occurrence.getTime()) ||
      occurrence.getMonth() !== parsed.month - 1 ||
      occurrence.getDate() !== parsed.day
    ) {
      continue;
    }

    if (occurrence >= start) {
      return occurrence;
    }
  }

  return null;
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
  const events: Array<FamilyEvent & { occurrenceTime: number }> = [];

  for (const member of members) {
    const importantDates = resolveMemberImportantDates(member);
    if (!importantDates.length) {
      continue;
    }

    for (const entry of importantDates) {
      const nextOccurrence = resolveUpcomingOccurrence(entry.value, today);
      if (!nextOccurrence) {
        continue;
      }

      const diff = Math.round((nextOccurrence.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diff < 0 || diff > daysAhead) {
        continue;
      }

      events.push({
        memberId: String(member._id),
        memberName: member.name,
        label: labelForEvent(entry.type, entry.label),
        date: formatCalendarDate(nextOccurrence),
        daysLeft: diff,
        occurrenceTime: nextOccurrence.getTime()
      });
    }
  }

  return events
    .sort((left, right) => {
      if (left.occurrenceTime !== right.occurrenceTime) {
        return left.occurrenceTime - right.occurrenceTime;
      }

      if (left.memberName !== right.memberName) {
        return left.memberName.localeCompare(right.memberName);
      }

      return left.label.localeCompare(right.label);
    })
    .map(({ occurrenceTime: _occurrenceTime, ...event }) => event);
}
