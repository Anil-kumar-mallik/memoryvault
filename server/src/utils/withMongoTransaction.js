const mongoose = require("mongoose");

const isTransactionUnsupportedError = (error) => {
  if (!error) {
    return false;
  }

  const message = String(error.message || "").toLowerCase();
  return (
    message.includes("transaction numbers are only allowed on a replica set member or mongos") ||
    message.includes("transactions are not supported")
  );
};

const withMongoTransaction = async (handler) => {
  const session = await mongoose.startSession();

  try {
    let result;

    try {
      await session.withTransaction(async () => {
        result = await handler(session);
      });
      return result;
    } catch (error) {
      if (!isTransactionUnsupportedError(error)) {
        throw error;
      }
    }
  } finally {
    await session.endSession();
  }

  return handler(null);
};

module.exports = withMongoTransaction;
