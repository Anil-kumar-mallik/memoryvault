const sanitizeHtml = require("xss");

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

const createOriginGuard = (allowedOrigins) => {
  const allowed = new Set((allowedOrigins || []).filter(Boolean));

  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method.toUpperCase())) {
      next();
      return;
    }

    const originHeader = req.headers.origin;
    const refererHeader = req.headers.referer;

    if (originHeader && !allowed.has(originHeader)) {
      res.status(403).json({ message: "CSRF protection blocked this request (invalid origin)." });
      return;
    }

    if (!originHeader && refererHeader) {
      try {
        const refererOrigin = new URL(refererHeader).origin;
        if (!allowed.has(refererOrigin)) {
          res.status(403).json({ message: "CSRF protection blocked this request (invalid referer)." });
          return;
        }
      } catch (_error) {
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
