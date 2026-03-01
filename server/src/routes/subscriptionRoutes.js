const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  subscribe,
  getMySubscription,
  cancelSubscription,
  listAvailablePlans
} = require("../controllers/subscriptionController");

const router = express.Router();

router.use(protect);

router.get("/plans", listAvailablePlans);
router.post("/subscribe", subscribe);
router.get("/my", getMySubscription);
router.post("/cancel", cancelSubscription);

module.exports = router;
