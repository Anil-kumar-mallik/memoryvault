const { sendEmail, getMissingResendEnvVars } = require("../utils/emailService");
const logger = require("../utils/logger");

const TEST_EMAIL_RECIPIENT = "debug+test@your-email.com";

const sendTestEmail = async (_req, res) => {
  const missingEnv = getMissingResendEnvVars();
  if (missingEnv.length) {
    const smtpResponse = `Missing required Resend env vars: ${missingEnv.join(", ")}`;
    logger.error("Test email failed due to missing Resend env", {
      missingEnv
    });

    res.status(500).json({
      success: false,
      message: "Resend configuration missing.",
      smtpResponse
    });
    return;
  }

  const timestamp = new Date().toISOString();
  const subject = "MemoryVault Test Email";
  const text = `MemoryVault Resend API test email.\nTimestamp: ${timestamp}`;

  try {
    const result = await sendEmail({
      to: TEST_EMAIL_RECIPIENT,
      subject,
      text,
      forceSend: true,
      context: "api-v1-test-email"
    });

    logger.info("Test email sent from debug endpoint", {
      to: TEST_EMAIL_RECIPIENT,
      timestamp,
      smtpResponse: result.serverResponse || result.smtpResponse
    });

    res.json({
      success: true,
      message: "Email sent",
      smtpResponse: result.serverResponse || result.smtpResponse
    });
  } catch (error) {
    const smtpResponse = error.smtpResponse || error.response || error.message;

    logger.error("Test email endpoint failed", {
      to: TEST_EMAIL_RECIPIENT,
      timestamp,
      message: error.message,
      stack: error.stack,
      smtpResponse
    });

    res.status(500).json({
      success: false,
      message: error.message,
      smtpResponse
    });
  }
};

module.exports = {
  sendTestEmail
};
