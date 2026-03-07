const FULL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const PARTIAL_DATE_PATTERN = /^(\d{2})-(\d{2})$/;
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

export type ParsedImportantDateValue = {
  normalizedValue: string;
  year: number | null;
  month: number;
  day: number;
  hasYear: boolean;
};

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

const buildParsedImportantDateValue = ({
  year,
  month,
  day
}: {
  year: number | null;
  month: number;
  day: number;
}): ParsedImportantDateValue => ({
  normalizedValue: year == null ? `${padNumber(month)}-${padNumber(day)}` : `${year}-${padNumber(month)}-${padNumber(day)}`,
  year,
  month,
  day,
  hasYear: year != null
});

export const parseStrictImportantDateValue = (value: string): ParsedImportantDateValue | null => {
  const fullMatch = value.match(FULL_DATE_PATTERN);
  if (fullMatch) {
    const year = Number.parseInt(fullMatch[1], 10);
    const month = Number.parseInt(fullMatch[2], 10);
    const day = Number.parseInt(fullMatch[3], 10);

    if (!isValidCalendarDate(year, month, day)) {
      return null;
    }

    return buildParsedImportantDateValue({ year, month, day });
  }

  const partialMatch = value.match(PARTIAL_DATE_PATTERN);
  if (partialMatch) {
    const month = Number.parseInt(partialMatch[1], 10);
    const day = Number.parseInt(partialMatch[2], 10);

    if (!isValidCalendarDate(2000, month, day)) {
      return null;
    }

    return buildParsedImportantDateValue({ year: null, month, day });
  }

  return null;
};

const parseLegacyImportantDateValue = (value: string): ParsedImportantDateValue | null => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return buildParsedImportantDateValue({
    year: parsed.getUTCFullYear(),
    month: parsed.getUTCMonth() + 1,
    day: parsed.getUTCDate()
  });
};

export function parseImportantDateValue(value?: string | null): ParsedImportantDateValue | null {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return null;
  }

  return parseStrictImportantDateValue(trimmed) || parseLegacyImportantDateValue(trimmed);
}

export function normalizeImportantDateValue(value?: string | null): string {
  return parseImportantDateValue(value)?.normalizedValue || "";
}

export function compareImportantDateValues(left?: string | null, right?: string | null): number {
  const leftParsed = parseImportantDateValue(left);
  const rightParsed = parseImportantDateValue(right);

  if (!leftParsed && !rightParsed) {
    return 0;
  }

  if (!leftParsed) {
    return 1;
  }

  if (!rightParsed) {
    return -1;
  }

  if (leftParsed.hasYear && rightParsed.hasYear) {
    if (leftParsed.year !== rightParsed.year) {
      return (leftParsed.year || 0) - (rightParsed.year || 0);
    }

    if (leftParsed.month !== rightParsed.month) {
      return leftParsed.month - rightParsed.month;
    }

    return leftParsed.day - rightParsed.day;
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

export function formatImportantDate(value?: string | null): string {
  const parsed = parseImportantDateValue(value);
  if (!parsed) {
    return "N/A";
  }

  const displayDate = new Date(Date.UTC(parsed.hasYear ? parsed.year || 0 : 2000, parsed.month - 1, parsed.day));
  return parsed.hasYear
    ? DISPLAY_FULL_DATE_FORMATTER.format(displayDate)
    : DISPLAY_PARTIAL_DATE_FORMATTER.format(displayDate);
}

export function formatCalendarDate(value: Date): string {
  return `${value.getFullYear()}-${padNumber(value.getMonth() + 1)}-${padNumber(value.getDate())}`;
}

export function resolveImportantDateOccurrenceForYear(value: string, year: number): Date | null {
  const parsed = parseImportantDateValue(value);
  if (!parsed || !isValidCalendarDate(year, parsed.month, parsed.day)) {
    return null;
  }

  return new Date(year, parsed.month - 1, parsed.day);
}

export function resolveNextImportantDateOccurrence(value: string, fromDate: Date = new Date()): Date | null {
  const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());

  for (let yearOffset = 0; yearOffset <= 8; yearOffset += 1) {
    const occurrence = resolveImportantDateOccurrenceForYear(value, start.getFullYear() + yearOffset);
    if (!occurrence) {
      continue;
    }

    if (occurrence >= start) {
      return occurrence;
    }
  }

  return null;
}
