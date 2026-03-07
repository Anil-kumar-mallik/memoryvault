import { ImportantDateItem, createImportantDateRow } from "@/components/DateFieldGroup";
import {
  compareImportantDateValues,
  buildImportantDateInputValue,
  normalizeImportantDateInputValue,
  normalizeImportantDateValue,
  parseImportantDateParts,
  toImportantDateParts
} from "@/lib/importantDateValue";
import { ImportantDateEntry, Member } from "@/types";

const IMPORTANT_DATE_TYPES = new Set<ImportantDateEntry["type"]>(["dob", "anniversary", "death", "custom"]);
export {
  compareImportantDateValues,
  formatCalendarDate,
  formatImportantDate,
  normalizeImportantDateValue,
  parseImportantDateValue,
  resolveImportantDateOccurrenceForYear,
  resolveNextImportantDateOccurrence,
  type ParsedImportantDateValue
} from "@/lib/importantDateValue";

const normalizeEntry = (entry: Partial<ImportantDateEntry>): ImportantDateEntry | null => {
  const type = String(entry.type || "")
    .trim()
    .toLowerCase() as ImportantDateEntry["type"];
  if (!IMPORTANT_DATE_TYPES.has(type)) {
    return null;
  }

  const value = normalizeImportantDateValue(entry.value || "");
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
    const value = normalizeImportantDateValue(line.slice(separatorIndex + 1).trim());
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
    const dateComparison = compareImportantDateValues(left.value, right.value);
    if (dateComparison !== 0) {
      return dateComparison;
    }

    return left.type.localeCompare(right.type);
  });
};

const fallbackLegacyDates = (member: Member): ImportantDateEntry[] => {
  const rows: ImportantDateEntry[] = [];
  const pushLegacy = (type: "dob" | "anniversary" | "death", value?: string | null) => {
    const normalized = normalizeImportantDateValue(value);
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
    const parsedDate = toImportantDateParts(entry.value, "backend");
    row.type = entry.type;
    row.day = parsedDate.day;
    row.month = parsedDate.month;
    row.year = parsedDate.year;
    row.label = entry.label || "";
    row.customLabel = row.label;
    return row;
  });
}

export function toImportantDateEntries(rows: ImportantDateItem[]): ImportantDateEntry[] {
  const normalized = rows.map((row, index) => {
    const type = row.type as ImportantDateEntry["type"];
    const label = String(row.label || row.customLabel || "").trim();
    const hasDateSelection = row.day != null || row.month != null || row.year != null;

    if (!type && !hasDateSelection && !label) {
      return null;
    }

    if (!IMPORTANT_DATE_TYPES.has(type)) {
      throw new Error(`Important date row ${index + 1}: select a date type.`);
    }

    if (!hasDateSelection) {
      throw new Error(`Important date row ${index + 1}: select day and month.`);
    }

    if (row.day == null || row.month == null) {
      throw new Error(`Important date row ${index + 1}: select both day and month.`);
    }

    const parsedParts = parseImportantDateParts({
      day: row.day,
      month: row.month,
      year: row.year
    });
    if (!parsedParts) {
      throw new Error(`Important date row ${index + 1}: select a valid date.`);
    }

    const inputValue = buildImportantDateInputValue({
      day: parsedParts.day,
      month: parsedParts.month,
      year: parsedParts.year
    });
    const value = normalizeImportantDateInputValue(inputValue);
    if (!value) {
      throw new Error(`Important date row ${index + 1}: select a valid date.`);
    }

    return {
      type,
      value,
      ...(label ? { label } : {})
    } as ImportantDateEntry;
  });

  return dedupeAndSortEntries(normalized.filter((entry): entry is ImportantDateEntry => Boolean(entry)));
}
