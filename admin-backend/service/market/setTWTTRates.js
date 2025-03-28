const { ENABLE_TWTT_RATE_SET } = require("../../../config/constant/rateConfig");
const redisClient = require("../../../connections/redisConnections");
const TO_WIN_THE_TOSS = "TO WIN THE TOSS";
const ODDS_PREFIX = "ODDS_";
const EXPIRE = 60 * 60 * 24 * 5; // 5 Days
const defaultBackRate = 1.95;

exports.setTWTTRates = async (params) => {
  try {
    if (ENABLE_TWTT_RATE_SET) {
      const { marketId, marketName } = params;
      if (marketName === TO_WIN_THE_TOSS) {
        const cacheMarketId = `${ODDS_PREFIX}${marketId}`;
        getCacheData = await redisClient.get(cacheMarketId);
        if (!getCacheData) {
          redisClient.set(
            cacheMarketId,
            JSON.stringify(defaultFormat(params)),
            "EX",
            EXPIRE,
          );
        }
      }
    }
  } catch (error) {
    console.error(`Error while setting the TWTT rates ${error.stack}`);
  }
};

function defaultFormat(params) {
  const { marketId } = params;
  const data = {
    marketId: marketId,
    status: "OPEN",
    inplay: true,
    runners: [
      {
        selectionId: 501,
        status: "ACTIVE",
        ex: {
          availableToBack: [
            {
              price: defaultBackRate,
              size: 50000,
            },
            {
              price: 0,
              size: 0,
            },
            {
              price: 0,
              size: 0,
            },
          ],
          availableToLay: [
            {
              price: 0,
              size: 0,
            },
            {
              price: 0,
              size: 0,
            },
            {
              price: 0,
              size: 0,
            },
          ],
        },
      },
      {
        selectionId: 502,
        status: "ACTIVE",
        ex: {
          availableToBack: [
            {
              price: defaultBackRate,
              size: 50000,
            },
            {
              price: 0,
              size: 0,
            },
            {
              price: 0,
              size: 0,
            },
          ],
          availableToLay: [
            {
              price: 0,
              size: 0,
            },
            {
              price: 0,
              size: 0,
            },
            {
              price: 0,
              size: 0,
            },
          ],
        },
      },
    ],
  };

  return data;
}
