const isBlank = (value) => !value || !String(value).trim();

const requireEnv = (key) => {
  if (isBlank(process.env[key])) {
    throw new Error(`${key} environment variable is required.`);
  }
};

const requireAtLeastOneEnv = (keys) => {
  const hasAny = keys.some((key) => !isBlank(process.env[key]));
  if (!hasAny) {
    throw new Error(`At least one environment variable is required: ${keys.join(", ")}.`);
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
    requireAtLeastOneEnv(["CLIENT_URL", "FRONTEND_URL", "VERCEL_PREVIEW_URL"]);
  }
};

module.exports = validateEnv;
