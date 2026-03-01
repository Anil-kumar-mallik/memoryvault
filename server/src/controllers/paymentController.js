const crypto = require("crypto");
const Razorpay = require("razorpay");
const Plan = require("../models/Plan");
const Subscription = require("../models/Subscription");
const User = require("../models/User");
const withMongoTransaction = require("../utils/withMongoTransaction");
const validateRequest = require("../utils/validateRequest");
const { createAuditLog } = require("../utils/auditLogger");
const { createNotification } = require("../utils/notificationService");
const { sendPaymentSuccessMail, sendSubscriptionConfirmationMail } = require("../utils/emailService");
const { getSubscriptionStateForUser } = require("../utils/subscriptionService");
const logger = require("../utils/logger");

const BILLING_CYCLE = new Set(["monthly", "yearly"]);
const DEFAULT_CURRENCY = "INR";

const addBillingWindow = (startDate, billingCycle) => {
  const endDate = new Date(startDate);

  if (billingCycle === "yearly") {
    endDate.setFullYear(endDate.getFullYear() + 1);
    return endDate;
  }

  endDate.setMonth(endDate.getMonth() + 1);
  return endDate;
};

const planAmountForCycle = (plan, billingCycle) => {
  const price = billingCycle === "yearly" ? plan.priceYearly : plan.priceMonthly;
  return Math.round(Number(price || 0) * 100);
};

