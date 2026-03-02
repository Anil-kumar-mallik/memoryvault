const express = require("express");
const { loginUser, registerUser, requestPasswordReset, resetPassword } = require("../controllers/authController");
const { validateBody } = require("../middleware/joiValidationMiddleware");
const {
  loginBodySchema,
  registerBodySchema,
  passwordResetRequestBodySchema,
  passwordResetConfirmBodySchema
} = require("../validation/bodySchemas");

const router = express.Router();

router.post("/register", validateBody(registerBodySchema), registerUser);

router.post("/login", validateBody(loginBodySchema), loginUser);
router.post("/password-reset/request", validateBody(passwordResetRequestBodySchema), requestPasswordReset);
router.post("/password-reset/confirm", validateBody(passwordResetConfirmBodySchema), resetPassword);

module.exports = router;
