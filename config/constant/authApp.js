require("custom-env").env("authApp", require("./path").path);

module.exports = Object.freeze({
  AUTH_APP_OTP_EXPIRE_TIME_SECONDS: process.env.AUTH_APP_OTP_EXPIRE_TIME_SECONDS,
  AUTH_APP_SHORTER_OTP_EXPIRE_TIME_SECONDS: process.env.AUTH_APP_SHORTER_OTP_EXPIRE_TIME_SECONDS,
  AUTH_APP_SOCKET_TOKEN: process.env.AUTH_APP_SOCKET_TOKEN || "",
});