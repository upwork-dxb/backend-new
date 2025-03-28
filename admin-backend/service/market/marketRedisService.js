// Models
const Market = require("../../../models/market");

// Redis
const redisClient = require("../../../connections/redisConnections");
const {
  LIVE_GAME_SPORT_ID,
  UNIVERSE_CASINO_SPORT_ID,
  DIAMOND_CASINO_SPORT_ID,
  MARKET_KEY,
  FANCY_KEY,
  UNIQUE_IDENTIFIER_KEY,
  SUSPENDED,
  EXPIRY_FOR_REDIS_MARKETS,
  AUTO,
  MANUAL,
} = require("../../../utils/constants");
const moment = require("moment/moment");
const { getTimeTaken } = require("../../../utils/");
const logger = require('../../../utils/loggers/');

async function processMarketsData(markets) {
  try {
    const keys = markets.map(
      (i) => {
        const manualText = !i.is_manual ? AUTO : MANUAL;
        return `${MARKET_KEY}${i.match_id}:${i.market_id}${manualText}${UNIQUE_IDENTIFIER_KEY}`;
      }
    );

    if (!keys.length) {
      return;
    }

    const startTime = moment();
    const redisData = await redisClient.mget(...keys);
    const redisFetch = getTimeTaken({ startTime });

    const multi = redisClient.multi();

    const loopstartTime = moment();
    for (let i = 0; i < markets.length; i++) {
      const key = keys[i];
      // console.log("key: ", key);
      let redisItem = redisData[i];
      let market = markets[i];

      let finalObj;
      if (!redisItem) {
        // If no data exists in redis
        market.dbRunners = market.runners;
        finalObj = JSON.stringify(market);
      } else {
        // If Redis Item Exists;

        // Parse Redis Item before operations
        redisItem = JSON.parse(redisItem);
        market.dbRunners = [...market.runners];

        market.runners = redisItem.runners.map((runner, index) => {
          const marketRunner = market.runners[index];
          return {
            ...runner,
            ...marketRunner,
            ex: runner.ex,
            status: runner.status,
          };
        });

        finalObj = {
          ...redisItem,
          ...market,
          status: redisItem.status,
        };
        finalObj = JSON.stringify(finalObj);
      }
      multi.set(key, finalObj);
      multi.expire(key, EXPIRY_FOR_REDIS_MARKETS);
    }

    const execstartTime = moment();

    // Execute the commands
    await multi.exec();

  } catch (error) {
    // console.log("Error in ProcessMarketsData: ", error);
    logger.error(`FILE: MarketRedisService.js
          FUNCTION: ProcessMarketsData
          ERROR: ${error.stack}
        `);
  }
}

