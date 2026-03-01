const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const FamilyTree = require("../models/FamilyTree");
const Member = require("../models/Member");
const validateRequest = require("../utils/validateRequest");
const withMongoTransaction = require("../utils/withMongoTransaction");
const { isOwnerOrAdmin } = require("../middleware/treeAccessMiddleware");
const { ensureTreeCreateAllowed, getSubscriptionStateForUser } = require("../utils/subscriptionService");
const { generateUniqueTreeSlug } = require("../utils/treeSlug");
const { createAuditLog } = require("../utils/auditLogger");
const { createNotification } = require("../utils/notificationService");
const logger = require("../utils/logger");

const parseBoolean = (value) => value === true || value === "true" || value === 1 || value === "1";
const sessionOptions = (session) => (session ? { session } : {});
const normalizeLegacyId = (value) => (value === undefined || value === null ? null : String(value).trim() || null);
const dedupeStrings = (values = []) => Array.from(new Set(values.map((item) => String(item)).filter(Boolean)));
const getTreeRootMemberId = (tree) => (tree ? tree.rootMember || tree.rootMemberId || null : null);

const ensureTreeRootMember = async (tree, session = null) => {
  let rootMemberId = getTreeRootMemberId(tree);
  if (rootMemberId) {
    return rootMemberId;
  }

  const fallbackMember = await Member.findOne({ treeId: tree._id }).sort({ createdAt: 1, _id: 1 }).select("_id").lean();
  if (!fallbackMember) {
    return null;
  }

  rootMemberId = fallbackMember._id;

  if (typeof tree.save === "function") {
    tree.rootMember = rootMemberId;
    tree.rootMemberId = rootMemberId;
    await tree.save(sessionOptions(session));
  } else {
    await FamilyTree.updateOne(
      { _id: tree._id },
      { $set: { rootMember: rootMemberId, rootMemberId } },
      sessionOptions(session)
    );
    tree.rootMember = rootMemberId;
    tree.rootMemberId = rootMemberId;
  }

  await Promise.all([
    Member.updateMany(
      { treeId: tree._id, isRoot: true, _id: { $ne: rootMemberId } },
      { $set: { isRoot: false } },
      sessionOptions(session)
    ),
    Member.updateOne(
      { treeId: tree._id, _id: rootMemberId },
      { $set: { isRoot: true, linkedUserId: tree.owner || null } },
      sessionOptions(session)
    )
  ]);

  return rootMemberId;
};

const ensureTreeHasSlug = async (tree, session = null) => {
  if (tree.slug) {
    return tree.slug;
  }

  const slug = await generateUniqueTreeSlug({
    name: tree.name,
    excludeTreeId: tree._id,
    session
  });

  if (typeof tree.save === "function") {
    tree.slug = slug;
    await tree.save(sessionOptions(session));
  } else {
    await FamilyTree.updateOne({ _id: tree._id }, { $set: { slug } }, sessionOptions(session));
    tree.slug = slug;
  }

  return slug;
};

const buildTreeViewPayload = async (tree, user) => {
  await ensureTreeHasSlug(tree);

  const memberCount = await Member.countDocuments({ treeId: tree._id });
  let initialFocusMember = await ensureTreeRootMember(tree);

  if (!initialFocusMember && memberCount > 0) {
    const fallbackMember = await Member.findOne({ treeId: tree._id }).sort({ createdAt: 1 }).select("_id").lean();
    initialFocusMember = fallbackMember ? fallbackMember._id : null;
  }

  return {
    ...toSafeTree(tree),
    memberCount,
    initialFocusMember,
    canEdit: isOwnerOrAdmin(user, tree)
  };
};

