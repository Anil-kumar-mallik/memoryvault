const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { validateBody } = require("../middleware/joiValidationMiddleware");
const { paymentCreateOrderBodySchema, paymentVerifyBodySchema } = require("../validation/bodySchemas");
const { createOrder, verifyPayment } = require("../controllers/paymentController");

const router = express.Router();

router.post("/create-order", protect, validateBody(paymentCreateOrderBodySchema), createOrder);
router.post("/verify", protect, validateBody(paymentVerifyBodySchema), verifyPayment);

module.exports = router;
