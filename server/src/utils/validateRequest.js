const { validationResult } = require("express-validator");

function validateRequest(req, res) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    res.status(400).json({
      message: "Validation failed.",
      errors: errors.array()
    });
    return false;
  }

  return true;
}

module.exports = validateRequest;