const toSafeTree = (tree) => {
  const raw = typeof tree.toObject === "function" ? tree.toObject() : { ...tree };
  delete raw.accessPassword;
  delete raw.passwordHash;

  if (!raw.privacy && typeof raw.isPrivate === "boolean") {
    raw.privacy = raw.isPrivate ? "private" : "public";
  }

  if (!raw.privacy) {
    raw.privacy = "private";
  }

  if (typeof raw.isPrivate !== "boolean") {
    raw.isPrivate = raw.privacy === "private";
  }

  const normalizedRootMember = raw.rootMember || raw.rootMemberId || null;
  raw.rootMember = normalizedRootMember;
  raw.rootMemberId = normalizedRootMember;

  return raw;
};

const createTree = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const name = String(req.body.name || "").trim();
    const description = String(req.body.description || "").trim();
    const hasIsPrivateInput = Object.prototype.hasOwnProperty.call(req.body, "isPrivate");
    const privacy = hasIsPrivateInput
      ? parseBoolean(req.body.isPrivate)
        ? "private"
        : "public"
      : req.body.privacy === "public"
        ? "public"
        : "private";
    const treePassword = String(req.body.treePassword || req.body.accessPassword || "").trim();

    if (!name) {
      res.status(400).json({ message: "Tree name is required." });
      return;
    }

    if (privacy === "private" && !treePassword) {
      res.status(400).json({ message: "Tree password is required for private trees." });
      return;
    }

    const ownerName = String(req.user?.name || "").trim() || "Root Member";

    const payload = await withMongoTransaction(async (session) => {
      await ensureTreeCreateAllowed(req.user._id, session);
      const slug = await generateUniqueTreeSlug({ name, session });
      const passwordHash = privacy === "private" ? await bcrypt.hash(treePassword, 10) : null;

      const treeDocs = await FamilyTree.create(
        [
          {
            name,
            slug,
            description,
            privacy,
            passwordHash,
            isPrivate: privacy === "private",
            accessPassword: passwordHash,
            owner: req.user._id,
            rootMember: null,
            rootMemberId: null
          }
        ],
        { session }
      );
      const tree = treeDocs[0];

      const memberDocs = await Member.create(
        [
          {
            treeId: tree._id,
            createdBy: req.user._id,
            name: ownerName,
            fatherId: null,
            motherId: null,
            spouses: [],
            children: [],
            siblings: [],
            isRoot: true,
            linkedUserId: req.user._id
          }
        ],
        { session }
      );
      const rootMember = memberDocs[0];

      tree.rootMember = rootMember._id;
      tree.rootMemberId = rootMember._id;
      await tree.save(sessionOptions(session));

      await createAuditLog({
        userId: req.user._id,
        action: "tree_create",
        entityType: "tree",
        entityId: tree._id,
        metadata: {
          privacy,
          slug: tree.slug
        },
        session
      });

      return {
        tree,
        rootMemberId: rootMember._id
      };
    });

    res.status(201).json({
      ...toSafeTree(payload.tree),
      memberCount: 1,
      initialFocusMember: payload.rootMemberId,
      canEdit: true
    });
  } catch (error) {
    if (error && typeof error.statusCode === "number") {
      res.status(error.statusCode).json({ message: error.message });
      return;
    }
    next(error);
  }
};

const getMyTrees = async (req, res, next) => {
  try {
    const query = req.user.role === "admin" ? {} : { owner: req.user._id };

    const trees = await FamilyTree.find(query)
      .populate("owner", "_id name email role")
      .sort({ createdAt: -1 })
      .lean();

    const withCounts = [];
    for (const tree of trees) {
      if (!tree.slug) {
        tree.slug = await generateUniqueTreeSlug({
          name: tree.name,
          excludeTreeId: tree._id
        });
        await FamilyTree.updateOne({ _id: tree._id }, { $set: { slug: tree.slug } });
      }

      const memberCount = await Member.countDocuments({ treeId: tree._id });
      const safeTree = toSafeTree(tree);
      withCounts.push({
        ...safeTree,
        memberCount,
        canEdit: isOwnerOrAdmin(req.user, tree)
      });
    }

    res.json(withCounts);
  } catch (error) {
    next(error);
  }
};

const getTreeById = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const payload = await buildTreeViewPayload(req.tree, req.user);
    res.json(payload);
  } catch (error) {
    next(error);
  }
};

