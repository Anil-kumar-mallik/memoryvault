const express = require("express");
const { param, query } = require("express-validator");
const { getTreeFocus } = require("../controllers/focusController");
const { optionalAuth } = require("../middleware/authMiddleware");
const { attachTreeContext, validateTreeAccess } = require("../middleware/treeAccessMiddleware");

const router = express.Router();

router.get(
  "/:treeId/focus/:memberId",
  optionalAuth,
  [
    param("treeId").isMongoId().withMessage("Valid tree id is required."),
    param("memberId").isMongoId().withMessage("Valid member id is required."),
    query("childrenPage").optional().isInt({ min: 1 }).withMessage("childrenPage must be >= 1."),
    query("childrenLimit").optional().isInt({ min: 1, max: 200 }).withMessage("childrenLimit must be 1-200."),
    query("spouseLimit").optional().isInt({ min: 1, max: 200 }).withMessage("spouseLimit must be 1-200."),
    query("siblingLimit").optional().isInt({ min: 1, max: 200 }).withMessage("siblingLimit must be 1-200.")
  ],
  attachTreeContext,
  validateTreeAccess,
  getTreeFocus
);

module.exports = router;
