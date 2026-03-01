const FamilyTree = require("../models/FamilyTree");

const MAX_SLUG_LENGTH = 72;

const normalizeSlugBase = (name) => {
  const normalized = String(name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!normalized) {
    return "family-tree";
  }

  return normalized.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, "") || "family-tree";
};

const applySuffix = (base, suffix) => {
  const suffixText = `-${suffix}`;
  const maxBaseLength = Math.max(MAX_SLUG_LENGTH - suffixText.length, 10);
  return `${base.slice(0, maxBaseLength).replace(/-+$/g, "")}${suffixText}`;
};

const generateUniqueTreeSlug = async ({ name, excludeTreeId = null, session = null }) => {
  const base = normalizeSlugBase(name);
  let attempt = 0;

  while (attempt < 3000) {
    const candidate = attempt === 0 ? base : applySuffix(base, attempt + 1);
    const query = {
      slug: candidate
    };

    if (excludeTreeId) {
      query._id = { $ne: excludeTreeId };
    }

    const exists = session
      ? await FamilyTree.exists(query).session(session)
      : await FamilyTree.exists(query);

    if (!exists) {
      return candidate;
    }

    attempt += 1;
  }

  return `${base}-${Date.now()}`;
};

module.exports = {
  generateUniqueTreeSlug
};
