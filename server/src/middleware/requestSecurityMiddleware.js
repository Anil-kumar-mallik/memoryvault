const sanitizeHtml = require("xss");
const logger = require("../utils/logger");

const FORBIDDEN_KEY_PATTERN = /^\$|\.|\u0000/;
const SENSITIVE_FIELDS = new Set(["password", "treePassword", "token"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const sanitizeText = (value) =>
  sanitizeHtml(String(value), {
    whiteList: {},
    stripIgnoreTag: true,
    stripIgnoreTagBody: ["script"]
  });

const sanitizeValue = (value, currentKey = "") => {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, currentKey));
  }

  if (value && typeof value === "object" && !(value instanceof Date)) {
    const sanitized = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      if (FORBIDDEN_KEY_PATTERN.test(key)) {
        continue;
      }

      sanitized[key] = sanitizeValue(nestedValue, key);
    }

    return sanitized;
  }

  if (typeof value === "string") {
    if (SENSITIVE_FIELDS.has(currentKey)) {
      return value;
    }

    return sanitizeText(value);
  }

  return value;
};

const sanitizeRequest = (req, _res, next) => {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeValue(req.body);
  }

  if (req.query && typeof req.query === "object") {
    req.query = sanitizeValue(req.query);
  }

  if (req.params && typeof req.params === "object") {
    req.params = sanitizeValue(req.params);
  }

  next();
};

const normalizeOrigin = (value) => {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    return new URL(raw).origin;
  } catch (_error) {
    try {
      return new URL(`https://${raw}`).origin;
    } catch (_innerError) {
      return raw.replace(/\/+$/, "");
    }
  }
};

const createOriginGuard = ({ allowedOrigins = [], isProduction = false } = {}) => {
  const allowed = new Set((allowedOrigins || []).map((entry) => normalizeOrigin(entry)).filter(Boolean));

  return (req, res, next) => {
    if (!isProduction) {
      next();
      return;
    }

    if (SAFE_METHODS.has(req.method.toUpperCase())) {
      next();
      return;
    }

    const originHeader = req.headers.origin;
    const refererHeader = req.headers.referer;

    const normalizedOrigin = normalizeOrigin(originHeader);
    if (originHeader && !allowed.has(normalizedOrigin)) {
      logger.warn("Rejected origin by CSRF guard", {
        originHeader,
        normalizedOrigin,
        refererHeader: refererHeader || null,
        method: req.method,
        path: req.originalUrl
      });
      res.status(403).json({ message: "CSRF protection blocked this request (invalid origin)." });
      return;
    }

    if (!originHeader && refererHeader) {
      const refererOrigin = normalizeOrigin(refererHeader);
      if (!refererOrigin || !allowed.has(refererOrigin)) {
        logger.warn("Rejected referer by CSRF guard", {
          originHeader: originHeader || null,
          refererHeader,
          refererOrigin: refererOrigin || null,
          method: req.method,
          path: req.originalUrl
        });
        res.status(403).json({ message: "CSRF protection blocked this request (invalid referer)." });
        return;
      }
    }

    next();
  };
};

module.exports = {
  sanitizeRequest,
  createOriginGuard,
  sanitizeText
};
