const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const validateRequest = require("../utils/validateRequest");
const { ensurePlanExpiryNotification } = require("../utils/notificationService");

const getNotifications = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const page = Math.max(Number.parseInt(String(req.query.page || "1"), 10), 1);
    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit || "20"), 10), 1), 100);
    const skip = (page - 1) * limit;

    await ensurePlanExpiryNotification(req.user._id);

    const [items, total, unread] = await Promise.all([
      Notification.find({ userId: req.user._id }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Notification.countDocuments({ userId: req.user._id }),
      Notification.countDocuments({ userId: req.user._id, isRead: false })
    ]);

    res.json({
      notifications: items,
      total,
      unread,
      page,
      limit,
      hasMore: skip + items.length < total
    });
  } catch (error) {
    next(error);
  }
};

const markNotificationAsRead = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: "Invalid notification id." });
      return;
    }

    const notification = await Notification.findOne({ _id: id, userId: req.user._id });
    if (!notification) {
      res.status(404).json({ message: "Notification not found." });
      return;
    }

    notification.isRead = true;
    await notification.save();

    const unread = await Notification.countDocuments({ userId: req.user._id, isRead: false });
    res.json({
      message: "Notification marked as read.",
      notification,
      unread
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNotifications,
  markNotificationAsRead
};
