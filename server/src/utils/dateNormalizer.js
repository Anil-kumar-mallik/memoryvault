const IMPORTANT_DATE_TYPES = new Set(["dob", "anniversary", "death", "custom"]);
const FULL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const PARTIAL_DATE_PATTERN = /^(\d{2})-(\d{2})$/;

const normalizeLabel = (value) => String(value || "").trim();

const padNumber = (value) => String(value).padStart(2, "0");

const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const isValidCalendarDate = (year, month, day) => {
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

const buildParsedImportantDateValue = ({ year, month, day }) => ({
  normalizedValue: year == null ? `${padNumber(month)}-${padNumber(day)}` : `${year}-${padNumber(month)}-${padNumber(day)}`,
  year,
  month,
  day,
  hasYear: year != null
});

const parseStrictImportantDateValue = (value) => {
  const fullMatch = String(value).match(FULL_DATE_PATTERN);
  if (fullMatch) {
    const year = Number.parseInt(fullMatch[1], 10);
    const month = Number.parseInt(fullMatch[2], 10);
    const day = Number.parseInt(fullMatch[3], 10);

    if (!isValidCalendarDate(year, month, day)) {
      return null;
    }

    return buildParsedImportantDateValue({ year, month, day });
  }

  const partialMatch = String(value).match(PARTIAL_DATE_PATTERN);
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

const parseLegacyImportantDateValue = (value) => {
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

const parseImportantDateValue = (rawValue) => {
  const trimmed = String(rawValue || "").trim();
  if (!trimmed) {
    return null;
  }

  return parseStrictImportantDateValue(trimmed) || parseLegacyImportantDateValue(trimmed);
};

const normalizeImportantDateValue = (rawValue) => parseImportantDateValue(rawValue)?.normalizedValue || null;

const compareImportantDateValues = (left, right) => {
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
};

const normalizeImportantDateEntry = (entry) => {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const type = String(entry.type || "")
    .trim()
    .toLowerCase();
  if (!IMPORTANT_DATE_TYPES.has(type)) {
    return null;
  }

  const value = normalizeImportantDateValue(entry.value);
  if (!value) {
    return null;
  }

  const label = normalizeLabel(entry.label);
  return {
    type,
    value,
    ...(label ? { label } : {})
  };
};

const parseCustomImportantNotesEntries = (importantNotes) => {
  if (!importantNotes) {
    return [];
  }

  const rows = [];
  const lines = String(importantNotes)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const markerIndex = lines.findIndex((line) => line.toLowerCase().startsWith("important dates"));
  const customLines = markerIndex >= 0 ? lines.slice(markerIndex + 1) : [];

  for (const line of customLines) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }

    const label = normalizeLabel(line.slice(0, separatorIndex)) || "Custom";
    const value = normalizeImportantDateValue(line.slice(separatorIndex + 1).trim());
    if (!value) {
      continue;
    }

    rows.push({ type: "custom", value, label });
  }

  return rows;
};

const dedupeAndSortEntries = (entries) => {
  const seen = new Set();
  const unique = [];

  for (const entry of entries) {
    const normalized = normalizeImportantDateEntry(entry);
    if (!normalized) {
      continue;
    }

    const key = `${normalized.type}|${normalized.label || ""}|${normalized.value}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(normalized);
  }

  return unique.sort((left, right) => {
    const dateComparison = compareImportantDateValues(left.value, right.value);
    if (dateComparison !== 0) {
      return dateComparison;
    }

    return left.type.localeCompare(right.type);
  });
};

const buildLegacyEntries = (member) => {
  if (!member || typeof member !== "object") {
    return [];
  }

  const entries = [];
  const pushLegacy = (type, value, label) => {
    const normalizedValue = normalizeImportantDateValue(value);
    if (!normalizedValue) {
      return;
    }

    entries.push({
      type,
      value: normalizedValue,
      ...(label ? { label } : {})
    });
  };

  pushLegacy("dob", member.dateOfBirth || member.birthDate || null);
  pushLegacy("anniversary", member.anniversaryDate || null);
  pushLegacy("death", member.dateOfDeath || member.deathDate || null);

  entries.push(...parseCustomImportantNotesEntries(member.importantNotes));

  return entries;
};

function normalizeDatesFromLegacy(member) {
  if (!member || typeof member !== "object") {
    return [];
  }

  if (Array.isArray(member.importantDateEntries)) {
    return dedupeAndSortEntries(member.importantDateEntries);
  }

  return dedupeAndSortEntries(buildLegacyEntries(member));
}

function mapImportantDatesToLegacy(importantDates) {
  const normalizedEntries = Array.isArray(importantDates) ? dedupeAndSortEntries(importantDates) : [];
  const getFirstDateByType = (type) => {
    const entry = normalizedEntries.find((item) => {
      if (item.type !== type) {
        return false;
      }

      return Boolean(parseImportantDateValue(item.value)?.hasYear);
    });

    return entry ? entry.value : null;
  };

  const customLines = normalizedEntries
    .filter((entry) => entry.type === "custom")
    .map((entry) => `${entry.label || "Custom"}: ${entry.value}`);

  return {
    dateOfBirth: getFirstDateByType("dob") ? new Date(getFirstDateByType("dob")) : null,
    anniversaryDate: getFirstDateByType("anniversary") ? new Date(getFirstDateByType("anniversary")) : null,
    dateOfDeath: getFirstDateByType("death") ? new Date(getFirstDateByType("death")) : null,
    importantNotes: customLines.length ? `Important dates:\n${customLines.join("\n")}` : null
  };
}

module.exports = {
  normalizeImportantDateEntry,
  normalizeImportantDateValue,
  normalizeDatesFromLegacy,
  mapImportantDatesToLegacy
};
