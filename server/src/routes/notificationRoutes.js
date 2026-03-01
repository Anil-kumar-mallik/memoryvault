const express = require("express");
const { param, query } = require("express-validator");
const { protect } = require("../middleware/authMiddleware");
const { getNotifications, markNotificationAsRead } = require("../controllers/notificationController");

const router = express.Router();

router.use(protect);

router.get(
  "/",
  [
    query("page").optional().isInt({ min: 1 }).withMessage("page must be >= 1."),
    query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("limit must be 1-100.")
  ],
  getNotifications
);

router.put(
  "/read/:id",
  [param("id").isMongoId().withMessage("Valid notification id is required.")],
  markNotificationAsRead
);

module.exports = router;
