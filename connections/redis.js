const asyncRedis = require('async-redis');
const config = require("./redisConfigFile").getConfig();
const tls_enabled = config?.tls_enabled === "yes";

function createRedisClient() {
  const client = asyncRedis.createClient({
    host: config.host,
    port: config.port,
    password: config.redisSSL_TLS.auth_pass,
    tls: tls_enabled ? { } : undefined,
    retry_strategy: (options) => {
      if (options.attempt > 5) {
        console.error("Max retries reached. Not reconnecting.");
        return null; // Stop retrying
      }
      const delay = Math.min(options.attempt * 100, 2000);
      console.warn(`Retrying Redis connection in ${delay}ms...`);
      return delay;
    },
  });

  client.on("connect", () => console.log("Connected to Redis successfully."));
  client.on("error", (err) => console.error("Redis connection error:", err));
  client.on("reconnecting", (delay) => console.warn(`Reconnecting to Redis in ${delay}ms...`));
  client.on("end", () => console.warn("Redis connection closed."));

  return client;
}

const client = createRedisClient();

process.on("SIGINT", async () => {
  console.log("Shutting down application. Closing Redis connection...");
  await client.quit();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Received termination signal. Closing Redis connection...");
  await client.quit();
  process.exit(0);
});

module.exports = client;