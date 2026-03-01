const mongoose = require("mongoose");
const Member = require("../models/Member");

const setTreeIdFromBody = (req, res, next) => {
  const treeId = req.body?.treeId;

  if (!treeId || !mongoose.Types.ObjectId.isValid(treeId)) {
    res.status(400).json({ message: "treeId is required and must be a valid id." });
    return;
  }

  req.params.treeId = String(treeId);
  next();
};

const setTreeContextFromBodyMemberId = async (req, res, next) => {
  try {
    const memberId = req.body?.memberId;

    if (!memberId || !mongoose.Types.ObjectId.isValid(memberId)) {
      res.status(400).json({ message: "memberId is required and must be a valid id." });
      return;
    }

    const member = await Member.findById(memberId).select("_id treeId").lean();
    if (!member) {
      res.status(404).json({ message: "Member not found." });
      return;
    }

    req.params.memberId = String(member._id);
    req.params.treeId = String(member.treeId);
    next();
  } catch (error) {
    next(error);
  }
};

const setTreeContextFromMemberParam = async (req, res, next) => {
  try {
    const memberId = req.params.id;

    if (!memberId || !mongoose.Types.ObjectId.isValid(memberId)) {
      res.status(400).json({ message: "Valid member id is required." });
      return;
    }

    const member = await Member.findById(memberId).select("_id treeId").lean();
    if (!member) {
      res.status(404).json({ message: "Member not found." });
      return;
    }

    req.params.memberId = String(member._id);
    req.params.treeId = String(member.treeId);
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  setTreeIdFromBody,
  setTreeContextFromMemberParam,
  setTreeContextFromBodyMemberId
};
