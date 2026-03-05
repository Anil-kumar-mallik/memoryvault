"use client";

import { useMemo } from "react";
import { Member } from "@/types";
import { resolveTimelineEvents } from "@/utils/timelineResolver";

interface Props {
  members: Member[];
}

export default function TimelineView({ members }: Props) {
  const events = useMemo(() => resolveTimelineEvents(members), [members]);

  return (
    <div className="panel mt-6">
      <h2 className="mb-4 text-lg font-semibold">Family Timeline</h2>

      <div className="space-y-3">
        {events.map((event, index) => (
          <div key={index} className="flex gap-4 text-sm">
            <span className="w-28 font-semibold text-slate-700">{event.date.toISOString().split("T")[0]}</span>

            <span className="text-slate-900">
              {event.memberName} - {event.label}
            </span>
          </div>
        ))}

        {events.length === 0 && <p className="text-sm text-slate-500">No timeline events available.</p>}
      </div>
    </div>
  );
}