const getTreeBySlug = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const payload = await buildTreeViewPayload(req.tree, req.user);
    res.json(payload);
  } catch (error) {
    next(error);
  }
};

const updateTreeSettings = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const tree = req.tree;
    const previousPrivacy = tree.privacy;

    if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
      const name = String(req.body.name || "").trim();
      if (!name) {
        res.status(400).json({ message: "Tree name is required." });
        return;
      }

      tree.name = name;
      if (!tree.slug) {
        tree.slug = await generateUniqueTreeSlug({
          name,
          excludeTreeId: tree._id
        });
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "description")) {
      tree.description = String(req.body.description || "").trim();
    }

    const hasPrivacyInput = Object.prototype.hasOwnProperty.call(req.body, "privacy");
    const hasIsPrivateInput = Object.prototype.hasOwnProperty.call(req.body, "isPrivate");
    const hasPasswordInput = Object.prototype.hasOwnProperty.call(req.body, "treePassword");
    const hasAccessPasswordInput = Object.prototype.hasOwnProperty.call(req.body, "accessPassword");

    if (hasPrivacyInput || hasIsPrivateInput) {
      const privacy = hasIsPrivateInput
        ? parseBoolean(req.body.isPrivate)
          ? "private"
          : "public"
        : req.body.privacy === "public"
          ? "public"
          : req.body.privacy === "private"
            ? "private"
            : null;

      if (!privacy) {
        res.status(400).json({ message: "Invalid privacy type." });
        return;
      }

      tree.privacy = privacy;
      tree.isPrivate = privacy === "private";
    }

    if (hasPasswordInput || hasAccessPasswordInput) {
      const treePassword = String(req.body.treePassword || req.body.accessPassword || "").trim();
      if (treePassword) {
        tree.passwordHash = await bcrypt.hash(treePassword, 10);
        tree.accessPassword = tree.passwordHash;
      } else if (tree.privacy === "private") {
        res.status(400).json({ message: "Private tree must have a password." });
        return;
      } else {
        tree.passwordHash = null;
        tree.accessPassword = null;
      }
    }

    if (tree.privacy === "private" && !tree.passwordHash && !tree.accessPassword) {
      res.status(400).json({ message: "Private tree must have a password." });
      return;
    }

    if (tree.privacy === "public") {
      tree.passwordHash = null;
      tree.accessPassword = null;
    }

    await tree.save();

    if (previousPrivacy !== "public" && tree.privacy === "public") {
      await ensureTreeHasSlug(tree);
      await createNotification({
        userId: tree.owner,
        message: `Tree shared publicly: ${tree.name}`,
        metadata: {
          type: "tree_shared_publicly",
          treeId: String(tree._id),
          slug: tree.slug || null
        }
      });
    }

    const memberCount = await Member.countDocuments({ treeId: tree._id });

    res.json({
      ...toSafeTree(tree),
      memberCount,
      canEdit: true
    });
  } catch (error) {
    next(error);
  }
};

const deleteTree = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const tree = req.tree;
    const treeId = String(tree._id);
    const payload = await withMongoTransaction(async (session) => {
      const txTree = await FamilyTree.findById(tree._id).session(session);
      if (!txTree) {
        const error = new Error("Family tree not found.");
        error.statusCode = 404;
        throw error;
      }

      const deletedMembersResult = await Member.deleteMany({ treeId }, sessionOptions(session));
      await FamilyTree.deleteOne({ _id: txTree._id }, sessionOptions(session));

      return {
        message: "Tree deleted successfully.",
        treeId,
        deletedMembers: deletedMembersResult.deletedCount || 0
      };
    });

    logger.info("Tree deleted", {
      userId: req.user ? String(req.user._id) : null,
      treeId: payload.treeId,
      deletedMembers: payload.deletedMembers
    });

    res.json(payload);
  } catch (error) {
    next(error);
  }
};

