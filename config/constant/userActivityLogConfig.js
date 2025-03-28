require("custom-env").env("userActivityLogConfig", require("./path").path);

module.exports = Object.freeze({
  ACTIVITY_LOG_ENABLE: process.env.ACTIVITY_LOG_ENABLE,
  ACTIVITY_LOG_TTL: process.env.ACTIVITY_LOG_TTL,
  LOG_VALIDATION_FAILED: 'Validation Failed',
  LOG_SUCCESS: 'Success'
});