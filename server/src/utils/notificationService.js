const Notification = require("../models/Notification");
const Subscription = require("../models/Subscription");
const Plan = require("../models/Plan");

const DAY_MS = 24 * 60 * 60 * 1000;
const PLAN_EXPIRY_LOOKAHEAD_DAYS = 7;

const sessionOptions = (session) => (session ? { session } : {});
const withSession = (query, session) => (session ? query.session(session) : query);

const createNotification = async ({ userId, message, metadata = {}, session = null }) => {
  if (!userId || !message) {
    return null;
  }

  return Notification.create(
    [
      {
        userId,
        message: String(message).trim(),
        metadata,
        isRead: false,
        createdAt: new Date()
      }
    ],
    sessionOptions(session)
  );
};

const ensurePlanExpiryNotification = async (userId, session = null) => {
  if (!userId) {
    return;
  }

  const activeSubscription = await withSession(
    Subscription.findOne({ userId, status: "active" }).sort({ endDate: 1 }),
    session
  );

  if (!activeSubscription || !activeSubscription.endDate) {
    return;
  }

  const endDate = new Date(activeSubscription.endDate);
  const daysLeft = Math.ceil((endDate.getTime() - Date.now()) / DAY_MS);
  if (daysLeft < 0 || daysLeft > PLAN_EXPIRY_LOOKAHEAD_DAYS) {
    return;
  }

  const existing = await withSession(
    Notification.findOne({
      userId,
      "metadata.type": "plan_expiring",
      "metadata.subscriptionId": String(activeSubscription._id)
    }),
    session
  );

  if (existing) {
    return;
  }

  const plan = await withSession(Plan.findById(activeSubscription.planId).select("name"), session);
  const planName = plan ? plan.name : "Your current";

  await createNotification({
    userId,
    message: `${planName} plan expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`,
    metadata: {
      type: "plan_expiring",
      subscriptionId: String(activeSubscription._id),
      planId: String(activeSubscription.planId),
      endDate: activeSubscription.endDate
    },
    session
  });
};

module.exports = {
  createNotification,
  ensurePlanExpiryNotification
};
