const { Resend } = require("resend");
const logger = require("./logger");

const RESEND_DEFAULT_FROM = "MemoryVault <onboarding@resend.dev>";
const REQUIRED_RESEND_ENV_KEYS = ["RESEND_API_KEY"];
let resendClient = null;
let resendClientApiKey = "";

const isEmailEnabled = () => String(process.env.EMAIL_ENABLED || "true").toLowerCase() !== "false";
const getMissingResendEnvVars = () =>
  REQUIRED_RESEND_ENV_KEYS.filter((key) => !String(process.env[key] || "").trim());

const parseEmailAddress = (value) => {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  const bracketMatch = raw.match(/<([^>]+)>/);
  if (bracketMatch && bracketMatch[1]) {
    return bracketMatch[1].trim().toLowerCase();
  }

  return raw.toLowerCase();
};

const getEmailDomain = (value) => {
  const email = parseEmailAddress(value);
  if (!email.includes("@")) {
    return "";
  }

  return email.split("@")[1].trim().toLowerCase();
};

const getResendVerifiedDomain = () => String(process.env.RESEND_VERIFIED_DOMAIN || "").trim().toLowerCase();

const resolveEmailFromAddress = () => {
  const configuredFrom = String(process.env.EMAIL_FROM || "").trim();
  const senderDomain = getEmailDomain(configuredFrom);
  const verifiedDomain = getResendVerifiedDomain();

  if (!configuredFrom) {
    logger.warn("EMAIL_FROM missing for Resend API. Falling back to default sender.", {
      fallbackFrom: RESEND_DEFAULT_FROM
    });
    return RESEND_DEFAULT_FROM;
  }

  if (senderDomain === "resend.dev") {
    return configuredFrom;
  }

  if (verifiedDomain && senderDomain === verifiedDomain) {
    return configuredFrom;
  }

  logger.warn("Custom EMAIL_FROM domain appears unverified for Resend API. Falling back to default sender.", {
    configuredFrom,
    senderDomain,
    verifiedDomain: verifiedDomain || null,
    fallbackFrom: RESEND_DEFAULT_FROM
  });
  return RESEND_DEFAULT_FROM;
};

const getProviderErrorMeta = (error, resendResponse = null) => ({
  message: error.message,
  response: error.response || resendResponse,
  code: error.code,
  command: error.command,
  stack: error.stack
});

const createDetailedSendError = (prefix, error, resendResponse = null) => {
  const providerResponse = error.response || resendResponse || error.message || "Email provider operation failed.";
  const detailedError = new Error(`${prefix}: ${error.message || "Email provider request failed."}`);
  detailedError.smtpResponse = providerResponse;
  detailedError.response = error.response;
  detailedError.code = error.code;
  detailedError.command = error.command;
  detailedError.stack = error.stack;
  return detailedError;
};

const getResendClient = () => {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) {
    return null;
  }
  if (!resendClient || resendClientApiKey !== apiKey) {
    resendClient = new Resend(apiKey);
    resendClientApiKey = apiKey;
  }
  return resendClient;
};

