require("custom-env").env("db", require("./path").path);

module.exports = Object.freeze({
  ADMIN_MIN_POOL: Number(process.env.ADMIN_MIN_POOL) || 20,
  ADMIN_MAX_POOL: Number(process.env.ADMIN_MAX_POOL) || 300,
  USER_MIN_POOL: Number(process.env.USER_MIN_POOL) || 15,
  USER_MAX_POOL: Number(process.env.USER_MAX_POOL) || 300,
  BULL_REDIS_TYPE: process.env.BULL_REDIS_TYPE || 'LOCAL',
});