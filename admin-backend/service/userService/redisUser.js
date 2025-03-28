const redisClient = require("../../../connections/redisConnections");
const resultResponse = require('../../../utils/globalFunction').resultResponse;
const { SUCCESS, NOT_FOUND, SERVER_ERROR } = require('../../../utils/constants');
const { getUserCacheUID } = require('../../../utils/getter-setter');

async function getUserDataCache(params) {
  try {
    const { pattern } = params;
    const key = getUserCacheUID(pattern);
    const result = await redisClient.get(key);

    if (result) {
      return resultResponse(SUCCESS, JSON.parse(result));
    }
    return resultResponse(NOT_FOUND, "User not found!");
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function userTokenGetSet(params) {
  try {
    const { fullDocument, operationType } = params;
    const pattern = fullDocument?.user?.user_name;
    let result = await getUserDataCache({ pattern });

    if (result.statusCode == SUCCESS) {
      let user = result.data;

      const { accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt } = fullDocument;
      const token = {
        accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt
      }

      if (user?.tokens?.length) {
        if (operationType == "delete") {
          const preservedTokens = user.tokens.filter(item => item.accessToken !== accessToken);
          user.tokens = preservedTokens;
        } else {
          user.tokens.push(token);
        }
      } else {
        user.tokens = [token];
      }

      await redisClient.set(getUserCacheUID(pattern), JSON.stringify(user));
    }
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function userTokenUnset(params) {
  params.fullDocument = params.fullDocumentBeforeChange;
  await userTokenGetSet(params);
}

module.exports = {
  getUserDataCache,
  userTokenGetSet,
  userTokenUnset
}