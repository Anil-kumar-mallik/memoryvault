const express = require("express");
const {
  getAccount,
  updateAccount,
  updateAccountPassword,
  deleteAccount
} = require("../controllers/accountController");
const upload = require("../config/multer");
const { sanitizeRequest } = require("../middleware/requestSecurityMiddleware");
const { validateUploadedImage } = require("../middleware/uploadSecurityMiddleware");
const { validateBody } = require("../middleware/joiValidationMiddleware");
const {
  accountUpdateBodySchema,
  accountPasswordBodySchema,
  accountDeleteBodySchema
} = require("../validation/bodySchemas");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", protect, getAccount);

router.put(
  "/update",
  protect,
  upload.single("profileImage"),
  sanitizeRequest,
  validateUploadedImage,
  validateBody(accountUpdateBodySchema),
  updateAccount
);

router.put(
  "/password",
  protect,
  validateBody(accountPasswordBodySchema),
  updateAccountPassword
);

router.delete(
  "/",
  protect,
  validateBody(accountDeleteBodySchema),
  deleteAccount
);

module.exports = router;
