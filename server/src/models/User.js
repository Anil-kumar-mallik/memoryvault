const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    profileImage: {
      type: String,
      default: null
    },
    dateOfBirth: {
      type: Date,
      default: null
    },
    education: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200
    },
    qualification: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200
    },
    designation: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200
    },
    addressPermanent: {
      type: String,
      default: null,
      trim: true,
      maxlength: 600
    },
    addressCurrent: {
      type: String,
      default: null,
      trim: true,
      maxlength: 600
    },
    phoneNumber: {
      type: String,
      default: null,
      trim: true,
      maxlength: 40
    },
    password: {
      type: String,
      required: true,
      minlength: 8
    },
    role: {
      type: String,
      enum: ["admin", "user"],
      default: "user",
      index: true
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
      index: true
    },
    emailVerificationTokenHash: {
      type: String,
      default: null
    },
    emailVerificationTokenExpiresAt: {
      type: Date,
      default: null
    },
    passwordResetTokenHash: {
      type: String,
      default: null
    },
    passwordResetTokenExpiresAt: {
      type: Date,
      default: null
    },
    tokenVersion: {
      type: Number,
      default: 0
    },
    activeTokenId: {
      type: String,
      default: null
    },
    csrfTokenHash: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

userSchema.pre("save", async function handlePasswordHash(next) {
  if (!this.isModified("password")) {
    next();
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
