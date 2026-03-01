"use client";

import { Member } from "@/types";

interface FamilyTreeChartProps {
  members: Member[];
}

export default function FamilyTreeChart({ members }: FamilyTreeChartProps) {
  return (
    <div className="panel">
      <h2 className="text-lg font-semibold text-slate-900">Legacy Tree View</h2>
      <p className="mt-2 text-sm text-slate-600">
        This view is deprecated. Use the focus engine in the tree detail screen.
      </p>
      <p className="mt-2 text-xs text-slate-500">Loaded members: {members.length}</p>
    </div>
  );
}
