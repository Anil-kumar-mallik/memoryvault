const mongoose = require("mongoose");

const planSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    priceMonthly: {
      type: Number,
      required: true,
      min: 0
    },
    priceYearly: {
      type: Number,
      required: true,
      min: 0
    },
    maxMembers: {
      type: Number,
      required: true,
      min: 1
    },
    maxTrees: {
      type: Number,
      required: true,
      min: 1
    },
    features: [
      {
        type: String,
        trim: true,
        maxlength: 240
      }
    ],
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    isDefault: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

planSchema.index({ name: 1 }, { unique: true });
planSchema.index(
  { isDefault: 1 },
  {
    unique: true,
    partialFilterExpression: { isDefault: true }
  }
);

module.exports = mongoose.model("Plan", planSchema);
