const path = require('path');
require('dotenv').config({ path: path.normalize(path.resolve(__dirname, "../.env")) });

const mongoose = require('mongoose');
const log = require('../utils/logger');
const logger = require('../utils/loggers');
const {
  ADMIN_MIN_POOL,
  ADMIN_MAX_POOL,
  USER_MIN_POOL,
  USER_MAX_POOL,
} = require('../config/constant/db');

// Configurable Parameters
const maxRetries = 10;
const baseRetryInterval = 5000; // Start at 5 seconds
const maxRetryInterval = 60000; // Cap retry interval to 1 minute
let retries = 0;

// Mongoose Global Settings
mongoose.set('strictQuery', false);
mongoose.set('autoIndex', false);

const IS_ENABLE = process.env.ENABLE_MONGOOSE_LOGS === "true";

if (IS_ENABLE) {
  mongoose.set('debug', (collectionName, method, query, doc, options) => {
    try {
      logger.MongoLog(`db.${collectionName}.${method}(${JSON.stringify(query)}, ${JSON.stringify(doc)}) ${options ? JSON.stringify(options) : ""}`);
    } catch (error) {
      logger.MongoLog("MONGOOSE DEBUG ERROR: " + JSON.stringify(error, ["message", "arguments", "type", "name"]));
    }
  });
}

// Build MongoDB URI safely
function buildMongoURI() {
  const user = encodeURIComponent(process.env.MONGO_USER);
  const password = encodeURIComponent(process.env.MONGO_PASSWORD);

  if (process.env.CONNECTION_TYPE === "ReplicaSet") {
    const sets = [
      `${process.env.SET_SECONDARY2}${process.env.MONGO_PORT}`,
      `${process.env.SET_SECONDARY1}${process.env.MONGO_PORT}`,
      `${process.env.SET_PRIMARY}${process.env.MONGO_PORT}`,
    ];
    return `mongodb://${user}:${password}@${sets.join(",")}/${process.env.MONGO_DEFAULT_DATABASE}?ssl=true&replicaSet=${process.env.REPLICA_NAME}&authSource=admin&retryWrites=true&w=majority`;
  } else if (process.env.CONNECTION_TYPE === "localhost") {
    return `mongodb://localhost:27017,localhost:27018,localhost:27019/${process.env.MONGO_DEFAULT_DATABASE}?replicaSet=rs`;
  } else {
    return `mongodb+srv://${user}:${password}@${process.env.MONGO_CLUSTURE}/${process.env.MONGO_DEFAULT_DATABASE}?retryWrites=true&w=majority`;
  }
}

// Get Mongoose options based on app type
function getOptions() {
  const commonOptions = {
    maxIdleTimeMS: 15 * 60 * 1000, // 15 minutes
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    heartbeatFrequencyMS: 10000, // MongoDB monitoring heartbeat
  };

  if (process.env.APP_TYPE === 'ADMIN') {
    return {
      ...commonOptions,
      maxPoolSize: ADMIN_MAX_POOL,
      minPoolSize: ADMIN_MIN_POOL,
    };
  } else {
    return {
      ...commonOptions,
      maxPoolSize: USER_MAX_POOL,
      minPoolSize: USER_MIN_POOL,
    };
  }
}

// Connect function with exponential backoff
async function smartConnect(options = {}) {
  const URI = buildMongoURI();
  const finalOptions = { ...getOptions(), ...options };
  const connectionType = process.env.CONNECTION_TYPE || "Unknown";

  console.info("---------------------------------------");
  log.info("Connection mode: " + connectionType);
  console.info("---------------------------------------");

  try {
    log.warn(`Connecting to MongoDB...`);
    await mongoose.connect(URI, finalOptions);
    log.info("MongoDB connection successful.");
    retries = 0;
  } catch (error) {
    log.error(`Connection failed: ${error.message}`);
    if (retries < maxRetries) {
      retries++;
      const retryDelay = Math.min(baseRetryInterval * Math.pow(2, retries), maxRetryInterval);
      log.warn(`Retrying (${retries}/${maxRetries}) after ${retryDelay / 1000}s...`);
      setTimeout(() => {
        smartConnect(options);
      }, retryDelay);
    } else {
      log.error('Max retries reached. Shutting down application.');
      process.exit(1);
    }
  }
}

// Disconnect function
async function disconnect() {
  try {
    await mongoose.disconnect();
    log.warn('Disconnected from MongoDB.');
  } catch (err) {
    log.error('Error during disconnect:', err.message);
  }
}

// MongoDB Monitoring Events
mongoose.connection.on('connected', () => {
  log.info('Mongoose connected to MongoDB.');
  retries = 0;
});

mongoose.connection.on('error', (err) => {
  log.error('Mongoose connection error: ' + err.message);
});

mongoose.connection.on('disconnected', () => {
  log.warn('Mongoose disconnected! Trying to reconnect...');
  smartConnect();
});

mongoose.connection.on('reconnected', () => {
  log.info('Mongoose reconnected to MongoDB.');
});

mongoose.connection.on('disconnecting', () => {
  log.warn('Mongoose disconnecting...');
});

mongoose.connection.on('close', () => {
  log.warn('Mongoose connection closed.');
});

mongoose.connection.on('timeout', () => {
  log.error('Mongoose connection timeout.');
});

// MongoDB Ping Monitor every 60 seconds
setInterval(async () => {
  if (mongoose.connection.readyState === 1) { // connected
    try {
      await mongoose.connection.db.admin().ping();
      log.info('MongoDB ping successful.');
    } catch (err) {
      log.error('MongoDB ping failed:', err.message);
    }
  }
}, 60000); // 60 seconds

// Exports
exports.smartConnect = smartConnect;
exports.disconnect = disconnect;
exports.getOptions = getOptions;
