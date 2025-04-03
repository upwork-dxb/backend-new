const dotenv = require('dotenv');
dotenv.config();

const requiredEnvVars = [
  'TELEGRAM_TOKEN',
  'TELEGRAM_WEBHOOK_URL',
  'TELEGRAM_BOT_ID',
  'TELEGRAM_OTP_EXPIRE_TIME_SECOENDS',
  'OTPLESS_CLIENT_ID',
  'OTPLESS_CLIENT_SECRET',
  'OTPLESS_KEY_API',
  'OTPLESS_USER_INFO_API',
  'OTPLESS_MAGIC_LINK_API',
  'OTPLESS_SEND_OTP_URL',
  'OTPLESS_RESEND_OTP_URL',
  'OTPLESS_VERIFY_OTP_URL',
  'OTPLESS_CHANNEL',
  'OTPLESS_EXPIRY',
  'OTPLESS_OTP_LENGTH'
];

// 🚨 Optional: Validate required env vars exist (throws on missing)
requiredEnvVars.forEach((key) => {
  if (!process.env[key]) {
    console.warn(`⚠️  Warning: Missing environment variable "${key}"`);
  }
});

const e = process.env;

module.exports = {
  TELEGRAM_TOKEN: e.TELEGRAM_TOKEN,
  TELEGRAM_WEBHOOK_URL: e.TELEGRAM_WEBHOOK_URL,
  TELEGRAM_BOT_ID: e.TELEGRAM_BOT_ID,
  TELEGRAM_OTP_EXPIRE_TIME_SECOENDS: Number(e.TELEGRAM_OTP_EXPIRE_TIME_SECOENDS || 300), // Default 5 mins
  OTPLESS_CLIENT_ID: e.OTPLESS_CLIENT_ID,
  OTPLESS_CLIENT_SECRET: e.OTPLESS_CLIENT_SECRET,
  OTPLESS_KEY_API: e.OTPLESS_KEY_API,
  OTPLESS_USER_INFO_API: e.OTPLESS_USER_INFO_API,
  OTPLESS_MAGIC_LINK_API: e.OTPLESS_MAGIC_LINK_API,
  OTPLESS_SEND_OTP_URL: e.OTPLESS_SEND_OTP_URL,
  OTPLESS_RESEND_OTP_URL: e.OTPLESS_RESEND_OTP_URL,
  OTPLESS_VERIFY_OTP_URL: e.OTPLESS_VERIFY_OTP_URL,
  OTPLESS_CHANNEL: e.OTPLESS_CHANNEL || 'sms', // Fallback if not set
  OTPLESS_EXPIRY: Number(e.OTPLESS_EXPIRY || 300), // Default 5 mins
  OTPLESS_OTP_LENGTH: Number(e.OTPLESS_OTP_LENGTH || 6) // Default 6 digits
};
