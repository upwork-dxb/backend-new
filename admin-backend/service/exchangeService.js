const client = require('../../connections/redis')
  , publisher = require("../../connections/redisConnections")
  , { SERVER_ERROR, SUCCESS, DATA_NULL, NOT_FOUND, HOME_MATCHES_OPEN_KEY } = require('../../utils/constants')
  , { resultResponse } = require('../../utils/globalFunction');

let getOddsByMarketIds = async (market_ids, group = false) => {
  try {
    let tempData = [];
    let odds = await client.mget(market_ids);
    if (group) {
      tempData = {}
      odds.map(function (o) {
        if (o != null) {
          var oddsTemp = JSON.parse(o);
          if (Array.isArray(oddsTemp))
            tempData = oddsTemp;
          if (oddsTemp.marketId != undefined)
            if (oddsTemp.runners.length)
              tempData[oddsTemp.marketId] = oddsTemp;
        }
      });
      if (Array.isArray(tempData))
        if (tempData.length)
          return resultResponse(SUCCESS, tempData);
      if (Object.keys(tempData).length)
        return resultResponse(SUCCESS, tempData);
      return resultResponse(SERVER_ERROR, DATA_NULL);
    }
    odds.map(o => {
      if (o != null)
        tempData.push(JSON.parse(o));
    });
    if (!tempData.length)
      return resultResponse(SERVER_ERROR, DATA_NULL);
    return resultResponse(SUCCESS, tempData);
  } catch (error) {
    return resultResponse(SERVER_ERROR, DATA_NULL);
  }
};

let getOddsByMarketIdsV2 = async (market_ids) => {
  try {
    if (!market_ids?.length)
      return resultResponse(SUCCESS, []);

    let odds = await client.mget(...market_ids);

    odds = odds.map(i => {
      if (i) return JSON.parse(i);
      return i
    })
    return resultResponse(SUCCESS, odds);
  } catch (error) {
    return resultResponse(SERVER_ERROR, DATA_NULL);
  }
};

let getMarketLiveData = (marketIds = 'ODDS_1.*') => {
  if (Array.isArray(marketIds))
    return getMarkets(marketIds).then(data => data);
  return client.keys(marketIds).then(market => {
    if (market.length)
      return getMarkets(market).then(data => data);
    return resultResponse(NOT_FOUND, []);
  }).catch(error => resultResponse(SERVER_ERROR, error.message))
}

function getMarkets(market) {
  return client.mget(market)
    .then(data => resultResponse(SUCCESS, data.map(data => JSON.parse(data))))
    .catch(error => resultResponse(SERVER_ERROR, error.message));
}

let getMarketDelayData = (marketIds = "DELAY_ODDS_*") => {
  return getMarketLiveData(marketIds);
}

let getFancyLiveData = (match_id) => {
  return client.keys(`${match_id}_*`).then(fancy => {
    if (fancy.length)
      return client.mget(fancy).then(data => resultResponse(SUCCESS, data.map(data => JSON.parse(data)))).catch(error => resultResponse(SERVER_ERROR, error.message));
    return resultResponse(NOT_FOUND, "No live data found!");
  }).catch(error => resultResponse(SERVER_ERROR, error.message))
}

let getFanciesLiveData = (request) => {
  const { fancyIds } = request.body
  return client.mget(fancyIds).then(data => {
    data = data.filter(clean => clean);
    if (!data.length)
      return resultResponse(NOT_FOUND, "No fancy(s) data found!");
    return resultResponse(SUCCESS, data.filter(clean => clean).map(data => JSON.parse(data)))
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

const MATCHES_AGENTS = "MATCHES_AGENTS"
  , MATCHES_MARKETS_AGENTS = "MATCHES_MARKETS_AGENTS";

let setMatchesForUsers = (data, KEY = MATCHES_AGENTS) => {
  try {
    client.set(KEY, JSON.stringify(data));
  } catch (error) { }
}

let setMatchesMarketsForUsers = (data, KEY = MATCHES_MARKETS_AGENTS) => {
  setMatchesForUsers(data, KEY);
}

let getMatchesForUsers = (KEY = MATCHES_AGENTS) => {
  try {
    return client.get(KEY).then(data => JSON.parse(data));
  } catch (error) { }
}

let getMatchesMarketsForUsers = (KEY = MATCHES_MARKETS_AGENTS) => {
  return getMatchesForUsers(KEY);
}

let flushCache = () => {
  try {
    return client.flushall().then(data => resultResponse(SUCCESS, data));
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}


let homeMatchesWrite = (data) => {

  const EXPIRE_ONE_DAY = 24 * 60 * 60;

  publisher.set(HOME_MATCHES_OPEN_KEY, JSON.stringify(data), 'EX', EXPIRE_ONE_DAY)
    .then()
    .catch(error => resultResponse(SERVER_ERROR, error.message));

}

let homeMatchesRead = () => {
  return publisher.get(HOME_MATCHES_OPEN_KEY)
    .then(data => resultResponse(data ? SUCCESS : NOT_FOUND, data ? JSON.parse(data) : [])
    ).catch(error => resultResponse(SERVER_ERROR, error.message));
}

module.exports = {
  getOddsByMarketIds, getMarketLiveData, getFancyLiveData, setMatchesForUsers,
  getMatchesForUsers, setMatchesMarketsForUsers, getMatchesMarketsForUsers,
  getMarketDelayData, getFanciesLiveData, flushCache, homeMatchesWrite,
  homeMatchesRead, getOddsByMarketIdsV2
}