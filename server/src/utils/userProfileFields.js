const { sanitizeText } = require("../middleware/requestSecurityMiddleware");

const USER_PROFILE_TEXT_FIELDS = ["education", "qualification", "designation", "addressPermanent", "addressCurrent", "phoneNumber"];

const parseOptionalDateValue = (value) => {
  if (value === undefined || value === null || value === "" || value === "null") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeOptionalTextValue = (value) => {
  const text = sanitizeText(String(value || "").trim());
  return text || null;
};

const buildUserProfileFields = (input = {}) => ({
  dateOfBirth: parseOptionalDateValue(input.dateOfBirth),
  education: normalizeOptionalTextValue(input.education),
  qualification: normalizeOptionalTextValue(input.qualification),
  designation: normalizeOptionalTextValue(input.designation),
  addressPermanent: normalizeOptionalTextValue(input.addressPermanent),
  addressCurrent: normalizeOptionalTextValue(input.addressCurrent),
  phoneNumber: normalizeOptionalTextValue(input.phoneNumber)
});

module.exports = {
  USER_PROFILE_TEXT_FIELDS,
  parseOptionalDateValue,
  normalizeOptionalTextValue,
  buildUserProfileFields
};
