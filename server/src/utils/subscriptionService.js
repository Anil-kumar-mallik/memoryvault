const FamilyTree = require("../models/FamilyTree");
const Member = require("../models/Member");
const Plan = require("../models/Plan");
const Subscription = require("../models/Subscription");

const CORE_PLAN_DEFINITIONS = Object.freeze([
  {
    name: "Free",
    priceMonthly: 0,
    priceYearly: 0,
    maxMembers: 10,
    maxTrees: 1,
    features: ["Basic Tree"],
    isActive: true,
    isDefault: true
  },
  {
    name: "Basic",
    priceMonthly: 99,
    priceYearly: 999,
    maxMembers: 100,
    maxTrees: 1,
    features: ["Extended Members"],
    isActive: true,
    isDefault: false
  },
  {
    name: "Pro",
    priceMonthly: 199,
    priceYearly: 1999,
    maxMembers: 500,
    maxTrees: 1,
    features: ["Large Family Support"],
    isActive: true,
    isDefault: false
  },
  {
    name: "Family Plus",
    priceMonthly: 299,
    priceYearly: 2999,
    maxMembers: 999999,
    maxTrees: 1,
    features: ["Unlimited Members"],
    isActive: true,
    isDefault: false
  }
]);
const FREE_PLAN_DEFINITION = Object.freeze(CORE_PLAN_DEFINITIONS.find((plan) => String(plan.name).toLowerCase() === "free"));
const CORE_PLAN_NAMES = Object.freeze(CORE_PLAN_DEFINITIONS.map((plan) => plan.name));

const withSession = (query, session) => (session ? query.session(session) : query);
const sessionOptions = (session) => (session ? { session } : {});

const forbidden = (message) => {
  const error = new Error(message);
  error.statusCode = 403;
  return error;
};

const notFound = (message) => {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
};

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

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalizePlanName = (value) => String(value || "").trim().toLowerCase();
const buildPlanNameRegex = (value) => new RegExp(`^${escapeRegex(value)}$`, "i");

const pickPrimaryPlanDocument = (plans, expectedName) => {
  if (!Array.isArray(plans) || plans.length === 0) {
    return null;
  }

  const exact = plans.find((plan) => String(plan.name) === String(expectedName));
  return exact || plans[0];
};

const hasFeatureChanges = (currentFeatures, desiredFeatures) => {
  const normalizedCurrent = normalizeFeatures(currentFeatures);
  const normalizedDesired = normalizeFeatures(desiredFeatures);

  if (normalizedCurrent.length !== normalizedDesired.length) {
    return true;
  }

  return normalizedDesired.some((feature, index) => feature !== normalizedCurrent[index]);
};

const isExpired = (subscription, now = new Date()) => {
  if (!subscription || subscription.status !== "active" || !subscription.endDate) {
    return false;
  }

  return new Date(subscription.endDate).getTime() <= now.getTime();
};

const toPlanSummary = (plan) => {
  if (!plan) {
    return null;
  }

  return {
    _id: String(plan._id),
    name: plan.name,
    priceMonthly: plan.priceMonthly,
    priceYearly: plan.priceYearly,
    maxMembers: plan.maxMembers,
    maxTrees: plan.maxTrees,
    features: Array.isArray(plan.features) ? plan.features : [],
    isActive: Boolean(plan.isActive),
    isDefault: Boolean(plan.isDefault)
  };
};

const toSubscriptionSummary = (subscription) => {
  if (!subscription) {
    return null;
  }

  const rawPlanId =
    subscription.planId && typeof subscription.planId === "object" ? subscription.planId._id : subscription.planId;

  return {
    _id: String(subscription._id),
    userId: String(subscription.userId),
    planId: rawPlanId ? String(rawPlanId) : null,
    startDate: subscription.startDate,
    endDate: subscription.endDate,
    status: subscription.status,
    billingCycle: subscription.billingCycle,
    paymentReference: subscription.paymentReference || null,
    createdAt: subscription.createdAt,
    updatedAt: subscription.updatedAt
  };
};