module.exports = {
  updateMarketsInRedis: async function (marketWiseRedisData, market) {
    try {
      const redisObj = marketWiseRedisData[market.marketId];
      if (redisObj) {
        let { redisData, key } = redisObj;
        let tempMarket = { ...market };
        delete tempMarket.runners;

        const newRunner = market.runners;

        redisData = { ...redisData, ...tempMarket };

        redisData.runners = redisData.runners.map((i) => {
          const { selectionId } = i;
          const newRunnerItem = newRunner.find(
            (i) => i.selectionId === selectionId,
          );

          if (!newRunnerItem) return i;

          return { ...i, ...newRunnerItem };
        });

        marketWiseRedisData[market.marketId]["redisData"] = redisData;

        redisClient.set(
          key,
          JSON.stringify(marketWiseRedisData[market.marketId]["redisData"]),
          "EX",
          EXPIRY_FOR_REDIS_MARKETS,
        );
      }
    } catch (error) {
      // console.log("Error in updateMarketsInRedis: ", error);
      logger.error(`FILE: MarketRedisService.js
          FUNCTION: updateMarketsInRedis
          ERROR: ${error.stack}
        `);
    }
  },
  suspendMarketsInRedis: async function (
    remainingMarkets,
    marketWiseRedisData,
  ) {
    try {
      for (const market of remainingMarkets) {
        const { market_id } = market;
        const redisObj = marketWiseRedisData[market_id];

        if (redisObj) {
          let { redisData, key } = redisObj;

          redisData.status = SUSPENDED;
          redisData.runners = redisData.runners.map((i) => {
            return { ...i, status: SUSPENDED };
          });

          marketWiseRedisData[market_id]["redisData"] = redisData;

          redisClient.set(
            key,
            JSON.stringify(marketWiseRedisData[market_id]["redisData"]),
            "EX",
            EXPIRY_FOR_REDIS_MARKETS,
          );
        }
      }
    } catch (error) {
      // console.log("Error in suspendMarketsInRedis: ", error);
      logger.error(`FILE: MarketRedisService.js
          FUNCTION: suspendMarketsInRedis
          ERROR: ${error.stack}
        `);
    }
  },
  getMarketFronRedis: async function (markets, isFancy = false) {
    try {
      const marketKeys = markets
        .filter((i) => i)
        .map(
          (i) =>
            `${!isFancy ? MARKET_KEY : FANCY_KEY}${i.match_id}:${i.market_id}${AUTO}${UNIQUE_IDENTIFIER_KEY}`,
        );
      const marketWiseRedisData = {};
      if (!marketKeys.length) {
        return marketWiseRedisData;
      }
      const marketsRedisData = await redisClient.mget(...marketKeys);
      markets.map(({ market_id, match_id }, index) => {
        const redisData = marketsRedisData[index];
        const key = marketKeys[index];
        if (redisData) {
          marketWiseRedisData[market_id] = {
            market_id,
            match_id,
            redisData: JSON.parse(redisData),
            key,
          };
        }
      });
      return marketWiseRedisData;
    } catch (error) {
      // console.log("Error in getMarketFronRedis: ", error);
      logger.error(`FILE: MarketRedisService.js
          FUNCTION: getMarketFronRedis
          ERROR: ${error.stack}
        `);
      return {};
    }
  },
  marketsDumpRedis: async () => {
    try {
      const casinoSportIds = [
        LIVE_GAME_SPORT_ID.toString(),
        UNIVERSE_CASINO_SPORT_ID.toString(),
        DIAMOND_CASINO_SPORT_ID.toString(),
      ];

      const startTime = moment(),
        todayDate = new Date();
      todayDate.setHours(0, 0, 0, 0);
      todayDate.setDate(todayDate.getDate() - 5);

      const markets = await Market.find({
        is_active: 1,
        is_visible: true,
        is_abandoned: 0,
        is_result_declared: 0,
        sport_id: { $nin: casinoSportIds },
        match_date: { $gt: todayDate },
      }).lean();

      const db = getTimeTaken({ startTime });

      const marketLength = markets.length;

      // Return if No Market is Present !!
      if (!marketLength) {
        return;
      }

      await processMarketsData(markets);

      // console.log(marketLength, getTimeTaken({ startTime }), db);
    } catch (error) {
      // console.log("Error in MarketDumpRedis: ", error);
      logger.error(`FILE: MarketRedisService.js
          FUNCTION: MarketDumpRedis
          ERROR: ${error.stack}
        `);
    }
  },
  manualMarketOddsDumpRedis: async () => {
    try {

      const casinoSportIds = [
        LIVE_GAME_SPORT_ID.toString(),
        UNIVERSE_CASINO_SPORT_ID.toString(),
        DIAMOND_CASINO_SPORT_ID.toString(),
      ];

      const todayDate = new Date();
      todayDate.setHours(0, 0, 0, 0);
      todayDate.setDate(todayDate.getDate() - 5);

      const markets = await Market.find({
        is_active: 1,
        is_manual: 1,
        is_visible: true,
        is_abandoned: 0,
        is_result_declared: 0,
        sport_id: { $nin: casinoSportIds },
        match_date: { $gt: todayDate },
      }).lean();

      const marketIds = [];

      const keys = markets.map(
        (i) => {
          marketIds.push("ODDS_" + i.market_id);
          return `${MARKET_KEY}${i.match_id}:${i.market_id}${MANUAL}${UNIQUE_IDENTIFIER_KEY}`
        },
      );
      if (!keys.length) return;

      const marketOdds = await redisClient.mget(...marketIds);

      const multi = redisClient.multi();

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        let marketOdd = marketOdds[i];
        let market = markets[i];
        market = { ...market, dbRunners: market.runners }

        let finalObj = { ...market }

        if (marketOdd) {
          marketOdd = JSON.parse(marketOdd);

          let tempMarketOdds = { ...marketOdd };
          delete tempMarketOdds.runners;

          const newRunner = marketOdd.runners;

          finalObj = { ...market, ...tempMarketOdds };

          finalObj.runners = finalObj.runners.map((i) => {
            const { selectionId } = i;
            const newRunnerItem = newRunner.find(
              (i) => i.selectionId === selectionId,
            );

            if (!newRunnerItem) return i;

            return { ...i, ...newRunnerItem };
          });
        } else {
          finalObj.status = SUSPENDED;
        }

        finalObj = JSON.stringify(finalObj);

        multi.set(key, finalObj);
        multi.expire(key, EXPIRY_FOR_REDIS_MARKETS);
      }

      await multi.exec();
    } catch (error) {
      // console.log("Error in manualMarketOddsDumpRedis: ", error);
      logger.error(`FILE: MarketRedisService.js
          FUNCTION: manualMarketOddsDumpRedis
          ERROR: ${error.stack}
        `);
    }
  }
};
