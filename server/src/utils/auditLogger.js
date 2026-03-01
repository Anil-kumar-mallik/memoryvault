const AuditLog = require("../models/AuditLog");

const sessionOptions = (session) => (session ? { session } : {});

const createAuditLog = async ({ userId = null, action, entityType, entityId = null, metadata = {}, session = null }) => {
  if (!action || !entityType) {
    return null;
  }

  return AuditLog.create(
    [
      {
        userId,
        action,
        entityType,
        entityId: entityId ? String(entityId) : null,
        metadata,
        timestamp: new Date()
      }
    ],
    sessionOptions(session)
  );
};

module.exports = {
  createAuditLog
};
