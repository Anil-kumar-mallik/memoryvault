const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Plan",
      required: true,
      index: true
    },
    startDate: {
      type: Date,
      required: true,
      default: Date.now
    },
    endDate: {
      type: Date,
      default: null,
      index: true
    },
    status: {
      type: String,
      enum: ["active", "expired", "cancelled"],
      default: "active",
      index: true
    },
    billingCycle: {
      type: String,
      enum: ["monthly", "yearly"],
      default: "monthly"
    },
    paymentReference: {
      type: String,
      default: null,
      maxlength: 220
    }
  },
  {
    timestamps: true
  }
);

subscriptionSchema.index({ userId: 1, status: 1, startDate: -1 });
subscriptionSchema.index(
  { userId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "active" }
  }
);
subscriptionSchema.index(
  { userId: 1, paymentReference: 1 },
  {
    unique: true,
    sparse: true
  }
);

module.exports = mongoose.model("Subscription", subscriptionSchema);
