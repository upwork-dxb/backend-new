const dotenv = require('dotenv')
dotenv.config()
/** export env constant */
const e = process.env
module.exports = {
  TELEGRAM_TOKEN: e.TELEGRAM_TOKEN,
  TELEGRAM_WEBHOOK_URL: e.TELEGRAM_WEBHOOK_URL,
  TELEGRAM_BOT_ID: e.TELEGRAM_BOT_ID,
  TELEGRAM_OTP_EXPIRE_TIME_SECOENDS: e.TELEGRAM_OTP_EXPIRE_TIME_SECOENDS,
  OTPLESS_CLIENT_ID: e.OTPLESS_CLIENT_ID,
  OTPLESS_CLIENT_SECRET: e.OTPLESS_CLIENT_SECRET,
  OTPLESS_KEY_API: e.OTPLESS_KEY_API,
  OTPLESS_USER_INFO_API: e.OTPLESS_USER_INFO_API,
  OTPLESS_MAGIC_LINK_API: e.OTPLESS_MAGIC_LINK_API,
  OTPLESS_SEND_OTP_URL: e.OTPLESS_SEND_OTP_URL,
  OTPLESS_RESEND_OTP_URL: e.OTPLESS_RESEND_OTP_URL,
  OTPLESS_VERIFY_OTP_URL: e.OTPLESS_VERIFY_OTP_URL,
  OTPLESS_CHANNEL: e.OTPLESS_CHANNEL,
  OTPLESS_EXPIRY: e.OTPLESS_EXPIRY,
  OTPLESS_OTP_LENGTH: e.OTPLESS_OTP_LENGTH,
}