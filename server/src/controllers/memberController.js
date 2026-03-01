const path = require("path");
const mongoose = require("mongoose");
const FamilyTree = require("../models/FamilyTree");
const Member = require("../models/Member");
const validateRequest = require("../utils/validateRequest");
const withMongoTransaction = require("../utils/withMongoTransaction");
const { ensureMemberCreateAllowed } = require("../utils/subscriptionService");
const { createAuditLog } = require("../utils/auditLogger");
const { createNotification } = require("../utils/notificationService");

const RELATION_TYPES = new Set(["none", "father", "mother", "child", "spouse", "sibling"]);
const MUTATION_RELATIONS = new Set(["father", "mother", "child", "spouse", "sibling"]);
const RELATION_ACTIONS = new Set(["connect", "disconnect"]);
const PARENT_ROLE_TYPES = new Set(["father", "mother", "auto"]);
const DEFAULT_CHILDREN_LIMIT = 18;
const MAX_CHILDREN_LIMIT = 100;
const DEFAULT_SIDE_RELATION_LIMIT = 30;
const MAX_SIDE_RELATION_LIMIT = 120;
const DEFAULT_GRAPH_DEPTH = 2;
const MAX_GRAPH_DEPTH = 4;
const DEFAULT_GRAPH_LIMIT = 250;
const MAX_GRAPH_LIMIT = 600;

const toUploadPath = (absoluteFilePath) => `/uploads/${path.basename(absoluteFilePath)}`;
const withSession = (query, session) => (session ? query.session(session) : query);
const sessionOptions = (session) => (session ? { session } : {});

const hasOwn = (source, key) => Object.prototype.hasOwnProperty.call(source, key);

const badRequest = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const notFound = (message) => {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
};

const forbidden = (message) => {
  const error = new Error(message);
  error.statusCode = 403;
  return error;
};

const normalizeId = (value) => {
  if (!value) {
    return null;
  }

  return String(value);
};

const normalizeGender = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return null;
  }

  if (["male", "female", "other", "unspecified"].includes(normalized)) {
    return normalized;
  }

  return null;
};

const oppositeBinaryGender = (value) => {
  const normalized = normalizeGender(value);
  if (normalized === "male") {
    return "female";
  }

  if (normalized === "female") {
    return "male";
  }

  return null;
};

const ensureRootOwnerCanEditMember = (member, user) => {
  if (!member || !member.isRoot) {
    return;
  }

  const linkedUserId = normalizeId(member.linkedUserId);
  if (!linkedUserId) {
    return;
  }

  const requesterId = normalizeId(user && user._id);
  if (requesterId !== linkedUserId) {
    throw forbidden("Only the root owner can edit this root member.");
  }
};

const uniqueIds = (values) => {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(new Set(values.map((value) => normalizeId(value)).filter(Boolean)));
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const addUniqueId = (collection, value) => {
  const normalized = normalizeId(value);
  if (!normalized) {
    return;
  }

  if (!collection.some((item) => String(item) === normalized)) {
    collection.push(normalized);
  }
};

const parseNullableIdInput = (rawValue, fieldName) => {
  if (rawValue === undefined) {
    return { provided: false, value: null };
  }

  if (rawValue === null || rawValue === "" || rawValue === "null") {
    return { provided: true, value: null };
  }

  if (!mongoose.Types.ObjectId.isValid(rawValue)) {
    throw badRequest(`${fieldName} must be a valid member id.`);
  }

  return { provided: true, value: String(rawValue) };
};

const parseRelationType = (rawValue) => {
  if (!rawValue) {
    return "none";
  }

  const normalized = String(rawValue).toLowerCase().trim();
  if (!RELATION_TYPES.has(normalized)) {
    throw badRequest("Invalid relation type.");
  }

  return normalized;
};

const parseMutationRelation = (rawValue) => {
  const normalized = String(rawValue || "").toLowerCase().trim();
  if (!MUTATION_RELATIONS.has(normalized)) {
    throw badRequest("relation must be one of father, mother, child, spouse, sibling.");
  }

  return normalized;
};

const parseRelationAction = (rawValue) => {
  const normalized = String(rawValue || "").toLowerCase().trim();
  if (!RELATION_ACTIONS.has(normalized)) {
    throw badRequest("action must be connect or disconnect.");
  }

  return normalized;
};

const parseRemoveRelationType = (rawValue) => {
  const normalized = String(rawValue || "").toLowerCase().trim();
  if (!["spouse", "sibling", "parent", "child"].includes(normalized)) {
    throw badRequest("relationType must be spouse, sibling, parent, or child.");
  }

  return normalized;
};

const parseNullableDateInput = (rawValue, fieldName) => {
  if (rawValue === undefined) {
    return { provided: false, value: null };
  }

  if (rawValue === null || rawValue === "" || rawValue === "null") {
    return { provided: true, value: null };
  }

  const parsedDate = new Date(rawValue);
  if (Number.isNaN(parsedDate.getTime())) {
    throw badRequest(`${fieldName} must be a valid date.`);
  }

  return { provided: true, value: parsedDate };
};

const parseMetadataInput = (rawValue) => {
  if (rawValue === undefined) {
    return { provided: false, value: {} };
  }

  if (rawValue === null || rawValue === "" || rawValue === "null") {
    return { provided: true, value: {} };
  }

  if (typeof rawValue === "object" && !Array.isArray(rawValue)) {
    return { provided: true, value: rawValue };
  }

  if (typeof rawValue === "string") {
    try {
      const parsed = JSON.parse(rawValue);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("metadata must be a JSON object.");
      }

      return { provided: true, value: parsed };
    } catch (_error) {
      throw badRequest("metadata must be a valid JSON object.");
    }
  }

  throw badRequest("metadata must be an object.");
};

const parseParentRole = (rawValue) => {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return "auto";
  }

  const normalized = String(rawValue).toLowerCase().trim();
  if (!PARENT_ROLE_TYPES.has(normalized)) {
    throw badRequest("parentRole must be father, mother, or auto.");
  }

  return normalized;
};

const parseSpouseIds = (rawValue) => {
  if (rawValue === undefined) {
    return { provided: false, values: [] };
  }

  if (rawValue === null || rawValue === "") {
    return { provided: true, values: [] };
  }

  let parsed = rawValue;

  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();

    if (trimmed.startsWith("[")) {
      try {
        parsed = JSON.parse(trimmed);
      } catch (_error) {
        throw badRequest("spouses must be a valid JSON array of member ids.");
      }
    } else {
      parsed = trimmed.split(",").map((token) => token.trim());
    }
  }

  if (!Array.isArray(parsed)) {
    throw badRequest("spouses must be an array of member ids.");
  }

  const values = uniqueIds(parsed);
  for (const value of values) {
    if (!mongoose.Types.ObjectId.isValid(value)) {
      throw badRequest("spouses must contain valid member ids.");
    }
  }

  return { provided: true, values };
};

const parsePositiveInt = ({ rawValue, fallback, min, max, fieldName }) => {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return fallback;
  }

  const parsed = Number.parseInt(String(rawValue), 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    throw badRequest(`${fieldName} must be an integer.`);
  }

  if (parsed < min || parsed > max) {
    throw badRequest(`${fieldName} must be between ${min} and ${max}.`);
  }

  return parsed;
};

