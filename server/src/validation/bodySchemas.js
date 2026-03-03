const Joi = require("joi");

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectIdField = Joi.string().trim().pattern(objectIdRegex).messages({
  "string.pattern.base": "Must be a valid Mongo ObjectId."
});

const nullableObjectIdField = Joi.alternatives().try(objectIdField, Joi.string().valid(""), Joi.string().valid("null"), Joi.valid(null));

const nullableIsoDateField = Joi.alternatives().try(
  Joi.string().isoDate(),
  Joi.string().valid(""),
  Joi.string().valid("null"),
  Joi.valid(null)
);

const relationTypeField = Joi.string().valid("none", "father", "mother", "child", "spouse", "sibling");
const genderField = Joi.string().valid("male", "female", "other", "unspecified");
const optionalProfileTextField = Joi.string().allow("").max(200).optional();
const optionalAddressTextField = Joi.string().allow("").max(600).optional();
const optionalPhoneTextField = Joi.string().allow("").max(40).optional();
const optionalImportantNotesField = Joi.string().allow("").max(2000).optional();
const importantDateEntryField = Joi.object({
  type: Joi.string().valid("dob", "anniversary", "death", "custom").required(),
  value: nullableIsoDateField.required(),
  label: Joi.string().allow("").max(160).optional()
});
const importantDatesField = Joi.alternatives()
  .try(Joi.array().items(importantDateEntryField), Joi.string().trim(), Joi.valid(null))
  .optional();

const metadataField = Joi.alternatives().try(
  Joi.object().unknown(true),
  Joi.string()
    .trim()
    .custom((value, helpers) => {
      if (!value || value === "null") {
        return value;
      }

      try {
        const parsed = JSON.parse(value);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return helpers.message("metadata must be a valid JSON object.");
        }
      } catch (_error) {
        return helpers.message("metadata must be a valid JSON object.");
      }

      return value;
    }, "metadata object validation")
).optional();

const spousesField = Joi.alternatives().try(
  Joi.array().items(objectIdField),
  Joi.string()
    .trim()
    .custom((value, helpers) => {
      if (!value) {
        return value;
      }

      const trimmed = value.trim();
      if (trimmed.startsWith("[")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (!Array.isArray(parsed)) {
            return helpers.message("spouses must be an array of member ids.");
          }

          if (parsed.some((entry) => !objectIdRegex.test(String(entry)))) {
            return helpers.message("spouses must contain valid member ids.");
          }
        } catch (_error) {
          return helpers.message("spouses must be a valid JSON array of member ids.");
        }

        return value;
      }

      const ids = trimmed
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);

      if (ids.some((entry) => !objectIdRegex.test(entry))) {
        return helpers.message("spouses must contain valid member ids.");
      }

      return value;
    }, "spouses array validation")
);

const treePasswordField = Joi.string()
  .allow("")
  .max(120)
  .custom((value, helpers) => {
    const text = String(value || "").trim();
    if (text && text.length < 4) {
      return helpers.message("Tree password must be 4-120 characters.");
    }

    return value;
  }, "tree password validation");

const buildPrivacyValue = (payload) => {
  if (typeof payload.isPrivate === "boolean") {
    return payload.isPrivate ? "private" : "public";
  }

  if (payload.privacy === "private" || payload.privacy === "public") {
    return payload.privacy;
  }

  return null;
};

const createTreeBodySchema = Joi.object({
  name: Joi.string().trim().min(2).max(150).required(),
  description: Joi.string().allow("").max(1200).optional(),
  privacy: Joi.string().valid("public", "private").optional(),
  isPrivate: Joi.boolean().optional(),
  treePassword: treePasswordField.optional(),
  accessPassword: treePasswordField.optional()
}).custom((value, helpers) => {
  const privacy = buildPrivacyValue(value) || "private";
  const password = String(value.treePassword || value.accessPassword || "").trim();

  if (privacy === "private" && !password) {
    return helpers.message("Tree password is required for private trees.");
  }

  return value;
});

const updateTreeBodySchema = Joi.object({
  name: Joi.string().trim().min(2).max(150).optional(),
  description: Joi.string().allow("").max(1200).optional(),
  privacy: Joi.string().valid("public", "private").optional(),
  isPrivate: Joi.boolean().optional(),
  treePassword: treePasswordField.optional(),
  accessPassword: treePasswordField.optional()
});

const registerBodySchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  email: Joi.string().trim().email().required(),
  password: Joi.string().min(8).max(256).required(),
  dateOfBirth: nullableIsoDateField.optional(),
  education: optionalProfileTextField,
  qualification: optionalProfileTextField,
  designation: optionalProfileTextField,
  addressPermanent: optionalAddressTextField,
  addressCurrent: optionalAddressTextField,
  phoneNumber: optionalPhoneTextField
});

const loginBodySchema = Joi.object({
  email: Joi.string().trim().email().required(),
  password: Joi.string().min(8).max(256).required()
});

const passwordResetRequestBodySchema = Joi.object({
  email: Joi.string().trim().email().required()
});

const passwordResetConfirmBodySchema = Joi.object({
  token: Joi.string().trim().min(20).max(256).required(),
  password: Joi.string().min(8).max(256).required()
});

const accountUpdateBodySchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).optional(),
  dateOfBirth: nullableIsoDateField.optional(),
  education: optionalProfileTextField,
  qualification: optionalProfileTextField,
  designation: optionalProfileTextField,
  addressPermanent: optionalAddressTextField,
  addressCurrent: optionalAddressTextField,
  phoneNumber: optionalPhoneTextField
});

const accountPasswordBodySchema = Joi.object({
  currentPassword: Joi.string().min(8).max(256).required(),
  newPassword: Joi.string().min(8).max(256).required()
}).custom((value, helpers) => {
  if (String(value.currentPassword) === String(value.newPassword)) {
    return helpers.message("New password must be different from current password.");
  }

  return value;
});

const accountDeleteBodySchema = Joi.object({
  currentPassword: Joi.string().min(8).max(256).required()
});

const createMemberBodySchema = Joi.object({
  name: Joi.string().trim().min(1).max(140).required(),
  note: Joi.string().allow("").max(2000).optional(),
  relationType: relationTypeField.optional(),
  relatedMemberId: nullableObjectIdField.optional(),
  gender: genderField.optional(),
  birthDate: nullableIsoDateField.optional(),
  deathDate: nullableIsoDateField.optional(),
  dateOfBirth: nullableIsoDateField.optional(),
  anniversaryDate: nullableIsoDateField.optional(),
  dateOfDeath: nullableIsoDateField.optional(),
  importantDates: importantDatesField,
  education: optionalProfileTextField,
  qualification: optionalProfileTextField,
  designation: optionalProfileTextField,
  addressPermanent: optionalAddressTextField,
  addressCurrent: optionalAddressTextField,
  importantNotes: optionalImportantNotesField,
  metadata: metadataField.optional()
});

const createCoreMemberBodySchema = createMemberBodySchema.keys({
  treeId: objectIdField.required()
});

const updateMemberBodySchema = Joi.object({
  name: Joi.string().trim().min(1).max(140).optional(),
  note: Joi.string().allow("").max(2000).optional(),
  gender: genderField.optional(),
  fatherId: nullableObjectIdField.optional(),
  motherId: nullableObjectIdField.optional(),
  spouses: spousesField.optional(),
  birthDate: nullableIsoDateField.optional(),
  deathDate: nullableIsoDateField.optional(),
  dateOfBirth: nullableIsoDateField.optional(),
  anniversaryDate: nullableIsoDateField.optional(),
  dateOfDeath: nullableIsoDateField.optional(),
  importantDates: importantDatesField,
  education: optionalProfileTextField,
  qualification: optionalProfileTextField,
  designation: optionalProfileTextField,
  addressPermanent: optionalAddressTextField,
  addressCurrent: optionalAddressTextField,
  importantNotes: optionalImportantNotesField,
  metadata: metadataField.optional()
});

const memberRelationMutationBodySchema = Joi.object({
  action: Joi.string().valid("connect", "disconnect").required(),
  relation: Joi.string().valid("father", "mother", "child", "spouse", "sibling").required(),
  targetMemberId: objectIdField.required(),
  parentRole: Joi.string().valid("father", "mother", "auto").optional()
});

