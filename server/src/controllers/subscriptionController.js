const Subscription = require("../models/Subscription");
const withMongoTransaction = require("../utils/withMongoTransaction");
const {
  getActiveSubscriptionDocument,
  getSubscriptionStateForUser,
  getPublicPlans
} = require("../utils/subscriptionService");
const { createAuditLog } = require("../utils/auditLogger");
const { ensurePlanExpiryNotification } = require("../utils/notificationService");

const subscribe = async (req, res, next) => {
  try {
    res.status(403).json({
      message: "Manual subscription activation is disabled. Use Razorpay checkout to activate a plan."
    });
  } catch (error) {
    next(error);
  }
};

const getMySubscription = async (req, res, next) => {
  try {
    await ensurePlanExpiryNotification(req.user._id);
    const state = await getSubscriptionStateForUser(req.user._id);
    res.json(state);
  } catch (error) {
    next(error);
  }
};

const cancelSubscription = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const cancelledState = await withMongoTransaction(async (session) => {
      const activeSubscription = await getActiveSubscriptionDocument(userId, session);
      if (!activeSubscription) {
        const error = new Error("No active subscription found.");
        error.statusCode = 404;
        throw error;
      }

      activeSubscription.status = "cancelled";
      activeSubscription.endDate = new Date();
      await activeSubscription.save({ session });

      await createAuditLog({
        userId,
        action: "subscription_cancel",
        entityType: "subscription",
        entityId: activeSubscription._id,
        metadata: {
          planId: String(activeSubscription.planId),
          reason: "user_request"
        },
        session
      });

      return getSubscriptionStateForUser(userId, session);
    });

    res.json({
      message: "Subscription cancelled successfully.",
      ...cancelledState
    });
  } catch (error) {
    if (error && typeof error.statusCode === "number") {
      res.status(error.statusCode).json({ message: error.message });
      return;
    }
    next(error);
  }
};

const listAvailablePlans = async (_req, res, next) => {
  try {
    const plans = await getPublicPlans();
    res.json(plans);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  subscribe,
  getMySubscription,
  cancelSubscription,
  listAvailablePlans
};
