const mongoose = require("mongoose");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const runIntegrityCheck = require("../utils/integrityChecker");
const validateRequest = require("../utils/validateRequest");
const logger = require("../utils/logger");

const getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find({})
      .select("_id name email role createdAt updatedAt")
      .sort({ createdAt: -1 })
      .lean();

    logger.info("Admin action: list users", {
      adminUserId: req.user ? String(req.user._id) : null,
      resultCount: users.length
    });

    res.json({
      total: users.length,
      users
    });
  } catch (error) {
    next(error);
  }
};

const getIntegrityCheck = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const treeId = req.query.treeId ? String(req.query.treeId) : null;
    if (treeId && !mongoose.Types.ObjectId.isValid(treeId)) {
      res.status(400).json({ message: "treeId must be a valid Mongo id." });
      return;
    }

    const report = await runIntegrityCheck({ treeId });
    logger.info("Admin action: integrity check", {
      adminUserId: req.user ? String(req.user._id) : null,
      treeId
    });
    res.json(report);
  } catch (error) {
    next(error);
  }
};

const getAuditLogs = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const page = Math.max(Number.parseInt(String(req.query.page || "1"), 10), 1);
    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit || "20"), 10), 1), 100);
    const skip = (page - 1) * limit;
    const query = {};

    if (req.query.userId && mongoose.Types.ObjectId.isValid(String(req.query.userId))) {
      query.userId = String(req.query.userId);
    }

    if (req.query.action) {
      query.action = String(req.query.action).trim();
    }

    if (req.query.entityType) {
      query.entityType = String(req.query.entityType).trim();
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .populate("userId", "_id name email role")
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(query)
    ]);

    logger.info("Admin action: audit logs", {
      adminUserId: req.user ? String(req.user._id) : null,
      page,
      limit,
      resultCount: logs.length,
      total
    });

    res.json({
      logs,
      total,
      page,
      limit,
      hasMore: skip + logs.length < total
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllUsers,
  getIntegrityCheck,
  getAuditLogs
};
