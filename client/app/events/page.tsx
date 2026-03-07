"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";
import { getMembers, getMyTrees } from "@/lib/api";
import { resolveUpcomingEvents, type FamilyEvent } from "@/utils/eventResolver";

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
] as const;

const shortMonthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type MonthName = (typeof monthNames)[number];
type GroupedFamilyEvents = Record<MonthName, FamilyEvent[]>;

function createEmptyMonthGroups(): GroupedFamilyEvents {
  return monthNames.reduce(
    (groups, month) => {
      groups[month] = [];
      return groups;
    },
    {} as GroupedFamilyEvents
  );
}

function groupEventsByMonth(events: FamilyEvent[]): GroupedFamilyEvents {
  const groups = createEmptyMonthGroups();

  for (const event of events) {
    const parts = event.date.split("-").map((value) => Number(value));
    if (parts.length !== 3) {
      continue;
    }

    const monthName = monthNames[parts[1] - 1];
    if (!monthName) {
      continue;
    }

    groups[monthName].push(event);
  }

  for (const month of monthNames) {
    groups[month].sort((left, right) => {
      const leftDay = Number(left.date.split("-")[2] || "0");
      const rightDay = Number(right.date.split("-")[2] || "0");

      if (leftDay !== rightDay) {
        return leftDay - rightDay;
      }

      if (left.memberName !== right.memberName) {
        return left.memberName.localeCompare(right.memberName);
      }

      return left.label.localeCompare(right.label);
    });
  }

  return groups;
}

function formatEventDate(date: string): string {
  const parts = date.split("-").map((value) => Number(value));
  if (parts.length !== 3) {
    return date;
  }

  const monthLabel = shortMonthNames[parts[1] - 1];
  if (!monthLabel) {
    return date;
  }

  return `${parts[2]} ${monthLabel}`;
}

export default function EventsPage() {
  const [groupedEvents, setGroupedEvents] = useState<GroupedFamilyEvents>(() => createEmptyMonthGroups());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasTree, setHasTree] = useState(false);

  useEffect(() => {
    let active = true;

    const loadCalendar = async () => {
      const token = getToken();
      if (!token) {
        if (active) {
          setIsAuthenticated(false);
          setHasTree(false);
          setGroupedEvents(createEmptyMonthGroups());
          setError(null);
          setLoading(false);
        }

        return;
      }

      try {
        setLoading(true);
        setIsAuthenticated(true);

        const trees = await getMyTrees();
        if (!active) {
          return;
        }

        if (trees.length === 0) {
          setHasTree(false);
          setGroupedEvents(createEmptyMonthGroups());
          setError(null);
          return;
        }

        setHasTree(true);
        const treeId = trees[0]._id;
        const payload = await getMembers(treeId, 1, 100);

        if (!active) {
          return;
        }

        const events = resolveUpcomingEvents(payload.members, 1461);
        setGroupedEvents(groupEventsByMonth(events));
        setError(null);
      } catch (loadError) {
        if (!active) {
          return;
        }

        setGroupedEvents(createEmptyMonthGroups());
        setError(loadError instanceof Error ? loadError.message : "Failed to load family event calendar.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadCalendar();

    return () => {
      active = false;
    };
  }, []);

  if (!isAuthenticated && !loading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-4 py-8">
        <section className="panel text-center">
          <h1 className="text-3xl font-bold text-slate-900">Family Event Calendar</h1>
          <p className="mt-3 text-sm text-slate-600">Log in to view your family event calendar.</p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link href="/login" className="button-primary">
              Login
            </Link>
            <Link href="/register" className="button-secondary">
              Register
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Family Event Calendar</h1>
          <p className="text-sm text-slate-600">
            View birthdays, anniversaries, and custom family reminders grouped by month.
          </p>
        </div>
        <Link href="/dashboard" className="button-secondary">
          Back to Dashboard
        </Link>
      </header>

      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {loading ? (
        <section className="panel">
          <p className="text-sm text-slate-500">Loading family event calendar...</p>
        </section>
      ) : !hasTree ? (
        <section className="panel">
          <p className="text-sm text-slate-500">No family tree found.</p>
        </section>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {monthNames.map((month) => (
            <section key={month} className="panel">
              <h2 className="mb-3 text-lg font-semibold text-slate-900">{month}</h2>
              {groupedEvents[month].length === 0 ? (
                <p className="text-sm text-slate-500">No events.</p>
              ) : (
                <ul className="space-y-2 text-sm text-slate-700">
                  {groupedEvents[month].map((event) => (
                    <li key={`${event.memberId}-${event.label}-${event.date}`}>
                      <strong className="text-slate-900">{event.memberName}</strong> - {event.label} -{" "}
                      {formatEventDate(event.date)}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