const upsertCorePlan = async (definition, session = null) => {
  const planRegex = buildPlanNameRegex(definition.name);
  const existingPlans = await withSession(
    Plan.find({
      name: {
        $regex: planRegex
      }
    }),
    session
  );
  let plan = pickPrimaryPlanDocument(existingPlans, definition.name);

  if (!plan) {
    try {
      plan = new Plan({
        name: definition.name,
        priceMonthly: Number(definition.priceMonthly),
        priceYearly: Number(definition.priceYearly),
        maxMembers: Number(definition.maxMembers),
        maxTrees: Number(definition.maxTrees),
        features: normalizeFeatures(definition.features),
        isActive: Boolean(definition.isActive),
        isDefault: false
      });
      await plan.save(sessionOptions(session));
      return plan;
    } catch (error) {
      if (!error || error.code !== 11000) {
        throw error;
      }

      const conflictingPlans = await withSession(
        Plan.find({
          name: {
            $regex: planRegex
          }
        }),
        session
      );
      plan = pickPrimaryPlanDocument(conflictingPlans, definition.name);
    }
  }

  if (!plan) {
    const notResolvedError = new Error(`Unable to provision plan ${definition.name}.`);
    notResolvedError.statusCode = 500;
    throw notResolvedError;
  }

  const desiredFeatures = normalizeFeatures(definition.features);
  const shouldSave =
    String(plan.name) !== String(definition.name) ||
    Number(plan.priceMonthly) !== Number(definition.priceMonthly) ||
    Number(plan.priceYearly) !== Number(definition.priceYearly) ||
    Number(plan.maxMembers) !== Number(definition.maxMembers) ||
    Number(plan.maxTrees) !== Number(definition.maxTrees) ||
    Boolean(plan.isActive) !== Boolean(definition.isActive) ||
    hasFeatureChanges(plan.features, desiredFeatures);

  if (shouldSave) {
    plan.name = definition.name;
    plan.priceMonthly = Number(definition.priceMonthly);
    plan.priceYearly = Number(definition.priceYearly);
    plan.maxMembers = Number(definition.maxMembers);
    plan.maxTrees = Number(definition.maxTrees);
    plan.features = desiredFeatures;
    plan.isActive = Boolean(definition.isActive);
    await plan.save(sessionOptions(session));
  }

  return plan;
};

const ensureConfiguredPlans = async (session = null) => {
  const corePlans = new Map();

  for (const definition of CORE_PLAN_DEFINITIONS) {
    const plan = await upsertCorePlan(definition, session);
    corePlans.set(normalizePlanName(definition.name), plan);
  }

  const freePlan = corePlans.get("free");
  if (!freePlan) {
    const error = new Error("Unable to provision default free plan.");
    error.statusCode = 500;
    throw error;
  }

  await Plan.updateMany(
    {
      isDefault: true,
      _id: {
        $ne: freePlan._id
      }
    },
    {
      $set: {
        isDefault: false
      }
    },
    sessionOptions(session)
  );

  if (!freePlan.isDefault) {
    freePlan.isDefault = true;
    await freePlan.save(sessionOptions(session));
  }

  return corePlans;
};

const ensureDefaultFreePlan = async (session = null) => {
  const configuredPlans = await ensureConfiguredPlans(session);
  const freePlan = configuredPlans.get("free");

  if (!freePlan) {
    const error = new Error("Unable to provision default free plan.");
    error.statusCode = 500;
    throw error;
  }

  return freePlan;
};

const getActiveSubscriptionDocument = async (userId, session = null) => {
  const activeSubscription = await withSession(
    Subscription.findOne({ userId, status: "active" })
      .sort({ startDate: -1 })
      .populate("planId"),
    session
  );

  if (!activeSubscription) {
    return null;
  }

  if (!isExpired(activeSubscription)) {
    return activeSubscription;
  }

  activeSubscription.status = "expired";
  await activeSubscription.save(sessionOptions(session));
  return null;
};

const ensureDefaultSubscriptionForUser = async (userId, session = null) => {
  let activeSubscription = await getActiveSubscriptionDocument(userId, session);
  if (activeSubscription) {
    return activeSubscription;
  }

  const freePlan = await ensureDefaultFreePlan(session);

  try {
    const newSubscription = new Subscription({
      userId,
      planId: freePlan._id,
      startDate: new Date(),
      endDate: null,
      status: "active",
      billingCycle: "monthly",
      paymentReference: null
    });

    await newSubscription.save(sessionOptions(session));
  } catch (error) {
    if (!error || error.code !== 11000) {
      throw error;
    }
  }

  activeSubscription = await getActiveSubscriptionDocument(userId, session);
  return activeSubscription;
};

