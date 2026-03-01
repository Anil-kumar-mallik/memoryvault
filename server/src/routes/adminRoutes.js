const express = require("express");
const { param, query } = require("express-validator");
const { getMyTrees, deleteTree } = require("../controllers/treeController");
const { getAllUsers, getIntegrityCheck, getAuditLogs } = require("../controllers/adminController");
const { createPlan, getAllPlans, updatePlan, deletePlan } = require("../controllers/planController");
const { protect, authorizeRoles } = require("../middleware/authMiddleware");
const { attachTreeContext, requireTreeWriteAccess, mapTreeIdParam } = require("../middleware/treeAccessMiddleware");
const { validateBody } = require("../middleware/joiValidationMiddleware");
const { createPlanBodySchema, updatePlanBodySchema } = require("../validation/bodySchemas");

const router = express.Router();

router.use(protect, authorizeRoles("admin"));

router.get("/all-trees", getMyTrees);
router.get("/all-users", getAllUsers);
router.get(
  "/audit-logs",
  [
    query("page").optional().isInt({ min: 1 }).withMessage("page must be >= 1."),
    query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("limit must be 1-100."),
    query("userId").optional().isMongoId().withMessage("userId must be a valid Mongo id.")
  ],
  getAuditLogs
);
router.post("/plan/create", validateBody(createPlanBodySchema), createPlan);
router.get("/plan/all", getAllPlans);
router.put(
  "/plan/update/:id",
  [param("id").isMongoId().withMessage("Valid plan id is required.")],
  validateBody(updatePlanBodySchema),
  updatePlan
);
router.delete(
  "/plan/delete/:id",
  [param("id").isMongoId().withMessage("Valid plan id is required.")],
  deletePlan
);
router.get(
  "/integrity-check",
  [query("treeId").optional().isMongoId().withMessage("treeId must be a valid Mongo id.")],
  getIntegrityCheck
);
router.delete(
  "/delete-tree/:id",
  [param("id").isMongoId().withMessage("Valid tree id is required.")],
  mapTreeIdParam("id"),
  attachTreeContext,
  requireTreeWriteAccess,
  deleteTree
);

module.exports = router;
