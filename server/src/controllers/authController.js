const crypto = require("crypto");
const User = require("../models/User");
const generateToken = require("../utils/generateToken");
const validateRequest = require("../utils/validateRequest");
const { sanitizeText } = require("../middleware/requestSecurityMiddleware");
const { ensureDefaultSubscriptionForUser } = require("../utils/subscriptionService");
const { sendEmailVerificationMail, sendPasswordResetMail } = require("../utils/emailService");
const logger = require("../utils/logger");

const sanitizeUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  profileImage: user.profileImage || null,
  role: user.role,
  isEmailVerified: Boolean(user.isEmailVerified),
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

const hashToken = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const createOpaqueToken = () => crypto.randomBytes(32).toString("hex");
const EMAIL_VERIFICATION_TTL_MS = Math.max(
  Number.parseInt(process.env.EMAIL_VERIFICATION_TOKEN_TTL_MS || "86400000", 10) || 86400000,
  300000
);
const PASSWORD_RESET_TTL_MS = Math.max(
  Number.parseInt(process.env.PASSWORD_RESET_TOKEN_TTL_MS || "3600000", 10) || 3600000,
  300000
);
const allowUnverifiedLogin = String(process.env.ALLOW_UNVERIFIED_LOGIN || "false").toLowerCase() === "true";

const createSessionTokens = async (user) => {
  const csrfToken = crypto.randomBytes(32).toString("hex");
  const tokenId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");

  user.tokenVersion = (user.tokenVersion || 0) + 1;
  user.activeTokenId = tokenId;
  user.csrfTokenHash = hashToken(csrfToken);
  await user.save();

  const token = generateToken({
    id: String(user._id),
    tokenVersion: user.tokenVersion,
    tokenId
  });

  return { token, csrfToken };
};

const createEmailVerificationTokenState = () => {
  const token = createOpaqueToken();
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS)
  };
};

const createPasswordResetTokenState = () => {
  const token = createOpaqueToken();
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS)
  };
};

const registerUser = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const { name, email, password } = req.body;
    const normalizedEmail = String(email).trim().toLowerCase();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      res.status(409).json({ message: "Email already in use." });
      return;
    }

    const verificationState = createEmailVerificationTokenState();
    if (
      !verificationState.token ||
      !verificationState.tokenHash ||
      !(verificationState.expiresAt instanceof Date)
    ) {
      throw new Error("Failed to initialize email verification token.");
    }

    let user = null;
    try {
      user = await User.create({
        name: sanitizeText(String(name).trim()),
        email: normalizedEmail,
        password,
        role: "user",
        isEmailVerified: false,
        emailVerificationTokenHash: verificationState.tokenHash,
        emailVerificationTokenExpiresAt: verificationState.expiresAt
      });

      await ensureDefaultSubscriptionForUser(user._id);
    } catch (registrationError) {
      if (user && user._id) {
        await User.deleteOne({ _id: user._id });
      }
      throw registrationError;
    }

    try {
      await sendEmailVerificationMail({
        email: user.email,
        name: user.name,
        token: verificationState.token
      });
    } catch (emailError) {
      logger.error("Failed to send verification email", {
        email: user.email,
        message: emailError.message
      });
    }

    res.status(201).json({
      message: "Registration successful. Verification email sent.",
      verificationRequired: true,
      user: sanitizeUser(user)
    });
  } catch (error) {
    next(error);
  }
};

const loginUser = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const { email, password } = req.body;
    const normalizedEmail = String(email).trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      logger.warn("Failed login attempt: user not found", { email: normalizedEmail });
      res.status(401).json({ message: "Invalid email or password." });
      return;
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      logger.warn("Failed login attempt: invalid password", {
        email: normalizedEmail,
        userId: String(user._id)
      });
      res.status(401).json({ message: "Invalid email or password." });
      return;
    }

    if (!user.isEmailVerified && !allowUnverifiedLogin) {
      logger.warn("Failed login attempt: unverified email", {
        email: normalizedEmail,
        userId: String(user._id)
      });
      res.status(403).json({
        message: "Email is not verified. Please verify your email before login.",
        verificationRequired: true
      });
      return;
    }

    if (!user.isEmailVerified && allowUnverifiedLogin) {
      logger.warn("Allowing unverified login due to ALLOW_UNVERIFIED_LOGIN=true", {
        email: normalizedEmail,
        userId: String(user._id)
      });
    }

    const { token, csrfToken } = await createSessionTokens(user);

    res.json({
      token,
      csrfToken,
      user: sanitizeUser(user)
    });
  } catch (error) {
    next(error);
  }
};

const verifyEmail = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const token = String(req.query.token || req.body.token || "").trim();
    if (!token) {
      res.status(400).json({ message: "Verification token is required." });
      return;
    }

    const tokenHash = hashToken(token);
    const user = await User.findOne({
      emailVerificationTokenHash: tokenHash,
      emailVerificationTokenExpiresAt: { $gt: new Date() }
    });

    if (!user) {
      res.status(400).json({ message: "Verification token is invalid or expired." });
      return;
    }

    user.isEmailVerified = true;
    user.emailVerificationTokenHash = null;
    user.emailVerificationTokenExpiresAt = null;
    await user.save();

    res.json({
      success: true,
      message: "Email verified successfully.",
      isVerified: true,
      user: sanitizeUser(user)
    });
  } catch (error) {
    next(error);
  }
};

const requestPasswordReset = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const normalizedEmail = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const genericResponse = {
      message: "If the account exists, a password reset email has been sent."
    };

    if (!normalizedEmail) {
      res.json(genericResponse);
      return;
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      res.json(genericResponse);
      return;
    }

    const resetState = createPasswordResetTokenState();
    user.passwordResetTokenHash = resetState.tokenHash;
    user.passwordResetTokenExpiresAt = resetState.expiresAt;
    await user.save();

    try {
      await sendPasswordResetMail({
        email: user.email,
        name: user.name,
        token: resetState.token
      });
    } catch (emailError) {
      logger.error("Failed to send password reset email", {
        email: user.email,
        message: emailError.message
      });
    }

    res.json(genericResponse);
  } catch (error) {
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    if (!validateRequest(req, res)) {
      return;
    }

    const token = String(req.body.token || "").trim();
    const newPassword = String(req.body.password || "");

    if (!token || !newPassword) {
      res.status(400).json({ message: "Token and password are required." });
      return;
    }

    const tokenHash = hashToken(token);
    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetTokenExpiresAt: { $gt: new Date() }
    });

    if (!user) {
      res.status(400).json({ message: "Reset token is invalid or expired." });
      return;
    }

    user.password = newPassword;
    user.passwordResetTokenHash = null;
    user.passwordResetTokenExpiresAt = null;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.activeTokenId = null;
    user.csrfTokenHash = null;
    await user.save();

    res.json({
      message: "Password reset successful. Please log in again."
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerUser,
  loginUser,
  verifyEmail,
  requestPasswordReset,
  resetPassword
};
