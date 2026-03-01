const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

const uploadDirectory = path.join(__dirname, "../../uploads");
const allowedMimeToExtension = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp"
};
const maxUploadSizeMb = Math.max(Number.parseInt(process.env.MAX_UPLOAD_SIZE_MB || "5", 10) || 5, 1);

if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadDirectory);
  },
  filename: (_req, file, callback) => {
    const normalizedMime = String(file.mimetype || "").toLowerCase();
    const extension = allowedMimeToExtension[normalizedMime];

    if (!extension) {
      callback(new Error("Unsupported image format."));
      return;
    }

    const uniqueName = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
    callback(null, `member-${Date.now()}-${uniqueName}.${extension}`);
  }
});

const fileFilter = (_req, file, callback) => {
  const normalizedMime = String(file.mimetype || "").toLowerCase();
  if (allowedMimeToExtension[normalizedMime]) {
    callback(null, true);
    return;
  }

  callback(new Error("Only JPG, PNG, GIF, and WEBP image uploads are allowed."));
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: maxUploadSizeMb * 1024 * 1024
  }
});

module.exports = upload;
