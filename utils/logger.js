const winston = require('winston');

let alignColorsAndTime = winston.format.combine(
  winston.format.colorize({
    all: true
  }),
  winston.format.printf(
    info => `${info.level} : ${info.message}`
  )
);

const log = winston.createLogger({
  level: "debug",
  transports: [
    new (winston.transports.Console)({
      format: winston.format.combine(winston.format.colorize(), alignColorsAndTime)
    })
  ], exitOnError: false
});

global.log = log;
module.exports = log;