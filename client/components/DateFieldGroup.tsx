"use client";

export type ImportantDateType = "" | "dob" | "anniversary" | "death" | "custom";

export type ImportantDateItem = {
  id: string;
  type: ImportantDateType;
  value: string;
  customLabel: string;
};

type DateFieldGroupProps = {
  importantDates: ImportantDateItem[];
  onChange: (rows: ImportantDateItem[]) => void;
  title?: string;
};

export function createImportantDateRow(seed: number): ImportantDateItem {
  return {
    id: `date-row-${Date.now()}-${seed}`,
    type: "",
    value: "",
    customLabel: ""
  };
}

export default function DateFieldGroup({
  importantDates,
  onChange,
  title = "Important Dates"
}: DateFieldGroupProps) {
  const rows = importantDates.length ? importantDates : [createImportantDateRow(1)];

  const addDateRow = () => {
    onChange([...rows, createImportantDateRow(rows.length + 1)]);
  };

  const updateDateRow = (rowId: string, patch: Partial<ImportantDateItem>) => {
    onChange(rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  };

  const removeDateRow = (rowId: string) => {
    const nextRows = rows.filter((row) => row.id !== rowId);
    onChange(nextRows.length ? nextRows : [createImportantDateRow(1)]);
  };

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</p>
      {rows.map((row, index) => (
        <div key={row.id} className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_1fr_auto]">
          <select
            className="field"
            value={row.type}
            onChange={(event) => updateDateRow(row.id, { type: event.target.value as ImportantDateType })}
          >
            <option value="">Select Date Type</option>
            <option value="dob">Date of Birth</option>
            <option value="anniversary">Anniversary</option>
            <option value="death">Date of Death</option>
            <option value="custom">Custom</option>
          </select>

          <input
            className="field"
            type="date"
            value={row.value}
            onChange={(event) => updateDateRow(row.id, { value: event.target.value })}
            disabled={!row.type}
          />

          <button
            type="button"
            className="button-secondary"
            onClick={() => removeDateRow(row.id)}
            disabled={rows.length === 1 && index === 0}
          >
            Remove
          </button>

          {row.type === "custom" && (
            <input
              className="field sm:col-span-3"
              type="text"
              placeholder="Custom label (e.g., Joined Army)"
              value={row.customLabel}
              onChange={(event) => updateDateRow(row.id, { customLabel: event.target.value })}
            />
          )}
        </div>
      ))}

      <button type="button" className="button-secondary w-full" onClick={addDateRow}>
        + Add Another Date
      </button>
    </div>
  );
}
