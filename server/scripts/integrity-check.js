require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../src/config/db");
const runIntegrityCheck = require("../src/utils/integrityChecker");

const main = async () => {
  const treeIdArg = process.argv[2] ? String(process.argv[2]).trim() : null;
  if (treeIdArg && !mongoose.Types.ObjectId.isValid(treeIdArg)) {
    throw new Error("treeId argument must be a valid Mongo ObjectId.");
  }

  await connectDB();
  const report = await runIntegrityCheck({ treeId: treeIdArg || null });
  console.log(JSON.stringify(report, null, 2));
  await mongoose.connection.close();
};

main().catch(async (error) => {
  console.error("Integrity check failed:", error.message);
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
  process.exit(1);
});