const removeMemberRelationBodySchema = Joi.object({
  memberId: objectIdField.required(),
  relationType: Joi.string().valid("spouse", "sibling", "parent", "child").required(),
  relatedMemberId: objectIdField.required()
});

const planFeaturesField = Joi.array().items(Joi.string().trim().min(1).max(240)).max(60).default([]);
const planPricingField = Joi.number().min(0).precision(2);

const createPlanBodySchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  priceMonthly: planPricingField.required(),
  priceYearly: planPricingField.required(),
  maxMembers: Joi.number().integer().min(1).required(),
  maxTrees: Joi.number().integer().min(1).required(),
  features: planFeaturesField.optional(),
  isActive: Joi.boolean().optional(),
  isDefault: Joi.boolean().optional()
});

const updatePlanBodySchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).optional(),
  priceMonthly: planPricingField.optional(),
  priceYearly: planPricingField.optional(),
  maxMembers: Joi.number().integer().min(1).optional(),
  maxTrees: Joi.number().integer().min(1).optional(),
  features: planFeaturesField.optional(),
  isActive: Joi.boolean().optional(),
  isDefault: Joi.boolean().optional()
}).or("name", "priceMonthly", "priceYearly", "maxMembers", "maxTrees", "features", "isActive", "isDefault");

const subscriptionSubscribeBodySchema = Joi.object({
  planId: objectIdField.required(),
  billingCycle: Joi.string().valid("monthly", "yearly").optional(),
  paymentReference: Joi.string().trim().allow("").max(220).optional()
});

const paymentCreateOrderBodySchema = Joi.object({
  planId: objectIdField.required(),
  billingCycle: Joi.string().valid("monthly", "yearly").optional()
});

const paymentVerifyBodySchema = Joi.object({
  planId: objectIdField.required(),
  billingCycle: Joi.string().valid("monthly", "yearly").optional(),
  razorpay_order_id: Joi.string().trim().min(8).max(120).required(),
  razorpay_payment_id: Joi.string().trim().min(8).max(120).required(),
  razorpay_signature: Joi.string().trim().min(32).max(256).required()
});

const treeImportBodySchema = Joi.object({
  tree: Joi.object({
    name: Joi.string().trim().min(2).max(180).required(),
    description: Joi.string().allow("").max(2400).optional(),
    privacy: Joi.string().valid("public", "private").optional(),
    treePassword: Joi.string().allow("").max(120).optional(),
    rootLegacyId: Joi.string().allow("").optional()
  })
    .required()
    .unknown(true),
  members: Joi.array()
    .items(
      Joi.object({
        legacyId: Joi.string().required(),
        name: Joi.string().trim().min(1).max(140).required(),
        note: Joi.string().allow("").max(2000).optional(),
        profileImage: Joi.string().allow("").optional(),
        gender: genderField.optional(),
        birthDate: nullableIsoDateField.optional(),
        deathDate: nullableIsoDateField.optional(),
        metadata: Joi.object().unknown(true).optional(),
        bio: Joi.string().allow("").max(2000).optional(),
        fatherLegacyId: Joi.string().allow("").optional(),
        motherLegacyId: Joi.string().allow("").optional(),
        spouseLegacyIds: Joi.array().items(Joi.string()).optional(),
        childrenLegacyIds: Joi.array().items(Joi.string()).optional(),
        siblingLegacyIds: Joi.array().items(Joi.string()).optional()
      }).unknown(true)
    )
    .required()
});

module.exports = {
  registerBodySchema,
  loginBodySchema,
  passwordResetRequestBodySchema,
  passwordResetConfirmBodySchema,
  accountUpdateBodySchema,
  accountPasswordBodySchema,
  accountDeleteBodySchema,
  createTreeBodySchema,
  updateTreeBodySchema,
  createMemberBodySchema,
  createCoreMemberBodySchema,
  updateMemberBodySchema,
  memberRelationMutationBodySchema,
  removeMemberRelationBodySchema,
  createPlanBodySchema,
  updatePlanBodySchema,
  subscriptionSubscribeBodySchema,
  paymentCreateOrderBodySchema,
  paymentVerifyBodySchema,
  treeImportBodySchema
};
