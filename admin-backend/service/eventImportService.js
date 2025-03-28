const mongoose = require('mongoose')
  , moment = require('moment')
  , path = require('path')
  , Match = require('../../models/match')
  , Market = require('../../models/market')
  , seriesService = require("./seriesService")
  , matchService = require("./matchService")
  , marketService = require("./marketService")
  , marketCreateRunners = require('../../utils/marketCreateRunners')
  , XCENTRAL_LOGS_PATH = path.normalize(path.resolve(__dirname, "../../logs-3rd"))
  , appendFile = require('util').promisify(require('fs').appendFileSync)
  , { createMarketRunners } = marketCreateRunners
  , { titleCase, getMarketType } = require('../../utils')
  , { SUCCESS, NOT_FOUND, SERVER_ERROR } = require("../../utils/constants")
  , { resultResponse } = require('../../utils/globalFunction');

async function saveImportMarketData(params, replication = false) {
  const session = await mongoose.startSession();
  try {
    let xcentral_logs_path = XCENTRAL_LOGS_PATH + "/" + moment(new Date()).utcOffset("+05:30").format('YYYY-MM-DD') + ".log";
    let log_data = `${moment(new Date()).utcOffset("+05:30").format('YYYY-MM-DD h:mm:ss A')} -> ${JSON.stringify(params)} \n`;
    appendFile(xcentral_logs_path, log_data, 'utf8');
    params = {
      is_settled: params.IsSettled,
      is_fancy: params.IsFancy,
      market_type_id: params.MarketTypeId,
      market_type: params.MarketType,
      market_order: params.MarketOrder,
      category_type: params.categoryType,
      sport_id: params.bfSportId,
      sport_name: params.SportName,
      series_id: params.bfTournamentId,
      series_name: params.TournamentName,
      match_id: params.bfMatchId,
      match_name: params.MatchName,
      centralId: params.CentralId,
      match_date: params.OpenDate,
      market_id: params.bfMarketId,
      market_name: params.MarketName,
      runners: params.runners,
      winning_team: params.Result,
    };
    if (params.is_settled != false)
      return resultResponse(NOT_FOUND, "Market Already imported!");
    if (params.market_type == "MATCH_ODDS" && params.market_type_id == 1) {
      params.market_type_id = 0; params.category_type = 1;
    }
    if (![
      // 0	1	Market      11	3	Bookmakers
      [0, 1].toString(), [11, 3].toString(),
      // 12	5	ManualOdds  12	10	Win Toss 
      [12, 5].toString(), [12, 10].toString()
    ].includes([params.market_type_id, params.category_type].toString()) && !replication)
      return resultResponse(NOT_FOUND, "Market & Category type not allowed!");
    await session.withTransaction(async session => {
      // Here series will create.
      let series = await seriesService.seriesCreateUpdate({
        sport_id: params.sport_id,
        sport_name: params.sport_name,
        series_id: params.series_id,
        series_name: params.series_name,
        name: params.series_name
      }, ['_id'], true, session);
      if (series.statusCode != SUCCESS)
        throw new Error(series.data);
      let { market_id, centralId, runners } = params;
      params.marketId = market_id;
      params.marketIds = [market_id];
      params.centralIds = [centralId.toString()];
      params.centralId = params.centralId.toString();
      var matchDate = new Date(params.match_date);
      matchDate.setHours(matchDate.getHours() - 5);
      matchDate.setMinutes(matchDate.getMinutes() - 30);
      params.match_date = matchDate;
      // Re-Structured the runner data.
      runners = runners.map((data, index) => ({
        selectionId: data.bfRunnerId.toString(),
        runnerName: data.RunnerName,
        sortPriority: index + 1
      }));
      // Formatting runners data for match & market.
      marketRunners = createMarketRunners(market_id, runners);
      // The initial creation object for the match.
      let matchData = {
        sport_id: params.sport_id,
        sport_name: params.sport_name,
        series_id: params.series_id,
        series_name: params.series_name,
        match_id: params.match_id,
        match_name: params.match_name,
        name: params.match_name,
      };
      let marketName = (params.market_name).toLowerCase()
        , IsBookmaker = (new RegExp('bookmaker')).test(marketName)
        , IsMatchOdds = "match odds" == marketName
        , IsSpecificMarketName = IsBookmaker || IsMatchOdds || "winner" == marketName
        , enable_fancy = params.sport_id == "4" ? true : false;
      if (IsBookmaker)
        params.market_name = "bookmaker";
      params.market_name = titleCase(params.market_name.replace(/\s+/g, ' ').trim());
      // Store necessary market values in match collection.
      let marketIdStatusInMatch = await Match.findOne({ match_id: params.match_id }).select("-_id").session(session);
      if (IsSpecificMarketName && marketIdStatusInMatch == null)
        matchData = {
          ...matchData,
          market_id: params.market_id,
          marketId: params.marketId,
          market_order: params.market_order,
          market_type: params.market_type,
          market_name: params.market_name,
          match_date: params.match_date,
          start_date: params.match_date,
          centralId: params.centralId,
          marketIds: params.marketIds,
          centralIds: params.centralIds,
          runners: marketRunners,
          enable_fancy
        };
      if (IsMatchOdds)
        matchData = {
          ...matchData,
          market_id: params.market_id,
          marketId: params.marketId,
          market_type: params.market_type,
          market_order: params.market_order,
          market_name: params.market_name,
          centralId: params.centralId,
          match_date: params.match_date,
          start_date: params.match_date,
          marketIds: params.marketIds,
          centralIds: params.centralIds,
          runners: marketRunners,
          enable_fancy
        }
      // Here match will create.
      let match = await matchService.matchCreateUpdate(matchData, ['_id'], true, session);
      if (match.statusCode != SUCCESS)
        throw new Error(match.data);

      // The initial creation object for the market.
      let marketData = {
        sport_id: params.sport_id,
        sport_name: params.sport_name,
        series_id: params.series_id,
        series_name: params.series_name,
        match_id: params.match_id,
        match_name: params.match_name,
        market_id: params.market_id,
        marketId: params.market_id,
        market_order: params.market_id,
        market_type: params.market_type,
        market_name: params.market_name,
        name: params.market_name,
        centralId: params.centralId,
        match_date: params.match_date,
        enable_fancy,
        runners: marketRunners,
      };
      // Market orders will assign.
      let market_order;
      if (!params.market_order) {
        market_order = await Market.find({ match_id: params.match_id }).select("_id").session(session);
        if (!market_order.length)
          market_order = 4;
        else
          market_order = market_order.length;
        if (IsMatchOdds)
          market_order = 0;
        if (IsBookmaker)
          market_order = 1;
      } else
        market_order = params.market_order;
      marketData.market_order = market_order;
      // Here market will create.
      let market = await marketService.marketCreateUpdate(marketData, ['_id'], true, session);
      if (market.statusCode != SUCCESS)
        throw new Error(market.data);
      // Check if match is already created.
      marketIdStatusInMatch = await Match.findOne({ match_id: params.match_id }).select("-_id market").session(session);
      let updateMatch = false, updateMatchData = {};
      if (marketIdStatusInMatch) {
        // If the market name is matched with strings.
        if (IsSpecificMarketName) {
          if (marketIdStatusInMatch.market == null) {
            updateMatch = true;
            updateMatchData = {
              match_id: params.match_id,
              market: market.data._id
            };
          }
        }
        // Upon creating a match and not having the market object ID, Update the match with the pushed IDs.
        if (marketIdStatusInMatch.market != null) {
          updateMatch = true;
          updateMatchData = {
            match_id: params.match_id,
            "$addToSet": {
              marketIds: params.market_id,
              centralIds: params.centralId
            }
          };
        }
      }
      if (updateMatch) {
        // Upon market creation, match fields are updated.
        let matchUpdate = await matchService.matchCreateUpdate(updateMatchData, ['_id'], true, session);
        if (matchUpdate.statusCode != SUCCESS)
          throw new Error(matchUpdate.data);
      }
    });
    return resultResponse(SUCCESS, params.market_name + " Imported successfully...");
  } catch (error) {
    console.error(error);
    return resultResponse(SERVER_ERROR, error.message);
  } finally {
    session.endSession();
  }
}