const parseRelationQueryOptions = (query = {}) => ({
  childrenPage: parsePositiveInt({
    rawValue: query.childrenPage,
    fallback: 1,
    min: 1,
    max: 100000,
    fieldName: "childrenPage"
  }),
  childrenLimit: parsePositiveInt({
    rawValue: query.childrenLimit,
    fallback: DEFAULT_CHILDREN_LIMIT,
    min: 1,
    max: MAX_CHILDREN_LIMIT,
    fieldName: "childrenLimit"
  }),
  spouseLimit: parsePositiveInt({
    rawValue: query.spouseLimit,
    fallback: DEFAULT_SIDE_RELATION_LIMIT,
    min: 1,
    max: MAX_SIDE_RELATION_LIMIT,
    fieldName: "spouseLimit"
  }),
  siblingLimit: parsePositiveInt({
    rawValue: query.siblingLimit,
    fallback: DEFAULT_SIDE_RELATION_LIMIT,
    min: 1,
    max: MAX_SIDE_RELATION_LIMIT,
    fieldName: "siblingLimit"
  })
});

const parseGraphQueryOptions = (query = {}) => ({
  depth: parsePositiveInt({
    rawValue: query.depth,
    fallback: DEFAULT_GRAPH_DEPTH,
    min: 1,
    max: MAX_GRAPH_DEPTH,
    fieldName: "depth"
  }),
  limit: parsePositiveInt({
    rawValue: query.limit,
    fallback: DEFAULT_GRAPH_LIMIT,
    min: 1,
    max: MAX_GRAPH_LIMIT,
    fieldName: "limit"
  })
});

const collectParentAgeWarnings = async ({
  treeId,
  fatherId,
  motherId,
  memberBirthDate,
  session = null
}) => {
  const warnings = [];

  if (!memberBirthDate) {
    return warnings;
  }

  const childBirthDate = new Date(memberBirthDate);
  if (Number.isNaN(childBirthDate.getTime())) {
    return warnings;
  }

  const parentIds = uniqueIds([fatherId, motherId]);
  if (!parentIds.length) {
    return warnings;
  }

  const parentRows = await withSession(Member.find({ treeId, _id: { $in: parentIds } }), session)
    .select("_id name birthDate")
    .lean();

  const parentMap = new Map(parentRows.map((row) => [String(row._id), row]));

  for (const parentId of parentIds) {
    const parent = parentMap.get(String(parentId));
    if (!parent?.birthDate) {
      continue;
    }

    const parentBirthDate = new Date(parent.birthDate);
    if (Number.isNaN(parentBirthDate.getTime())) {
      continue;
    }

    if (parentBirthDate > childBirthDate) {
      warnings.push(`Soft warning: Parent ${parent.name || parentId} appears younger than child.`);
    }
  }

  return warnings;
};

const handleKnownError = (error, res, next) => {
  if (error && typeof error.statusCode === "number") {
    res.status(error.statusCode).json({ message: error.message });
    return;
  }

  if (error instanceof mongoose.Error.ValidationError) {
    res.status(400).json({ message: error.message });
    return;
  }

  next(error);
};

const getTreeFromRequest = async (req, session = null) => {
  if (req.tree) {
    if (!session) {
      return req.tree;
    }

    return withSession(FamilyTree.findById(req.tree._id), session);
  }

  const { treeId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(treeId)) {
    return null;
  }

  return withSession(FamilyTree.findById(treeId), session);
};

const loadMemberInTree = async (treeId, memberId, session = null) => {
  if (!mongoose.Types.ObjectId.isValid(memberId)) {
    return null;
  }

  return withSession(Member.findOne({ _id: memberId, treeId }), session);
};

const ensureMembersInTree = async (treeId, memberIds, fieldLabel = "Member ids", session = null) => {
  const ids = uniqueIds(memberIds);

  if (!ids.length) {
    return;
  }

  const count = await withSession(Member.countDocuments({ treeId, _id: { $in: ids } }), session);

  if (count !== ids.length) {
    throw badRequest(`${fieldLabel} must belong to the same tree.`);
  }
};

const wouldCreateParentCycle = async ({ treeId, memberId, candidateParentId, session = null }) => {
  const normalizedMemberId = normalizeId(memberId);
  const normalizedParentId = normalizeId(candidateParentId);

  if (!normalizedMemberId || !normalizedParentId) {
    return false;
  }

  let frontier = [normalizedParentId];
  const visited = new Set();

  while (frontier.length > 0) {
    const batch = Array.from(new Set(frontier.filter((id) => !visited.has(id))));
    frontier = [];

    if (!batch.length) {
      break;
    }

    if (batch.includes(normalizedMemberId)) {
      return true;
    }

    batch.forEach((id) => visited.add(id));

    const rows = await withSession(Member.find({ treeId, _id: { $in: batch } }), session)
      .select("_id fatherId motherId")
      .lean();

    for (const row of rows) {
      const fatherId = normalizeId(row.fatherId);
      const motherId = normalizeId(row.motherId);

      if (fatherId && !visited.has(fatherId)) {
        frontier.push(fatherId);
      }

      if (motherId && !visited.has(motherId)) {
        frontier.push(motherId);
      }
    }
  }

  return false;
};

const validateParentAssignment = async ({
  treeId,
  memberId,
  fatherId,
  motherId,
  session = null,
  enforceGenderConstraints = true
}) => {
  const normalizedMemberId = normalizeId(memberId);
  const normalizedFatherId = normalizeId(fatherId);
  const normalizedMotherId = normalizeId(motherId);

  if (normalizedFatherId && normalizedMemberId && normalizedFatherId === normalizedMemberId) {
    throw badRequest("fatherId cannot be the same as member id.");
  }

  if (normalizedMotherId && normalizedMemberId && normalizedMotherId === normalizedMemberId) {
    throw badRequest("motherId cannot be the same as member id.");
  }

  if (normalizedFatherId && normalizedMotherId && normalizedFatherId === normalizedMotherId) {
    throw badRequest("fatherId and motherId cannot be the same member.");
  }

  await ensureMembersInTree(treeId, [normalizedFatherId, normalizedMotherId], "Parent ids", session);

  const parentIds = uniqueIds([normalizedFatherId, normalizedMotherId]);
  const parentRows = parentIds.length
    ? await withSession(Member.find({ treeId, _id: { $in: parentIds } }), session).select("_id gender").lean()
    : [];
  const parentMap = new Map(parentRows.map((row) => [String(row._id), row]));

  if (enforceGenderConstraints && normalizedFatherId) {
    const fatherGender = normalizeGender(parentMap.get(normalizedFatherId)?.gender);
    if (fatherGender === "female") {
      throw badRequest("fatherId cannot reference a female member.");
    }
  }

  if (enforceGenderConstraints && normalizedMotherId) {
    const motherGender = normalizeGender(parentMap.get(normalizedMotherId)?.gender);
    if (motherGender === "male") {
      throw badRequest("motherId cannot reference a male member.");
    }
  }

  if (enforceGenderConstraints && normalizedFatherId && normalizedMotherId) {
    const fatherGender = normalizeGender(parentMap.get(normalizedFatherId)?.gender);
    const motherGender = normalizeGender(parentMap.get(normalizedMotherId)?.gender);
    if (
      (fatherGender === "male" || fatherGender === "female") &&
      (motherGender === "male" || motherGender === "female") &&
      fatherGender === motherGender
    ) {
      throw badRequest("father and mother cannot have the same gender when both are specified.");
    }
  }

  if (
    normalizedFatherId &&
    (await wouldCreateParentCycle({
      treeId,
      memberId: normalizedMemberId,
      candidateParentId: normalizedFatherId,
      session
    }))
  ) {
    throw badRequest("fatherId creates a parent cycle.");
  }

  if (
    normalizedMotherId &&
    (await wouldCreateParentCycle({
      treeId,
      memberId: normalizedMemberId,
      candidateParentId: normalizedMotherId,
      session
    }))
  ) {
    throw badRequest("motherId creates a parent cycle.");
  }
};

