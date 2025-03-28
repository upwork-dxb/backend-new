const publisher = require("../../connections/redisConnections"),
  CONSTANTS = require("../../utils/constants");

exports.getRedisData = async function (orderId) {
  const key =
    CONSTANTS.RESET_PASSWORD +
    (orderId || "").toLowerCase() +
    CONSTANTS.UNIQUE_IDENTIFIER_KEY;
  const data = await publisher.get(key);
  return data;
};

exports.setRedisData = async function (orderId, data, isDelete = false) {
  const key =
    CONSTANTS.RESET_PASSWORD +
    (orderId || "").toLowerCase() +
    CONSTANTS.UNIQUE_IDENTIFIER_KEY;
  if (isDelete) {
    await publisher.del(key);
  } else {
    await publisher.set(key, JSON.stringify(data), "EX", 300);
  }
};