const exportFullTree = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const tree = req.tree;
    const members = await Member.find({ treeId: tree._id }).sort({ createdAt: 1 }).lean();

    res.json({
      exportedAt: new Date().toISOString(),
      tree: {
        legacyTreeId: String(tree._id),
        name: tree.name,
        description: tree.description || "",
        privacy: tree.privacy || "private",
        slug: tree.slug || null,
        rootLegacyId: getTreeRootMemberId(tree) ? String(getTreeRootMemberId(tree)) : null
      },
      members: members.map((member) => ({
        legacyId: String(member._id),
        name: member.name,
        note: member.note || "",
        profileImage: member.profileImage || null,
        gender: member.gender || "unspecified",
        birthDate: member.birthDate || null,
        deathDate: member.deathDate || null,
        metadata: member.metadata || {},
        bio: member.bio || "",
        fatherLegacyId: member.fatherId ? String(member.fatherId) : null,
        motherLegacyId: member.motherId ? String(member.motherId) : null,
        spouseLegacyIds: (member.spouses || []).map((id) => String(id)),
        childrenLegacyIds: (member.children || []).map((id) => String(id)),
        siblingLegacyIds: (member.siblings || []).map((id) => String(id)),
        createdAt: member.createdAt,
        updatedAt: member.updatedAt
      }))
    });
  } catch (error) {
    next(error);
  }
};

