const express = require("express");
const { loginUser, registerUser, verifyEmail, requestPasswordReset, resetPassword } = require("../controllers/authController");
const { validateBody } = require("../middleware/joiValidationMiddleware");
const {
  loginBodySchema,
  registerBodySchema,
  passwordResetRequestBodySchema,
  passwordResetConfirmBodySchema,
  verifyEmailBodySchema
} = require("../validation/bodySchemas");

const router = express.Router();

router.post("/register", validateBody(registerBodySchema), registerUser);

router.post("/login", validateBody(loginBodySchema), loginUser);
router.get("/verify-email", verifyEmail);
router.post("/verify-email", validateBody(verifyEmailBodySchema), verifyEmail);
router.post("/password-reset/request", validateBody(passwordResetRequestBodySchema), requestPasswordReset);
router.post("/password-reset/confirm", validateBody(passwordResetConfirmBodySchema), resetPassword);

module.exports = router;
