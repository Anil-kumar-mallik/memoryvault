const logger = require("./logger");

const logError = ({ context = "server", error, meta = {} }) => {
  const message = error && error.message ? error.message : "Unknown error";
  const stack = error && error.stack ? error.stack : "";
  const payload = {
    context,
    ...meta,
    ...(stack ? { stack } : {})
  };

  logger.error(message, payload);
};

module.exports = {
  logError
};
