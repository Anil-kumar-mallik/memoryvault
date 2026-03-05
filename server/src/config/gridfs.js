const crypto = require("crypto");
const path = require("path");
const mongoose = require("mongoose");
const multer = require("multer");
const { GridFsStorage } = require("multer-gridfs-storage");
const Grid = require("gridfs-stream");

const GRIDFS_BUCKET_NAME = "uploads";
const allowedMimeToExtension = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp"
};
const maxUploadSizeMb = Math.max(Number.parseInt(process.env.MAX_UPLOAD_SIZE_MB || "5", 10) || 5, 1);

let gridFsBucket = null;
let gridFsStream = null;

const initializeGridFs = () => {
  if (!mongoose.connection || !mongoose.connection.db) {
    return;
  }

  if (!gridFsBucket) {
    gridFsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: GRIDFS_BUCKET_NAME
    });
  }

  if (!gridFsStream) {
    gridFsStream = Grid(mongoose.connection.db, mongoose.mongo);
    gridFsStream.collection(GRIDFS_BUCKET_NAME);
  }
};

mongoose.connection.on("connected", initializeGridFs);
mongoose.connection.on("disconnected", () => {
  gridFsBucket = null;
  gridFsStream = null;
});

const dbPromise = new Promise((resolve, reject) => {
  if (mongoose.connection.readyState === 1) {
    return resolve(mongoose.connection.db);
  }

  mongoose.connection.once("open", () => {
    resolve(mongoose.connection.db);
  });

  mongoose.connection.once("error", (err) => {
    reject(err);
  });
});

const storage = new GridFsStorage({
  url: process.env.MONGODB_URI 
  file: (_req, file) =>
    new Promise((resolve, reject) => {
      const normalizedMime = String(file.mimetype || "").toLowerCase();
      const extension = allowedMimeToExtension[normalizedMime];

      if (!extension) {
        reject(new Error("Unsupported image format."));
        return;
      }

      const uniqueName = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
      const originalName = String(file.originalname || "").trim();
      const parsedOriginal = originalName ? path.parse(originalName).name : "image";

      resolve({
        filename: `member-${Date.now()}-${uniqueName}-${parsedOriginal}.${extension}`,
        bucketName: GRIDFS_BUCKET_NAME,
        contentType: normalizedMime
      });
    })
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

const toObjectId = (value) => new mongoose.Types.ObjectId(String(value));

const getGridFsBucket = () => {
  initializeGridFs();

  if (!gridFsBucket) {
    throw new Error("GridFS bucket is not initialized.");
  }

  return gridFsBucket;
};

const getImageFile = async (fileId) => {
  const bucket = getGridFsBucket();
  const files = await bucket.find({ _id: toObjectId(fileId) }).limit(1).toArray();
  return files[0] || null;
};

const getImageStream = (fileId) => {
  const bucket = getGridFsBucket();
  return bucket.openDownloadStream(toObjectId(fileId));
};

module.exports = {
  upload,
  getImageFile,
  getImageStream
};
