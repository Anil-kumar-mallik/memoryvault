const express = require("express");
const { param, query } = require("express-validator");
const {
  createMember,
  deleteMember,
  getMemberGraph,
  getMemberWithRelations,
  listMembers,
  updateMemberRelation,
  updateMember
} = require("../controllers/memberController");
const upload = require("../config/multer");
const { sanitizeRequest } = require("../middleware/requestSecurityMiddleware");
const { validateUploadedImage } = require("../middleware/uploadSecurityMiddleware");
const { validateBody } = require("../middleware/joiValidationMiddleware");
const {
  createMemberBodySchema,
  updateMemberBodySchema,
  memberRelationMutationBodySchema
} = require("../validation/bodySchemas");
const { optionalAuth, protect } = require("../middleware/authMiddleware");
const {
  attachTreeContext,
  requireTreeReadAccess,
  requireTreeWriteAccess
} = require("../middleware/treeAccessMiddleware");

const router = express.Router({ mergeParams: true });

router
  .route("/")
  .get(
    optionalAuth,
    [
      param("treeId").isMongoId().withMessage("Valid tree id is required."),
      query("page").optional().isInt({ min: 1 }).withMessage("Page must be >= 1."),
      query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be 1-100."),
      query("search").optional().isLength({ max: 140 }).withMessage("search max length is 140.")
    ],
    attachTreeContext,
    requireTreeReadAccess,
    listMembers
  )
  .post(
    protect,
    [param("treeId").isMongoId().withMessage("Valid tree id is required.")],
    attachTreeContext,
    requireTreeWriteAccess,
    upload.single("profileImage"),
    sanitizeRequest,
    validateUploadedImage,
    validateBody(createMemberBodySchema),
    createMember
  );

router
  .route("/:memberId")
  .get(
    optionalAuth,
    [
      param("treeId").isMongoId().withMessage("Valid tree id is required."),
      query("childrenPage").optional().isInt({ min: 1 }).withMessage("childrenPage must be >= 1."),
      query("childrenLimit").optional().isInt({ min: 1, max: 100 }).withMessage("childrenLimit must be 1-100."),
      query("spouseLimit").optional().isInt({ min: 1, max: 120 }).withMessage("spouseLimit must be 1-120."),
      query("siblingLimit").optional().isInt({ min: 1, max: 120 }).withMessage("siblingLimit must be 1-120.")
    ],
    attachTreeContext,
    requireTreeReadAccess,
    getMemberWithRelations
  )
  .put(
    protect,
    [
      param("treeId").isMongoId().withMessage("Valid tree id is required."),
      param("memberId").isMongoId().withMessage("Valid member id is required.")
    ],
    attachTreeContext,
    requireTreeWriteAccess,
    upload.single("profileImage"),
    sanitizeRequest,
    validateUploadedImage,
    validateBody(updateMemberBodySchema),
    updateMember
  )
  .delete(
    protect,
    [
      param("treeId").isMongoId().withMessage("Valid tree id is required."),
      param("memberId").isMongoId().withMessage("Valid member id is required."),
      query("subtree").optional().isBoolean().withMessage("subtree must be true or false.")
    ],
    attachTreeContext,
    requireTreeWriteAccess,
    deleteMember
  );

router.get(
  "/:memberId/relations",
  optionalAuth,
  [
    param("treeId").isMongoId().withMessage("Valid tree id is required."),
    query("childrenPage").optional().isInt({ min: 1 }).withMessage("childrenPage must be >= 1."),
    query("childrenLimit").optional().isInt({ min: 1, max: 100 }).withMessage("childrenLimit must be 1-100."),
    query("spouseLimit").optional().isInt({ min: 1, max: 120 }).withMessage("spouseLimit must be 1-120."),
    query("siblingLimit").optional().isInt({ min: 1, max: 120 }).withMessage("siblingLimit must be 1-120.")
  ],
  attachTreeContext,
  requireTreeReadAccess,
  getMemberWithRelations
);

router.patch(
  "/:memberId/relations",
  protect,
  [
    param("treeId").isMongoId().withMessage("Valid tree id is required."),
    param("memberId").isMongoId().withMessage("Valid member id is required.")
  ],
  attachTreeContext,
  requireTreeWriteAccess,
  sanitizeRequest,
  validateBody(memberRelationMutationBodySchema),
  updateMemberRelation
);

router.get(
  "/:memberId/graph",
  optionalAuth,
  [
    param("treeId").isMongoId().withMessage("Valid tree id is required."),
    param("memberId").isMongoId().withMessage("Valid member id is required."),
    query("depth").optional().isInt({ min: 1, max: 4 }).withMessage("depth must be 1-4."),
    query("limit").optional().isInt({ min: 1, max: 600 }).withMessage("limit must be 1-600.")
  ],
  attachTreeContext,
  requireTreeReadAccess,
  getMemberGraph
);

module.exports = router;
