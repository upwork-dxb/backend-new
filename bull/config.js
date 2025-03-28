const { FAILED_JOB_MAX_ATTEMPTS, MAX_RETRY_LIMIT } = require("../config/constant/result");
const { BULL_REDIS_TYPE } = require("../config/constant/db");
const config = require("../connections/redisConfigFile").getConfig();

const localConnection = {
  host: "localhost",
  port: 6379,
  password: "",
};

const azureConnection = {
  host: config.host,
  port: config.port,
  password: config.redisSSL_TLS.auth_pass,
  tls: {}
};

const connection = BULL_REDIS_TYPE == 'LOCAL' ? localConnection : azureConnection;

const SessionResultQueueName = process.env.UNIQUE_IDENTIFIER_KEY + "_SessionResult";

module.exports = {
  connection,
  MAX_RETRY_LIMIT,
  FAILED_JOB_MAX_ATTEMPTS,
  SessionResultQueueName,
};