const rebuildDerivedRelations = async (treeId, session = null) => {
  const members = await withSession(Member.find({ treeId }), session).select("_id fatherId motherId spouses siblings").lean();

  if (!members.length) {
    return;
  }

  const allIds = members.map((member) => String(member._id));
  const validIds = new Set(allIds);
  const childrenMap = new Map();
  const siblingMap = new Map();
  const spouseMap = new Map();
  const parentPairGroups = new Map();
  const parentAssignments = new Map();

  for (const memberId of allIds) {
    childrenMap.set(memberId, new Set());
    siblingMap.set(memberId, new Set());
    spouseMap.set(memberId, new Set());
  }

  for (const member of members) {
    const memberId = String(member._id);

    let fatherId = normalizeId(member.fatherId);
    let motherId = normalizeId(member.motherId);

    if (!fatherId || !validIds.has(fatherId) || fatherId === memberId) {
      fatherId = null;
    }

    if (!motherId || !validIds.has(motherId) || motherId === memberId) {
      motherId = null;
    }

    if (fatherId && motherId && fatherId === motherId) {
      motherId = null;
    }

    parentAssignments.set(memberId, { fatherId, motherId });

    if (fatherId) {
      childrenMap.get(fatherId).add(memberId);
    }

    if (motherId) {
      childrenMap.get(motherId).add(memberId);
    }

    if (fatherId || motherId) {
      const key = `${fatherId || "_"}|${motherId || "_"}`;
      if (!parentPairGroups.has(key)) {
        parentPairGroups.set(key, []);
      }
      parentPairGroups.get(key).push(memberId);
    }

    const spouses = uniqueIds(member.spouses);
    for (const spouseId of spouses) {
      if (!validIds.has(spouseId) || spouseId === memberId) {
        continue;
      }

      spouseMap.get(memberId).add(spouseId);
      spouseMap.get(spouseId).add(memberId);
    }

    const manualSiblings = uniqueIds(member.siblings);
    for (const siblingId of manualSiblings) {
      if (!validIds.has(siblingId) || siblingId === memberId) {
        continue;
      }

      siblingMap.get(memberId).add(siblingId);
      siblingMap.get(siblingId).add(memberId);
    }
  }

  for (const groupIds of parentPairGroups.values()) {
    if (groupIds.length < 2) {
      continue;
    }

    for (const memberId of groupIds) {
      const siblings = siblingMap.get(memberId);
      for (const siblingId of groupIds) {
        if (siblingId !== memberId) {
          siblings.add(siblingId);
        }
      }
    }
  }

  const operations = allIds.map((memberId) => {
    const parentAssignment = parentAssignments.get(memberId) || { fatherId: null, motherId: null };

    return {
      updateOne: {
        filter: { _id: memberId, treeId },
        update: {
          $set: {
            fatherId: parentAssignment.fatherId,
            motherId: parentAssignment.motherId,
            children: Array.from(childrenMap.get(memberId) || []),
            siblings: Array.from(siblingMap.get(memberId) || []),
            spouses: Array.from(spouseMap.get(memberId) || [])
          }
        }
      }
    };
  });

  if (operations.length) {
    await Member.bulkWrite(operations, { ordered: false, ...sessionOptions(session) });
  }
};

const buildMemberWithRelations = async (treeId, memberId, options = {}, session = null) => {
  const childrenPage = options.childrenPage || 1;
  const childrenLimit = options.childrenLimit || DEFAULT_CHILDREN_LIMIT;
  const spouseLimit = options.spouseLimit || DEFAULT_SIDE_RELATION_LIMIT;
  const siblingLimit = options.siblingLimit || DEFAULT_SIDE_RELATION_LIMIT;

  const focus = await withSession(Member.findOne({ _id: memberId, treeId }), session).lean();

  if (!focus) {
    return null;
  }

  const focusId = String(focus._id);
  const fatherId = normalizeId(focus.fatherId);
  const motherId = normalizeId(focus.motherId);

  const spouseIds = uniqueIds(focus.spouses).filter((id) => id !== focusId);
  const siblingIds = uniqueIds(focus.siblings).filter((id) => id !== focusId);

  const pagedSpouseIds = spouseIds.slice(0, spouseLimit);
  const pagedSiblingIds = siblingIds.slice(0, siblingLimit);

  const relationIds = uniqueIds([fatherId, motherId, ...pagedSpouseIds, ...pagedSiblingIds]);
  const relationDocs = relationIds.length
    ? await withSession(Member.find({ treeId, _id: { $in: relationIds } }), session).lean()
    : [];

  const relationMap = new Map(relationDocs.map((member) => [String(member._id), member]));

  const childrenFilter = {
    treeId,
    $or: [{ fatherId: focus._id }, { motherId: focus._id }]
  };

  const totalChildren = await withSession(Member.countDocuments(childrenFilter), session);
  const children = await withSession(Member.find(childrenFilter), session)
    .sort({ createdAt: 1, _id: 1 })
    .skip((childrenPage - 1) * childrenLimit)
    .limit(childrenLimit)
    .lean();

  const nodesMap = new Map();

  const addNode = (member) => {
    if (!member) {
      return;
    }

    const id = String(member._id);
    if (!nodesMap.has(id)) {
      nodesMap.set(id, member);
    }
  };

  addNode(focus);
  relationDocs.forEach(addNode);
  children.forEach(addNode);

  return {
    focus,
    relations: {
      father: fatherId ? relationMap.get(fatherId) || null : null,
      mother: motherId ? relationMap.get(motherId) || null : null,
      spouses: pagedSpouseIds.map((id) => relationMap.get(id)).filter(Boolean),
      children,
      siblings: pagedSiblingIds.map((id) => relationMap.get(id)).filter(Boolean)
    },
    relationMeta: {
      spouses: {
        total: spouseIds.length,
        loaded: Math.min(pagedSpouseIds.length, spouseIds.length),
        limit: spouseLimit,
        hasMore: spouseIds.length > pagedSpouseIds.length
      },
      siblings: {
        total: siblingIds.length,
        loaded: Math.min(pagedSiblingIds.length, siblingIds.length),
        limit: siblingLimit,
        hasMore: siblingIds.length > pagedSiblingIds.length
      },
      children: {
        total: totalChildren,
        loaded: children.length,
        page: childrenPage,
        limit: childrenLimit,
        hasMore: childrenPage * childrenLimit < totalChildren
      }
    },
    nodes: Array.from(nodesMap.values())
  };
};

const pickPreferredSpouseForParent = async ({ treeId, parentMember, session = null }) => {
  const spouseIds = uniqueIds(parentMember?.spouses || []);
  if (!spouseIds.length) {
    return null;
  }

  const spouseRows = await withSession(Member.find({ treeId, _id: { $in: spouseIds } }), session)
    .select("_id gender createdAt")
    .lean();
  if (!spouseRows.length) {
    return null;
  }

  const desiredSpouseGender = oppositeBinaryGender(parentMember?.gender);
  if (desiredSpouseGender) {
    const preferred = spouseRows.find((row) => normalizeGender(row.gender) === desiredSpouseGender);
    if (preferred) {
      return preferred;
    }
  }

  spouseRows.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return spouseRows[0] || null;
};

