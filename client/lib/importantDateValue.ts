export type ImportantDateSource = "backend" | "input" | "auto";

export type ImportantDateParts = {
  day: number | null;
  month: number | null;
  year: number | null;
};

export type ParsedImportantDateValue = {
  day: number;
  month: number;
  year: number | null;
  normalizedValue: string;
  backendValue: string;
  inputValue: string;
  hasYear: boolean;
};

const BACKEND_FULL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const BACKEND_PARTIAL_DATE_PATTERN = /^(\d{2})-(\d{2})$/;
const INPUT_FULL_DATE_PATTERN = /^(\d{2})-(\d{2})-(\d{4})$/;
const INPUT_PARTIAL_DATE_PATTERN = /^(\d{2})-(\d{2})$/;
const DISPLAY_FULL_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC"
});
const DISPLAY_PARTIAL_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  timeZone: "UTC"
});

const padNumber = (value: number): string => String(value).padStart(2, "0");

const daysInMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

const isValidCalendarDate = (year: number, month: number, day: number): boolean => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }

  if (month < 1 || month > 12) {
    return false;
  }

  if (day < 1 || day > daysInMonth(year, month)) {
    return false;
  }

  return true;
};

const normalizeParts = (parts: Partial<ImportantDateParts>): ImportantDateParts => ({
  day: typeof parts.day === "number" && Number.isInteger(parts.day) ? parts.day : null,
  month: typeof parts.month === "number" && Number.isInteger(parts.month) ? parts.month : null,
  year: typeof parts.year === "number" && Number.isInteger(parts.year) ? parts.year : null
});

const buildParsedImportantDateValue = ({
  day,
  month,
  year
}: {
  day: number;
  month: number;
  year: number | null;
}): ParsedImportantDateValue => ({
  day,
  month,
  year,
  normalizedValue: year == null ? `${padNumber(month)}-${padNumber(day)}` : `${year}-${padNumber(month)}-${padNumber(day)}`,
  backendValue: year == null ? `${padNumber(month)}-${padNumber(day)}` : `${year}-${padNumber(month)}-${padNumber(day)}`,
  inputValue: year == null ? `${padNumber(day)}-${padNumber(month)}` : `${padNumber(day)}-${padNumber(month)}-${year}`,
  hasYear: year != null
});

export function getMaxImportantDateDay(month?: number | null, year?: number | null): number {
  if (!month) {
    return 31;
  }

  return daysInMonth(year ?? 2000, month);
}

export function hasImportantDateParts(parts: Partial<ImportantDateParts>): boolean {
  const normalized = normalizeParts(parts);
  return normalized.day != null && normalized.month != null;
}

export function parseImportantDateParts(parts: Partial<ImportantDateParts>): ParsedImportantDateValue | null {
  const normalized = normalizeParts(parts);
  if (!hasImportantDateParts(normalized)) {
    return null;
  }

  const day = normalized.day as number;
  const month = normalized.month as number;
  const year = normalized.year;
  const validationYear = year ?? 2000;

  if (!isValidCalendarDate(validationYear, month, day)) {
    return null;
  }

  return buildParsedImportantDateValue({ day, month, year });
}

export function buildImportantDateInputValue(parts: Partial<ImportantDateParts>): string {
  return parseImportantDateParts(parts)?.inputValue || "";
}

export function buildImportantDateBackendValue(parts: Partial<ImportantDateParts>): string {
  return parseImportantDateParts(parts)?.backendValue || "";
}

const parseBackendStrictImportantDateValue = (value: string): ParsedImportantDateValue | null => {
  const fullMatch = value.match(BACKEND_FULL_DATE_PATTERN);
  if (fullMatch) {
    const year = Number.parseInt(fullMatch[1], 10);
    const month = Number.parseInt(fullMatch[2], 10);
    const day = Number.parseInt(fullMatch[3], 10);

    if (!isValidCalendarDate(year, month, day)) {
      return null;
    }

    return buildParsedImportantDateValue({ day, month, year });
  }

  const partialMatch = value.match(BACKEND_PARTIAL_DATE_PATTERN);
  if (partialMatch) {
    const month = Number.parseInt(partialMatch[1], 10);
    const day = Number.parseInt(partialMatch[2], 10);

    if (!isValidCalendarDate(2000, month, day)) {
      return null;
    }

    return buildParsedImportantDateValue({ day, month, year: null });
  }

  return null;
};

