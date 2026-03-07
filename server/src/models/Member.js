const mongoose = require("mongoose");
const { normalizeDatesFromLegacy } = require("../utils/dateNormalizer");

const dedupeObjectIdArray = (values, selfId) => {
  if (!Array.isArray(values)) {
    return [];
  }

  const unique = new Set();
  const normalized = [];

  for (const value of values) {
    if (!value) {
      continue;
    }

    const id = String(value);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      continue;
    }

    if (selfId && id === selfId) {
      continue;
    }

    if (!unique.has(id)) {
      unique.add(id);
      normalized.push(value);
    }
  }

  return normalized;
};

const memberSchema = new mongoose.Schema(
  {
    treeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FamilyTree",
      required: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140
    },
    note: {
      type: String,
      default: "",
      maxlength: 2000
    },
    fatherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      default: null
    },
    motherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      default: null
    },
    isRoot: {
      type: Boolean,
      default: false
    },
    linkedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    spouses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Member"
      }
    ],
    children: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Member"
      }
    ],
    siblings: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Member"
      }
    ],
    profileImage: {
      type: String,
      default: null
    },
    gender: {
      type: String,
      enum: ["male", "female", "other", "unspecified"],
      default: "unspecified"
    },
    birthDate: {
      type: Date,
      default: null
    },
    dateOfBirth: {
      type: Date,
      default: null
    },
    anniversaryDate: {
      type: Date,
      default: null
    },
    deathDate: {
      type: Date,
      default: null
    },
    dateOfDeath: {
      type: Date,
      default: null
    },
    importantDateEntries: {
      type: [
        {
          _id: false,
          type: {
            type: String,
            enum: ["dob", "anniversary", "death", "custom"],
            required: true
          },
          value: {
            type: String,
            required: true,
            trim: true,
            maxlength: 10
          },
          label: {
            type: String,
            trim: true,
            maxlength: 160,
            default: undefined
          }
        }
      ],
      default: undefined
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
    importantNotes: {
      type: String,
      default: null,
      maxlength: 2000
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    bio: {
      type: String,
      default: "",
      maxlength: 2000
    }
  },
  {
    timestamps: true
  }
);

memberSchema.pre("validate", function normalizeRelations(next) {
  const selfId = this._id ? String(this._id) : null;

  this.spouses = dedupeObjectIdArray(this.spouses, selfId);
  this.children = dedupeObjectIdArray(this.children, selfId);
  this.siblings = dedupeObjectIdArray(this.siblings, selfId);

  if (this.fatherId && selfId && String(this.fatherId) === selfId) {
    this.invalidate("fatherId", "fatherId cannot reference the same member.");
  }

  if (this.motherId && selfId && String(this.motherId) === selfId) {
    this.invalidate("motherId", "motherId cannot reference the same member.");
  }

  if (this.fatherId && this.motherId && String(this.fatherId) === String(this.motherId)) {
    this.invalidate("motherId", "fatherId and motherId cannot be identical.");
  }

  next();
});

memberSchema.virtual("importantDates").get(function resolveImportantDates() {
  return normalizeDatesFromLegacy(this);
});

memberSchema.index({ treeId: 1, createdAt: 1 });
memberSchema.index({ treeId: 1 });
memberSchema.index({ fatherId: 1 });
memberSchema.index({ motherId: 1 });
memberSchema.index({ spouses: 1 });
memberSchema.index({ children: 1 });
memberSchema.index({ siblings: 1 });
memberSchema.index({ treeId: 1, updatedAt: -1 });
memberSchema.index({ treeId: 1, name: 1 });
memberSchema.index({ treeId: 1, _id: 1 });
memberSchema.index({ treeId: 1, fatherId: 1, createdAt: 1 });
memberSchema.index({ treeId: 1, motherId: 1, createdAt: 1 });
memberSchema.index({ treeId: 1, spouses: 1 });
memberSchema.index({ treeId: 1, siblings: 1 });
memberSchema.index({ treeId: 1, children: 1 });
memberSchema.index({ linkedUserId: 1 });
memberSchema.index(
  { treeId: 1, isRoot: 1 },
  {
    unique: true,
    partialFilterExpression: { isRoot: true }
  }
);

module.exports = mongoose.model("Member", memberSchema);
