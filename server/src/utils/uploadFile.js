const resolveUploadedFileId = (file) => {
  if (!file || typeof file !== "object") {
    return null;
  }

  const candidates = [file.id, file._id, file.fileId, file.gridFsId];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    return String(candidate);
  }

  return null;
};

module.exports = {
  resolveUploadedFileId
};
