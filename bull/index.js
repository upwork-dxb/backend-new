const { SESSION_RESULT_VERSION, MARKET_RESULT_VERSION } = require('../config/constant/result');

if (SESSION_RESULT_VERSION == 'V3' || MARKET_RESULT_VERSION == 'V3') {
  const { SessionResultWorker } = require("./workers/sessionResultWorker");

  module.exports = {
    // Workers
    SessionResultWorker,

  };
}
