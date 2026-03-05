const resolveUploadedFileId = (file) => {
  if (!file || typeof file !== "object") {
    return null;
  }

  if (file.id) {
    return String(file.id);
  }

  if (file._id) {
    return String(file._id);
  }

  if (file.fileId) {
    return String(file.fileId);
  }

  if (file.gridFsId) {
    return String(file.gridFsId);
  }

  if (file.filename && file.bucketName) {
    return String(file._id || file.id);
  }

  return null;
};

module.exports = {
  resolveUploadedFileId
};