export const parseStrictImportantDateValue = (value: string): ParsedImportantDateValue | null => {
  const fullMatch = value.match(INPUT_FULL_DATE_PATTERN);
  if (fullMatch) {
    const day = Number.parseInt(fullMatch[1], 10);
    const month = Number.parseInt(fullMatch[2], 10);
    const year = Number.parseInt(fullMatch[3], 10);

    if (!isValidCalendarDate(year, month, day)) {
      return null;
    }

    return buildParsedImportantDateValue({ day, month, year });
  }

  const partialMatch = value.match(INPUT_PARTIAL_DATE_PATTERN);
  if (partialMatch) {
    const day = Number.parseInt(partialMatch[1], 10);
    const month = Number.parseInt(partialMatch[2], 10);

    if (!isValidCalendarDate(2000, month, day)) {
      return null;
    }

    return buildParsedImportantDateValue({ day, month, year: null });
  }

  return null;
};

const parseLegacyImportantDateValue = (value: string): ParsedImportantDateValue | null => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return buildParsedImportantDateValue({
    day: parsed.getUTCDate(),
    month: parsed.getUTCMonth() + 1,
    year: parsed.getUTCFullYear()
  });
};

export function parseImportantDateValue(
  value?: string | null,
  source: ImportantDateSource = "backend"
): ParsedImportantDateValue | null {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return null;
  }

  if (source === "input") {
    return parseStrictImportantDateValue(trimmed);
  }

  if (source === "backend") {
    return parseBackendStrictImportantDateValue(trimmed) || parseLegacyImportantDateValue(trimmed);
  }

  return (
    parseBackendStrictImportantDateValue(trimmed) ||
    parseStrictImportantDateValue(trimmed) ||
    parseLegacyImportantDateValue(trimmed)
  );
}

export function toImportantDateParts(
  value?: string | null,
  source: ImportantDateSource = "backend"
): ImportantDateParts {
  const parsed = parseImportantDateValue(value, source);
  if (!parsed) {
    return { day: null, month: null, year: null };
  }

  return {
    day: parsed.day,
    month: parsed.month,
    year: parsed.year
  };
}

export function normalizeImportantDateValue(value?: string | null): string {
  return parseImportantDateValue(value, "backend")?.backendValue || "";
}

export function normalizeImportantDateInputValue(value?: string | null): string {
  return parseImportantDateValue(value, "input")?.backendValue || "";
}

export function compareImportantDateParts(left: Partial<ImportantDateParts>, right: Partial<ImportantDateParts>): number {
  const leftParsed = parseImportantDateParts(left);
  const rightParsed = parseImportantDateParts(right);

  if (!leftParsed && !rightParsed) {
    return 0;
  }

  if (!leftParsed) {
    return 1;
  }

  if (!rightParsed) {
    return -1;
  }

  if (leftParsed.hasYear && rightParsed.hasYear && leftParsed.year !== rightParsed.year) {
    return (leftParsed.year || 0) - (rightParsed.year || 0);
  }

  if (leftParsed.month !== rightParsed.month) {
    return leftParsed.month - rightParsed.month;
  }

  if (leftParsed.day !== rightParsed.day) {
    return leftParsed.day - rightParsed.day;
  }

  if (leftParsed.hasYear !== rightParsed.hasYear) {
    return leftParsed.hasYear ? -1 : 1;
  }

  return 0;
}

export function compareImportantDateValues(
  left?: string | null,
  right?: string | null,
  source: ImportantDateSource = "backend"
): number {
  return compareImportantDateParts(toImportantDateParts(left, source), toImportantDateParts(right, source));
}

export function formatImportantDate(value?: string | null, source: ImportantDateSource = "backend"): string {
  const parsed = parseImportantDateValue(value, source);
  if (!parsed) {
    return "N/A";
  }

  const displayDate = new Date(Date.UTC(parsed.year ?? 2000, parsed.month - 1, parsed.day));
  return parsed.hasYear
    ? DISPLAY_FULL_DATE_FORMATTER.format(displayDate)
    : DISPLAY_PARTIAL_DATE_FORMATTER.format(displayDate);
}

export function formatCalendarDate(value: Date): string {
  return `${value.getFullYear()}-${padNumber(value.getMonth() + 1)}-${padNumber(value.getDate())}`;
}

export function resolveImportantDateOccurrenceForYear(
  value: string,
  year: number,
  source: ImportantDateSource = "backend"
): Date | null {
  const parsed = parseImportantDateValue(value, source);
  if (!parsed || !isValidCalendarDate(year, parsed.month, parsed.day)) {
    return null;
  }

  return new Date(year, parsed.month - 1, parsed.day);
}

export function resolveNextImportantDateOccurrence(
  value: string,
  fromDate: Date = new Date(),
  source: ImportantDateSource = "backend"
): Date | null {
  const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const parsed = parseImportantDateValue(value, source);
  if (!parsed) {
    return null;
  }

  for (let yearOffset = 0; yearOffset <= 8; yearOffset += 1) {
    const occurrence = resolveImportantDateOccurrenceForYear(value, start.getFullYear() + yearOffset, source);
    if (!occurrence) {
      continue;
    }

    if (occurrence >= start) {
      return occurrence;
    }
  }

  return null;
}