const getTreeIdsByOwner = async (ownerId, session = null) => {
  const trees = await withSession(FamilyTree.find({ owner: ownerId }).select("_id").lean(), session);
  return trees.map((tree) => tree._id);
};

const getUsageByOwner = async (ownerId, session = null) => {
  const treeIds = await getTreeIdsByOwner(ownerId, session);
  const treesUsed = treeIds.length;
  const membersUsed = treesUsed ? await withSession(Member.countDocuments({ treeId: { $in: treeIds } }), session) : 0;

  return {
    treesUsed,
    membersUsed
  };
};

const getSubscriptionStateForUser = async (userId, session = null) => {
  let activeSubscription = await ensureDefaultSubscriptionForUser(userId, session);
  const usage = await getUsageByOwner(userId, session);

  if (activeSubscription && activeSubscription.planId && !activeSubscription.planId.isActive) {
    activeSubscription.status = "cancelled";
    activeSubscription.endDate = new Date();
    await activeSubscription.save(sessionOptions(session));
    activeSubscription = await ensureDefaultSubscriptionForUser(userId, session);
  }

  const activePlan = activeSubscription && activeSubscription.planId ? activeSubscription.planId : null;

  const maxTrees = activePlan ? Number(activePlan.maxTrees || 0) : 0;
  const maxMembers = activePlan ? Number(activePlan.maxMembers || 0) : 0;

  const treesRemaining = Math.max(maxTrees - usage.treesUsed, 0);
  const membersRemaining = Math.max(maxMembers - usage.membersUsed, 0);

  const treeLimitReached = maxTrees <= 0 ? true : usage.treesUsed >= maxTrees;
  const memberLimitReached = maxMembers <= 0 ? true : usage.membersUsed >= maxMembers;

  return {
    hasActiveSubscription: Boolean(activePlan),
    subscription: activeSubscription ? toSubscriptionSummary(activeSubscription) : null,
    plan: toPlanSummary(activePlan),
    usage: {
      treesUsed: usage.treesUsed,
      membersUsed: usage.membersUsed,
      maxTrees,
      maxMembers,
      treesRemaining,
      membersRemaining,
      treeLimitReached,
      memberLimitReached
    }
  };
};

const ensureTreeCreateAllowed = async (ownerId, session = null) => {
  const state = await getSubscriptionStateForUser(ownerId, session);

  if (!state.hasActiveSubscription) {
    throw forbidden("Active subscription required. Please subscribe to a plan before creating trees.");
  }

  const canCreateFirstTree = state.usage.treesUsed === 0 && state.usage.maxTrees >= 1;
  if (state.usage.treeLimitReached && !canCreateFirstTree) {
    throw forbidden(`Tree limit reached for plan ${state.plan.name}. Upgrade your plan to create more trees.`);
  }

  return state;
};

const ensureMemberCreateAllowed = async ({ treeId, session = null }) => {
  const tree = await withSession(FamilyTree.findById(treeId).select("_id owner rootMember rootMemberId"), session);

  if (!tree) {
    throw notFound("Family tree not found.");
  }

  const state = await getSubscriptionStateForUser(tree.owner, session);

  if (!state.hasActiveSubscription) {
    throw forbidden("Active subscription required. Subscribe to a plan to add members.");
  }

  if (state.usage.memberLimitReached) {
    if (state.plan && String(state.plan.name).toLowerCase() === "free" && Number(state.usage.maxMembers) === 10) {
      throw forbidden("Free plan allows only 10 members. Upgrade to continue.");
    }

    throw forbidden(`Member limit reached for plan ${state.plan.name}. Upgrade your plan to add more members.`);
  }

  return {
    tree,
    ownerId: tree.owner,
    state
  };
};

const getPublicPlans = async () => {
  await ensureConfiguredPlans();
  const plans = await Plan.find({
    isActive: true,
    name: {
      $in: CORE_PLAN_NAMES
    }
  })
    .sort({ priceMonthly: 1, createdAt: 1 })
    .lean();

  return plans.map((plan) => toPlanSummary(plan));
};

module.exports = {
  ensureTreeCreateAllowed,
  ensureMemberCreateAllowed,
  getSubscriptionStateForUser,
  getActiveSubscriptionDocument,
  getUsageByOwner,
  getPublicPlans,
  ensureConfiguredPlans,
  ensureDefaultFreePlan,
  ensureDefaultSubscriptionForUser,
  FREE_PLAN_DEFINITION,
  CORE_PLAN_DEFINITIONS
};
