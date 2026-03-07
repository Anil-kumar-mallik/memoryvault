"use client";

import { compareImportantDateParts, getMaxImportantDateDay } from "@/lib/importantDateValue";

export type ImportantDateType = "" | "dob" | "anniversary" | "death" | "custom";
export type SelectableImportantDateType = Exclude<ImportantDateType, "">;

export type ImportantDateItem = {
  id: string;
  type: ImportantDateType;
  label: string;
  customLabel?: string;
  day: number | null;
  month: number | null;
  year: number | null;
};

type DateFieldGroupProps = {
  importantDates: ImportantDateItem[];
  onChange: (rows: ImportantDateItem[]) => void;
  title?: string;
  allowedTypes?: SelectableImportantDateType[];
  allowYearlessDates?: boolean;
};

const DEFAULT_ALLOWED_TYPES: SelectableImportantDateType[] = ["dob", "anniversary", "death", "custom"];
const CURRENT_YEAR = new Date().getFullYear();
const DAY_OPTIONS = Array.from({ length: 31 }, (_value, index) => index + 1);
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR - 1900 + 1 }, (_value, index) => CURRENT_YEAR - index);
const MONTH_OPTIONS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" }
] as const;

const DATE_TYPE_LABELS: Record<SelectableImportantDateType, string> = {
  dob: "Date of Birth",
  anniversary: "Anniversary",
  death: "Date of Death",
  custom: "Custom"
};

export function createImportantDateRow(seed: number): ImportantDateItem {
  return {
    id: `date-row-${Date.now()}-${seed}`,
    type: "",
    label: "",
    customLabel: "",
    day: null,
    month: null,
    year: null
  };
}

function parseSelectNumber(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function normalizeRowDateParts(row: ImportantDateItem): ImportantDateItem {
  if (row.day == null || row.month == null) {
    return row;
  }

  const maxDay = getMaxImportantDateDay(row.month, row.year);
  if (row.day <= maxDay) {
    return row;
  }

  return {
    ...row,
    day: maxDay
  };
}

function sortImportantDates(rows: ImportantDateItem[]): ImportantDateItem[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const dateComparison = compareImportantDateParts(left.row, right.row);
      if (dateComparison !== 0) {
        return dateComparison;
      }

      return left.index - right.index;
    })
    .map((item) => item.row);
}

function normalizeAllowedTypes(allowedTypes?: SelectableImportantDateType[]): SelectableImportantDateType[] {
  const source = allowedTypes && allowedTypes.length ? allowedTypes : DEFAULT_ALLOWED_TYPES;
  const unique: SelectableImportantDateType[] = [];

  for (const type of source) {
    if (!DEFAULT_ALLOWED_TYPES.includes(type) || unique.includes(type)) {
      continue;
    }

    unique.push(type);
  }

  return unique.length ? unique : DEFAULT_ALLOWED_TYPES;
}

export default function DateFieldGroup({
  importantDates,
  onChange,
  title = "Important Dates",
  allowedTypes,
  allowYearlessDates = true
}: DateFieldGroupProps) {
  const resolvedAllowedTypes = normalizeAllowedTypes(allowedTypes);
  const rows = importantDates.length ? sortImportantDates(importantDates) : [createImportantDateRow(1)];

  const addDateRow = () => {
    onChange(sortImportantDates([...rows, createImportantDateRow(rows.length + 1)]));
  };

  const updateDateRow = (rowId: string, patch: Partial<ImportantDateItem>) => {
    const nextRows = rows.map((row) => (row.id === rowId ? normalizeRowDateParts({ ...row, ...patch }) : row));
    onChange(sortImportantDates(nextRows));
  };

  const removeDateRow = (rowId: string) => {
    const nextRows = rows.filter((row) => row.id !== rowId);
    onChange(nextRows.length ? sortImportantDates(nextRows) : [createImportantDateRow(1)]);
  };

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</p>
      {rows.map((row, index) => {
        const resolvedType = row.type && resolvedAllowedTypes.includes(row.type as SelectableImportantDateType) ? row.type : "";

        return (
          <div
            key={row.id}
            className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 lg:grid-cols-[minmax(0,1.2fr)_110px_150px_130px_auto] lg:items-end"
          >
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Label</label>
              <select
                className="field"
                value={resolvedType}
                onChange={(event) => {
                  const nextType = event.target.value as ImportantDateType;
                  updateDateRow(row.id, {
                    type: nextType,
                    ...(nextType === "custom" ? {} : { label: "", customLabel: "" })
                  });
                }}
              >
                <option value="">Select Date Type</option>
                {resolvedAllowedTypes.map((type) => (
                  <option key={type} value={type}>
                    {DATE_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>

              {resolvedType === "custom" && (
                <input
                  className="field"
                  type="text"
                  placeholder="Custom label (e.g., Joined Army)"
                  value={row.label || row.customLabel || ""}
                  onChange={(event) => updateDateRow(row.id, { label: event.target.value, customLabel: event.target.value })}
                />
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Day</label>
              <select
                className="field"
                value={row.day ?? ""}
                onChange={(event) => updateDateRow(row.id, { day: parseSelectNumber(event.target.value) })}
                disabled={!row.type || !resolvedAllowedTypes.includes(row.type as SelectableImportantDateType)}
              >
                <option value="">Day</option>
                {DAY_OPTIONS.filter((day) => day <= getMaxImportantDateDay(row.month, row.year)).map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Month</label>
              <select
                className="field"
                value={row.month ?? ""}
                onChange={(event) => updateDateRow(row.id, { month: parseSelectNumber(event.target.value) })}
                disabled={!row.type || !resolvedAllowedTypes.includes(row.type as SelectableImportantDateType)}
              >
                <option value="">Month</option>
                {MONTH_OPTIONS.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {allowYearlessDates ? "Year (Optional)" : "Year"}
              </label>
              <select
                className="field"
                value={row.year ?? ""}
                onChange={(event) => updateDateRow(row.id, { year: parseSelectNumber(event.target.value) })}
                disabled={!row.type || !resolvedAllowedTypes.includes(row.type as SelectableImportantDateType)}
              >
                <option value="">{allowYearlessDates ? "Optional" : "Year"}</option>
                {YEAR_OPTIONS.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                className="button-secondary"
                onClick={() => removeDateRow(row.id)}
                disabled={rows.length === 1 && index === 0}
              >
                Remove
              </button>
            </div>
          </div>
        );
      })}

      <button type="button" className="button-secondary w-full" onClick={addDateRow}>
        Add Date
      </button>
    </div>
  );
}
