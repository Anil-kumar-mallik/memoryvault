const path = require("path");
const User = require("../models/User");
const FamilyTree = require("../models/FamilyTree");
const Member = require("../models/Member");
const Subscription = require("../models/Subscription");
const Notification = require("../models/Notification");
const AuditLog = require("../models/AuditLog");
const validateRequest = require("../utils/validateRequest");
const withMongoTransaction = require("../utils/withMongoTransaction");
const { sanitizeText } = require("../middleware/requestSecurityMiddleware");
const {
  USER_PROFILE_TEXT_FIELDS,
  parseOptionalDateValue,
  normalizeOptionalTextValue
} = require("../utils/userProfileFields");

const sessionOptions = (session) => (session ? { session } : {});
const withSession = (query, session) => (session ? query.session(session) : query);
const toUploadPath = (absoluteFilePath) => `/uploads/${path.basename(absoluteFilePath)}`;
const hasOwn = (source, key) => Object.prototype.hasOwnProperty.call(source, key);

const toSafeAccount = (user) => ({
  _id: String(user._id),
  name: user.name,
  email: user.email,
  profileImage: user.profileImage || null,
  dateOfBirth: user.dateOfBirth || null,
  education: user.education || null,
  qualification: user.qualification || null,
  designation: user.designation || null,
  addressPermanent: user.addressPermanent || null,
  addressCurrent: user.addressCurrent || null,
  phoneNumber: user.phoneNumber || null,
  role: user.role,
  isEmailVerified: Boolean(user.isEmailVerified),
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

const getAccount = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const account = await User.findById(req.user._id).lean();
    if (!account) {
      res.status(404).json({ message: "Account not found." });
      return;
    }

    res.json(toSafeAccount(account));
  } catch (error) {
    next(error);
  }
};

const updateAccount = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const hasNameInput = hasOwn(req.body, "name");
    const hasProfileImage = Boolean(req.file && req.file.path);
    const hasDateOfBirthInput = hasOwn(req.body, "dateOfBirth");
    const hasTextProfileInput = USER_PROFILE_TEXT_FIELDS.some((field) => hasOwn(req.body, field));

    if (!hasNameInput && !hasProfileImage && !hasDateOfBirthInput && !hasTextProfileInput) {
      const account = await User.findById(req.user._id).lean();
      if (!account) {
        res.status(404).json({ message: "Account not found." });
        return;
      }

      res.json(toSafeAccount(account));
      return;
    }

    const updatedAccount = await withMongoTransaction(async (session) => {
      const user = await withSession(User.findById(req.user._id), session);
      if (!user) {
        const error = new Error("Account not found.");
        error.statusCode = 404;
        throw error;
      }

      const rootMemberUpdate = {};

      if (hasNameInput) {
        const nextName = sanitizeText(String(req.body.name || "").trim());
        if (!nextName) {
          const error = new Error("Name is required.");
          error.statusCode = 400;
          throw error;
        }

        user.name = nextName;
        rootMemberUpdate.name = nextName;
      }

      if (hasProfileImage) {
        const nextProfileImage = toUploadPath(req.file.path);
        user.profileImage = nextProfileImage;
        rootMemberUpdate.profileImage = nextProfileImage;
      }

      if (hasDateOfBirthInput) {
        user.dateOfBirth = parseOptionalDateValue(req.body.dateOfBirth);
      }

      for (const field of USER_PROFILE_TEXT_FIELDS) {
        if (hasOwn(req.body, field)) {
          user[field] = normalizeOptionalTextValue(req.body[field]);
        }
      }

      await user.save(sessionOptions(session));

      if (Object.keys(rootMemberUpdate).length > 0) {
        await Member.updateMany(
          { linkedUserId: user._id, isRoot: true },
          { $set: rootMemberUpdate },
          sessionOptions(session)
        );
      }

      return toSafeAccount(user);
    });

    res.json(updatedAccount);
  } catch (error) {
    if (error && typeof error.statusCode === "number") {
      res.status(error.statusCode).json({ message: error.message });
      return;
    }
    next(error);
  }
};

const updateAccountPassword = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");

    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404).json({ message: "Account not found." });
      return;
    }

    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      res.status(401).json({ message: "Current password is incorrect." });
      return;
    }

    user.password = newPassword;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.activeTokenId = null;
    user.csrfTokenHash = null;
    await user.save();

    res.json({
      message: "Password updated successfully. Please log in again."
    });
  } catch (error) {
    next(error);
  }
};

const deleteAccount = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const currentPassword = String(req.body.currentPassword || "");

    const deletionSummary = await withMongoTransaction(async (session) => {
      const user = await withSession(User.findById(req.user._id), session);
      if (!user) {
        const error = new Error("Account not found.");
        error.statusCode = 404;
        throw error;
      }

      const isCurrentPasswordValid = await user.comparePassword(currentPassword);
      if (!isCurrentPasswordValid) {
        const error = new Error("Current password is incorrect.");
        error.statusCode = 401;
        throw error;
      }

      const ownedTrees = await withSession(FamilyTree.find({ owner: user._id }).select("_id").lean(), session);
      const ownedTreeIds = ownedTrees.map((tree) => tree._id);

      let deletedMembers = 0;
      let deletedTrees = 0;

      if (ownedTreeIds.length > 0) {
        const deletedMembersResult = await Member.deleteMany({ treeId: { $in: ownedTreeIds } }, sessionOptions(session));
        deletedMembers = deletedMembersResult.deletedCount || 0;

        const deletedTreesResult = await FamilyTree.deleteMany({ _id: { $in: ownedTreeIds } }, sessionOptions(session));
        deletedTrees = deletedTreesResult.deletedCount || 0;
      }

      const unlinkedRootMembersResult = await Member.updateMany(
        { linkedUserId: user._id },
        { $set: { linkedUserId: null } },
        sessionOptions(session)
      );

      await Promise.all([
        Subscription.deleteMany({ userId: user._id }, sessionOptions(session)),
        Notification.deleteMany({ userId: user._id }, sessionOptions(session)),
        AuditLog.updateMany({ userId: user._id }, { $set: { userId: null } }, sessionOptions(session)),
        User.deleteOne({ _id: user._id }, sessionOptions(session))
      ]);

      return {
        deletedTrees,
        deletedMembers,
        unlinkedRootMembers: unlinkedRootMembersResult.modifiedCount || 0
      };
    });

    res.json({
      message: "Account deleted successfully.",
      ...deletionSummary
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
  getAccount,
  updateAccount,
  updateAccountPassword,
  deleteAccount
};
