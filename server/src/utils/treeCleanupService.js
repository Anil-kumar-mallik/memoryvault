const FamilyTree = require("../models/FamilyTree");
const Member = require("../models/Member");
const logger = require("./logger");
const withMongoTransaction = require("./withMongoTransaction");

const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MIN_CLEANUP_INTERVAL_MS = 60 * 1000;

const sessionOptions = (session) => (session ? { session } : {});

const retentionDays = Math.max(
  Number.parseInt(process.env.TREE_BIN_RETENTION_DAYS || String(DEFAULT_RETENTION_DAYS), 10) || DEFAULT_RETENTION_DAYS,
  1
);

const cleanupIntervalMs = Math.max(
  Number.parseInt(process.env.TREE_BIN_CLEANUP_INTERVAL_MS || String(DEFAULT_CLEANUP_INTERVAL_MS), 10) || DEFAULT_CLEANUP_INTERVAL_MS,
  MIN_CLEANUP_INTERVAL_MS
);

const getCleanupCutoffDate = () => new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

const runTreeCleanupOnce = async () => {
  const cutoffDate = getCleanupCutoffDate();
  const expiredTrees = await FamilyTree.find({
    deletedAt: {
      $ne: null,
      $lte: cutoffDate
    }
  })
    .onlyDeleted()
    .select("_id owner deletedAt")
    .lean();

  if (!expiredTrees.length) {
    return {
      deletedTrees: 0,
      deletedMembers: 0
    };
  }

  const expiredTreeIds = expiredTrees.map((tree) => tree._id);

  return withMongoTransaction(async (session) => {
    let query = FamilyTree.find({
      _id: { $in: expiredTreeIds },
      deletedAt: {
        $ne: null,
        $lte: cutoffDate
      }
    })
      .onlyDeleted()
      .select("_id")
      .lean();

    if (session) {
      query = query.session(session);
    }

    const eligibleTrees = await query;
    if (!eligibleTrees.length) {
      return {
        deletedTrees: 0,
        deletedMembers: 0
      };
    }

    const eligibleTreeIds = eligibleTrees.map((tree) => tree._id);
    const deletedMembersResult = await Member.deleteMany(
      {
        treeId: { $in: eligibleTreeIds }
      },
      sessionOptions(session)
    );
    const deletedTreesResult = await FamilyTree.deleteMany(
      {
        _id: { $in: eligibleTreeIds }
      },
      sessionOptions(session)
    );

    return {
      deletedTrees: deletedTreesResult.deletedCount || 0,
      deletedMembers: deletedMembersResult.deletedCount || 0
    };
  });
};

const startTreeCleanupService = () => {
  let isRunning = false;

  const executeCleanup = async () => {
    if (isRunning) {
      logger.warn("Tree cleanup skipped because a previous run is still in progress.");
      return;
    }

    isRunning = true;

    try {
      const result = await runTreeCleanupOnce();
      if (result.deletedTrees > 0 || result.deletedMembers > 0) {
        logger.info("Tree bin cleanup completed", {
          deletedTrees: result.deletedTrees,
          deletedMembers: result.deletedMembers,
          retentionDays
        });
      }
    } catch (error) {
      logger.error("Tree bin cleanup failed", {
        message: error.message,
        stack: error.stack
      });
    } finally {
      isRunning = false;
    }
  };

  const interval = setInterval(() => {
    void executeCleanup();
  }, cleanupIntervalMs);

  if (typeof interval.unref === "function") {
    interval.unref();
  }

  logger.info("Tree cleanup service started", {
    retentionDays,
    cleanupIntervalMs
  });

  void executeCleanup();

  return interval;
};

module.exports = {
  DEFAULT_RETENTION_DAYS,
  startTreeCleanupService,
  runTreeCleanupOnce
};
