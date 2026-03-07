import { formatImportantDate, parseImportantDateValue } from "@/lib/importantDates";
import { Member } from "@/types";

export type TimelineEvent = {
  dateLabel: string;
  label: string;
  memberName: string;
  sortKey: number;
};

export function resolveTimelineEvents(members: Member[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  members.forEach((member) => {
    if (!member.importantDates) {
      return;
    }

    member.importantDates.forEach((dateEntry) => {
      if (!dateEntry.value) {
        return;
      }

      const parsedDate = parseImportantDateValue(dateEntry.value);
      if (!parsedDate) {
        return;
      }

      events.push({
        dateLabel: formatImportantDate(dateEntry.value),
        label: dateEntry.label || dateEntry.type,
        memberName: member.name,
        sortKey: Date.UTC(parsedDate.hasYear ? parsedDate.year || 0 : 2400, parsedDate.month - 1, parsedDate.day)
      });
    });
  });

  return events.sort((left, right) => {
    if (left.sortKey !== right.sortKey) {
      return left.sortKey - right.sortKey;
    }

    if (left.memberName !== right.memberName) {
      return left.memberName.localeCompare(right.memberName);
    }

    return left.label.localeCompare(right.label);
  });
}