const attachRelationToNewMember = async ({ relationType, member, relatedMember, session = null }) => {
  if (relationType === "none" || !relatedMember) {
    return;
  }

  switch (relationType) {
    case "father": {
      relatedMember.fatherId = member._id;
      await ensureParentSpouseLinkForChild({
        treeId: relatedMember.treeId,
        fatherId: relatedMember.fatherId,
        motherId: relatedMember.motherId,
        session
      });
      await relatedMember.save(sessionOptions(session));
      return;
    }

    case "mother": {
      relatedMember.motherId = member._id;
      await ensureParentSpouseLinkForChild({
        treeId: relatedMember.treeId,
        fatherId: relatedMember.fatherId,
        motherId: relatedMember.motherId,
        session
      });
      await relatedMember.save(sessionOptions(session));
      return;
    }

    case "child": {
      const parentGender = normalizeGender(relatedMember.gender);
      const spouseParent = await pickPreferredSpouseForParent({
        treeId: relatedMember.treeId,
        parentMember: relatedMember,
        session
      });
      const spouseParentId = spouseParent ? String(spouseParent._id) : null;
      const spouseParentGender = normalizeGender(spouseParent?.gender);

      if (parentGender === "male") {
        member.fatherId = relatedMember._id;
        if (
          spouseParentId &&
          String(relatedMember._id) !== spouseParentId &&
          spouseParentGender !== "male" &&
          !member.motherId
        ) {
          member.motherId = spouseParentId;
        }
      } else if (parentGender === "female") {
        member.motherId = relatedMember._id;
        if (
          spouseParentId &&
          String(relatedMember._id) !== spouseParentId &&
          spouseParentGender !== "female" &&
          !member.fatherId
        ) {
          member.fatherId = spouseParentId;
        }
      } else {
        if (!member.fatherId) {
          member.fatherId = relatedMember._id;
        } else if (!member.motherId && String(member.fatherId) !== String(relatedMember._id)) {
          member.motherId = relatedMember._id;
        }

        if (spouseParentId && String(relatedMember._id) !== spouseParentId) {
          if (!member.fatherId && spouseParentGender !== "female") {
            member.fatherId = spouseParentId;
          } else if (
            !member.motherId &&
            String(member.fatherId) !== spouseParentId &&
            spouseParentGender !== "male"
          ) {
            member.motherId = spouseParentId;
          }
        }
      }
      return;
    }

    case "spouse": {
      const currentGender = normalizeGender(member.gender);
      if (!currentGender) {
        const suggestedGender = oppositeBinaryGender(relatedMember.gender);
        if (suggestedGender) {
          member.gender = suggestedGender;
        }
      }

      addUniqueId(member.spouses, relatedMember._id);
      addUniqueId(relatedMember.spouses, member._id);
      await relatedMember.save(sessionOptions(session));
      await backfillMissingParentFromSpouseLink({
        treeId: relatedMember.treeId,
        parentMemberId: relatedMember._id,
        spouseMemberId: member._id,
        session
      });
      return;
    }

    case "sibling": {
      if (relatedMember.fatherId) {
        member.fatherId = relatedMember.fatherId;
      }

      if (relatedMember.motherId) {
        member.motherId = relatedMember.motherId;
      }

      addUniqueId(member.siblings, relatedMember._id);
      addUniqueId(relatedMember.siblings, member._id);
      await relatedMember.save(sessionOptions(session));
      return;
    }

    default:
      return;
  }
};

const syncSpouseLinks = async (treeId, member, nextSpouseIds, session = null) => {
  const memberId = String(member._id);
  const nextSet = new Set(nextSpouseIds.filter((id) => id !== memberId));
  const currentSet = new Set((member.spouses || []).map((id) => String(id)));

  const allIds = Array.from(new Set([...currentSet, ...nextSet]));
  await ensureMembersInTree(treeId, allIds, "Spouse ids", session);

  const operations = [];

  for (const spouseId of currentSet) {
    if (!nextSet.has(spouseId)) {
      operations.push({
        updateOne: {
          filter: { _id: spouseId, treeId },
          update: { $pull: { spouses: member._id } }
        }
      });
    }
  }

  for (const spouseId of nextSet) {
    if (!currentSet.has(spouseId)) {
      operations.push({
        updateOne: {
          filter: { _id: spouseId, treeId },
          update: { $addToSet: { spouses: member._id } }
        }
      });
    }
  }

  if (operations.length) {
    await Member.bulkWrite(operations, { ordered: false, ...sessionOptions(session) });
  }

  member.spouses = Array.from(nextSet);
};

const ensureParentSpouseLinkForChild = async ({ treeId, fatherId, motherId, session = null }) => {
  const normalizedFatherId = normalizeId(fatherId);
  const normalizedMotherId = normalizeId(motherId);

  if (!normalizedFatherId || !normalizedMotherId) {
    return;
  }

  if (normalizedFatherId === normalizedMotherId) {
    throw badRequest("fatherId and motherId cannot be the same member.");
  }

  await Member.bulkWrite(
    [
      {
        updateOne: {
          filter: { _id: normalizedFatherId, treeId },
          update: { $addToSet: { spouses: normalizedMotherId } }
        }
      },
      {
        updateOne: {
          filter: { _id: normalizedMotherId, treeId },
          update: { $addToSet: { spouses: normalizedFatherId } }
        }
      }
    ],
    { ordered: false, ...sessionOptions(session) }
  );
};

const backfillMissingParentFromSpouseLink = async ({
  treeId,
  parentMemberId,
  spouseMemberId,
  session = null
}) => {
  const normalizedParentId = normalizeId(parentMemberId);
  const normalizedSpouseId = normalizeId(spouseMemberId);

  if (!normalizedParentId || !normalizedSpouseId || normalizedParentId === normalizedSpouseId) {
    return;
  }

  const candidateChildren = await withSession(
    Member.find({
      treeId,
      $or: [
        {
          fatherId: normalizedParentId,
          $or: [{ motherId: null }, { motherId: { $exists: false } }]
        },
        {
          motherId: normalizedParentId,
          $or: [{ fatherId: null }, { fatherId: { $exists: false } }]
        }
      ]
    }),
    session
  )
    .select("_id fatherId motherId")
    .lean();

  if (!candidateChildren.length) {
    return;
  }

  const childUpdateOps = [];
  const linkedChildIds = [];

  for (const child of candidateChildren) {
    const currentFatherId = normalizeId(child.fatherId);
    const currentMotherId = normalizeId(child.motherId);

    let nextFatherId = currentFatherId;
    let nextMotherId = currentMotherId;

    if (currentFatherId === normalizedParentId && !currentMotherId) {
      nextMotherId = normalizedSpouseId;
    } else if (currentMotherId === normalizedParentId && !currentFatherId) {
      nextFatherId = normalizedSpouseId;
    } else {
      continue;
    }

    if (nextFatherId === currentFatherId && nextMotherId === currentMotherId) {
      continue;
    }

    try {
      await validateParentAssignment({
        treeId,
        memberId: child._id,
        fatherId: nextFatherId,
        motherId: nextMotherId,
        session,
        enforceGenderConstraints: true
      });
    } catch (error) {
      if (error && typeof error.statusCode === "number" && error.statusCode === 400) {
        continue;
      }

      throw error;
    }

    childUpdateOps.push({
      updateOne: {
        filter: { _id: child._id, treeId },
        update: {
          $set: {
            fatherId: nextFatherId || null,
            motherId: nextMotherId || null
          }
        }
      }
    });
    linkedChildIds.push(child._id);
  }

  if (childUpdateOps.length) {
    await Member.bulkWrite(childUpdateOps, { ordered: false, ...sessionOptions(session) });
  }

  if (linkedChildIds.length) {
    await Member.updateOne(
      { _id: normalizedSpouseId, treeId },
      { $addToSet: { children: { $each: linkedChildIds } } },
      sessionOptions(session)
    );
  }
};

