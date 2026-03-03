"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import DateFieldGroup, { ImportantDateItem, createImportantDateRow } from "@/components/DateFieldGroup";
import { Gender, Member } from "@/types";

export type MemberFormRelationType = "none" | "father" | "mother" | "spouse" | "son" | "daughter" | "brother" | "sister";

export interface MemberFormSubmitData {
  name: string;
  relationType: MemberFormRelationType;
  gender: Gender | "";
  note: string;
  importantDates: ImportantDateItem[];
  education: string;
  qualification: string;
  designation: string;
  addressPermanent: string;
  addressCurrent: string;
  imageFile: File | null;
}

export interface MemberFormProps {
  initialData?: Member;
  mode: "add" | "edit";
  onSubmit: (data: MemberFormSubmitData) => void | Promise<void>;
  onCancel: () => void;
}

const relationOptions: { value: MemberFormRelationType; label: string }[] = [
  { value: "son", label: "Son" },
  { value: "daughter", label: "Daughter" },
  { value: "father", label: "Father" },
  { value: "mother", label: "Mother" },
  { value: "spouse", label: "Spouse" },
  { value: "brother", label: "Brother" },
  { value: "sister", label: "Sister" },
  { value: "none", label: "No relation" }
];

function toDateInputValue(value?: string | null): string {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(0, 10);
}

function parseImportantNotesToCustomRows(notes?: string | null): ImportantDateItem[] {
  if (!notes) {
    return [];
  }

  const lines = notes.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const markerIndex = lines.findIndex((line) => line.toLowerCase().startsWith("important dates"));
  const customLines = markerIndex >= 0 ? lines.slice(markerIndex + 1) : [];

  const rows: ImportantDateItem[] = [];
  for (const line of customLines) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }

    const label = line.slice(0, separatorIndex).trim();
    const value = toDateInputValue(line.slice(separatorIndex + 1).trim());
    if (!value) {
      continue;
    }

    const row = createImportantDateRow(rows.length + 1);
    row.type = "custom";
    row.label = label || "Custom";
    row.customLabel = row.label;
    row.value = value;
    rows.push(row);
  }

  return rows;
}

function buildInitialImportantDates(member?: Member): ImportantDateItem[] {
  if (!member) {
    return [createImportantDateRow(1)];
  }

  const rows: ImportantDateItem[] = [];
  const pushLegacyDate = (type: "dob" | "anniversary" | "death", value?: string | null) => {
    const normalized = toDateInputValue(value);
    if (!normalized) {
      return;
    }
    const row = createImportantDateRow(rows.length + 1);
    row.type = type;
    row.value = normalized;
    rows.push(row);
  };

  pushLegacyDate("dob", member.dateOfBirth || member.birthDate);
  pushLegacyDate("anniversary", member.anniversaryDate);
  pushLegacyDate("death", member.dateOfDeath || member.deathDate);
  rows.push(...parseImportantNotesToCustomRows(member.importantNotes));

  return rows.length ? rows : [createImportantDateRow(1)];
}

function buildInitialState(mode: "add" | "edit", initialData?: Member): MemberFormSubmitData {
  return {
    name: initialData?.name || "",
    relationType: mode === "edit" ? "none" : "son",
    gender: initialData?.gender || "",
    note: initialData?.note || "",
    importantDates: buildInitialImportantDates(initialData),
    education: initialData?.education || "",
    qualification: initialData?.qualification || "",
    designation: initialData?.designation || "",
    addressPermanent: initialData?.addressPermanent || "",
    addressCurrent: initialData?.addressCurrent || "",
    imageFile: null
  };
}

export default function MemberForm({ initialData, mode, onSubmit, onCancel }: MemberFormProps) {
  const [form, setForm] = useState<MemberFormSubmitData>(() => buildInitialState(mode, initialData));
  const [submitting, setSubmitting] = useState(false);

  const initialKey = useMemo(
    () => `${mode}:${initialData?._id || "new"}:${initialData?.updatedAt || ""}`,
    [initialData?._id, initialData?.updatedAt, mode]
  );

  useEffect(() => {
    setForm(buildInitialState(mode, initialData));
  }, [initialKey, initialData, mode]);

  const submitLabel = mode === "add" ? "Add Member" : "Update Member";
  const submittingLabel = mode === "add" ? "Creating..." : "Saving...";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.name.trim()) {
      return;
    }

    try {
      setSubmitting(true);
      await Promise.resolve(onSubmit(form));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        className="field"
        placeholder="Name"
        value={form.name}
        onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
        required
      />

      <select
        className="field"
        value={form.relationType}
        onChange={(event) =>
          setForm((current) => ({
            ...current,
            relationType: event.target.value as MemberFormRelationType
          }))
        }
        disabled={mode === "edit"}
      >
        {relationOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {mode === "edit" && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Relation fields (father, mother, spouse, siblings) are managed in the Relationships tab.
        </p>
      )}

      <select
        className="field"
        value={form.gender}
        onChange={(event) => setForm((current) => ({ ...current, gender: event.target.value as Gender | "" }))}
      >
        <option value="">Select gender</option>
        <option value="male">Male</option>
        <option value="female">Female</option>
        <option value="other">Other</option>
        <option value="unspecified">Prefer not to say</option>
      </select>

      <textarea
        className="field min-h-20"
        placeholder="Optional note"
        value={form.note}
        onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
      />

      <DateFieldGroup
        importantDates={form.importantDates}
        onChange={(importantDates) => setForm((current) => ({ ...current, importantDates }))}
      />

      <input
        className="field"
        type="text"
        placeholder="Education"
        value={form.education}
        onChange={(event) => setForm((current) => ({ ...current, education: event.target.value }))}
      />

      <input
        className="field"
        type="text"
        placeholder="Qualification"
        value={form.qualification}
        onChange={(event) => setForm((current) => ({ ...current, qualification: event.target.value }))}
      />

      <input
        className="field"
        type="text"
        placeholder="Designation"
        value={form.designation}
        onChange={(event) => setForm((current) => ({ ...current, designation: event.target.value }))}
      />

      <textarea
        className="field min-h-20"
        placeholder="Permanent address"
        value={form.addressPermanent}
        onChange={(event) => setForm((current) => ({ ...current, addressPermanent: event.target.value }))}
      />

      <textarea
        className="field min-h-20"
        placeholder="Current address"
        value={form.addressCurrent}
        onChange={(event) => setForm((current) => ({ ...current, addressCurrent: event.target.value }))}
      />

      <input
        className="field"
        type="file"
        accept="image/*"
        onChange={(event) => setForm((current) => ({ ...current, imageFile: event.target.files?.[0] ?? null }))}
      />

      <div className="flex gap-2 pt-2">
        <button type="button" className="button-secondary flex-1" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="button-primary flex-1" disabled={submitting}>
          {submitting ? submittingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}
