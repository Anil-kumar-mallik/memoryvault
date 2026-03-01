const mongoose = require("mongoose");
const logger = require("../utils/logger");

const connectDB = async () => {
  const mongoURI = process.env.MONGO_URI;

  if (!mongoURI) {
    throw new Error("MONGO_URI environment variable is required.");
  }

  try {
    await mongoose.connect(mongoURI);
    logger.info("MongoDB connected successfully.");
  } catch (error) {
    logger.error("MongoDB connection failed", { message: error.message });
    process.exit(1);
  }
};

module.exports = connectDB;
