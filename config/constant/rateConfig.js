require("custom-env").env("rateConfig", require("./path").path);

module.exports = Object.freeze({
  FETCH_DATA_FROM_FOR_FANCY: process.env.FETCH_DATA_FROM_FOR_FANCY || "DB",
  FETCH_DATA_FROM_FOR_MARKET: process.env.FETCH_DATA_FROM_FOR_MARKET || "DB",
  FANCY_DUMP_CRON_STATUS: process.env.FANCY_DUMP_CRON_STATUS || "false",
  MARKET_DUMP_CRON_STATUS: process.env.MARKET_DUMP_CRON_STATUS || "false",
  ENABLE_ODDS_CREATOR_SERVICE: process.env.ENABLE_ODDS_CREATOR_SERVICE || "false",
  ENABLE_ODDS_WRITING_IN_REDIS_SERVICE: process.env.ENABLE_ODDS_WRITING_IN_REDIS_SERVICE || "false",
  ENABLE_AUTO_MARKET_RATES_SUSPEND: process.env.ENABLE_AUTO_MARKET_RATES_SUSPEND || "false",
  ENABLE_TWTT_RATE_SET: process.env.ENABLE_TWTT_RATE_SET == "true",
  ALLOW_MANUAL_FANCY: process.env.ALLOW_MANUAL_FANCY == "true",
});