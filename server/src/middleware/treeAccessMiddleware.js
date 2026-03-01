const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const FamilyTree = require("../models/FamilyTree");

const isOwnerOrAdmin = (user, tree) => {
  if (!user || !tree) {
    return false;
  }

  return String(tree.owner) === String(user._id) || user.role === "admin";
};

const extractTreePassword = (req) => {
  const headerPassword = req.headers["x-tree-password"];
  if (headerPassword) {
    return String(headerPassword);
  }

  if (req.query && req.query.treePassword) {
    return String(req.query.treePassword);
  }

  if (req.body && req.body.treePassword) {
    return String(req.body.treePassword);
  }

  return null;
};

const extractTreeAccessToken = (req) => {
  const headerToken = req.headers["x-tree-access-token"];
  if (headerToken) {
    return String(headerToken);
  }

  if (req.query && req.query.treeAccessToken) {
    return String(req.query.treeAccessToken);
  }

  if (req.body && req.body.treeAccessToken) {
    return String(req.body.treeAccessToken);
  }

  return null;
};

const resolveTreeHash = (tree) => tree.passwordHash || tree.accessPassword || null;

const issueTreeAccessToken = (treeId) => {
  if (!process.env.JWT_SECRET) {
    return null;
  }

  return jwt.sign(
    {
      sub: String(treeId),
      purpose: "tree-access"
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.TREE_ACCESS_TOKEN_TTL || "20m",
      issuer: process.env.JWT_ISSUER || "memoryvault-api",
      audience: process.env.JWT_TREE_ACCESS_AUDIENCE || "memoryvault-tree-access"
    }
  );
};

const verifyTreeAccessToken = (token, treeId) => {
  if (!token || !process.env.JWT_SECRET) {
    return false;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: process.env.JWT_ISSUER || "memoryvault-api",
      audience: process.env.JWT_TREE_ACCESS_AUDIENCE || "memoryvault-tree-access"
    });

    return decoded?.purpose === "tree-access" && String(decoded.sub) === String(treeId);
  } catch (_error) {
    return false;
  }
};

const validateTreeAccess = async (req, res, next) => {
  const tree = req.tree;

  if (!tree) {
    res.status(500).json({ message: "Tree context is missing." });
    return;
  }

  const isPrivate = tree.privacy === "private" || tree.isPrivate === true;

  if (!isPrivate || isOwnerOrAdmin(req.user, tree)) {
    req.treeAccess = {
      canWrite: isOwnerOrAdmin(req.user, tree),
      canRead: true,
      passwordVerified: false
    };
    next();
    return;
  }

  const accessToken = extractTreeAccessToken(req);
  if (verifyTreeAccessToken(accessToken, tree._id)) {
    req.treeAccess = {
      canWrite: false,
      canRead: true,
      passwordVerified: true
    };
    req.treeAccessToken = accessToken;
    next();
    return;
  }

  const suppliedPassword = extractTreePassword(req);
  if (!suppliedPassword) {
    res.status(403).json({ message: "Tree is private. Password is required." });
    return;
  }

  const storedHash = resolveTreeHash(tree);
  if (!storedHash) {
    res.status(403).json({ message: "Tree is private but password is not configured." });
    return;
  }

  const isMatch = await bcrypt.compare(suppliedPassword, storedHash);
  if (!isMatch) {
    res.status(403).json({ message: "Invalid tree password." });
    return;
  }

  const issuedToken = issueTreeAccessToken(tree._id);
  if (issuedToken) {
    res.set("x-tree-access-token", issuedToken);
    req.treeAccessToken = issuedToken;
  }

  req.treeAccess = {
    canWrite: false,
    canRead: true,
    passwordVerified: true
  };

  next();
};

const attachTreeContext = async (req, res, next) => {
  const { treeId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(treeId)) {
    res.status(400).json({ message: "Invalid tree id." });
    return;
  }

  const tree = await FamilyTree.findById(treeId);
  if (!tree) {
    res.status(404).json({ message: "Family tree not found." });
    return;
  }

  req.tree = tree;
  next();
};

const attachTreeContextBySlug = async (req, res, next) => {
  const slug = String(req.params.slug || "")
    .toLowerCase()
    .trim();

  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    res.status(400).json({ message: "Invalid tree slug." });
    return;
  }

  const tree = await FamilyTree.findOne({ slug });
  if (!tree) {
    res.status(404).json({ message: "Family tree not found." });
    return;
  }

  req.tree = tree;
  req.params.treeId = String(tree._id);
  next();
};

const requireTreeReadAccess = validateTreeAccess;

const requireTreeWriteAccess = (req, res, next) => {
  const tree = req.tree;

  if (!tree) {
    res.status(500).json({ message: "Tree context is missing." });
    return;
  }

  if (!req.user) {
    res.status(401).json({ message: "Not authorized. Token is missing." });
    return;
  }

  if (!isOwnerOrAdmin(req.user, tree)) {
    res.status(403).json({ message: "Forbidden. Only tree owner or admin can modify this tree." });
    return;
  }

  req.treeAccess = {
    canWrite: true,
    canRead: true,
    passwordVerified: false
  };

  next();
};

const requireTreeOwnerAccess = (req, res, next) => {
  const tree = req.tree;

  if (!tree) {
    res.status(500).json({ message: "Tree context is missing." });
    return;
  }

  if (!req.user) {
    res.status(401).json({ message: "Not authorized. Token is missing." });
    return;
  }

  if (String(tree.owner) !== String(req.user._id)) {
    res.status(403).json({ message: "Forbidden. Only tree owner can modify this tree." });
    return;
  }

  req.treeAccess = {
    canWrite: true,
    canRead: true,
    passwordVerified: false
  };

  next();
};

const mapTreeIdParam = (sourceParam = "id") => (req, _res, next) => {
  if (!req.params.treeId && req.params[sourceParam]) {
    req.params.treeId = req.params[sourceParam];
  }

  next();
};

module.exports = {
  attachTreeContext,
  attachTreeContextBySlug,
  validateTreeAccess,
  requireTreeReadAccess,
  requireTreeWriteAccess,
  requireTreeOwnerAccess,
  mapTreeIdParam,
  isOwnerOrAdmin
};
