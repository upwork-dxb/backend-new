const { disconnect } = require("../../../connections/mongoose");
const mongoose = require("mongoose");

let sigintCount = 0;

const handleSigint = async () => {
  try {
    sigintCount++;
    // console.log(`SIGINT received ${sigintCount} time(s).`);
    // Remove listener after first call
    process.off("SIGINT", handleSigint);

    log.info(`${process.env.APP_TYPE} app is shutting down...`);
    if (
      process.env.APP_TYPE == "ADMIN" &&
      process.env.NODE_APP_INSTANCE == "0" &&
      sigintCount == 1
    ) {
      log.warn("Setting result interruption message...");
      const filter = {
        $or: [
          { result_cron_progress: { $nin: [null, 2, 3] } },
          { rollback_cron_progress: { $nin: [null, 2, 3] } },
        ],
      };
      const update = {
        $set: {
          result_cron_progress_message:
            "Result set process are stop due to server stop/restart/reload, Please retry the process!",
          rollback_cron_progress_message:
            "Rollback process are stop due to server stop/restart/reload! Please retry the process!",
        },
      };

      const Fancy = require("../../../models/fancy");
      const Market = require("../../../models/market");

      await Promise.all([
        Fancy.updateMany(filter, update),
        Market.updateMany(filter, update),
      ]);
    }
  } catch (error) {
    console.error("Error disconnecting from MongoDB:", error);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await disconnect();
    console.log("MongoDB connection closed");

    // Exit process
    process.exit();
  }
};

process.on("SIGINT", handleSigint);
