const express = require("express");
const { param } = require("express-validator");
const {
  createTree,
  deleteTree,
  getMyTrees,
  getTreeById,
  updateTreeSettings
} = require("../controllers/treeController");
const { validateBody } = require("../middleware/joiValidationMiddleware");
const { createTreeBodySchema, updateTreeBodySchema } = require("../validation/bodySchemas");
const { optionalAuth, protect } = require("../middleware/authMiddleware");
const {
  attachTreeContext,
  requireTreeReadAccess,
  requireTreeWriteAccess
} = require("../middleware/treeAccessMiddleware");

const router = express.Router();

router
  .route("/")
  .get(protect, getMyTrees)
  .post(protect, validateBody(createTreeBodySchema), createTree);

router
  .route("/:treeId")
  .get(
    optionalAuth,
    [param("treeId").isMongoId().withMessage("Valid tree id is required.")],
    attachTreeContext,
    requireTreeReadAccess,
    getTreeById
  )
  .put(
    protect,
    [param("treeId").isMongoId().withMessage("Valid tree id is required.")],
    attachTreeContext,
    requireTreeWriteAccess,
    validateBody(updateTreeBodySchema),
    updateTreeSettings
  )
  .delete(
    protect,
    [param("treeId").isMongoId().withMessage("Valid tree id is required.")],
    attachTreeContext,
    requireTreeWriteAccess,
    deleteTree
  );

module.exports = router;