const assignParentToChild = ({ child, parentId, parentRole }) => {
  const normalizedParentId = normalizeId(parentId);
  if (!normalizedParentId) {
    throw badRequest("parentId is required.");
  }

  if (parentRole === "father") {
    if (child.motherId && String(child.motherId) === normalizedParentId) {
      throw badRequest("father and mother cannot be the same member.");
    }

    child.fatherId = normalizedParentId;
    return;
  }

  if (parentRole === "mother") {
    if (child.fatherId && String(child.fatherId) === normalizedParentId) {
      throw badRequest("father and mother cannot be the same member.");
    }

    child.motherId = normalizedParentId;
    return;
  }

  if (!child.fatherId) {
    child.fatherId = normalizedParentId;
    return;
  }

  if (!child.motherId && String(child.fatherId) !== normalizedParentId) {
    child.motherId = normalizedParentId;
    return;
  }

  if (String(child.fatherId) === normalizedParentId || String(child.motherId || "") === normalizedParentId) {
    return;
  }

  throw badRequest("Child already has two parents. Specify father/mother role explicitly or disconnect first.");
};

const detachParentFromChild = ({ child, parentId, parentRole }) => {
  const normalizedParentId = normalizeId(parentId);
  if (!normalizedParentId) {
    return;
  }

  if (parentRole === "father") {
    if (child.fatherId && String(child.fatherId) === normalizedParentId) {
      child.fatherId = null;
    }
    return;
  }

  if (parentRole === "mother") {
    if (child.motherId && String(child.motherId) === normalizedParentId) {
      child.motherId = null;
    }
    return;
  }

  if (child.fatherId && String(child.fatherId) === normalizedParentId) {
    child.fatherId = null;
  }

  if (child.motherId && String(child.motherId) === normalizedParentId) {
    child.motherId = null;
  }
};

const mutateMemberRelation = async ({ treeId, sourceMember, targetMember, relation, action, parentRole, session = null }) => {
  if (!sourceMember || !targetMember) {
    throw badRequest("Source and target members are required.");
  }

  const sourceId = String(sourceMember._id);
  const targetId = String(targetMember._id);

  if (sourceId === targetId) {
    throw badRequest("Cannot apply relation with the same member.");
  }

  if (relation === "father") {
    if (action === "connect") {
      sourceMember.fatherId = targetMember._id;
    } else if (sourceMember.fatherId && String(sourceMember.fatherId) === targetId) {
      sourceMember.fatherId = null;
    }

    await validateParentAssignment({
      treeId,
      memberId: sourceMember._id,
      fatherId: sourceMember.fatherId,
      motherId: sourceMember.motherId,
      session,
      enforceGenderConstraints: action === "connect"
    });
    await ensureParentSpouseLinkForChild({
      treeId,
      fatherId: sourceMember.fatherId,
      motherId: sourceMember.motherId,
      session
    });
    await sourceMember.save(sessionOptions(session));
    return;
  }

  if (relation === "mother") {
    if (action === "connect") {
      sourceMember.motherId = targetMember._id;
    } else if (sourceMember.motherId && String(sourceMember.motherId) === targetId) {
      sourceMember.motherId = null;
    }

    await validateParentAssignment({
      treeId,
      memberId: sourceMember._id,
      fatherId: sourceMember.fatherId,
      motherId: sourceMember.motherId,
      session,
      enforceGenderConstraints: action === "connect"
    });
    await ensureParentSpouseLinkForChild({
      treeId,
      fatherId: sourceMember.fatherId,
      motherId: sourceMember.motherId,
      session
    });
    await sourceMember.save(sessionOptions(session));
    return;
  }

  if (relation === "child") {
    if (action === "connect") {
      assignParentToChild({ child: targetMember, parentId: sourceMember._id, parentRole });
    } else {
      detachParentFromChild({ child: targetMember, parentId: sourceMember._id, parentRole });
    }

    await validateParentAssignment({
      treeId,
      memberId: targetMember._id,
      fatherId: targetMember.fatherId,
      motherId: targetMember.motherId,
      session,
      enforceGenderConstraints: action === "connect"
    });
    await ensureParentSpouseLinkForChild({
      treeId,
      fatherId: targetMember.fatherId,
      motherId: targetMember.motherId,
      session
    });
    await targetMember.save(sessionOptions(session));
    return;
  }

  if (relation === "spouse") {
    if (action === "connect") {
      await Member.bulkWrite(
        [
          {
            updateOne: {
              filter: { _id: sourceMember._id, treeId },
              update: { $addToSet: { spouses: targetMember._id } }
            }
          },
          {
            updateOne: {
              filter: { _id: targetMember._id, treeId },
              update: { $addToSet: { spouses: sourceMember._id } }
            }
          }
        ],
        { ordered: false, ...sessionOptions(session) }
      );
      await backfillMissingParentFromSpouseLink({
        treeId,
        parentMemberId: sourceMember._id,
        spouseMemberId: targetMember._id,
        session
      });
      await backfillMissingParentFromSpouseLink({
        treeId,
        parentMemberId: targetMember._id,
        spouseMemberId: sourceMember._id,
        session
      });
    } else {
      await Member.bulkWrite(
        [
          {
            updateOne: {
              filter: { _id: sourceMember._id, treeId },
              update: { $pull: { spouses: targetMember._id } }
            }
          },
          {
            updateOne: {
              filter: { _id: targetMember._id, treeId },
              update: { $pull: { spouses: sourceMember._id } }
            }
          }
        ],
        { ordered: false, ...sessionOptions(session) }
      );
    }

    return;
  }

  if (relation === "sibling") {
    if (action === "connect") {
      await Member.bulkWrite(
        [
          {
            updateOne: {
              filter: { _id: sourceMember._id, treeId },
              update: { $addToSet: { siblings: targetMember._id } }
            }
          },
          {
            updateOne: {
              filter: { _id: targetMember._id, treeId },
              update: { $addToSet: { siblings: sourceMember._id } }
            }
          }
        ],
        { ordered: false, ...sessionOptions(session) }
      );
    } else {
      await Member.bulkWrite(
        [
          {
            updateOne: {
              filter: { _id: sourceMember._id, treeId },
              update: { $pull: { siblings: targetMember._id } }
            }
          },
          {
            updateOne: {
              filter: { _id: targetMember._id, treeId },
              update: { $pull: { siblings: sourceMember._id } }
            }
          }
        ],
        { ordered: false, ...sessionOptions(session) }
      );
    }
  }
};

