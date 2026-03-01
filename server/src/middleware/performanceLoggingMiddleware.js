const logger = require("../utils/logger");

const REQUEST_SLOW_THRESHOLD_MS = Math.max(Number.parseInt(process.env.REQUEST_SLOW_THRESHOLD_MS || "1200", 10), 100);

const performanceLogger = (req, res, next) => {
  const start = process.hrtime.bigint();
  const startIso = new Date().toISOString();
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  res.setHeader("x-request-id", requestId);

  res.on("finish", () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;
    const baseMeta = {
      startedAt: startIso,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(1)),
      requestId
    };

    if (durationMs >= REQUEST_SLOW_THRESHOLD_MS) {
      logger.warn("Slow request", { ...baseMeta, slow: true });
      return;
    }

    logger.info("Request completed", baseMeta);
  });

  next();
};

module.exports = {
  performanceLogger
};
