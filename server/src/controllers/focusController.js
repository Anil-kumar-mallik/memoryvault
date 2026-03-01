const Member = require("../models/Member");
const validateRequest = require("../utils/validateRequest");

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

    const parentIds = uniqueIds([center.fatherId, center.motherId]);
    const spouseIds = uniqueIds(center.spouses);
    const siblingIds = uniqueIds(center.siblings);
    const pagedSpouseIds = spouseIds.slice(0, spouseLimit);
    const pagedSiblingIds = siblingIds.slice(0, siblingLimit);

    const [parentDocs, spouseDocs, siblingDocs, childDocs, totalChildren] = await Promise.all([
      parentIds.length ? Member.find({ _id: { $in: parentIds }, treeId }).lean() : [],
      pagedSpouseIds.length ? Member.find({ _id: { $in: pagedSpouseIds }, treeId }).lean() : [],
      pagedSiblingIds.length ? Member.find({ _id: { $in: pagedSiblingIds }, treeId }).lean() : [],
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

    const byId = (collection) => new Map(collection.map((member) => [String(member._id), member]));

    const parentsById = byId(parentDocs);
    const spousesById = byId(spouseDocs);
    const siblingsById = byId(siblingDocs);

    res.json({
      center,
      parents: parentIds.map((id) => parentsById.get(id)).filter(Boolean),
      spouses: pagedSpouseIds.map((id) => spousesById.get(id)).filter(Boolean),
      siblings: pagedSiblingIds.map((id) => siblingsById.get(id)).filter(Boolean),
      children: childDocs,
      relationMeta: {
        spouses: {
          total: spouseIds.length,
          loaded: pagedSpouseIds.length,
          limit: spouseLimit,
          hasMore: spouseIds.length > pagedSpouseIds.length
        },
        siblings: {
          total: siblingIds.length,
          loaded: pagedSiblingIds.length,
          limit: siblingLimit,
          hasMore: siblingIds.length > pagedSiblingIds.length
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
