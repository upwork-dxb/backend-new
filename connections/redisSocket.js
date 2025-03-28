const { createClient } = require('redis')
  , config = require("./redisConfigFile").getConfig()
  , connection = config.hasOwnProperty('enable') ? {
    url: `rediss://${config.host}:${config.port}`,
    password: config.redisSSL_TLS.auth_pass,
  } : config;

const client = createClient(connection);

(async () => {
  try {
    await client.connect();
    client.on('error', (error) => console.error('Redis Client Error', error));
    client.on('connect', () => console.info('Redis Client Connected'));
    client.on('ready', () => console.info('Redis Client Ready'));
    client.on('reconnecting', () => console.info('Redis Client Reconnecting'));
    client.on('end', () => console.info('Redis Client End'));
    // setInterval(async () => {
    //   console.info(await client.ping());
    // }, 5000);
  } catch (error) {
    console.error("Redis Socket Error", error);
  }
})();

module.exports = client;