async function convertNewDataToOld(newData) {
  const oldData = [];
  newData.markets = newData.markets.map(data => {
    let marketMeta = getMarketType({ marketName: data.marketName })
    data.marketType = marketMeta.market_type
    data.marketOrder = marketMeta.market_order;
    return data;
  }).sort((a, b) => a.marketOrder > b.marketOrder ? 1 : -1);
  newData.markets.forEach((market) => {
    const oldMarketData = {
      bfSportId: newData.eventType.id,
      SportName: newData.eventType.name,
      SportDescrption: "",
      bfTournamentId: newData.competition.id,
      TournamentName: newData.competition.name,
      TournamentDescrption: "",
      bfMatchId: newData.event.id,
      MatchName: newData.event.name,
      MatchDescrption: "",
      bfMarketId: market.marketId,
      MarketName: market.marketName,
      MarketType: market.marketType,
      MarketOrder: market.marketOrder,
      MarketDescrption: "",
      Result: "",
      IsSettled: false,
      IsFancy: false,
      BettingType: "0",
      Clarifications: null,
      IsBspMarket: false,
      IsDiscountAllowed: false,
      IsPersistenceEnabled: true,
      IsTurnInPlayEnabled: true,
      MarketBaseRate: 5,
      MarketTime: market.marketStartTime,
      MarketType: market.marketName.toUpperCase().replace(" ", "_"),
      MarketTypeId: (new RegExp('match odds')).test(market.marketName) ? 1 : 2, // assuming MarketTypeId is 2 for other market names
      Regulator: "",
      Rules: "",
      RulesHasDate: false,
      SettleTime: null,
      SuspendTime: null,
      OpenDate: market.marketStartTime,
      Wallet: "",
      CentralId: market.centralId,
      runners: market.runners.map((runner) => ({
        RunnerName: runner.runnerName,
        bfRunnerId: runner.selectionId,
      })),
      bannerImage: "",
    };
    oldData.push(oldMarketData);
  });
  return oldData;
}

async function formostEventImport(params) {
  try {
    if (!Object.keys(params.competition).length)
      return resultResponse(NOT_FOUND, "Competition not found!");
    if (!params.hasOwnProperty('markets') || !params.markets.length)
      return resultResponse(NOT_FOUND, "Market not found!");
    const migratedData = await convertNewDataToOld(params);
    let marketName = [];
    for await (const dt of migratedData) {
      marketName.push(dt.MarketName)
      await saveImportMarketData(dt, true);
    }
    return resultResponse(SUCCESS, marketName + " Imported successfully.");
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

module.exports = {
  saveImportMarketData, formostEventImport
}