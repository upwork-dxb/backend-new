const moment = require("moment");
const redisClient = require("../../../connections/redisConnections");
const resultResponse = require("../../../utils/globalFunction").resultResponse;
const {
  SUCCESS,
  NOT_FOUND,
  SERVER_ERROR,
} = require("../../../utils/constants");
const { getOAuthTokenUID, getIPAddressUID } = require("../../../utils/getter-setter");

// Fetches OAuth token data from Redis cache
async function getOAuthTokenDataFromCache(params) {
  try {
    const { pattern } = params;

    // Generate the unique Redis key using the token pattern
    const key = getOAuthTokenUID(pattern);

    // Attempt to retrieve token data from Redis cache
    const result = await redisClient.get(key);

    // Return parsed data if found, or a NOT_FOUND response if missing
    if (result) {
      return resultResponse(SUCCESS, JSON.parse(result));
    }

    return resultResponse(NOT_FOUND, "Access Token not found!");
  } catch (error) {
    // Catch and return server error details if Redis retrieval fails
    return resultResponse(SERVER_ERROR, error.message);
  }
}

// Stores OAuth token data in Redis cache with expiration
async function setOAuthToken(params) {
  const { fullDocument } = params;
  const {
    accessToken,
    accessTokenExpiresAt,
    refreshToken,
    refreshTokenExpiresAt,
    user,
  } = fullDocument;

  // Generate the unique Redis key using the access token
  const pattern = accessToken;
  const data = {
    user: { user_name: user.user_name },
    accessToken,
    accessTokenExpiresAt,
    refreshToken,
    refreshTokenExpiresAt,
  };

  // Calculate the expiry time in seconds based on the access token's expiry
  const EXPIRE = moment(accessTokenExpiresAt).diff(
    moment().startOf("minutes"),
    "seconds",
  );

  // Store token data in Redis with an expiration time
  await redisClient.set(
    getOAuthTokenUID(pattern),
    JSON.stringify(data),
    "EX",
    EXPIRE,
  );
}

// Removes OAuth token data from Redis cache
async function unsetOAuthToken(params) {
  const { fullDocumentBeforeChange } = params;
  const { accessToken } = fullDocumentBeforeChange;

  // Delete the token data from Redis using the access token pattern
  await redisClient.del(getOAuthTokenUID(accessToken));
  await redisClient.del(getIPAddressUID(accessToken));
}

module.exports = {
  getOAuthTokenDataFromCache,
  setOAuthToken,
  unsetOAuthToken,
};
