const express = require("express");
const cors = require("cors");
const path = require("path");
const morgan = require("morgan");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");

const apiV1Router = require("./routes/apiV1");
const { performanceLogger } = require("./middleware/performanceLoggingMiddleware");
const { createOriginGuard, sanitizeRequest } = require("./middleware/requestSecurityMiddleware");
const { errorHandler, notFound } = require("./middleware/errorMiddleware");
const logger = require("./utils/logger");

const app = express();

/* ===============================
   ENV + ORIGIN CONFIG
================================= */

const isProduction = String(process.env.NODE_ENV || "").toLowerCase() === "production";

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

const splitOrigins = (value) =>
  String(value || "")
    .split(",")
    .map((item) => normalizeOrigin(item))
    .filter(Boolean);

const allowedOrigins = Array.from(
  new Set([
    ...splitOrigins(process.env.CLIENT_URL),
    ...splitOrigins(process.env.FRONTEND_URL),
    ...splitOrigins(process.env.VERCEL_PREVIEW_URL)
  ])
);

/* ===============================
   RATE LIMIT CONFIG
================================= */

const apiWindowMs = Math.max(
  Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10) || 900000,
  60000
);

const apiMaxRequests = Math.max(
  Number.parseInt(process.env.RATE_LIMIT_MAX || "600", 10) || 600,
  50
);

const authMaxRequests = Math.max(
  Number.parseInt(process.env.AUTH_RATE_LIMIT_MAX || "25", 10) || 25,
  5
);

const paymentWindowMs = Math.max(
  Number.parseInt(process.env.PAYMENT_RATE_LIMIT_WINDOW_MS || String(apiWindowMs), 10),
  60000
);

const paymentMaxRequests = Math.max(
  Number.parseInt(process.env.PAYMENT_RATE_LIMIT_MAX || "120", 10) || 120,
  10
);

/* ===============================
   SECURITY MIDDLEWARE
================================= */

app.set("trust proxy", 1);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);

/* ===============================
   CORS CONFIG (FIXED FOR VERCEL)
================================= */

app.use(
  cors({
    origin: function (origin, callback) {
      if (!isProduction) {
        callback(null, true);
        return;
      }

      if (!origin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = normalizeOrigin(origin);
      if (allowedOrigins.includes(normalizedOrigin)) {
        callback(null, true);
        return;
      }

      logger.warn("Rejected origin by CORS", {
        originHeader: origin,
        normalizedOrigin,
        allowedOrigins
      });
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true
  })
);

app.use(createOriginGuard({ allowedOrigins, isProduction }));

/* ===============================
   RATE LIMITERS
================================= */

app.use(
  ["/api", "/api/v1"],
  rateLimit({
    windowMs: apiWindowMs,
    max: apiMaxRequests,
    skip: (req) =>
      req.path.startsWith("/auth") ||
      req.path.startsWith("/payment") ||
      req.originalUrl.startsWith("/api/auth") ||
      req.originalUrl.startsWith("/api/v1/auth") ||
      req.originalUrl.startsWith("/api/payment") ||
      req.originalUrl.startsWith("/api/v1/payment"),
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many requests. Please try again later." }
  })
);

app.use(
  ["/api/auth", "/api/v1/auth"],
  rateLimit({
    windowMs: apiWindowMs,
    max: authMaxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many authentication attempts. Please try again later." }
  })
);

app.use(
  ["/api/payment", "/api/v1/payment"],
  rateLimit({
    windowMs: paymentWindowMs,
    max: paymentMaxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many payment requests. Please try again later." }
  })
);

/* ===============================
   BODY + SANITIZATION
================================= */

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  mongoSanitize({
    replaceWith: "_"
  })
);

app.use(sanitizeRequest);
app.use(performanceLogger);

/* ===============================
   DEV LOGGER
================================= */

if (process.env.NODE_ENV === "development" && process.env.DISABLE_MORGAN !== "true") {
  app.use(morgan("dev"));
}

/* ===============================
   STATIC FILES
================================= */

app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

/* ===============================
   ROUTES
================================= */

app.use("/api/v1", apiV1Router);

app.use("/api", (req, res, next) => {
  if (req.path === "/v1" || req.path.startsWith("/v1/")) {
    next();
    return;
  }
  apiV1Router(req, res, next);
});

app.get("/", (_req, res) => {
  res.status(200).json({
    status: "MemoryVault API running",
    version: "v1",
    health: "/api/v1/health"
  });
});

/* ===============================
   ERROR HANDLING
================================= */

app.use(notFound);
app.use(errorHandler);

module.exports = app;
