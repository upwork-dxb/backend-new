const ApiUrlSetting = require('../../models/apiUrlSetting');
const { API_SETTINGS, UNIQUE_IDENTIFIER_KEY, GET_IP_ADDRESS_DETAILS } = require("../../utils/constants");
const publisher = require("../../connections/redisConnections");

function getApiUrls(params) {
  return ApiUrlSetting
    .findOne({}, params)
    .select("is_https https http events_base_url plug")
    .then(data => JSON.parse(JSON.stringify(data))).catch(console.error);
}

function getApi(params) {
  params["_id"] = 0;
  return ApiUrlSetting
    .findOne({}, params)
    .then(data => data).catch(console.error);
}

/**
 * admin-backend/service/marketService.js
 */
async function getBaseUrl() {

  return await getCacheAndDBData({ functionName: getApiUrls, fetchKey: "events_base_url", virtualKey: "getBaseUrl" });

}

/**
 * admin-backend/controllers/sportsController.js
 */
async function getSportsUrl() {

  return await getCacheAndDBData({ functionName: getApiUrls, fetchKey: "sports_url", virtualKey: "getSportsApi" });

}

/**
 * getSeries
 */
async function getSeriesUrl() {

  return await getCacheAndDBData({ functionName: getApiUrls, fetchKey: "series_url", virtualKey: "getSeriesApi" });

}

/**
 * admin-backend/controllers/matchController.js
 */
async function getMatchesUrl() {

  return await getCacheAndDBData({ functionName: getApiUrls, fetchKey: "matches_url", virtualKey: "getMatchesApi" });

}

/**
 * admin-backend/controllers/matchController.js
 */
async function getMatchMarketsUrl() {

  return await getCacheAndDBData({ functionName: getApiUrls, fetchKey: "match_markets_url", virtualKey: "getMatchMarketsApi" });

}

/**
 * admin-backend/controllers/marketController.js
 */
async function getMarketsUrl() {

  return await getCacheAndDBData({ functionName: getApiUrls, fetchKey: "markets_url", virtualKey: "getMarketsApi" });

}

/**
 * admin-backend/controllers/marketController.js
 * createMarket
 */
async function getMarketSelectionsUrl() {

  return await getCacheAndDBData({ functionName: getApiUrls, fetchKey: "market_selections_url", virtualKey: "getMarketSelectionsApi" });

}

/**
 * admin-backend/service/marketService.js
 * getResult
 */
async function getMarketResultUrl() {

  return await getCacheAndDBData({ functionName: getApiUrls, fetchKey: "market_result_url", virtualKey: "getMarketResultApi" });

}

/**
 * admin-backend/service/fancyService.js
 * getResult
 * getOnlineFancyList
 */
async function getFancyUrl() {

  return await getCacheAndDBData({ functionName: getApiUrls, fetchKey: "fancy_url", virtualKey: "getFancyApi" });

}

/**
 * admin-backend/service/fancyService.js
 * inactiveAutoImportFancy
 * getOddsForemostAPI
 */
async function getFancyOddsApiUrl() {

  return await getCacheAndDBData({ functionName: getApiUrls, fetchKey: "fancy_odds_url", virtualKey: "getFancyOddsApi" });

}

/**
 * utils/cron.js
 * Not used yet!
 */
async function isfancyFromApi() {

  return await getCacheAndDBData({ functionName: getApi, fetchKey: "fancy_from_api" });

}

/**
 * users-backend/service/betService.js
 */
async function checkFancyStatus() {

  return await getCacheAndDBData({ functionName: getApi, fetchKey: "check_fancy_status" });

}

/**
 * users-backend/service/exchangeService.js:19
 */
async function checkOddsStatus() {

  return await getCacheAndDBData({ functionName: getApi, fetchKey: "check_odds_status" });

}

/**
 * admin-backend/service/matchService.js
 */
async function isRatesFromRedis() {

  return await getCacheAndDBData({ functionName: getApi, fetchKey: "odds_from_redis" });

}

/**
 * admin-backend/routes/fancyRoutes.js
 * /getOnlineApiFancy
 */
async function liveFancyDataFrom() {

  return await getCacheAndDBData({ functionName: getApi, fetchKey: "live_fancy_data_from" });

}

/**
 * users-backend/controllers/eventsController.js
 * users-backend/routes/eventRoutes.js
 */
async function applyValidation() {

  return await getCacheAndDBData({ functionName: getApi, fetchKey: "apply_frontend_event_limit_validation" });

}

/**
 * utils/cron.js
 * Not used yet!
 */
function cronStatus(type = "odds_cron") {
  const params = {};
  params[type] = 1;
  return getApi(params).then(Api => Api[type]);
}

async function getCacheAndDBData(params) {

  const { functionName, fetchKey, virtualKey } = params;

  const KEY = API_SETTINGS + fetchKey + UNIQUE_IDENTIFIER_KEY;

  let result = await publisher.get(KEY);

  let key = {};

  key[fetchKey] = 1;

  if (!result) {

    if (virtualKey) {
      result = await functionName(key).then(Api => Api[virtualKey]);
    } else {
      result = await functionName(key).then(Api => Api[fetchKey]);
    }

    await publisher.set(KEY, result).then();

    return result;

  } else {

    return result;

  }

}

async function getIpAddressDetailsUrl(ip) {
  let apiBaseUrl = await getBaseUrl();
   return `${apiBaseUrl}/${GET_IP_ADDRESS_DETAILS}${ip}`
}

module.exports = {
  getApiUrls, getSportsUrl, getSeriesUrl, getMatchesUrl, getMatchMarketsUrl, getMarketResultUrl,
  getMarketsUrl, getMarketSelectionsUrl, getFancyUrl, isfancyFromApi, checkFancyStatus, getBaseUrl,
  isRatesFromRedis, liveFancyDataFrom, applyValidation, cronStatus, checkOddsStatus, getFancyOddsApiUrl,
  getIpAddressDetailsUrl
}