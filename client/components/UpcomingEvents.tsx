"use client";

import { useMemo } from "react";
import { Member } from "@/types";
import { resolveUpcomingEvents } from "@/utils/eventResolver";

interface Props {
  members: Member[];
}

export default function UpcomingEvents({ members }: Props) {
  const events = useMemo(() => resolveUpcomingEvents(members, 7), [members]);

  if (!events.length) {
    return null;
  }

  return (
    <div className="panel mt-6">
      <h2 className="mb-3 text-lg font-semibold text-slate-900">Upcoming Family Events</h2>

      <ul className="space-y-2 text-sm">
        {events.map((event) => (
          <li key={`${event.memberId}-${event.label}-${event.date}`} className="text-slate-700">
            <strong>{event.memberName}</strong> - {event.label}

            {event.daysLeft === 0 && <span className="ml-2 font-semibold text-red-600">Today</span>}
            {event.daysLeft === 1 && <span className="ml-2 text-orange-600">Tomorrow</span>}
            {event.daysLeft > 1 && <span className="ml-2 text-slate-500">in {event.daysLeft} days</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
