const OAuthToken = require('../../models/oAuthToken');
const User = require('../../models/user');
const resultResponse = require('../../utils/globalFunction').resultResponse;
const redisOAuthService = require('./oauthtokenService/redisOAuthToken');
const redisUserService = require('./userService/redisUser');
const demoUserService = require('./userService/demoUsersDelete');
const OAuthEvent = require('../../lib/node-event').event;
const logger = require('../../utils/loggers');
const { SUCCESS, NOT_FOUND, SERVER_ERROR, USER_TYPE_SUPER_ADMIN, USER_TYPE_USER } = require('../../utils/constants');
const { EVENT_OAUTH_TOKEN } = require('../../utils/events')
const { getOAuthTokenDataFromCache } = redisOAuthService;

async function expireTokens(params) {
  let { user_id } = params;
  const query = { '$or': [{ "user._id": user_id }, { "user.parent_level_ids.user_id": user_id }] };
  return OAuthToken.deleteMany(query)
    .then(result => result.deletedCount
      ? resultResponse(SUCCESS, "Token successfully deleted...")
      : resultResponse(NOT_FOUND, "Tokens not found!"))
    .catch(error => resultResponse(SERVER_ERROR, error.message))
}

if (process.env.NODE_APP_INSTANCE == "0" || process.env.NODE_APP_INSTANCE == undefined) {
  OAuthEvent.on(EVENT_OAUTH_TOKEN, async (data) => {
    try {
      const { operationType } = data;

      if (operationType == "insert") {
        redisOAuthService.setOAuthToken(data);
      } else if (operationType == "delete") {
        if (data?.fullDocumentBeforeChange) {
          updateLoginCounts(data.fullDocumentBeforeChange?.user).then().catch(console.error);
          redisOAuthService.unsetOAuthToken(data);
          demoUserService.removeDemoUserData(data);
        }
      }

    } catch (error) {
      console.log("Event Watch -> 'OAuth Event' Error: ", error);
    }
  });
}

async function updateLoginCounts(params) {

  const { user_type_id, parent_level_ids } = params;

  // Not for super admin (root node user)
  if (user_type_id != USER_TYPE_SUPER_ADMIN) {

    const upperAgents = parent_level_ids.map(data => data.user_name);
    let updateDownlineCount = {};

    updateDownlineCount[(user_type_id == USER_TYPE_USER) ? "total_users_online_count" : "total_agents_online_count"] = -1;

    // Updating the upper line online count.
    User.updateMany(
      { user_name: { '$in': upperAgents } },
      { '$inc': updateDownlineCount }
    ).then().catch(console.error);

  }

}

async function getOAuthTokenDataFromDB(params) {
  try {
    // Extract the accessToken from the provided parameters
    const { accessToken } = params;

    // Find the OAuthToken document with the given accessToken,
    // lean() to return a plain JavaScript object, and execute the query
    const result = await OAuthToken.findOne({ accessToken }).lean().exec();

    // If the document is found, return it with a success status
    if (result) {
      return resultResponse(SUCCESS, result);
    }

    // If the document is not found, return a not found status
    return resultResponse(NOT_FOUND, "Access Token data not found!");
  } catch (error) {
    // If an error occurs during the database operation, log it and return an error response
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function getAccessToken(token, callback) {
  try {

    // Check if the token is provided; if not, return null through the callback
    if (!token) return callback(null, null);

    // Attempt to retrieve the OAuth token data from Redis cache
    let cacheResponse = await redisOAuthService.getOAuthTokenDataFromCache({
      pattern: token,
    });

    // If cache retrieval fails, fall back to database query
    if (cacheResponse.statusCode !== SUCCESS) {
      const dbResponse = await getOAuthTokenDataFromDB({ accessToken: token });
      if (dbResponse.statusCode !== SUCCESS) return callback(null, null); // Return null if DB query fails
      callback(null, dbResponse.data);
      return;
    }

    // If cache retrieval succeeds, get user data based on cached token data
    const cachedTokenData = cacheResponse.data;
    let userCacheResponse = await redisUserService.getUserDataCache({
      pattern: cachedTokenData?.user?.user_name,
    });

    // If user data retrieval from cache fails, query the database
    if (userCacheResponse.statusCode !== SUCCESS) {
      const dbResponse = await getOAuthTokenDataFromDB({ accessToken: token });
      if (dbResponse.statusCode !== SUCCESS) return callback(null, null); // Return null if DB query fails
      callback(null, dbResponse.data);
      return;
    }

    // Process and structure final result using cached token and user data
    const userData = userCacheResponse.data;

    // Convert expiration dates to Date objects for consistency
    cachedTokenData.accessTokenExpiresAt = new Date(
      cachedTokenData.accessTokenExpiresAt,
    );
    cachedTokenData.refreshTokenExpiresAt = new Date(
      cachedTokenData.refreshTokenExpiresAt,
    );

    // Merge token and user data into the final result
    const finalResult = { ...cachedTokenData, user: userData };

    // Return final data structure through callback
    callback(null, finalResult);
  } catch (error) {
    logger.error(`Error getAccessToken ${error.stack}`);
    // Handle errors by passing them to the callback
    callback(error, null);
  }
}

module.exports = {
  expireTokens,
  updateLoginCounts,
  getAccessToken,
  getOAuthTokenDataFromCache,
}