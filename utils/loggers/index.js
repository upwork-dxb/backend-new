// path: logger.js
const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf, colorize } = format;
const DailyRotateFile = require('winston-daily-rotate-file');
const moment = require('moment');

const APP_TYPE = process.env.APP_TYPE;
const DIR = APP_TYPE?.toLocaleLowerCase();
const DATE_DIR_PATH = moment().utcOffset("+05:30").format('YYYY-MM-DD');
const LOG_BASE_DIR_PATH = "logs-3rd/sys-logs/";
const LOG_DIR_PATH = `${LOG_BASE_DIR_PATH}${DATE_DIR_PATH}/${DIR}/`;
const BALANCE_EXPOSURE_LOG_PATH = `${LOG_DIR_PATH}bal-exp-%DATE%.log`;
const FLOXYPAY_LOG_PATH = `${LOG_DIR_PATH}floxypay-%DATE%.log`;

// Define custom log format
const customFormat = printf(({ level, message, timestamp, ...args }) => {
  // Check if there are additional arguments
  const extraArgs = Object.keys(args).length ? JSON.stringify(args) : '';
  return `[${APP_TYPE}] ${timestamp} [${level}]: ${message} ${extraArgs}`;
});

const timezoned = () => {
  return moment().utcOffset("+05:30").format('h:mm:ss.SSS A');
}

// Determine logging level based on environment
const logLevel = process.env.LOG_LEVEL || 'debug';

const infoFilter = format((info, opts) => {
  return info.level === "info" ? info : false;
});

const errorFilter = format((info, opts) => {
  return info.level === "error" ? info : false;
});

const BalExpFilter = format((info, opts) => {

  if (process.env.SHOW_DEV_LOGS === 'true') {
    console.info(LOG_DIR_PATH);
  }

  return info.level === "BalExp" ? info : false;
});

const floxyPayFilter = format((info, opts) => {

  if (process.env.SHOW_DEV_LOGS === 'true') {
    console.info(LOG_DIR_PATH);
  }

  return info.level === "FloxyPay" ? info : false;
});

const MongoLogFilter = format((info, opts) => {

  if (process.env.SHOW_DEV_LOGS === 'true') {
    console.info(LOG_DIR_PATH);
  }

  return info.level === "MongoLog" ? info : false;
});

const UserCreateFilter = format((info, opts) => {

  if (process.env.SHOW_DEV_LOGS === 'true') {
    console.info(LOG_DIR_PATH);
  }

  return info.level === "UserCreate" ? info : false;
});

const SessionResultRollBackFilter = format((info, opts) => {

  if (process.env.SHOW_DEV_LOGS === 'true') {
    console.info(LOG_DIR_PATH);
  }

  return info.level === "SessionResultRollBack" ? info : false;
});

const custom = {
  levels: {
    error: 1,
    warn: 2,
    info: 3,
    http: 4,
    verbose: 5,
    debug: 6,
    silly: 7,
    all: 8,
    help: 9,
    BalExp: 0,
    FloxyPay: 10,
    MongoLog: 0,
    UserCreate: 0,
    SessionResultRollBack: 0,
  },
  colors: {
    silly: 'rainbow',
    input: 'grey',
    verbose: 'cyan',
    prompt: 'grey',
    info: 'green',
    data: 'grey',
    help: 'cyan',
    warn: 'yellow',
    debug: 'blue',
    error: 'red',
    BalExp: 'white',
    FloxyPay: 'white',
    MongoLog: 'magenta',
    UserCreate: 'magenta',
    SessionResultRollBack: 'magenta',
  }
}

// Create the logger
const logger = createLogger({

  levels: custom.levels,

  level: logLevel,

  format: combine(
    timestamp({ format: timezoned }),
    customFormat
  ),

  transports: [

    // filename: "./logs/%DATE% - debug.log",
    // filename: "./logs/%DATE% - general.log",
    // level: "all", "debug", "verbose", "info", "warn", "error"

    // Daily rotating file transport for info and above
    new DailyRotateFile({
      filename: `${LOG_DIR_PATH}info-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      frequency: "24h",
      level: 'info',
      format: combine(infoFilter()),
      maxFiles: '15d', // Keep logs for 15 days
      zippedArchive: true // Compress old logs
    }),

    new DailyRotateFile({
      filename: `${LOG_DIR_PATH}error-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      frequency: "24h",
      level: 'error',
      format: combine(errorFilter()),
      maxFiles: '15d', // Keep logs for 15 days
      zippedArchive: true // Compress old logs
    }),

    new DailyRotateFile({
      filename: `${LOG_DIR_PATH}all-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      frequency: "24h",
      level: 'all',
      maxFiles: '15d', // Keep logs for 15 days
      zippedArchive: true // Compress old logs
    }),

    new DailyRotateFile({
      filename: BALANCE_EXPOSURE_LOG_PATH,
      datePattern: 'YYYY-MM-DD',
      frequency: "24h",
      level: 'BalExp',
      format: combine(BalExpFilter()),
      maxFiles: '15d', // Keep logs for 15 days
      zippedArchive: true // Compress old logs
    }),

    new DailyRotateFile({
      filename: FLOXYPAY_LOG_PATH,
      datePattern: 'YYYY-MM-DD',
      frequency: "24h",
      level: 'FloxyPay',
      format: combine(floxyPayFilter()),
      maxFiles: '15d', // Keep logs for 15 days
      zippedArchive: true // Compress old logs
    }),

    new DailyRotateFile({
      filename: `mongoose-%DATE%.log`,
      dirname: `${LOG_BASE_DIR_PATH}mongoose/`,
      datePattern: 'YYYY-MM-DD',
      frequency: "24h",
      level: 'MongoLog',
      maxSize: "100m",
      format: combine(MongoLogFilter()),
      zippedArchive: true // Compress old logs
    }),

    new DailyRotateFile({
      filename: `user_create-%DATE%.log`,
      dirname: `${LOG_BASE_DIR_PATH}usercreate/`,
      datePattern: 'YYYY-MM-DD',
      frequency: "24h",
      level: 'UserCreate',
      maxSize: "100m",
      format: combine(UserCreateFilter()),
      zippedArchive: true // Compress old logs
    }),

    new DailyRotateFile({
      filename: `session_result_rollback-%DATE%.log`,
      dirname: `${LOG_BASE_DIR_PATH}sessionresultrollBack/`,
      datePattern: 'YYYY-MM-DD',
      frequency: "24h",
      level: 'SessionResultRollBack',
      maxSize: "100m",
      format: combine(SessionResultRollBackFilter()),
      zippedArchive: true // Compress old logs
    }),

  ]

});

// Add console transport in development environment
if (process.env.SHOW_DEV_LOGS === 'true') {

  logger.add(new transports.Console({
    format: combine(
      timestamp(),
      colorize({ colors: custom.colors, all: true }), // Add color to the output, { colors: colorsConfig }
      customFormat
    )
  }));

}

// https://prnt.sc/tHlTK4MlHk95
// logger.debug('This is a debug message');
// logger.verbose('This is a verbose message');
// logger.info('This is an info message');
// logger.warn('This is a warning message');
// logger.error('This is an error message');
// logger.silly('This is an silly message');
// logger.BalExp('This is an BalExp message');
// logger.FloxyPay('This is an FloxyPay message');

module.exports = logger;