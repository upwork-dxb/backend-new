const cron = require('node-cron')
  , mongoose = require('../connections/mongoose')
  , supernowaService = require('../admin-backend/service/supernowaService');
let running = false;

mongoose.connect({ maxPoolSize: 1 })().then(() => {
  console.info("Supernowa service started...");
  async function declareResult() {
    if (running)
      return;
    running = true;
    try {
      await supernowaService.supernowaResult({});
    } catch (error) { }
    running = false;
  }
  //Run every 15 sec.
  cron.schedule('*/15 * * * * *', () => {
    declareResult();
  });
});