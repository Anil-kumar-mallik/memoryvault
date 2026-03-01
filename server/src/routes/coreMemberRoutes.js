const express = require("express");
const { param, query } = require("express-validator");
const {
  createMember,
  updateMember,
  deleteMember,
  getMemberWithRelations,
  removeMemberRelation
} = require("../controllers/memberController");
const upload = require("../config/multer");
const { sanitizeRequest } = require("../middleware/requestSecurityMiddleware");
const { validateUploadedImage } = require("../middleware/uploadSecurityMiddleware");
const { validateBody } = require("../middleware/joiValidationMiddleware");
const {
  createCoreMemberBodySchema,
  updateMemberBodySchema,
  removeMemberRelationBodySchema
} = require("../validation/bodySchemas");
const { optionalAuth, protect } = require("../middleware/authMiddleware");
const {
  attachTreeContext,
  requireTreeReadAccess,
  requireTreeWriteAccess
} = require("../middleware/treeAccessMiddleware");
const {
  setTreeContextFromMemberParam,
  setTreeIdFromBody,
  setTreeContextFromBodyMemberId
} = require("../middleware/memberContextMiddleware");

const router = express.Router();

router.post(
  "/add",
  protect,
  upload.single("profileImage"),
  sanitizeRequest,
  validateUploadedImage,
  validateBody(createCoreMemberBodySchema),
  setTreeIdFromBody,
  attachTreeContext,
  requireTreeWriteAccess,
  createMember
);

router.put(
  "/update/:id",
  protect,
  [
    param("id").isMongoId().withMessage("Valid member id is required.")
  ],
  upload.single("profileImage"),
  sanitizeRequest,
  validateUploadedImage,
  validateBody(updateMemberBodySchema),
  setTreeContextFromMemberParam,
  attachTreeContext,
  requireTreeWriteAccess,
  updateMember
);

router.delete(
  "/delete/:id",
  protect,
  [
    param("id").isMongoId().withMessage("Valid member id is required."),
    query("subtree").optional().isBoolean().withMessage("subtree must be true or false.")
  ],
  setTreeContextFromMemberParam,
  attachTreeContext,
  requireTreeWriteAccess,
  deleteMember
);

router.get(
  "/:id",
  optionalAuth,
  [
    param("id").isMongoId().withMessage("Valid member id is required."),
    query("childrenPage").optional().isInt({ min: 1 }).withMessage("childrenPage must be >= 1."),
    query("childrenLimit").optional().isInt({ min: 1, max: 100 }).withMessage("childrenLimit must be 1-100."),
    query("spouseLimit").optional().isInt({ min: 1, max: 120 }).withMessage("spouseLimit must be 1-120."),
    query("siblingLimit").optional().isInt({ min: 1, max: 120 }).withMessage("siblingLimit must be 1-120.")
  ],
  setTreeContextFromMemberParam,
  attachTreeContext,
  requireTreeReadAccess,
  getMemberWithRelations
);

router.put(
  "/remove-relation",
  protect,
  sanitizeRequest,
  validateBody(removeMemberRelationBodySchema),
  setTreeContextFromBodyMemberId,
  attachTreeContext,
  requireTreeWriteAccess,
  removeMemberRelation
);

module.exports = router;
