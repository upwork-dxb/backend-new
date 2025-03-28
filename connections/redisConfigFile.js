const fs = require("fs");
const path = require("path");
const CONFIG_FILE = "./redisCronConfig.json";
const CONFIG_FILE_PATH = path.normalize(path.resolve(__dirname, CONFIG_FILE));
let config = {};
if (!fs.existsSync(CONFIG_FILE_PATH))
  config = getDefaultConfig();
else {
  try {
    if (process.env.REDIS_ENABLE) {
      if (process.env.REDIS_ENABLE == "yes")
        config = getEnvConfig();
    } else
      config = JSON.parse(JSON.stringify(require(CONFIG_FILE)));
  } catch (error) {
    config = getDefaultConfig();
  }
  if (!config.hasOwnProperty("enable"))
    config = getDefaultConfig();
  if (config["enable"] == "no")
    config = getDefaultConfig();
}

function getDefaultConfig() {
  return {
    "host": "127.0.0.1",
    "port": 6379,
    "redisSSL_TLS": {}
  };
}

function getEnvConfig() {
  return {
    "enable": process.env.REDIS_ENABLE,
    "host": process.env.REDIS_HOST,
    "port": parseInt(process.env.REDIS_PORT),
    "redisSSL_TLS": {
      "auth_pass": process.env.REDIS_AUTH_PASS,
      "tls": {
        "servername": process.env.REDIS_HOST
      }
    }
  }
}

exports.getConfig = () => config