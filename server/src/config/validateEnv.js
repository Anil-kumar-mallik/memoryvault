const isBlank = (value) => !value || !String(value).trim();

const requireEnv = (key) => {
  if (isBlank(process.env[key])) {
    throw new Error(`${key} environment variable is required.`);
  }
};

const validateEnv = () => {
  requireEnv("MONGO_URI");
  requireEnv("JWT_SECRET");
  requireEnv("RAZORPAY_KEY_ID");
  requireEnv("RAZORPAY_KEY_SECRET");

  const emailEnabled = String(process.env.EMAIL_ENABLED || "true").toLowerCase() !== "false";
  if (emailEnabled) {
    requireEnv("SMTP_HOST");
    requireEnv("SMTP_PORT");
    requireEnv("SMTP_USER");
    requireEnv("SMTP_PASS");
    requireEnv("EMAIL_FROM");
  }

  if (String(process.env.NODE_ENV || "").toLowerCase() === "production") {
    requireEnv("CLIENT_URL");
  }
};

module.exports = validateEnv;
