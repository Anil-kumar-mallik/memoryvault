const fs = require("fs");

const ALLOWED_SIGNATURES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp"
};

const detectMimeTypeFromSignature = (buffer) => {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return "image/gif";
  }

  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
};

const removeFileSilently = async (filePath) => {
  try {
    await fs.promises.unlink(filePath);
  } catch (_error) {
    // Ignore cleanup failures.
  }
};

const validateUploadedImage = async (req, res, next) => {
  try {
    if (!req.file || !req.file.path) {
      next();
      return;
    }

    const handle = await fs.promises.open(req.file.path, "r");
    const headerBuffer = Buffer.alloc(32);
    await handle.read(headerBuffer, 0, headerBuffer.length, 0);
    await handle.close();

    const detectedMimeType = detectMimeTypeFromSignature(headerBuffer);
    if (!detectedMimeType || !ALLOWED_SIGNATURES[detectedMimeType]) {
      await removeFileSilently(req.file.path);
      res.status(400).json({ message: "Uploaded file is not a valid supported image." });
      return;
    }

    const declaredMime = String(req.file.mimetype || "").toLowerCase();
    if (declaredMime !== detectedMimeType) {
      await removeFileSilently(req.file.path);
      res.status(400).json({ message: "Image MIME type does not match file content." });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  validateUploadedImage
};