const importTree = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const treeInput = req.body.tree || {};
    const membersInput = Array.isArray(req.body.members) ? req.body.members : [];

    if (!membersInput.length) {
      res.status(400).json({ message: "Import payload must include members." });
      return;
    }

    const created = await withMongoTransaction(async (session) => {
      const subscriptionState = await ensureTreeCreateAllowed(req.user._id, session);
      const availableMemberSlots = Math.max(subscriptionState.usage.maxMembers - subscriptionState.usage.membersUsed, 0);
      if (membersInput.length > availableMemberSlots) {
        const error = new Error("Member import exceeds current plan member limit.");
        error.statusCode = 403;
        throw error;
      }

      const name = String(treeInput.name || "").trim();
      const description = String(treeInput.description || "").trim();
      const privacy = treeInput.privacy === "public" ? "public" : "private";
      const treePassword = String(treeInput.treePassword || "").trim();

      if (!name) {
        const error = new Error("Tree name is required for import.");
        error.statusCode = 400;
        throw error;
      }

      if (privacy === "private" && !treePassword) {
        const error = new Error("Private imported trees require a treePassword.");
        error.statusCode = 400;
        throw error;
      }

      const slug = await generateUniqueTreeSlug({ name, session });
      const passwordHash = privacy === "private" ? await bcrypt.hash(treePassword, 10) : null;

      const treeDocs = await FamilyTree.create(
        [
          {
            name,
            description,
            privacy,
            isPrivate: privacy === "private",
            passwordHash,
            accessPassword: passwordHash,
            slug,
            owner: req.user._id,
            rootMember: null,
            rootMemberId: null
          }
        ],
        { session }
      );
      const importedTree = treeDocs[0];

      const legacyToNewId = new Map();
      const normalizedMembers = [];

      for (const memberInput of membersInput) {
        const legacyId = normalizeLegacyId(memberInput.legacyId);
        const memberName = String(memberInput.name || "").trim();

        if (!legacyId || !memberName) {
          const error = new Error("Each member must include legacyId and name.");
          error.statusCode = 400;
          throw error;
        }

        if (legacyToNewId.has(legacyId)) {
          const error = new Error(`Duplicate legacyId found: ${legacyId}`);
          error.statusCode = 400;
          throw error;
        }

        legacyToNewId.set(legacyId, new mongoose.Types.ObjectId());
        normalizedMembers.push({
          legacyId,
          memberInput,
          memberName
        });
      }

      const ensureReference = (legacyReference, fieldLabel) => {
        const normalized = normalizeLegacyId(legacyReference);
        if (!normalized) {
          return null;
        }

        if (!legacyToNewId.has(normalized)) {
          const error = new Error(`Invalid ${fieldLabel} reference in import payload: ${normalized}`);
          error.statusCode = 400;
          throw error;
        }

        return normalized;
      };

      const importedMembers = normalizedMembers.map(({ legacyId, memberInput, memberName }) => {
        const fatherLegacyId = ensureReference(memberInput.fatherLegacyId, "fatherLegacyId");
        const motherLegacyId = ensureReference(memberInput.motherLegacyId, "motherLegacyId");
        const spouseLegacyIds = dedupeStrings((memberInput.spouseLegacyIds || []).map((id) => ensureReference(id, "spouseLegacyIds")));
        const childrenLegacyIds = dedupeStrings((memberInput.childrenLegacyIds || []).map((id) => ensureReference(id, "childrenLegacyIds")));
        const siblingLegacyIds = dedupeStrings((memberInput.siblingLegacyIds || []).map((id) => ensureReference(id, "siblingLegacyIds")));

        return {
          _id: legacyToNewId.get(legacyId),
          treeId: importedTree._id,
          createdBy: req.user._id,
          name: memberName,
          note: String(memberInput.note || "").trim(),
          profileImage: memberInput.profileImage ? String(memberInput.profileImage) : null,
          gender: memberInput.gender || "unspecified",
          birthDate: memberInput.birthDate ? new Date(memberInput.birthDate) : null,
          deathDate: memberInput.deathDate ? new Date(memberInput.deathDate) : null,
          metadata: memberInput.metadata && typeof memberInput.metadata === "object" ? memberInput.metadata : {},
          bio: String(memberInput.bio || "").trim(),
          fatherId: fatherLegacyId ? legacyToNewId.get(fatherLegacyId) : null,
          motherId: motherLegacyId ? legacyToNewId.get(motherLegacyId) : null,
          spouses: spouseLegacyIds.filter((id) => id !== legacyId).map((id) => legacyToNewId.get(id)),
          children: childrenLegacyIds.filter((id) => id !== legacyId).map((id) => legacyToNewId.get(id)),
          siblings: siblingLegacyIds.filter((id) => id !== legacyId).map((id) => legacyToNewId.get(id))
        };
      });

      await Member.insertMany(importedMembers, { session, ordered: true });

      const rootLegacyId = normalizeLegacyId(treeInput.rootLegacyId);
      const mappedRootId = rootLegacyId && legacyToNewId.has(rootLegacyId)
        ? legacyToNewId.get(rootLegacyId)
        : importedMembers[0]?._id || null;

      importedTree.rootMember = mappedRootId;
      importedTree.rootMemberId = mappedRootId;
      await importedTree.save(sessionOptions(session));

      if (mappedRootId) {
        await Member.updateMany({ treeId: importedTree._id, isRoot: true }, { $set: { isRoot: false } }, sessionOptions(session));
        await Member.updateOne(
          { treeId: importedTree._id, _id: mappedRootId },
          { $set: { isRoot: true, linkedUserId: req.user._id } },
          sessionOptions(session)
        );
      }

      await createAuditLog({
        userId: req.user._id,
        action: "tree_import",
        entityType: "tree",
        entityId: importedTree._id,
        metadata: {
          importedMembers: importedMembers.length,
          privacy
        },
        session
      });

      const stateAfterImport = await getSubscriptionStateForUser(req.user._id, session);

      return {
        treeId: String(importedTree._id),
        slug: importedTree.slug || null,
        importedMembers: importedMembers.length,
        rootMember: mappedRootId ? String(mappedRootId) : null,
        subscriptionUsage: stateAfterImport.usage
      };
    });

    res.status(201).json({
      message: "Tree imported successfully.",
      ...created
    });
  } catch (error) {
    if (error && typeof error.statusCode === "number") {
      res.status(error.statusCode).json({ message: error.message });
      return;
    }
    next(error);
  }
};

module.exports = {
  createTree,
  getMyTrees,
  getTreeById,
  getTreeBySlug,
  updateTreeSettings,
  deleteTree,
  exportFullTree,
  importTree
};
