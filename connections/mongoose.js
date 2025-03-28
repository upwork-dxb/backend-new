const mongoose = require('mongoose');
const path = require("path")
const log = require('../utils/logger');
const env = path.normalize(path.resolve(__dirname, "../.env"));
const logger = require("../utils/loggers");
const {
  ADMIN_MIN_POOL,
  ADMIN_MAX_POOL,
  USER_MIN_POOL,
  USER_MAX_POOL, } = require('../config/constant/db');
const IS_ENABLE = process.env.ENABLE_MONGOOSE_LOGS == "true" ? true : false;
require('dotenv').config({ path: env });

// Adjustable parameters
const maxRetries = 10;  // Increase or decrease based on needs
const retryInterval = 10000; // Interval in milliseconds (e.g., 10 seconds)

let retries = 0;

mongoose.set('strictQuery', false);

mongoose.set('autoIndex', false);

// mongoose.set('bufferCommands', false);

if (IS_ENABLE) {
  // mongoose.set('debug', true);
  mongoose.set('debug', (collectionName, method, query, doc, options) => {
    try {
      logger.MongoLog(`db.${collectionName}.${method}(${JSON.stringify(query)}, ${JSON.stringify(doc)}) ${options ? JSON.stringify(options) : ""}`);
    } catch (error) { logger.MongoLog("MONGOOSE DEBUG ON : " + JSON.stringify(error, ["message", "arguments", "type", "name"])); }
  });
}

// Function to attempt reconnection
function connect(options = {
  maxPoolSize: 300,
  minPoolSize: 15,
  maxIdleTimeMS: 15 * 60 * 1000 // Current: 15 min, Should be 15 - 20 min.
  // serverSelectionTimeoutMS: 5000
}) {

  return async function (cb) {

    let URI;

    if (process.env.CONNECTION_TYPE == "ReplicaSet") {

      URI = `mongodb://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@`;

      let sets = [
        process.env.SET_SECONDARY2 + process.env.MONGO_PORT,
        process.env.SET_SECONDARY1 + process.env.MONGO_PORT,
        process.env.SET_PRIMARY + process.env.MONGO_PORT
      ];

      URI = `${URI}${sets.toString()}/${process.env.MONGO_DEFAULT_DATABASE}?ssl=true&replicaSet=${process.env.REPLICA_NAME}&authSource=admin&retryWrites=true&w=majority`;

    } else if (process.env.CONNECTION_TYPE == "localhost") {

      URI = `mongodb://localhost:27017,localhost:27018,localhost:27019/${process.env.MONGO_DEFAULT_DATABASE}?replicaSet=rs`;

    } else {

      URI = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_CLUSTURE}/${process.env.MONGO_DEFAULT_DATABASE}?retryWrites=true&w=majority`;

    }

    let connectionType = (process.env.CONNECTION_TYPE == "ReplicaSet" ? "Replica set" : process.env.CONNECTION_TYPE == "localhost" ? "localhost" : "SRV");

    console.info("---------------------------------------");
    log.info("Connection mode: " + connectionType);
    console.info("---------------------------------------");

    log.warn("Connecting to MongoDB...");

    await mongoose.connect(URI, options)
      .then(() => {
        log.info("Connection established with MongoDB...");
      }).catch((error) => {

        log.error(`Mongoose connection failed: ${error.message}`);

        if (retries < maxRetries) {

          retries++;

          log.warn(`Retrying connection attempt ${retries}/${maxRetries}...`);

          setTimeout(() => {
            connect(options)();
          }, retryInterval);

        } else {

          log.error('Max retries reached. Could not reconnect to MongoDB.');

          log.error('Could not connect to MongoDB! ' + error.message);

          process.exit(1);

        }
      });

  }
};

exports.connect = connect;

async function disconnect() {
  await mongoose.disconnect();
  log.error('Disconnected from MongoDB.');
};

function getOptions() {
  if (process.env.APP_TYPE == 'ADMIN') {
    // Admin
    return {
      maxPoolSize: ADMIN_MAX_POOL,
      minPoolSize: ADMIN_MIN_POOL,
      maxIdleTimeMS: 15 * 60 * 1000 // Current: 15 min, Should be 15 - 20 min.
      // serverSelectionTimeoutMS: 5000
    }
  } else {
    return {
      maxPoolSize: USER_MAX_POOL,
      minPoolSize: USER_MIN_POOL,
      maxIdleTimeMS: 15 * 60 * 1000 // Current: 15 min, Should be 15 - 20 min.
      // serverSelectionTimeoutMS: 5000
    }
  }
}

// Handling connection events
mongoose.connection.on('connected', () => {
  log.info('Mongoose connected to MongoDB');
  retries = 0; // Reset retry counter on successful connection
});

mongoose.connection.on('error', (err) => {
  log.error('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', async () => {
  log.warn('Mongoose disconnected from MongoDB');
  await disconnect();
  const options = getOptions();
  connect(options)();
});

mongoose.connection.on('open', () => log.info('Mongoose connection open'));

mongoose.connection.on('reconnected', () => console.log('Mongoose connection reconnected'));

mongoose.connection.on('disconnecting', () => log.warn('Mongoose disconnecting'));

mongoose.connection.on('close', () => log.warn('Mongoose connection closed'));

exports.disconnect = disconnect;
exports.getOptions = getOptions;