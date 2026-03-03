const IMPORTANT_DATE_TYPES = new Set(["dob", "anniversary", "death", "custom"]);

const normalizeDateToIso = (rawValue) => {
  if (!rawValue) {
    return null;
  }

  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
};

const normalizeLabel = (value) => String(value || "").trim();

const normalizeEntry = (entry) => {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const type = String(entry.type || "")
    .trim()
    .toLowerCase();
  if (!IMPORTANT_DATE_TYPES.has(type)) {
    return null;
  }

  const value = normalizeDateToIso(entry.value);
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
    const value = normalizeDateToIso(line.slice(separatorIndex + 1).trim());
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
    const normalized = normalizeEntry(entry);
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

function normalizeDatesFromLegacy(member) {
  if (!member || typeof member !== "object") {
    return [];
  }

  const entries = [];
  const pushLegacy = (type, value, label) => {
    const normalizedValue = normalizeDateToIso(value);
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

  return dedupeAndSortEntries(entries);
}

function mapImportantDatesToLegacy(importantDates) {
  const normalizedEntries = Array.isArray(importantDates) ? dedupeAndSortEntries(importantDates) : [];
  const getFirstDateByType = (type) => normalizedEntries.find((entry) => entry.type === type)?.value || null;

  const customLines = normalizedEntries
    .filter((entry) => entry.type === "custom")
    .map((entry) => `${entry.label || "Custom"}: ${entry.value.slice(0, 10)}`);

  return {
    dateOfBirth: getFirstDateByType("dob") ? new Date(getFirstDateByType("dob")) : null,
    anniversaryDate: getFirstDateByType("anniversary") ? new Date(getFirstDateByType("anniversary")) : null,
    dateOfDeath: getFirstDateByType("death") ? new Date(getFirstDateByType("death")) : null,
    importantNotes: customLines.length ? `Important dates:\n${customLines.join("\n")}` : null
  };
}

module.exports = {
  normalizeDatesFromLegacy,
  mapImportantDatesToLegacy
};