const buildRelationMutationResponse = async ({ treeId, sourceMemberId, relation, action, targetMemberId, session = null }) => {
  await rebuildDerivedRelations(treeId, session);

  const payload = await buildMemberWithRelations(treeId, sourceMemberId, {
    childrenPage: 1,
    childrenLimit: DEFAULT_CHILDREN_LIMIT,
    spouseLimit: DEFAULT_SIDE_RELATION_LIMIT,
    siblingLimit: DEFAULT_SIDE_RELATION_LIMIT
  }, session);

  return {
    ...payload,
    mutation: {
      relation,
      action,
      targetMemberId: String(targetMemberId)
    }
  };
};

const collectSubtreeMemberIds = async ({ treeId, rootMemberId, session = null }) => {
  const normalizedRootId = normalizeId(rootMemberId);
  if (!normalizedRootId) {
    return [];
  }

  const idsToDelete = new Set([normalizedRootId]);
  const queue = [normalizedRootId];

  while (queue.length > 0) {
    const batch = queue.splice(0, 250);
    const children = await withSession(
      Member.find({
        treeId,
        $or: [{ fatherId: { $in: batch } }, { motherId: { $in: batch } }]
      }),
      session
    )
      .select("_id")
      .lean();

    for (const child of children) {
      const childId = String(child._id);
      if (!idsToDelete.has(childId)) {
        idsToDelete.add(childId);
        queue.push(childId);
      }
    }
  }

  return Array.from(idsToDelete);
};

const createMember = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const { treeId } = req.params;

    const name = String(req.body.name || "").trim();
    if (!name) {
      throw badRequest("Name is required.");
    }

    const relationType = parseRelationType(req.body.relationType);
    const relatedMemberId = normalizeId(req.body.relatedMemberId);

    if (relationType !== "none" && !relatedMemberId) {
      throw badRequest("relatedMemberId is required when relationType is selected.");
    }

    const birthDateInput = parseNullableDateInput(req.body.birthDate, "birthDate");
    const deathDateInput = parseNullableDateInput(req.body.deathDate, "deathDate");
    const metadataInput = parseMetadataInput(req.body.metadata);
    const genderValue = hasOwn(req.body, "gender") ? String(req.body.gender || "").trim().toLowerCase() : undefined;

    const payload = await withMongoTransaction(async (session) => {
      const { tree } = await ensureMemberCreateAllowed({ treeId, session });
      const treeRootMemberId = tree.rootMember || tree.rootMemberId || null;

      let relatedMember = null;
      if (relatedMemberId) {
        relatedMember = await loadMemberInTree(treeId, relatedMemberId, session);
        if (!relatedMember) {
          throw notFound("Related member not found in this tree.");
        }

        ensureRootOwnerCanEditMember(relatedMember, req.user);
      }

      const member = new Member({
        treeId,
        createdBy: req.user._id,
        name,
        note: String(req.body.note || "").trim(),
        profileImage: req.file ? toUploadPath(req.file.path) : null,
        fatherId: null,
        motherId: null,
        spouses: [],
        children: [],
        siblings: [],
        isRoot: !treeRootMemberId,
        linkedUserId: !treeRootMemberId ? tree.owner : null,
        birthDate: birthDateInput.provided ? birthDateInput.value : null,
        deathDate: deathDateInput.provided ? deathDateInput.value : null,
        metadata: metadataInput.provided ? metadataInput.value : {},
        ...(genderValue ? { gender: genderValue } : {})
      });

      await attachRelationToNewMember({ relationType, member, relatedMember, session });

      await validateParentAssignment({
        treeId,
        memberId: member._id,
        fatherId: member.fatherId,
        motherId: member.motherId,
        session
      });

      await ensureParentSpouseLinkForChild({
        treeId,
        fatherId: member.fatherId,
        motherId: member.motherId,
        session
      });

      const ageWarnings = await collectParentAgeWarnings({
        treeId,
        fatherId: member.fatherId,
        motherId: member.motherId,
        memberBirthDate: member.birthDate,
        session
      });

      await member.save(sessionOptions(session));

      if (!treeRootMemberId) {
        tree.rootMember = member._id;
        tree.rootMemberId = member._id;
        await tree.save(sessionOptions(session));
      }

      await rebuildDerivedRelations(treeId, session);

      await createAuditLog({
        userId: req.user._id,
        action: "member_add",
        entityType: "member",
        entityId: member._id,
        metadata: {
          treeId: String(tree._id),
          relationType
        },
        session
      });

      await createNotification({
        userId: tree.owner,
        message: `Member added to ${tree.name}: ${member.name}`,
        metadata: {
          type: "member_added",
          treeId: String(tree._id),
          memberId: String(member._id)
        },
        session
      });

      const responsePayload = await buildMemberWithRelations(
        treeId,
        member._id,
        {
          childrenPage: 1,
          childrenLimit: DEFAULT_CHILDREN_LIMIT,
          spouseLimit: DEFAULT_SIDE_RELATION_LIMIT,
          siblingLimit: DEFAULT_SIDE_RELATION_LIMIT
        },
        session
      );

      if (ageWarnings.length) {
        responsePayload.warnings = ageWarnings;
      }

      return responsePayload;
    });

    res.status(201).json(payload);
  } catch (error) {
    handleKnownError(error, res, next);
  }
};

const updateMember = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const { treeId, memberId } = req.params;
    const relationOptions = parseRelationQueryOptions(req.query);
    const payload = await withMongoTransaction(async (session) => {
      const tree = await getTreeFromRequest(req, session);

      if (!tree) {
        throw notFound("Family tree not found.");
      }

      const member = await loadMemberInTree(treeId, memberId, session);
      if (!member) {
        throw notFound("Member not found.");
      }

      ensureRootOwnerCanEditMember(member, req.user);

      if (hasOwn(req.body, "name")) {
        const name = String(req.body.name || "").trim();
        if (!name) {
          throw badRequest("Name is required.");
        }

        member.name = name;
      }

      if (hasOwn(req.body, "note")) {
        member.note = String(req.body.note || "").trim();
      }

      if (hasOwn(req.body, "gender")) {
        const normalizedGender = String(req.body.gender || "unspecified").trim().toLowerCase() || "unspecified";
        member.gender = normalizedGender;
      }

      const birthDateInput = parseNullableDateInput(req.body.birthDate, "birthDate");
      if (birthDateInput.provided) {
        member.birthDate = birthDateInput.value;
      }

      const deathDateInput = parseNullableDateInput(req.body.deathDate, "deathDate");
      if (deathDateInput.provided) {
        member.deathDate = deathDateInput.value;
      }

      const metadataInput = parseMetadataInput(req.body.metadata);
      if (metadataInput.provided) {
        member.metadata = metadataInput.value;
      }

      if (req.file) {
        member.profileImage = toUploadPath(req.file.path);
      }

      const fatherInput = parseNullableIdInput(req.body.fatherId, "fatherId");
      const motherInput = parseNullableIdInput(req.body.motherId, "motherId");

      const nextFatherId = fatherInput.provided ? fatherInput.value : member.fatherId;
      const nextMotherId = motherInput.provided ? motherInput.value : member.motherId;

      await validateParentAssignment({
        treeId,
        memberId: member._id,
        fatherId: nextFatherId,
        motherId: nextMotherId,
        session,
        enforceGenderConstraints: fatherInput.provided || motherInput.provided
      });

      await ensureParentSpouseLinkForChild({
        treeId,
        fatherId: nextFatherId,
        motherId: nextMotherId,
        session
      });

      const ageWarnings = await collectParentAgeWarnings({
        treeId,
        fatherId: nextFatherId,
        motherId: nextMotherId,
        memberBirthDate: birthDateInput.provided ? birthDateInput.value : member.birthDate,
        session
      });

      if (fatherInput.provided) {
        member.fatherId = fatherInput.value;
      }

      if (motherInput.provided) {
        member.motherId = motherInput.value;
      }

      const spouseInput = parseSpouseIds(req.body.spouses);
      if (spouseInput.provided) {
        await syncSpouseLinks(treeId, member, spouseInput.values, session);
      }

      await member.save(sessionOptions(session));
      await rebuildDerivedRelations(treeId, session);

      const nextPayload = await buildMemberWithRelations(treeId, member._id, relationOptions, session);
      if (ageWarnings.length) {
        nextPayload.warnings = ageWarnings;
      }

      return nextPayload;
    });

    res.json(payload);
  } catch (error) {
    handleKnownError(error, res, next);
  }
};

