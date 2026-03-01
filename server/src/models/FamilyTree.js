const mongoose = require("mongoose");

const familyTreeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150
    },
    description: {
      type: String,
      default: "",
      maxlength: 1200
    },
    slug: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 72,
      unique: true,
      sparse: true,
      index: true
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    privacy: {
      type: String,
      enum: ["public", "private"],
      default: "private",
      index: true
    },
    isPrivate: {
      type: Boolean,
      default: false,
      index: true
    },
    passwordHash: {
      type: String,
      default: null
    },
    accessPassword: {
      type: String,
      default: null
    },
    rootMember: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      default: null
    },
    rootMemberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      default: null
    }
  },
  {
    timestamps: true
  }
);

familyTreeSchema.pre("validate", function syncLegacyAndCompatibilityFields(next) {
  const hasPrivacy = typeof this.privacy === "string";
  const hasIsPrivate = typeof this.isPrivate === "boolean";

  if (hasPrivacy) {
    this.isPrivate = this.privacy === "private";
  } else if (hasIsPrivate) {
    this.privacy = this.isPrivate ? "private" : "public";
  } else {
    this.privacy = "private";
    this.isPrivate = true;
  }

  if (this.passwordHash && !this.accessPassword) {
    this.accessPassword = this.passwordHash;
  } else if (!this.passwordHash && this.accessPassword) {
    this.passwordHash = this.accessPassword;
  }

  const normalizedRootMember = this.rootMember || this.rootMemberId || null;
  this.rootMember = normalizedRootMember;
  this.rootMemberId = normalizedRootMember;

  next();
});

module.exports = mongoose.model("FamilyTree", familyTreeSchema);
