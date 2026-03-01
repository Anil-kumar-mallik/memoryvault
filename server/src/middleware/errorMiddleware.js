const multer = require("multer");
const { logError } = require("../utils/errorLogger");

const notFound = (req, res, next) => {
  res.status(404);
  next(new Error(`Route not found: ${req.originalUrl}`));
};

const errorHandler = (error, req, res, _next) => {
  logError({
    context: "error-middleware",
    error,
    meta: {
      statusCode: res.statusCode,
      method: req.method,
      path: req.originalUrl
    }
  });

  if (error instanceof multer.MulterError) {
    const status = 400;
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? "Uploaded file is too large."
        : "Upload failed due to invalid file data.";

    res.status(status).json({
      message,
      stack: process.env.NODE_ENV === "production" ? undefined : error.stack
    });
    return;
  }

  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;

  res.status(statusCode).json({
    message: error.message,
    stack: process.env.NODE_ENV === "production" ? undefined : error.stack
  });
};

module.exports = { notFound, errorHandler };
