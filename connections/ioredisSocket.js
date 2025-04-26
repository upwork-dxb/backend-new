const Redis = require("ioredis");
const config = require("./redisConfigFile").getConfig();

const tlsEnabled = config?.tls_enabled === "yes";

// Create Redis Client
function createRedisClient() {
  const redisOptions = {
    host: config.host,
    port: config.port,
    password: config.redisSSL_TLS.auth_pass,
    maxRetriesPerRequest: 5,
    retryStrategy: (times) => {
      if (times >= 5) {
        console.error("Redis: Max retries reached. Not reconnecting.");
        return null; // Stop trying
      }
      const delay = Math.min(times * 100, 2000); // 100ms, 200ms, 400ms, 800ms, 1600ms
      console.warn(`Redis: Retry attempt ${times}, next in ${delay}ms...`);
      return delay;
    },
  };

  if (tlsEnabled) {
    redisOptions.tls = {}; // Empty object enables SSL/TLS
  }

  return new Redis(redisOptions);
}

const client = createRedisClient();

// Redis Event Listeners
client.on("connect", () => {
  console.log("✅ Redis connected successfully.");
});

client.on("ready", () => {
  console.log("✅ Redis client is ready to use.");
});

client.on("error", (err) => {
  console.error("❌ Redis connection error:", err.message || err);
});

client.on("reconnecting", (delay) => {
  console.warn(`⚠️  Redis reconnecting in ${delay}ms...`);
});

client.on("end", () => {
  console.warn("⚠️  Redis connection ended.");
});

// Graceful Shutdown Handling
async function shutdownRedis() {
  try {
    console.log("🛑 Shutting down. Closing Redis connection...");
    await client.quit();
    console.log("✅ Redis connection closed gracefully.");
  } catch (err) {
    console.error("Error during Redis shutdown:", err.message || err);
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", shutdownRedis);  // Ctrl+C
process.on("SIGTERM", shutdownRedis); // Kubernetes or PM2 shutdown

module.exports = client;