const sendEmail = async ({ to, subject, text, html = null, forceSend = false, context = "default" }) => {
  if (!forceSend && !isEmailEnabled()) {
    return {
      sent: false,
      skipped: true,
      smtpResponse: "Email sending disabled by EMAIL_ENABLED=false."
    };
  }

  const missingEnv = getMissingResendEnvVars();
  if (missingEnv.length) {
    const smtpResponse = `Resend configuration missing: ${missingEnv.join(", ")}`;
    logger.error("Resend configuration missing while sending email", {
      context,
      to,
      subject,
      missingEnv
    });

    if (forceSend) {
      const forceSendError = new Error(smtpResponse);
      forceSendError.smtpResponse = smtpResponse;
      throw forceSendError;
    }

    return {
      sent: false,
      skipped: true,
      smtpResponse
    };
  }

  const resend = getResendClient();
  if (!resend) {
    return {
      sent: false,
      skipped: true,
      smtpResponse: "Resend client unavailable."
    };
  }

  try {
    const fromAddress = resolveEmailFromAddress();
    const resendResponse = await resend.emails.send({
      from: fromAddress,
      to,
      subject,
      text,
      ...(html ? { html } : {})
    });

    if (resendResponse.error) {
      const providerError = new Error(resendResponse.error.message || "Resend API returned an error.");
      providerError.response = resendResponse.error;
      providerError.code = resendResponse.error.name || "RESEND_API_ERROR";
      throw createDetailedSendError("Resend send failed", providerError, resendResponse);
    }

    logger.info("Resend email sent", {
      context,
      to,
      subject,
      from: fromAddress,
      resendResponse
    });

    return {
      sent: true,
      skipped: false,
      smtpResponse: resendResponse.data || resendResponse,
      serverResponse: resendResponse
    };
  } catch (error) {
    logger.error("Resend email send failed", {
      context,
      to,
      subject,
      ...getProviderErrorMeta(error, error.response)
    });
    if (error.smtpResponse) {
      throw error;
    }
    throw createDetailedSendError("Resend send failed", error, error.response);
  }
};

const frontendBaseUrl = () =>
  String(process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:3000")
    .split(",")[0]
    .trim();

const sendEmailVerificationMail = async ({ email, name, token }) => {
  const verifyUrl = `${frontendBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  const subject = "Verify your MemoryVault email";
  const text = `Hello ${name},\n\nPlease verify your email by opening this link:\n${verifyUrl}\n\nIf you did not sign up, ignore this message.`;
  const html = `<p>Hello ${name},</p><p>Please verify your email by clicking <a href="${verifyUrl}">this link</a>.</p><p>If you did not sign up, ignore this message.</p>`;

  return sendEmail({
    to: email,
    subject,
    text,
    html
  });
};

const sendPasswordResetMail = async ({ email, name, token }) => {
  const resetUrl = `${frontendBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  const subject = "Reset your MemoryVault password";
  const text = `Hello ${name},\n\nReset your password using this link:\n${resetUrl}\n\nThis link expires soon.`;
  const html = `<p>Hello ${name},</p><p>Reset your password using <a href="${resetUrl}">this link</a>.</p><p>This link expires soon.</p>`;

  return sendEmail({
    to: email,
    subject,
    text,
    html
  });
};

const sendSubscriptionConfirmationMail = async ({ email, name, planName, endDate }) => {
  const subject = "MemoryVault subscription activated";
  const text = `Hello ${name},\n\nYour ${planName} subscription is active.\nValid until: ${new Date(endDate).toLocaleDateString()}.\n\nThank you for subscribing.`;
  const html = `<p>Hello ${name},</p><p>Your <strong>${planName}</strong> subscription is active.</p><p>Valid until: ${new Date(endDate).toLocaleDateString()}.</p><p>Thank you for subscribing.</p>`;

  return sendEmail({
    to: email,
    subject,
    text,
    html
  });
};

const sendPaymentSuccessMail = async ({ email, name, amount, currency, reference }) => {
  const subject = "MemoryVault payment successful";
  const text = `Hello ${name},\n\nPayment successful.\nAmount: ${amount} ${currency.toUpperCase()}\nReference: ${reference}\n\nYour subscription has been updated.`;
  const html = `<p>Hello ${name},</p><p>Payment successful.</p><p>Amount: <strong>${amount} ${currency.toUpperCase()}</strong><br/>Reference: <strong>${reference}</strong></p><p>Your subscription has been updated.</p>`;

  return sendEmail({
    to: email,
    subject,
    text,
    html
  });
};

module.exports = {
  sendEmail,
  getMissingResendEnvVars,
  sendEmailVerificationMail,
  sendPasswordResetMail,
  sendSubscriptionConfirmationMail,
  sendPaymentSuccessMail
};
