const env = {
  production: {
    "SUPER_ADMIN": "super",
    "DEBUG": false,
    "ALLOW_ORIGINS": false,
    "REDIS_CONNECTION": "ioredis",
    "START_SERVICE": "true",
    "CONNECTION_TYPE": "SRV",
    "SUPERNOWA_ENV": "production",
    "QTECH_ENV": "production",
    "TZ": "Asia/Kolkata",
    "NODE_ENV": "production",
    "MONGO_USER": "beatific-sandbox",
    "MONGO_PASSWORD": "World777-123",
    "MONGO_CLUSTURE": "beatific.mxw302m.mongodb.net",
    "MONGO_DEFAULT_DATABASE": "development",
    "MONGO_PORT": ":27017",
    "REPLICA_NAME": "atlas-o5dty7-shard-0",
    "SET_PRIMARY": "beatific-shard-00-00.s6ml7.mongodb.net",
    "SET_SECONDARY1": "beatific-shard-00-01.s6ml7.mongodb.net",
    "SET_SECONDARY2": "beatific-shard-00-02.s6ml7.mongodb.net"
  },
  development: {
    "SUPER_ADMIN": "super",
    "DEBUG": true,
    "ALLOW_ORIGINS": false,
    "REDIS_CONNECTION": "ioredis",
    "START_SERVICE": "true",
    "CONNECTION_TYPE": "SRV",
    "SUPERNOWA_ENV": "development",
    "QTECH_ENV": "development",
    "TZ": "Asia/Kolkata",
    "NODE_ENV": "development",
    "MONGO_USER": "beatific-sandbox",
    "MONGO_PASSWORD": "World777-123",
    "MONGO_CLUSTURE": "beatific.mxw302m.mongodb.net",
    "MONGO_DEFAULT_DATABASE": "development",
    "MONGO_PORT": ":27017",
    "REPLICA_NAME": "atlas-o5dty7-shard-0",
    "SET_PRIMARY": "beatific-shard-00-00.s6ml7.mongodb.net",
    "SET_SECONDARY1": "beatific-shard-00-01.s6ml7.mongodb.net",
    "SET_SECONDARY2": "beatific-shard-00-02.s6ml7.mongodb.net"
  }
}
module.exports = {
  apps: [
    {
      name: "beatific-admin",
      script: "./admin-server.js",
      env: env.production,
      env_development: env.development,
      env_dev: env.development,
      instances: "4",
      exec_mode: "cluster",
      autorestart: true, // PM2 will restart your app if it crashes or ends peacefully.
      max_restarts: 10,
      log_date_format: 'DD-MM-YYYY hh:mm:ss.SSS',
      output: "./logs-3rd/PM2/admin/main.log",
      error: "./logs-3rd/PM2/admin/error.log",
    },
    {
      name: "beatific-user",
      script: "./user-server.js",
      env: env.production,
      env_development: env.development,
      env_dev: env.development,
      instances: "max",
      exec_mode: "cluster",
      autorestart: true, // PM2 will restart your app if it crashes or ends peacefully.
      max_restarts: 10,
      log_date_format: 'DD-MM-YYYY hh:mm:ss.SSS',
      output: "./logs-3rd/PM2/user/main.log",
      error: "./logs-3rd/PM2/user/error.log",
    },
  ]
}