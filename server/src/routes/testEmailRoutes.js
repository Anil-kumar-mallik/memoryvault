const express = require("express");
const { sendTestEmail } = require("../controllers/testEmailController");

const router = express.Router();

router.get("/test-email", sendTestEmail);

module.exports = router;
