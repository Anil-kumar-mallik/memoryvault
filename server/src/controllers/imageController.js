const mongoose = require("mongoose");
const { getImageFile, getImageStream } = require("../config/gridfs");

const getImageById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: "Invalid image id." });
      return;
    }

    const file = await getImageFile(id);
    if (!file) {
      res.status(404).json({ message: "Image not found." });
      return;
    }

    res.setHeader("Content-Type", file.contentType || "application/octet-stream");
    if (file.length) {
      res.setHeader("Content-Length", String(file.length));
    }

    const downloadStream = getImageStream(id);
    downloadStream.on("error", (error) => {
      if (!res.headersSent) {
        if (error && (error.code === "ENOENT" || String(error.message || "").toLowerCase().includes("not found"))) {
          res.status(404).json({ message: "Image not found." });
          return;
        }
      }
      next(error);
    });

    downloadStream.pipe(res);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getImageById
};