const deleteMember = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const { treeId, memberId } = req.params;
    const subtree = String(req.query.subtree || "false").toLowerCase() === "true";

    const responsePayload = await withMongoTransaction(async (session) => {
      const tree = await getTreeFromRequest(req, session);
      if (!tree) {
        throw notFound("Family tree not found.");
      }

      const targetMember = await withSession(Member.findOne({ _id: memberId, treeId }), session)
        .select("_id isRoot linkedUserId fatherId motherId")
        .lean();
      if (!targetMember) {
        throw notFound("Member not found.");
      }

      ensureRootOwnerCanEditMember(targetMember, req.user);
      if (targetMember.isRoot) {
        throw forbidden("Root member cannot be deleted.");
      }

      const deleteIds = subtree
        ? await collectSubtreeMemberIds({ treeId, rootMemberId: targetMember._id, session })
        : [String(targetMember._id)];
      const deleteIdSet = new Set(deleteIds);

      if (!subtree) {
        const replacementParentId = normalizeId(targetMember.fatherId) || normalizeId(targetMember.motherId) || null;

        if (replacementParentId) {
          const parentChildren = await withSession(
            Member.find({
              treeId,
              $or: [{ fatherId: targetMember._id }, { motherId: targetMember._id }]
            }),
            session
          )
            .select("_id fatherId motherId")
            .lean();

          const relinkOps = parentChildren.map((child) => {
            const currentFather = normalizeId(child.fatherId);
            const currentMother = normalizeId(child.motherId);
            const nextFather =
              currentFather && currentFather === String(targetMember._id)
                ? currentMother === replacementParentId
                  ? null
                  : replacementParentId
                : currentFather;
            const nextMother =
              currentMother && currentMother === String(targetMember._id)
                ? currentFather === replacementParentId
                  ? null
                  : replacementParentId
                : currentMother;

            return {
              updateOne: {
                filter: { _id: child._id, treeId },
                update: {
                  $set: {
                    fatherId: nextFather || null,
                    motherId: nextMother || null
                  }
                }
              }
            };
          });

          if (relinkOps.length) {
            await Member.bulkWrite(relinkOps, { ordered: false, ...sessionOptions(session) });
          }
        }
      }

      await Promise.all([
        Member.updateMany({ treeId, fatherId: { $in: deleteIds } }, { $set: { fatherId: null } }, sessionOptions(session)),
        Member.updateMany({ treeId, motherId: { $in: deleteIds } }, { $set: { motherId: null } }, sessionOptions(session)),
        Member.updateMany(
          { treeId, spouses: { $in: deleteIds } },
          { $pull: { spouses: { $in: deleteIds } } },
          sessionOptions(session)
        ),
        Member.updateMany(
          { treeId, children: { $in: deleteIds } },
          { $pull: { children: { $in: deleteIds } } },
          sessionOptions(session)
        ),
        Member.updateMany(
          { treeId, siblings: { $in: deleteIds } },
          { $pull: { siblings: { $in: deleteIds } } },
          sessionOptions(session)
        )
      ]);

      await Member.deleteMany({ treeId, _id: { $in: deleteIds } }, sessionOptions(session));

      const currentRootMember = tree.rootMember || tree.rootMemberId || null;
      if (currentRootMember && deleteIdSet.has(String(currentRootMember))) {
        const fallbackRoot = await withSession(Member.findOne({ treeId }), session).sort({ createdAt: 1 }).select("_id").lean();
        tree.rootMember = fallbackRoot ? fallbackRoot._id : null;
        tree.rootMemberId = fallbackRoot ? fallbackRoot._id : null;
        await tree.save(sessionOptions(session));

        await Member.updateMany({ treeId, isRoot: true }, { $set: { isRoot: false } }, sessionOptions(session));
        if (fallbackRoot) {
          await Member.updateOne(
            { treeId, _id: fallbackRoot._id },
            { $set: { isRoot: true, linkedUserId: tree.owner } },
            sessionOptions(session)
          );
        }
      }

      await rebuildDerivedRelations(treeId, session);

      await createAuditLog({
        userId: req.user._id,
        action: "member_delete",
        entityType: "member",
        entityId: targetMember._id,
        metadata: {
          treeId: String(tree._id),
          subtree,
          deletedCount: deleteIds.length
        },
        session
      });

      return {
        message: "Member deleted successfully.",
        deletedCount: deleteIds.length,
        deletedIds: deleteIds,
        rootMember: tree.rootMember || tree.rootMemberId || null
      };
    });

    res.json(responsePayload);
  } catch (error) {
    handleKnownError(error, res, next);
  }
};

const listMembers = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const { treeId } = req.params;
    const tree = await getTreeFromRequest(req);

    if (!tree) {
      res.status(404).json({ message: "Family tree not found." });
      return;
    }

    const page = Math.max(Number.parseInt(String(req.query.page || "1"), 10), 1);
    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit || "20"), 10), 1), 100);
    const search = String(req.query.search || "").trim();

    const query = { treeId };
    if (search) {
      query.name = { $regex: escapeRegex(search), $options: "i" };
    }

    const total = await Member.countDocuments(query);
    const members = await Member.find(query)
      .sort({ createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({
      members,
      page,
      limit,
      total,
      hasMore: page * limit < total
    });
  } catch (error) {
    next(error);
  }
};

const getMemberWithRelations = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const treeId = String(req.params.treeId || "").trim();
    const memberId = String(req.params.memberId || "").trim();
    const tree = await getTreeFromRequest(req);

    if (!tree) {
      res.status(404).json({ message: "Family tree not found." });
      return;
    }

    if (!memberId || !mongoose.Types.ObjectId.isValid(memberId)) {
      res.status(404).json({ message: "Member not found." });
      return;
    }

    const relationOptions = parseRelationQueryOptions(req.query);
    const payload = await buildMemberWithRelations(treeId, memberId, relationOptions);

    if (!payload) {
      res.status(404).json({ message: "Member not found." });
      return;
    }

    res.json(payload);
  } catch (error) {
    handleKnownError(error, res, next);
  }
};

