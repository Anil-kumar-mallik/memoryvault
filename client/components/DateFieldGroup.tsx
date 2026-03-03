"use client";

export type ImportantDateType = "" | "dob" | "anniversary" | "death" | "custom";
export type SelectableImportantDateType = Exclude<ImportantDateType, "">;

export type ImportantDateItem = {
  id: string;
  type: ImportantDateType;
  value: string;
  label: string;
  customLabel?: string;
};

type DateFieldGroupProps = {
  importantDates: ImportantDateItem[];
  onChange: (rows: ImportantDateItem[]) => void;
  title?: string;
  allowedTypes?: SelectableImportantDateType[];
};

const DEFAULT_ALLOWED_TYPES: SelectableImportantDateType[] = ["dob", "anniversary", "death", "custom"];

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
    value: "",
    label: "",
    customLabel: ""
  };
}

function sortImportantDates(rows: ImportantDateItem[]): ImportantDateItem[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const leftTime = left.row.value ? new Date(left.row.value).getTime() : Number.POSITIVE_INFINITY;
      const rightTime = right.row.value ? new Date(right.row.value).getTime() : Number.POSITIVE_INFINITY;
      const safeLeftTime = Number.isNaN(leftTime) ? Number.POSITIVE_INFINITY : leftTime;
      const safeRightTime = Number.isNaN(rightTime) ? Number.POSITIVE_INFINITY : rightTime;

      if (safeLeftTime !== safeRightTime) {
        return safeLeftTime - safeRightTime;
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
  allowedTypes
}: DateFieldGroupProps) {
  const resolvedAllowedTypes = normalizeAllowedTypes(allowedTypes);
  const rows = importantDates.length ? sortImportantDates(importantDates) : [createImportantDateRow(1)];

  const addDateRow = () => {
    onChange(sortImportantDates([...rows, createImportantDateRow(rows.length + 1)]));
  };

  const updateDateRow = (rowId: string, patch: Partial<ImportantDateItem>) => {
    const nextRows = rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row));
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
          <div key={row.id} className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
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
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date</label>
              <input
                className="field"
                type="date"
                value={row.value}
                onChange={(event) => updateDateRow(row.id, { value: event.target.value })}
                disabled={!row.type || !resolvedAllowedTypes.includes(row.type as SelectableImportantDateType)}
              />
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
