const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const getTokenFromRequest = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.split(" ")[1];
};

const hashToken = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const resolveUserFromToken = async (token) => {
  if (!token) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: process.env.JWT_ISSUER || "memoryvault-api",
      audience: process.env.JWT_AUDIENCE || "memoryvault-client"
    });

    if (!decoded?.id || typeof decoded.tv !== "number" || !decoded.jti) {
      return null;
    }

    const user = await User.findById(decoded.id)
      .select("name email profileImage role createdAt updatedAt tokenVersion activeTokenId csrfTokenHash")
      .lean();

    if (!user) {
      return null;
    }

    if (user.tokenVersion !== decoded.tv) {
      return null;
    }

    if (!user.activeTokenId || !safeEqual(user.activeTokenId, decoded.jti)) {
      return null;
    }

    return { user, decoded };
  } catch (_error) {
    return null;
  }
};

const protect = async (req, res, next) => {
  const token = getTokenFromRequest(req);

  if (!token) {
    res.status(401).json({ message: "Not authorized. Token is missing." });
    return;
  }

  const resolved = await resolveUserFromToken(token);
  if (!resolved) {
    res.status(401).json({ message: "Not authorized. Token is invalid or expired." });
    return;
  }

  if (!SAFE_METHODS.has(req.method.toUpperCase())) {
    const csrfToken = req.headers["x-csrf-token"];
    if (!csrfToken || typeof csrfToken !== "string") {
      res.status(403).json({ message: "CSRF token is required for this action." });
      return;
    }

    if (!resolved.user.csrfTokenHash || !safeEqual(hashToken(csrfToken), resolved.user.csrfTokenHash)) {
      res.status(403).json({ message: "Invalid CSRF token." });
      return;
    }
  }

  req.user = resolved.user;
  req.auth = {
    tokenId: resolved.decoded.jti,
    tokenVersion: resolved.decoded.tv
  };
  next();
};

const optionalAuth = async (req, _res, next) => {
  const token = getTokenFromRequest(req);

  if (!token) {
    next();
    return;
  }

  const resolved = await resolveUserFromToken(token);
  if (resolved) {
    req.user = resolved.user;
    req.auth = {
      tokenId: resolved.decoded.jti,
      tokenVersion: resolved.decoded.tv
    };
  }

  next();
};

const authorizeRoles = (...roles) => (req, res, next) => {
  if (!req.user) {
    res.status(401).json({ message: "Not authorized. User is missing." });
    return;
  }

  if (!roles.includes(req.user.role)) {
    res.status(403).json({ message: "Forbidden. Insufficient role permission." });
    return;
  }

  next();
};

module.exports = { protect, optionalAuth, authorizeRoles };
