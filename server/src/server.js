require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("./config/db");
const validateEnv = require("./config/validateEnv");
const logger = require("./utils/logger");
const { ensureConfiguredPlans } = require("./utils/subscriptionService");
const app = require("./app");

const PORT = Number(process.env.PORT) || 5000;

const startServer = async () => {
  validateEnv();
  await connectDB();
  await ensureConfiguredPlans();
  logger.info("Connected DB Name", { dbName: mongoose.connection.name });

  app.listen(PORT, () => {
    logger.info("MemoryVault API listening", { port: PORT });
  });
};

startServer().catch((error) => {
  logger.error("Failed to start server", { message: error.message, stack: error.stack });
  process.exit(1);
});
