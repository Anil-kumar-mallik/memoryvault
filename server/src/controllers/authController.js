const crypto = require("crypto");
const User = require("../models/User");
const generateToken = require("../utils/generateToken");
const validateRequest = require("../utils/validateRequest");
const { sanitizeText } = require("../middleware/requestSecurityMiddleware");
const { ensureDefaultSubscriptionForUser } = require("../utils/subscriptionService");
const { sendPasswordResetMail } = require("../utils/emailService");
const { buildUserProfileFields } = require("../utils/userProfileFields");
const logger = require("../utils/logger");

const sanitizeUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  profileImage: user.profileImage || null,
  dateOfBirth: user.dateOfBirth || null,
  education: user.education || null,
  qualification: user.qualification || null,
  designation: user.designation || null,
  addressPermanent: user.addressPermanent || null,
  addressCurrent: user.addressCurrent || null,
  phoneNumber: user.phoneNumber || null,
  role: user.role,
  isEmailVerified: Boolean(user.isEmailVerified),
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

const hashToken = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const createOpaqueToken = () => crypto.randomBytes(32).toString("hex");
const PASSWORD_RESET_TTL_MS = Math.max(
  Number.parseInt(process.env.PASSWORD_RESET_TOKEN_TTL_MS || "3600000", 10) || 3600000,
  300000
);

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

    let user = null;
    try {
      user = await User.create({
        name: sanitizeText(String(name).trim()),
        email: normalizedEmail,
        password,
        role: "user",
        isEmailVerified: true,
        emailVerificationTokenHash: null,
        emailVerificationTokenExpiresAt: null,
        ...buildUserProfileFields(req.body)
      });

      await ensureDefaultSubscriptionForUser(user._id);
    } catch (registrationError) {
      if (user && user._id) {
        await User.deleteOne({ _id: user._id });
      }
      throw registrationError;
    }

    res.status(201).json({
      message: "Registration successful.",
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
  requestPasswordReset,
  resetPassword
};
