const mongoose = require("mongoose");
const Plan = require("../models/Plan");
const validateRequest = require("../utils/validateRequest");

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeFeatures = (features) => {
  if (!Array.isArray(features)) {
    return [];
  }

  const unique = new Set();
  const output = [];

  for (const feature of features) {
    const value = String(feature || "").trim();
    if (!value) {
      continue;
    }

    const key = value.toLowerCase();
    if (unique.has(key)) {
      continue;
    }

    unique.add(key);
    output.push(value);
  }

  return output;
};

const duplicatePlanErrorMessage = (error) => {
  if (error && error.keyPattern && error.keyPattern.isDefault) {
    return "Default plan already exists.";
  }

  return "Plan name already exists.";
};

const toPlanResponse = (plan) => ({
  _id: plan._id,
  name: plan.name,
  priceMonthly: plan.priceMonthly,
  priceYearly: plan.priceYearly,
  maxMembers: plan.maxMembers,
  maxTrees: plan.maxTrees,
  features: normalizeFeatures(plan.features),
  isActive: Boolean(plan.isActive),
  isDefault: Boolean(plan.isDefault),
  createdAt: plan.createdAt,
  updatedAt: plan.updatedAt
});

const createPlan = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const name = String(req.body.name || "").trim();
    const existing = await Plan.findOne({
      name: {
        $regex: `^${escapeRegex(name)}$`,
        $options: "i"
      }
    })
      .select("_id")
      .lean();

    if (existing) {
      res.status(409).json({ message: "Plan name already exists." });
      return;
    }

    const plan = await Plan.create({
      name,
      priceMonthly: Number(req.body.priceMonthly),
      priceYearly: Number(req.body.priceYearly),
      maxMembers: Number(req.body.maxMembers),
      maxTrees: Number(req.body.maxTrees),
      features: normalizeFeatures(req.body.features),
      isActive: req.body.isActive !== undefined ? Boolean(req.body.isActive) : true,
      isDefault: req.body.isDefault !== undefined ? Boolean(req.body.isDefault) : false
    });

    res.status(201).json(toPlanResponse(plan));
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      res.status(400).json({ message: error.message });
      return;
    }

    if (error && error.code === 11000) {
      res.status(409).json({ message: duplicatePlanErrorMessage(error) });
      return;
    }

    next(error);
  }
};

const getAllPlans = async (_req, res, next) => {
  try {
    const plans = await Plan.find({}).sort({ createdAt: -1, name: 1 }).lean();
    res.json(plans.map((plan) => toPlanResponse(plan)));
  } catch (error) {
    next(error);
  }
};

const updatePlan = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const { id } = req.params;
    const plan = await Plan.findById(id);

    if (!plan) {
      res.status(404).json({ message: "Plan not found." });
      return;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
      const name = String(req.body.name || "").trim();
      const duplicate = await Plan.findOne({
        _id: { $ne: plan._id },
        name: {
          $regex: `^${escapeRegex(name)}$`,
          $options: "i"
        }
      })
        .select("_id")
        .lean();

      if (duplicate) {
        res.status(409).json({ message: "Plan name already exists." });
        return;
      }

      plan.name = name;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "priceMonthly")) {
      plan.priceMonthly = Number(req.body.priceMonthly);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "priceYearly")) {
      plan.priceYearly = Number(req.body.priceYearly);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "maxMembers")) {
      plan.maxMembers = Number(req.body.maxMembers);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "maxTrees")) {
      plan.maxTrees = Number(req.body.maxTrees);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "features")) {
      plan.features = normalizeFeatures(req.body.features);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "isActive")) {
      plan.isActive = Boolean(req.body.isActive);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "isDefault")) {
      plan.isDefault = Boolean(req.body.isDefault);
    }

    await plan.save();
    res.json(toPlanResponse(plan));
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      res.status(400).json({ message: error.message });
      return;
    }

    if (error && error.code === 11000) {
      res.status(409).json({ message: duplicatePlanErrorMessage(error) });
      return;
    }

    next(error);
  }
};

const deletePlan = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const { id } = req.params;
    const plan = await Plan.findById(id);

    if (!plan) {
      res.status(404).json({ message: "Plan not found." });
      return;
    }

    plan.isActive = false;
    await plan.save();

    res.json({
      message: "Plan deleted successfully.",
      plan: toPlanResponse(plan)
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createPlan,
  getAllPlans,
  updatePlan,
  deletePlan
};
