const express = require("express");
const mongoose = require("mongoose");
const authRoutes = require("../authRoutes");
const treeRoutes = require("../treeRoutes");
const memberRoutes = require("../memberRoutes");
const coreMemberRoutes = require("../coreMemberRoutes");
const coreTreeRoutes = require("../coreTreeRoutes");
const coreFocusRoutes = require("../coreFocusRoutes");
const adminRoutes = require("../adminRoutes");
const subscriptionRoutes = require("../subscriptionRoutes");
const paymentRoutes = require("../paymentRoutes");
const publicTreeRoutes = require("../publicTreeRoutes");
const notificationRoutes = require("../notificationRoutes");
const accountRoutes = require("../accountRoutes");
const imageRoutes = require("../imageRoutes");
const testEmailRoutes = require("../testEmailRoutes");

const router = express.Router();

router.get("/health", (_req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    dbConnected
  });
});

router.use("/", testEmailRoutes);
router.use("/auth", authRoutes);
router.use("/trees", treeRoutes);
router.use("/trees/:treeId/members", memberRoutes);
router.use("/member", coreMemberRoutes);
router.use("/tree", coreTreeRoutes);
router.use("/tree", coreFocusRoutes);
router.use("/admin", adminRoutes);
router.use("/subscription", subscriptionRoutes);
router.use("/payment", paymentRoutes);
router.use("/public", publicTreeRoutes);
router.use("/notifications", notificationRoutes);
router.use("/account", accountRoutes);
router.use("/image", imageRoutes);

module.exports = router;
