import { ImportantDateItem, createImportantDateRow } from "@/components/DateFieldGroup";
import { ImportantDateEntry, Member } from "@/types";

const IMPORTANT_DATE_TYPES = new Set<ImportantDateEntry["type"]>(["dob", "anniversary", "death", "custom"]);

const toDateInputValue = (value?: string | null): string => {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(0, 10);
};

const normalizeEntry = (entry: Partial<ImportantDateEntry>): ImportantDateEntry | null => {
  const type = String(entry.type || "")
    .trim()
    .toLowerCase() as ImportantDateEntry["type"];
  if (!IMPORTANT_DATE_TYPES.has(type)) {
    return null;
  }

  const value = toDateInputValue(entry.value || "");
  if (!value) {
    return null;
  }

  const label = String(entry.label || "").trim();
  return {
    type,
    value,
    ...(label ? { label } : {})
  };
};

const parseCustomDatesFromImportantNotes = (notes?: string | null): ImportantDateEntry[] => {
  if (!notes) {
    return [];
  }

  const lines = notes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const markerIndex = lines.findIndex((line) => line.toLowerCase().startsWith("important dates"));
  const customLines = markerIndex >= 0 ? lines.slice(markerIndex + 1) : [];

  const rows: ImportantDateEntry[] = [];
  for (const line of customLines) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }

    const label = line.slice(0, separatorIndex).trim() || "Custom";
    const value = toDateInputValue(line.slice(separatorIndex + 1).trim());
    if (!value) {
      continue;
    }

    rows.push({
      type: "custom",
      value,
      label
    });
  }

  return rows;
};

const dedupeAndSortEntries = (entries: ImportantDateEntry[]): ImportantDateEntry[] => {
  const unique = new Map<string, ImportantDateEntry>();

  for (const entry of entries) {
    const normalized = normalizeEntry(entry);
    if (!normalized) {
      continue;
    }

    const key = `${normalized.type}|${normalized.label || ""}|${normalized.value}`;
    if (!unique.has(key)) {
      unique.set(key, normalized);
    }
  }

  return Array.from(unique.values()).sort((left, right) => {
    const leftTime = new Date(left.value).getTime();
    const rightTime = new Date(right.value).getTime();
    const safeLeftTime = Number.isNaN(leftTime) ? Number.POSITIVE_INFINITY : leftTime;
    const safeRightTime = Number.isNaN(rightTime) ? Number.POSITIVE_INFINITY : rightTime;

    if (safeLeftTime !== safeRightTime) {
      return safeLeftTime - safeRightTime;
    }

    return left.type.localeCompare(right.type);
  });
};

const fallbackLegacyDates = (member: Member): ImportantDateEntry[] => {
  const rows: ImportantDateEntry[] = [];
  const pushLegacy = (type: "dob" | "anniversary" | "death", value?: string | null) => {
    const normalized = toDateInputValue(value);
    if (!normalized) {
      return;
    }

    rows.push({
      type,
      value: normalized
    });
  };

  pushLegacy("dob", member.dateOfBirth || member.birthDate);
  pushLegacy("anniversary", member.anniversaryDate);
  pushLegacy("death", member.dateOfDeath || member.deathDate);
  rows.push(...parseCustomDatesFromImportantNotes(member.importantNotes));
  return rows;
};

export function resolveMemberImportantDates(member?: Member | null): ImportantDateEntry[] {
  if (!member) {
    return [];
  }

  if (member.importantDates != null) {
    return dedupeAndSortEntries(member.importantDates);
  }

  return dedupeAndSortEntries(fallbackLegacyDates(member));
}

export function buildImportantDateRows(member?: Member | null): ImportantDateItem[] {
  const entries = resolveMemberImportantDates(member);
  if (!entries.length) {
    return [createImportantDateRow(1)];
  }

  return entries.map((entry, index) => {
    const row = createImportantDateRow(index + 1);
    row.type = entry.type;
    row.value = toDateInputValue(entry.value);
    row.label = entry.label || "";
    row.customLabel = row.label;
    return row;
  });
}

export function toImportantDateEntries(rows: ImportantDateItem[]): ImportantDateEntry[] {
  const normalized = rows.map((row) => {
    const type = row.type as ImportantDateEntry["type"];
    const value = toDateInputValue(row.value);
    if (!IMPORTANT_DATE_TYPES.has(type) || !value) {
      return null;
    }

    const label = String(row.label || row.customLabel || "").trim();
    return {
      type,
      value,
      ...(label ? { label } : {})
    } as ImportantDateEntry;
  });

  return dedupeAndSortEntries(normalized.filter((entry): entry is ImportantDateEntry => Boolean(entry)));
}
