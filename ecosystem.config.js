const sharedEnv = {
  SUPER_ADMIN: "super",
  REDIS_CONNECTION: "ioredis",
  START_SERVICE: "true",
  CONNECTION_TYPE: "SRV",
  MONGO_USER: "beatific-sandbox",
  MONGO_PASSWORD: "World777-123",
  MONGO_CLUSTURE: "beatific.mxw302m.mongodb.net",
  MONGO_DEFAULT_DATABASE: "development",
  MONGO_PORT: ":27017",
  REPLICA_NAME: "atlas-o5dty7-shard-0",
  SET_PRIMARY: "beatific-shard-00-00.s6ml7.mongodb.net",
  SET_SECONDARY1: "beatific-shard-00-01.s6ml7.mongodb.net",
  SET_SECONDARY2: "beatific-shard-00-02.s6ml7.mongodb.net",
  TZ: "Asia/Kolkata",
};

module.exports = {
  apps: [
    {
      name: "beatific-admin",
      script: "./admin-server.js",
      instances: "4",
      exec_mode: "cluster",
      autorestart: true,
      max_restarts: 10,
      log_date_format: "DD-MM-YYYY hh:mm:ss.SSS",
      output: "./logs-3rd/PM2/admin/main.log",
      error: "./logs-3rd/PM2/admin/error.log",
      env: {
        ...sharedEnv,
        NODE_ENV: "development",
        DEBUG: true,
        ALLOW_ORIGINS: false,
        SUPERNOWA_ENV: "development",
        QTECH_ENV: "development"
      },
      env_production: {
        ...sharedEnv,
        NODE_ENV: "production",
        DEBUG: false,
        ALLOW_ORIGINS: false,
        SUPERNOWA_ENV: "production",
        QTECH_ENV: "production"
      }
    },
    {
      name: "beatific-user",
      script: "./user-server.js",
      instances: "max",
      exec_mode: "cluster",
      autorestart: true,
      max_restarts: 10,
      log_date_format: "DD-MM-YYYY hh:mm:ss.SSS",
      output: "./logs-3rd/PM2/user/main.log",
      error: "./logs-3rd/PM2/user/error.log",
      env: {
        ...sharedEnv,
        NODE_ENV: "development",
        DEBUG: true,
        ALLOW_ORIGINS: false,
        SUPERNOWA_ENV: "development",
        QTECH_ENV: "development"
      },
      env_production: {
        ...sharedEnv,
        NODE_ENV: "production",
        DEBUG: false,
        ALLOW_ORIGINS: false,
        SUPERNOWA_ENV: "production",
        QTECH_ENV: "production"
      }
    }
  ]
};
