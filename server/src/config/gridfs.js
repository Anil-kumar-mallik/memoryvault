const crypto = require("crypto");
const path = require("path");
const mongoose = require("mongoose");
const multer = require("multer");
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

const createUploadFilename = (file) => {
  const normalizedMime = String(file.mimetype || "").toLowerCase();
  const extension = allowedMimeToExtension[normalizedMime];

  if (!extension) {
    throw new Error("Unsupported image format.");
  }

  const uniqueName = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
  const originalName = String(file.originalname || "").trim();
  const parsedOriginal = originalName ? path.parse(originalName).name : "image";

  return {
    filename: `member-${Date.now()}-${uniqueName}-${parsedOriginal}.${extension}`,
    contentType: normalizedMime
  };
};

const storage = {
  _handleFile(_req, file, callback) {
    let uploadConfig;
    try {
      uploadConfig = createUploadFilename(file);
    } catch (error) {
      callback(error);
      return;
    }

    let bucket;
    let uploadStream;
    try {
      bucket = getGridFsBucket();
      uploadStream = bucket.openUploadStream(uploadConfig.filename, {
        contentType: uploadConfig.contentType
      });
    } catch (error) {
      callback(error);
      return;
    }

    let settled = false;
    const done = (error, result) => {
      if (settled) {
        return;
      }
      settled = true;
      callback(error, result);
    };

    const onError = (error) => {
      done(error);
    };

    const onFinish = async () => {
      try {
        const files = await bucket.find({ _id: uploadStream.id }).limit(1).toArray();
        const uploadedFile = files[0];

        if (!uploadedFile) {
          done(new Error("Uploaded GridFS file metadata could not be loaded."));
          return;
        }

        done(null, {
          id: uploadedFile._id,
          _id: uploadedFile._id,
          filename: uploadedFile.filename,
          bucketName: GRIDFS_BUCKET_NAME,
          contentType: uploadedFile.contentType || uploadConfig.contentType,
          size: uploadedFile.length,
          uploadDate: uploadedFile.uploadDate
        });
      } catch (error) {
        done(error);
      }
    };

    uploadStream.once("error", onError);
    uploadStream.once("finish", onFinish);
    file.stream.pipe(uploadStream);
  },

  _removeFile(_req, file, callback) {
    const targetFileId = file && (file.id || file._id);
    if (!targetFileId) {
      callback(null);
      return;
    }

    let bucket;
    try {
      bucket = getGridFsBucket();
    } catch (error) {
      callback(error);
      return;
    }

    bucket
      .delete(toObjectId(targetFileId))
      .then(() => callback(null))
      .catch((error) => callback(error));
  }
};

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
