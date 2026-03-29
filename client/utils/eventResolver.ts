import { formatCalendarDate, parseImportantDateValue, resolveMemberImportantDates } from "@/lib/importantDates";
import { Member } from "@/types";

export type FamilyEvent = {
  memberId: string;
  memberName: string;
  label: string;
  date: string;
  daysLeft: number;
};

export const UPCOMING_EVENTS_WINDOW_DAYS = 30;
const DAY_IN_MS = 1000 * 60 * 60 * 24;

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function resolveUpcomingOccurrence(value: string, fromDate: Date): Date | null {
  const parsed = parseImportantDateValue(value, "auto");
  if (!parsed) {
    return null;
  }

  const today = startOfDay(fromDate);
  let eventYear = today.getFullYear();

  for (let attempt = 0; attempt <= 8; attempt += 1) {
    const eventDate = new Date(eventYear, parsed.month - 1, parsed.day);
    if (
      Number.isNaN(eventDate.getTime()) ||
      eventDate.getMonth() !== parsed.month - 1 ||
      eventDate.getDate() !== parsed.day
    ) {
      eventYear += 1;
      continue;
    }

    if (eventDate < today) {
      eventYear += 1;
      continue;
    }

    return eventDate;
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

export function resolveUpcomingEvents(
  members: Member[],
  daysAhead: number = UPCOMING_EVENTS_WINDOW_DAYS
): FamilyEvent[] {
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

      const diffTime = nextOccurrence.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / DAY_IN_MS);
      if (diffDays < 0 || diffDays > daysAhead) {
        continue;
      }

      events.push({
        memberId: String(member._id),
        memberName: member.name,
        label: labelForEvent(entry.type, entry.label),
        date: formatCalendarDate(nextOccurrence),
        daysLeft: diffDays,
        occurrenceTime: nextOccurrence.getTime()
      });
    }
  }

  return events
    .sort((left, right) => {
      if (left.daysLeft !== right.daysLeft) {
        return left.daysLeft - right.daysLeft;
      }

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
