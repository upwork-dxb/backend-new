const Redis = require("ioredis");
const config = require("./redisConfigFile").getConfig();
const tls_enabled = config?.tls_enabled === "yes";

function createRedisClient() {
  return new Redis({
    host: config.host,
    port: config.port,
    password: config.redisSSL_TLS.auth_pass,
    tls: tls_enabled ? {} : undefined,
    maxRetriesPerRequest: 5, // Limit retries for a request
    retryStrategy: (times) => {
      if (times >= 5) {
        console.error("Max retries reached. Not reconnecting.");
        return null; // Stop retrying
      }
      const delay = Math.min(times * 100, 2000); // Exponential backoff
      console.warn(`Retrying Redis connection in ${delay}ms...`);
      return delay;
    },
  });
}

const client = createRedisClient();

client.on("connect", () => {
  console.log("Connected to Redis successfully.");
});

client.on("error", (err) => {
  console.error("Redis connection error:", err);
});

client.on("reconnecting", (delay) => {
  console.warn(`Reconnecting to Redis in ${delay}ms...`);
});

client.on("end", () => {
  console.warn("Redis connection closed.");
});

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