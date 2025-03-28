// userActivityLogService.js

const axios = require("axios");
const redisClient = require("../../../connections/redisConnections");
const { getIPAddressUID } = require("../../../utils/getter-setter");
const userActivityLog = require("../../../models/userActivityLog");
const {
  ACTIVITY_LOG_TTL,
} = require("../../../config/constant/userActivityLogConfig");

async function getUserToken(req) {
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }
}

async function getUserDetails(req) {
  const user = req.User || req.user || {};
  return {
    userName: user.user_name || "Unknown",
    userId: user._id || "Unknown",
  };
}

async function getIpInfo(token) {
  const ipAddressData = await redisClient.get(getIPAddressUID(token));
  return ipAddressData ? JSON.parse(ipAddressData) : {};
}

async function logUserActivity(req) {
  try {
    let body = { ...(req.body || {}) };
    let query = { ...(req.query || {}) };
    let todayDate = new Date();
    const expireAt = todayDate.setDate(todayDate.getDate() + ACTIVITY_LOG_TTL);
    const token = await getUserToken(req);
    const { userName, userId } = await getUserDetails(req);
    const ipDetails = await getIpInfo(token);
    const geolocation = ipDetails ? ipDetails : {};
    const filteredHeaders = {
      authorization: req.headers["authorization"],
      "user-agent": req.headers["user-agent"],
      host: req.headers["host"],
      origin: req.headers["origin"],
    };

    let logObj = req.userActivityLog;
    const logEntry = {
      user_name: userName,
      user_id: userId,
      path: req.path,
      req: {
        headers: filteredHeaders,
        data: {
          body: body || {},
          query: query || {},
        },
      },
      expireAt: expireAt,
      ip_details:
        geolocation && Object.keys(geolocation).length > 0 ? geolocation : {},
    };

    let finalLogObj = Object.assign(logObj, logEntry);
    await finalLogObj.save();
  } catch (error) {
    console.error(error);
  }
}

async function updateLogStatus(req, data) {
  if (req.userActivityLog) {
    await userActivityLog
      .updateOne({ _id: req.userActivityLog._id }, { $set: data })
      .then()
      .catch((err) => {
        console.error(err);
      });
  }
}

module.exports = {
  logUserActivity,
  updateLogStatus,
};
