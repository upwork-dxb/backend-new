const winston = require('winston');

// 🎨 Custom log format with color, timestamp, and alignment
const customFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message }) => {
    return `[${timestamp}] ${level} : ${message}`;
  })
);

// 📝 Logger instance
const log = winston.createLogger({
  level: process.env.LOG_LEVEL || 'debug',
  format: customFormat,
  transports: [
    new winston.transports.Console()
  ],
  exitOnError: false
});

// 🌍 Global reference (optional, but convenient)
global.log = log;

module.exports = log;
