const { IOREDIS } = require("../utils/constants")
let client;
if (process.env.REDIS_CONNECTION == IOREDIS)
  client = require("../connections/ioredisSocket")
else
  client = require("../connections/redisSocket")
module.exports = client;