const nodemailer = require("nodemailer");
const logger = require("./logger");

let transporter = null;
let initialized = false;
const isEmailEnabled = () => String(process.env.EMAIL_ENABLED || "true").toLowerCase() !== "false";

const hasSmtpConfig = () =>
  Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.EMAIL_FROM
  );

const getTransporter = () => {
  if (initialized) {
    return transporter;
  }

  initialized = true;

  if (!isEmailEnabled()) {
    logger.info("Email sending disabled by EMAIL_ENABLED=false.");
    transporter = null;
    return transporter;
  }

  if (!hasSmtpConfig()) {
    logger.warn("SMTP configuration missing. Email sending is disabled.");
    transporter = null;
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number.parseInt(String(process.env.SMTP_PORT), 10),
    secure: Number.parseInt(String(process.env.SMTP_PORT), 10) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  return transporter;
};

const sendEmail = async ({ to, subject, text, html = null }) => {
  const smtpTransport = getTransporter();
  if (!smtpTransport) {
    return {
      sent: false,
      skipped: true
    };
  }

  await smtpTransport.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    text,
    ...(html ? { html } : {})
  });

  return {
    sent: true,
    skipped: false
  };
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
  sendEmailVerificationMail,
  sendPasswordResetMail,
  sendSubscriptionConfirmationMail,
  sendPaymentSuccessMail
};
