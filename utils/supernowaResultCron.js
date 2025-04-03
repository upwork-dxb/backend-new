const cron = require('node-cron');
const mongoose = require('../connections/mongoose');
const supernowaService = require('../admin-backend/service/supernowaService');

let running = false;

(async function startSupernowaCron() {
  try {
    await mongoose.connect({ maxPoolSize: 1 })();
    console.info("✅ Supernowa service connected to MongoDB...");

    async function declareResult() {
      if (running) return;

      running = true;
      console.log(`[${new Date().toISOString()}] ⏳ Running supernowaResult...`);

      try {
        await supernowaService.supernowaResult({});
        console.log(`[${new Date().toISOString()}] ✅ Finished supernowaResult`);
      } catch (error) {
        console.error('❌ Error in supernowaResult:', error);
      } finally {
        running = false;
      }
    }

    // Run every 15 seconds
    cron.schedule('*/15 * * * * *', declareResult);
    console.info("🚀 Cron job scheduled: Every 15 seconds");

    // Graceful shutdown
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    async function shutdown() {
      console.info("\n🛑 Shutting down gracefully...");
      await mongoose.disconnect();
      process.exit(0);
    }

  } catch (err) {
    console.error("❌ Failed to start Supernowa cron:", err);
    process.exit(1);
  }
})();
