const express = require("express");
const { param } = require("express-validator");
const { getTreeBySlug } = require("../controllers/treeController");
const { optionalAuth } = require("../middleware/authMiddleware");
const { attachTreeContextBySlug, requireTreeReadAccess } = require("../middleware/treeAccessMiddleware");

const router = express.Router();

router.get(
  "/tree/:slug",
  optionalAuth,
  [
    param("slug")
      .isString()
      .trim()
      .isLength({ min: 3, max: 90 })
      .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .withMessage("Valid slug is required.")
  ],
  attachTreeContextBySlug,
  requireTreeReadAccess,
  getTreeBySlug
);

module.exports = router;
