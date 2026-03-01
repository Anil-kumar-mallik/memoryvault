const validateBody = (schema, options = {}) => (req, res, next) => {
  const { error, value } = schema.validate(req.body || {}, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
    ...options
  });

  if (error) {
    res.status(400).json({
      message: "Validation failed.",
      errors: error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message
      }))
    });
    return;
  }

  req.body = value;
  next();
};

module.exports = {
  validateBody
};
