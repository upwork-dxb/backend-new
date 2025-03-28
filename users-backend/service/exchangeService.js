const axios = require('axios')
  , client = require('../../connections/redis')
  , apiUrlSettingsService = require('../../admin-backend/service/apiUrlSettingsService')
  , marketService = require('../../admin-backend/service/marketService')
  , {
    LIVE_GAME_SPORT_ID, SUCCESS, NOT_FOUND, DATA_NULL, SERVER_ERROR, DIAMOND_CASINO_SPORT_ID,
    GET_LAST_RATE, OPEN, SUSPENDED, API_PROVIDER, INPLAY, DELAY, BOOKMAKER_TYPE,
  } = require('../../utils/constants')
  , { resultResponse } = require('../../utils/globalFunction')
  , API = "A", REDIS = "R";

let getOddsRate = async (data) => {
  try {
    let { market_id, selection_id, is_back, is_live_sport, sport_id } = data;
    let status = 0, currentOdss = 0, size = 0, selectionData = [], isExchangeGame, response = {}, odds;
    // if length is 5 it's exchange game.
    if (market_id.includes(LIVE_GAME_SPORT_ID) || market_id.includes(DIAMOND_CASINO_SPORT_ID))
      isExchangeGame = true;
    let matchFrom = await apiUrlSettingsService.checkOddsStatus();
    if (matchFrom == undefined)
      return resultResponse(NOT_FOUND, "Error code: checkOddsStatus");
    try {
      if (!isExchangeGame && matchFrom == API) {
        if (API_PROVIDER == "frnk") {
          let api_status = await validateFromFrnkAPI(data);
          if (api_status.statusCode == SUCCESS)
            odds = api_status.data;
          else
            return resultResponse(api_status.statusCode, api_status.data);
        } else if (API_PROVIDER == "xcentral") {
          let api_status = await validateFromXCentralAPI(data);
          return resultResponse(api_status.statusCode, api_status.data);
        } else
          return resultResponse(NOT_FOUND, "API_PROVIDER not found!");
      }
    } catch (error) {
      return resultResponse(SERVER_ERROR, "Error while checking odds status from [API]");
    }

    if (matchFrom == REDIS)
      odds = await client.get('ODDS_' + market_id);
    if (!odds)
      return resultResponse(NOT_FOUND, "Odds data not found!");
    odds = ([DIAMOND_CASINO_SPORT_ID].includes(sport_id)) ? [JSON.parse(odds)] : JSON.parse(odds);
    if (odds != null) {
      if (!isExchangeGame) {
        if (odds.selectionType == 'outer')
          selectionData = odds.runners_org.filter(function (data) {
            return data.selectionId == selection_id
          });
        else
          selectionData = odds.runners.filter(function (data) {
            return data.selectionId == selection_id
          });
        if (selectionData[0].hasOwnProperty("ex")) {
          if (selectionData[0].ex != undefined)
            if (is_back == 1) {
              if (!(selectionData[0].ex.availableToBack).length)
                return resultResponse(NOT_FOUND, "Odds suspended!");
              currentOdss = selectionData[0].ex.availableToBack[0].price;
              size = selectionData[0].ex.availableToBack[0].size;
              if (is_live_sport == 1)
                status = selectionData[0].ex.availableToBack[0].status;
              else
                status = odds.status;
            } else {
              if (!(selectionData[0].ex.availableToLay).length)
                return resultResponse(NOT_FOUND, "Odds suspended!");
              currentOdss = selectionData[0].ex.availableToLay[0].price;
              size = selectionData[0].ex.availableToLay[0].size;
              if (is_live_sport == 1)
                status = selectionData[0].ex.availableToLay[0].status;
              else
                status = odds.status;
            }
        } else {
          if (is_back == 1) {
            if (!(selectionData[0].back).length)
              return resultResponse(NOT_FOUND, "Odds suspended!");
            currentOdss = selectionData[0].back[0].price;
            size = selectionData[0].back[0].size;
            if (is_live_sport == 1)
              status = selectionData[0].back[0].status;
            else
              status = odds.status;
          } else {
            if (!(selectionData[0].lay).length)
              return resultResponse(NOT_FOUND, "Odds suspended!");
            currentOdss = selectionData[0].lay[0].price;
            size = selectionData[0].lay[0].size;
            if (is_live_sport == 1)
              status = selectionData[0].lay[0].status;
            else
              status = odds.status;
          }
        }
        response = {
          odds: currentOdss,
          size: size,
          status: status
        }
      }
      if (isExchangeGame) {
        if (is_back == 1) {
          odds.map(liveData => {
            let selectionData = liveData.runners.find(selection => selection.selectionId == selection_id);
            if (selectionData) {
              currentOdss = selectionData.back[0].price;
              size = selectionData.back[0].size;
              status = liveData.status;
            }
          })
        } else {
          odds.map(liveData => {
            let selectionData = liveData.runners.find(selection => selection.selectionId == selection_id);
            if (selectionData) {
              currentOdss = selectionData.lay[0].price;
              size = selectionData.back[0].size;
              status = liveData.status;
            }
          })
        }
        odds = odds[0];
        response = {
          odds: currentOdss,
          size: size,
          status: status,
          market_id: `${market_id}.${odds.roundId}`
        }
      }
      return resultResponse(SUCCESS, response);
    } else
      return resultResponse(NOT_FOUND, "Odds data not found!");
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

let validateFromFrnkAPI = async function (params) {
  let API_TYPE = (params.market.market_type == BOOKMAKER_TYPE) ? BOOKMAKER_TYPE : params.market.cron_inplay ? INPLAY : DELAY;
  let markets_data = await marketService.getOddsRates({ markets_ids: params.market_id, API_TYPE });
  if (markets_data.statusCode == SUCCESS)
    return resultResponse(SUCCESS, JSON.stringify(markets_data.data[0]));
  else
    return resultResponse(NOT_FOUND, markets_data.data);
}

let validateFromXCentralAPI = async function (params) {
  let getLastRateResponse = await getLastRate(params.market);
  if (getLastRateResponse.statusCode == SUCCESS) {
    if (!getLastRateResponse.data.status)
      return resultResponse(NOT_FOUND, "Market is suspended");
    let marketStatus = getLastRateResponse.data.status;
    getLastRateResponse = getLastRateResponse.data.runners;
    selectionData = getLastRateResponse.filter(data =>
    (
      market_id == data.appMarketID_BF && selection_id == data.appSelectionID_BF &&
      (is_back ? true : false) == data.appIsBack
    ));
    selectionData = selectionData.sort((oldRate, newRate) => newRate.appRate - oldRate.appRate);
    if (is_back)
      selectionData = selectionData[0];
    else
      selectionData = selectionData.reverse()[0];
    const { appRate, appBFVolume, appRunnerStatus } = selectionData;
    response = {
      odds: appRate,
      size: appBFVolume,
      // status: appRunnerStatus ? OPEN : SUSPENDED
      status: marketStatus ? OPEN : SUSPENDED
    }
    return resultResponse(SUCCESS, response);
  } else
    return resultResponse(NOT_FOUND, getLastRateResponse.data);
}

let getFancyByFancyId = async (fancy_id) => {
  try {
    let odds = await client.get(fancy_id);
    return resultResponse(SUCCESS, JSON.parse(odds));
  } catch (error) {
    return resultResponse(SERVER_ERROR, DATA_NULL);
  }
}

let getOddsByMarketId = async (market_id) => {
  try {
    let odds = await client.get("ODDS_" + market_id);
    if (odds == null)
      return resultResponse(SERVER_ERROR, false);
    odds = JSON.parse(odds);
    return resultResponse(SUCCESS, odds.inplay);
  } catch (error) {
    return resultResponse(SERVER_ERROR, false);
  }
};

let getFancyLastRate = async (centralId) => {
  try {
    let getLastRateResponse = await getLastRate({ centralId });
    if (getLastRateResponse.statusCode == SUCCESS) {
      getLastRateResponse = getLastRateResponse.data;
      if (!getLastRateResponse.runners.length)
        return resultResponse(NOT_FOUND, DATA_NULL);
      let BackPrice1, BackSize1, LayPrice1, LaySize1, GameStatus = SUSPENDED;
      GameStatus = getLastRateResponse.status == 1 ? "" : SUSPENDED;
      for (const fancy of getLastRateResponse.runners) {
        if (fancy.appIsBack) {
          BackPrice1 = fancy.appRate;
          BackSize1 = fancy.appPoint;
        } else {
          LayPrice1 = fancy.appRate;
          LaySize1 = fancy.appPoint;
        }
      }
      return resultResponse(SUCCESS, {
        BackPrice1,
        BackSize1,
        LayPrice1,
        LaySize1,
        GameStatus
      });
    } else
      return resultResponse(NOT_FOUND, DATA_NULL);
  } catch (error) {
    return resultResponse(SERVER_ERROR, DATA_NULL);
  }
};

let getLastRate = async (data) => {
  try {
    const { centralId } = data;
    let config = {
      method: 'post',
      url: GET_LAST_RATE,
      timeout: 800,
      data: {
        "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhZ2VudGlkIjoia2NjZW50cmFsMl9pbiIsImRhdGV0aW1lIjoxNjY0ODYxNTM0NzUzLCJpYXQiOjE2NjQ4NjE1MzR9.9g8YMI6IEIgSc65iHBKupqPoxQeNc_GRw3cB1bmYPQw",
        "marketCode": centralId
      }
    }
    let response = await axios(config);
    if (response.data) {
      response = response.data;
      if (response.length) {
        response = response[0];
        if (response.hasOwnProperty("appRate")) {
          try {
            runners = JSON.parse(response.appRate);
            return resultResponse(SUCCESS, { runners, status: response.appMarketStatus });
          } catch (error) { }
        }
      }
    }
    return resultResponse(NOT_FOUND, "No data found in provider api");
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
};

module.exports = { getFancyByFancyId, getOddsByMarketId, getOddsRate, getFancyLastRate }