const getRazorpayClient = () => {
  const keyId = String(process.env.RAZORPAY_KEY_ID || "").trim();
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || "").trim();

  if (!keyId || !keySecret) {
    const error = new Error("Razorpay credentials are not configured.");
    error.statusCode = 500;
    throw error;
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret
  });
};

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const verifyRazorpaySignature = ({ orderId, paymentId, signature }) => {
  const secret = String(process.env.RAZORPAY_KEY_SECRET || "").trim();
  const payload = `${orderId}|${paymentId}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return safeEqual(expected, signature);
};

const resolveBillingCycle = (value) => {
  const normalized = String(value || "").toLowerCase();
  return BILLING_CYCLE.has(normalized) ? normalized : "monthly";
};

const createOrder = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const planId = String(req.body.planId || "");
    const billingCycle = resolveBillingCycle(req.body.billingCycle);

    const plan = await Plan.findOne({ _id: planId, isActive: true }).select(
      "_id name priceMonthly priceYearly maxMembers maxTrees isDefault"
    );
    if (!plan) {
      res.status(404).json({ message: "Active plan not found." });
      return;
    }

    const amount = planAmountForCycle(plan, billingCycle);
    if (!amount) {
      res.status(400).json({
        message: "Selected plan does not require payment."
      });
      return;
    }

    const razorpay = getRazorpayClient();
    const receipt = `mv_${String(req.user._id)}_${Date.now()}`;
    const order = await razorpay.orders.create({
      amount,
      currency: DEFAULT_CURRENCY,
      receipt,
      notes: {
        userId: String(req.user._id),
        planId: String(plan._id),
        billingCycle
      }
    });

    res.status(201).json({
      orderId: order.id,
      amount: Number(order.amount || amount),
      currency: String(order.currency || DEFAULT_CURRENCY).toUpperCase(),
      keyId: String(process.env.RAZORPAY_KEY_ID || ""),
      planId: String(plan._id),
      planName: plan.name,
      billingCycle
    });
  } catch (error) {
    logger.error("Razorpay order creation failed", {
      userId: req.user ? String(req.user._id) : null,
      planId: req.body ? String(req.body.planId || "") : null,
      message: error.message
    });
    if (error && typeof error.statusCode === "number") {
      res.status(error.statusCode).json({ message: error.message });
      return;
    }
    next(error);
  }
};

const verifyPayment = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const userId = String(req.user._id);
    const planId = String(req.body.planId || "");
    const billingCycle = resolveBillingCycle(req.body.billingCycle);
    const razorpayOrderId = String(req.body.razorpay_order_id || "");
    const razorpayPaymentId = String(req.body.razorpay_payment_id || "");
    const razorpaySignature = String(req.body.razorpay_signature || "");

    const [user, plan] = await Promise.all([
      User.findById(userId).select("_id name email"),
      Plan.findOne({ _id: planId, isActive: true }).select("_id name priceMonthly priceYearly maxMembers maxTrees")
    ]);

    if (!user) {
      res.status(404).json({ message: "User not found." });
      return;
    }

    if (!plan) {
      res.status(404).json({ message: "Active plan not found." });
      return;
    }

    const expectedAmount = planAmountForCycle(plan, billingCycle);
    if (!expectedAmount) {
      res.status(400).json({
        message: "Selected plan does not require payment."
      });
      return;
    }

    if (
      !verifyRazorpaySignature({
        orderId: razorpayOrderId,
        paymentId: razorpayPaymentId,
        signature: razorpaySignature
      })
    ) {
      res.status(400).json({ message: "Invalid Razorpay signature." });
      return;
    }

    const paymentAlreadyUsed = await Subscription.findOne({ paymentReference: razorpayPaymentId })
      .select("_id userId planId status")
      .lean();
    if (paymentAlreadyUsed) {
      if (String(paymentAlreadyUsed.userId) !== userId) {
        res.status(409).json({ message: "Payment reference already used." });
        return;
      }

      const existingState = await getSubscriptionStateForUser(userId);
      res.json({
        message: "Payment already verified for this account.",
        duplicate: true,
        ...existingState
      });
      return;
    }

    const razorpay = getRazorpayClient();
    const razorpayOrder = await razorpay.orders.fetch(razorpayOrderId);
    if (!razorpayOrder || !razorpayOrder.id) {
      res.status(400).json({ message: "Razorpay order not found." });
      return;
    }

    const orderAmount = Number(razorpayOrder.amount || 0);
    if (orderAmount !== expectedAmount) {
      res.status(400).json({ message: "Payment amount does not match plan pricing." });
      return;
    }

    const orderNotes = razorpayOrder.notes || {};
    if (orderNotes.planId && String(orderNotes.planId) !== planId) {
      res.status(400).json({ message: "Order plan mismatch." });
      return;
    }

    if (orderNotes.userId && String(orderNotes.userId) !== userId) {
      res.status(400).json({ message: "Order user mismatch." });
      return;
    }

    const now = new Date();
    const endDate = addBillingWindow(now, billingCycle);
    let activatedSubscriptionId = null;

    await withMongoTransaction(async (session) => {
      const duplicateInTxn = await Subscription.findOne({ paymentReference: razorpayPaymentId })
        .select("_id userId")
        .session(session)
        .lean();

      if (duplicateInTxn) {
        const error = new Error("Payment already processed.");
        error.statusCode = 409;
        throw error;
      }

      let targetSubscription = await Subscription.findOne({ userId, status: "active" }).session(session);
      if (!targetSubscription) {
        targetSubscription = new Subscription({
          userId,
          planId: plan._id
        });
      }

      targetSubscription.planId = plan._id;
      targetSubscription.startDate = now;
      targetSubscription.endDate = endDate;
      targetSubscription.status = "active";
      targetSubscription.billingCycle = billingCycle;
      targetSubscription.paymentReference = razorpayPaymentId;
      await targetSubscription.save({ session });
      activatedSubscriptionId = String(targetSubscription._id);

      await Subscription.updateMany(
        {
          userId,
          status: "active",
          _id: { $ne: targetSubscription._id }
        },
        {
          $set: {
            status: "cancelled",
            endDate: now
          }
        },
        { session }
      );

      await createAuditLog({
        userId,
        action: "plan_purchase",
        entityType: "subscription",
        entityId: targetSubscription._id,
        metadata: {
          planId: String(plan._id),
          planName: plan.name,
          billingCycle,
          razorpayOrderId,
          razorpayPaymentId
        },
        session
      });

      await createNotification({
        userId,
        message: `Subscription activated: ${plan.name} (${billingCycle}).`,
        metadata: {
          type: "subscription_activated",
          planId: String(plan._id),
          planName: plan.name,
          billingCycle,
          subscriptionId: String(targetSubscription._id),
          razorpayPaymentId
        },
        session
      });
    });

    const state = await getSubscriptionStateForUser(userId);

    try {
      await Promise.all([
        sendSubscriptionConfirmationMail({
          email: user.email,
          name: user.name || "User",
          planName: plan.name,
          endDate
        }),
        sendPaymentSuccessMail({
          email: user.email,
          name: user.name || "User",
          amount: expectedAmount / 100,
          currency: DEFAULT_CURRENCY,
          reference: razorpayPaymentId
        })
      ]);
    } catch (emailError) {
      logger.error("Failed to send Razorpay payment emails", {
        userId,
        subscriptionId: activatedSubscriptionId,
        message: emailError.message
      });
    }

    logger.info("Razorpay payment verified and subscription activated", {
      userId,
      planId: String(plan._id),
      razorpayOrderId,
      razorpayPaymentId,
      subscriptionId: activatedSubscriptionId
    });

    res.json({
      message: "Subscription activated successfully.",
      duplicate: false,
      ...state
    });
  } catch (error) {
    logger.error("Razorpay verify failed", {
      userId: req.user ? String(req.user._id) : null,
      message: error.message
    });

    if (error && error.code === 11000) {
      const state = await getSubscriptionStateForUser(String(req.user._id));
      res.json({
        message: "Payment already verified for this account.",
        duplicate: true,
        ...state
      });
      return;
    }

    if (error && typeof error.statusCode === "number") {
      res.status(error.statusCode).json({ message: error.message });
      return;
    }

    next(error);
  }
};

module.exports = {
  createOrder,
  verifyPayment
};
