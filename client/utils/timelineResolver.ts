import { Member } from "@/types";

export type TimelineEvent = {
  date: Date;
  label: string;
  memberName: string;
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

      const parsedDate = new Date(dateEntry.value);
      if (Number.isNaN(parsedDate.getTime())) {
        return;
      }

      events.push({
        date: parsedDate,
        label: dateEntry.label || dateEntry.type,
        memberName: member.name
      });
    });
  });

  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}