const updateMemberRelation = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const { treeId, memberId } = req.params;
    const action = parseRelationAction(req.body.action);
    const relation = parseMutationRelation(req.body.relation);
    const parentRole = parseParentRole(req.body.parentRole);
    const targetMemberId = normalizeId(req.body.targetMemberId);

    if (!targetMemberId || !mongoose.Types.ObjectId.isValid(targetMemberId)) {
      throw badRequest("targetMemberId must be a valid member id.");
    }

    const responsePayload = await withMongoTransaction(async (session) => {
      const tree = await getTreeFromRequest(req, session);

      if (!tree) {
        throw notFound("Family tree not found.");
      }

      const [sourceMember, targetMember] = await Promise.all([
        loadMemberInTree(treeId, memberId, session),
        loadMemberInTree(treeId, targetMemberId, session)
      ]);

      if (!sourceMember) {
        throw notFound("Source member not found.");
      }

      if (!targetMember) {
        throw notFound("Target member not found.");
      }

      ensureRootOwnerCanEditMember(sourceMember, req.user);
      ensureRootOwnerCanEditMember(targetMember, req.user);

      await mutateMemberRelation({
        treeId,
        sourceMember,
        targetMember,
        relation,
        action,
        parentRole,
        session
      });

      return buildRelationMutationResponse({
        treeId,
        sourceMemberId: sourceMember._id,
        relation,
        action,
        targetMemberId: targetMember._id,
        session
      });
    });

    res.json(responsePayload);
  } catch (error) {
    handleKnownError(error, res, next);
  }
};

const removeMemberRelation = async (req, res, next) => {
  try {
    const tree = await getTreeFromRequest(req);

    if (!tree) {
      res.status(404).json({ message: "Family tree not found." });
      return;
    }

    const memberId = normalizeId(req.body.memberId);
    const relatedMemberId = normalizeId(req.body.relatedMemberId);
    const relationType = parseRemoveRelationType(req.body.relationType);

    if (!memberId || !relatedMemberId) {
      throw badRequest("memberId and relatedMemberId are required.");
    }

    if (!mongoose.Types.ObjectId.isValid(memberId) || !mongoose.Types.ObjectId.isValid(relatedMemberId)) {
      throw badRequest("memberId and relatedMemberId must be valid ids.");
    }

    const [sourceMember, targetMember] = await Promise.all([
      loadMemberInTree(tree._id, memberId),
      loadMemberInTree(tree._id, relatedMemberId)
    ]);

    if (!sourceMember) {
      res.status(404).json({ message: "Source member not found." });
      return;
    }

    if (!targetMember) {
      res.status(404).json({ message: "Related member not found." });
      return;
    }

    ensureRootOwnerCanEditMember(sourceMember, req.user);
    ensureRootOwnerCanEditMember(targetMember, req.user);

    let relation = relationType;
    let parentRole = "auto";

    if (relationType === "parent") {
      const targetId = String(targetMember._id);
      if (sourceMember.fatherId && String(sourceMember.fatherId) === targetId) {
        relation = "father";
        parentRole = "father";
      } else if (sourceMember.motherId && String(sourceMember.motherId) === targetId) {
        relation = "mother";
        parentRole = "mother";
      } else {
        throw badRequest("Selected related member is not a parent of the selected member.");
      }
    }

    await mutateMemberRelation({
      treeId: String(tree._id),
      sourceMember,
      targetMember,
      relation,
      action: "disconnect",
      parentRole
    });

    const responsePayload = await buildRelationMutationResponse({
      treeId: String(tree._id),
      sourceMemberId: sourceMember._id,
      relation,
      action: "disconnect",
      targetMemberId: targetMember._id
    });

    res.json({
      ...responsePayload,
      message: "Relationship removed successfully."
    });
  } catch (error) {
    handleKnownError(error, res, next);
  }
};

const getMemberGraph = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const { treeId, memberId } = req.params;
    const tree = await getTreeFromRequest(req);

    if (!tree) {
      res.status(404).json({ message: "Family tree not found." });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(memberId)) {
      res.status(404).json({ message: "Member not found." });
      return;
    }

    const options = parseGraphQueryOptions(req.query);
    const focusMember = await Member.findOne({ _id: memberId, treeId }).lean();

    if (!focusMember) {
      res.status(404).json({ message: "Member not found." });
      return;
    }

    const visited = new Set([String(focusMember._id)]);
    const nodes = [focusMember];
    const links = [];
    const queue = [{ id: String(focusMember._id), depth: 0 }];

    const pushLink = (sourceId, targetId, relationType) => {
      const key = `${sourceId}:${targetId}:${relationType}`;
      links.push({
        key,
        sourceId,
        targetId,
        relation: relationType
      });
    };

    while (queue.length > 0 && visited.size < options.limit) {
      const current = queue.shift();
      if (!current) {
        continue;
      }

      if (current.depth >= options.depth) {
        continue;
      }

      const currentMember = await Member.findOne({ _id: current.id, treeId })
        .select("_id fatherId motherId spouses siblings")
        .lean();

      if (!currentMember) {
        continue;
      }

      const candidateIds = uniqueIds([
        currentMember.fatherId,
        currentMember.motherId,
        ...(currentMember.spouses || []),
        ...(currentMember.siblings || [])
      ]);

      const children = await Member.find({
        treeId,
        $or: [{ fatherId: currentMember._id }, { motherId: currentMember._id }]
      })
        .select("_id")
        .lean();

      for (const child of children) {
        candidateIds.push(String(child._id));
      }

      const uniqueCandidateIds = uniqueIds(candidateIds).slice(0, options.limit);
      if (!uniqueCandidateIds.length) {
        continue;
      }

      const relatedMembers = await Member.find({
        treeId,
        _id: { $in: uniqueCandidateIds }
      }).lean();

      const relatedMap = new Map(relatedMembers.map((member) => [String(member._id), member]));
      const currentId = String(currentMember._id);

      if (currentMember.fatherId) {
        const fatherId = String(currentMember.fatherId);
        if (relatedMap.has(fatherId)) {
          pushLink(currentId, fatherId, "father");
        }
      }

      if (currentMember.motherId) {
        const motherId = String(currentMember.motherId);
        if (relatedMap.has(motherId)) {
          pushLink(currentId, motherId, "mother");
        }
      }

      for (const spouseIdRaw of currentMember.spouses || []) {
        const spouseId = String(spouseIdRaw);
        if (relatedMap.has(spouseId)) {
          pushLink(currentId, spouseId, "spouse");
        }
      }

      for (const siblingIdRaw of currentMember.siblings || []) {
        const siblingId = String(siblingIdRaw);
        if (relatedMap.has(siblingId)) {
          pushLink(currentId, siblingId, "sibling");
        }
      }

      for (const relatedMember of relatedMembers) {
        const relatedId = String(relatedMember._id);

        if (
          (relatedMember.fatherId && String(relatedMember.fatherId) === currentId) ||
          (relatedMember.motherId && String(relatedMember.motherId) === currentId)
        ) {
          pushLink(currentId, relatedId, "child");
        }

        if (!visited.has(relatedId) && visited.size < options.limit) {
          visited.add(relatedId);
          nodes.push(relatedMember);
          queue.push({ id: relatedId, depth: current.depth + 1 });
        }
      }
    }

    const dedupedLinks = Array.from(new Map(links.map((link) => [link.key, link])).values());

    res.json({
      focusId: String(focusMember._id),
      depth: options.depth,
      limit: options.limit,
      nodes,
      links: dedupedLinks
    });
  } catch (error) {
    handleKnownError(error, res, next);
  }
};

module.exports = {
  createMember,
  updateMember,
  deleteMember,
  listMembers,
  getMemberWithRelations,
  updateMemberRelation,
  removeMemberRelation,
  getMemberGraph
};
