const express = require("express");
const { param } = require("express-validator");
const { createTree, getMyTrees, updateTreeSettings, deleteTree, exportFullTree, importTree } = require("../controllers/treeController");
const { protect } = require("../middleware/authMiddleware");
const { attachTreeContext, requireTreeOwnerAccess, mapTreeIdParam } = require("../middleware/treeAccessMiddleware");
const { validateBody } = require("../middleware/joiValidationMiddleware");
const { createTreeBodySchema, updateTreeBodySchema, treeImportBodySchema } = require("../validation/bodySchemas");

const router = express.Router();

router.post(
  "/create",
  protect,
  validateBody(createTreeBodySchema),
  createTree
);

router.get("/my-trees", protect, getMyTrees);

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
  "/delete/:id",
  protect,
  [param("id").isMongoId().withMessage("Valid tree id is required.")],
  mapTreeIdParam("id"),
  attachTreeContext,
  requireTreeOwnerAccess,
  deleteTree
);

module.exports = router;
