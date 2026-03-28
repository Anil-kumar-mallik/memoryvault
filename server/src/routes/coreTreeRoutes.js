const express = require("express");
const mongoose = require("mongoose");
const { param } = require("express-validator");
const FamilyTree = require("../models/FamilyTree");
const {
  createTree,
  getMyTrees,
  updateTreeSettings,
  deleteTree,
  getDeletedTreesBin,
  restoreTree,
  permanentlyDeleteTree,
  exportFullTree,
  importTree
} = require("../controllers/treeController");
const { protect } = require("../middleware/authMiddleware");
const { attachTreeContext, requireTreeOwnerAccess, mapTreeIdParam } = require("../middleware/treeAccessMiddleware");
const { validateBody } = require("../middleware/joiValidationMiddleware");
const validateRequest = require("../utils/validateRequest");
const { createTreeBodySchema, updateTreeBodySchema, treeImportBodySchema } = require("../validation/bodySchemas");

const router = express.Router();

const sendTreeMovedToBinResponse = (_req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (payload) => {
    if (payload && payload.softDeleted === true) {
      return originalJson({
        success: true,
        message: "Tree moved to bin"
      });
    }

    return originalJson(payload);
  };

  next();
};

const attachOwnedTreeContext = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      res.status(400).json({ message: "Invalid tree id." });
      return;
    }

    const ownerId = req.user?.id || req.user?._id;
    const tree = await FamilyTree.findOne({ _id: req.params.id, owner: ownerId });

    if (!tree) {
      res.status(404).json({ message: "Family tree not found." });
      return;
    }

    req.tree = tree;
    next();
  } catch (error) {
    next(error);
  }
};

router.post(
  "/create",
  protect,
  validateBody(createTreeBodySchema),
  createTree
);

router.get("/my-trees", protect, getMyTrees);
router.get("/bin", protect, getDeletedTreesBin);

router.get(
  "/:id/export-full",
  protect,
  [param("id").isMongoId().withMessage("Valid tree id is required.")],
  mapTreeIdParam("id"),
  attachTreeContext,
  requireTreeOwnerAccess,
  exportFullTree
);

router.post("/import", protect, validateBody(treeImportBodySchema), importTree);

router.put(
  "/update/:id",
  protect,
  [param("id").isMongoId().withMessage("Valid tree id is required.")],
  mapTreeIdParam("id"),
  attachTreeContext,
  requireTreeOwnerAccess,
  validateBody(updateTreeBodySchema),
  updateTreeSettings
);

router.delete(
  "/:id",
  protect,
  [param("id").isMongoId().withMessage("Valid tree id is required.")],
  attachOwnedTreeContext,
  sendTreeMovedToBinResponse,
  deleteTree
);

router.post(
  "/restore/:id",
  protect,
  [param("id").isMongoId().withMessage("Valid tree id is required.")],
  restoreTree
);

router.delete(
  "/permanent/:id",
  protect,
  [param("id").isMongoId().withMessage("Valid tree id is required.")],
  permanentlyDeleteTree
);

router.delete(
  "/delete/:id",
  protect,
  [param("id").isMongoId().withMessage("Valid tree id is required.")],
  mapTreeIdParam("id"),
  attachTreeContext,
  requireTreeOwnerAccess,
  deleteTree
);

module.exports = router;
