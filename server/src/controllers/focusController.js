const Member = require("../models/Member");
const validateRequest = require("../utils/validateRequest");
const { normalizeDatesFromLegacy } = require("../utils/dateNormalizer");

const DEFAULT_CHILDREN_LIMIT = 40;
const MAX_CHILDREN_LIMIT = 200;
const DEFAULT_SIDE_LIMIT = 50;
const MAX_SIDE_LIMIT = 200;

const normalizeId = (value) => {
  if (!value) {
    return null;
  }

  return String(value);
};

const uniqueIds = (values) =>
  Array.from(new Set((values || []).map((value) => normalizeId(value)).filter(Boolean)));

const withNormalizedImportantDates = (member) => {
  if (!member) {
    return member;
  }

  return {
    ...member,
    importantDates: normalizeDatesFromLegacy(member)
  };
};

const parsePositiveInt = ({ rawValue, fallback, min, max, fieldName }) => {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return fallback;
  }

  const parsed = Number.parseInt(String(rawValue), 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    const error = new Error(`${fieldName} must be an integer.`);
    error.statusCode = 400;
    throw error;
  }

  if (parsed < min || parsed > max) {
    const error = new Error(`${fieldName} must be between ${min} and ${max}.`);
    error.statusCode = 400;
    throw error;
  }

  return parsed;
};

const getTreeFocus = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const { treeId, memberId } = req.params;
    const childrenPage = parsePositiveInt({
      rawValue: req.query.childrenPage,
      fallback: 1,
      min: 1,
      max: 100000,
      fieldName: "childrenPage"
    });
    const childrenLimit = parsePositiveInt({
      rawValue: req.query.childrenLimit,
      fallback: DEFAULT_CHILDREN_LIMIT,
      min: 1,
      max: MAX_CHILDREN_LIMIT,
      fieldName: "childrenLimit"
    });
    const spouseLimit = parsePositiveInt({
      rawValue: req.query.spouseLimit,
      fallback: DEFAULT_SIDE_LIMIT,
      min: 1,
      max: MAX_SIDE_LIMIT,
      fieldName: "spouseLimit"
    });
    const siblingLimit = parsePositiveInt({
      rawValue: req.query.siblingLimit,
      fallback: DEFAULT_SIDE_LIMIT,
      min: 1,
      max: MAX_SIDE_LIMIT,
      fieldName: "siblingLimit"
    });

    const center = await Member.findOne({ _id: memberId, treeId }).lean();
    if (!center) {
      res.status(404).json({ message: "Member not found in this tree." });
      return;
    }
    const normalizedCenter = withNormalizedImportantDates(center);

    const parentIds = uniqueIds([center.fatherId, center.motherId]);
    const spouseIds = uniqueIds(center.spouses);
    const siblingIds = uniqueIds(center.siblings);
    const relationIds = uniqueIds([...parentIds, ...spouseIds, ...siblingIds]);

    const [relationDocs, childDocs, totalChildren] = await Promise.all([
      relationIds.length ? Member.find({ _id: { $in: relationIds }, treeId }).lean() : [],
      Member.find({
        treeId,
        $or: [{ fatherId: center._id }, { motherId: center._id }]
      })
        .sort({ createdAt: 1, _id: 1 })
        .skip((childrenPage - 1) * childrenLimit)
        .limit(childrenLimit)
        .lean(),
      Member.countDocuments({
        treeId,
        $or: [{ fatherId: center._id }, { motherId: center._id }]
      })
    ]);

    const normalizedRelationDocs = relationDocs.map(withNormalizedImportantDates);
    const normalizedChildDocs = childDocs.map(withNormalizedImportantDates);
    const relationMap = new Map(normalizedRelationDocs.map((member) => [String(member._id), member]));
    const visibleParentIds = parentIds.filter((id) => relationMap.has(id));
    const visibleSpouseIds = spouseIds.filter((id) => relationMap.has(id));
    const visibleSiblingIds = siblingIds.filter((id) => relationMap.has(id));
    const pagedSpouseIds = visibleSpouseIds.slice(0, spouseLimit);
    const pagedSiblingIds = visibleSiblingIds.slice(0, siblingLimit);

    res.json({
      center: normalizedCenter,
      parents: visibleParentIds.map((id) => relationMap.get(id)).filter(Boolean),
      spouses: pagedSpouseIds.map((id) => relationMap.get(id)).filter(Boolean),
      siblings: pagedSiblingIds.map((id) => relationMap.get(id)).filter(Boolean),
      children: normalizedChildDocs,
      relationMeta: {
        spouses: {
          total: visibleSpouseIds.length,
          loaded: pagedSpouseIds.length,
          limit: spouseLimit,
          hasMore: visibleSpouseIds.length > pagedSpouseIds.length
        },
        siblings: {
          total: visibleSiblingIds.length,
          loaded: pagedSiblingIds.length,
          limit: siblingLimit,
          hasMore: visibleSiblingIds.length > pagedSiblingIds.length
        },
        children: {
          total: totalChildren,
          loaded: childDocs.length,
          page: childrenPage,
          limit: childrenLimit,
          hasMore: childrenPage * childrenLimit < totalChildren
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTreeFocus
};
