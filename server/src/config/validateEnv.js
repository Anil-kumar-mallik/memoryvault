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
    requireEnv("RESEND_API_KEY");
  }

  if (String(process.env.NODE_ENV || "").toLowerCase() === "production") {
    requireEnv("CLIENT_URL");
  }
};

module.exports = validateEnv;
