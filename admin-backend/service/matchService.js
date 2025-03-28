const axios = require('axios')
  , Match = require('../../models/match')
  , Fancy = require('../../models/fancy')
  , Market = require('../../models/market')
  , MarketAnalysis = require('../../models/marketAnalysis')
  , deactiveMatch = require('../../models/deactiveMatch')
  , tvAndScoreboardUrlSetting = require('../../models/tvAndScoreboardUrlSetting')
  , websiteSetting = require('../../models/websiteSetting')
  , websiteService = require("./websiteService")
  , matchServiceQuery = require('./matchServiceQuery')
  , globalFunction = require('../../utils/globalFunction')
  , exchangeService = require("./exchangeService")
  , apiUrlSettingsService = require('./apiUrlSettingsService')
  , { SUCCESS, NOT_FOUND, SERVER_ERROR, DATA_NULL, ALREADY_EXISTS,
    USER_TYPE_SUPER_ADMIN, LIVE_GAME_SPORT_ID, DIAMOND_CASINO_SPORT_ID, UNIVERSE_CASINO_SPORT_ID,
    TV_SCOREBOARD, FRNK, XCENTRAL, TV_SCOREBOARD_FRNK, FRNK_SECRETKEY,
    TV_DEFAULT, SCOREBOARD_DEFAULT,
    SCOREBOARD_XCENTRAL_1,
    SCOREBOARD_FRNK_1, SCOREBOARD_FRNK_2, SCOREBOARD_FRNK_3,
    SCOREBOARD_FRNK_2_URL, SCOREBOARD_FRNK_3_URL,
    TV_FRNK_1, TV_FRNK_2, TV_FRNK_3, TV_FRNK_4, TV_FRNK_5, TV_FRNK_6, TV_FRNK_7, TV_FRNK_8, TV_XCENTRAL_1,
    TV_EVENTS_FETCH_API, TV_EVENTS_FETCH_API_FOR_HRGHR, HR, GHR, API_PROVIDER,
    BET_COUNT,
    UNIQUE_IDENTIFIER_KEY,
    MARKET_CHANGE_EVENT,
    FANCY_CHANGE_EVENT,
    MARKET_KEY,
    FANCY_KEY,
    VALIDATION_ERROR,
    FANCY_CATEGORY,
    LIVE_SPORTS,
    RACING_SPORTS,
  } = require('../../utils/constants')
  , matchValidator = require('../validator/matchValidator')
  , redisClient = require("../../connections/redisConnections")
  , { ResError, ResSuccess } = require('../../lib/expressResponder');
const betCount = require('../../models/betCount');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const logger = require("../../utils/loggers");
const { getFanciesV2 } = require('./fancy/fancyRedisService');
const BetCountService = require("./betCount/betCountService");
const { USER_BLOCK_TYPE } = require('../../config/constant/user');
const MatchEvent = require('../../lib/node-event').event

let resultResponse = globalFunction.resultResponse
  , SCOREBOARD = SCOREBOARD_DEFAULT;

async function checkMatchExist(match_id) {
  try {
    let checkMatchExist = await Match.findOne({ match_id: match_id }, { match_id: 1, _id: 0 });
    if (checkMatchExist != null)
      if (checkMatchExist["match_id"])
        return resultResponse(SUCCESS, true);
    return resultResponse(NOT_FOUND, false);
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

let isMatchDataExists = async (match_id) => {
  try {
    let matchDetails = await Match.findOne({ match_id }).select("_id is_active is_visible series_id").lean();
    if (matchDetails)
      return resultResponse(SUCCESS, matchDetails);
    else
      return resultResponse(NOT_FOUND, "Match data not found!");
  } catch (error) {
    return resultResponse(SERVER_ERROR, DATA_NULL);
  }
};

async function updateMatchStatus(match_id, is_active) {
  try {
    let update = { is_active }
    if (!is_active)
      update.enable_fancy = 0;
    let updateAndGetMatchStatus = await Match.updateOne({ match_id }, { $set: update }).lean();
    if (updateAndGetMatchStatus.acknowledged)
      return resultResponse(SUCCESS, updateAndGetMatchStatus);
    else if (!updateAndGetMatchStatus.acknowledged)
      return resultResponse(NOT_FOUND, DATA_NULL);
    else
      return resultResponse(ALREADY_EXISTS, DATA_NULL);
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function updateDeactiveMatch(user_id, update) {
  try {
    let resFromDB = await deactiveMatch.findByIdAndUpdate(user_id, update);
    if (resFromDB)
      return resultResponse(SUCCESS, resFromDB);
    else
      return resultResponse(NOT_FOUND);
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function getDeactiveMatch(data) {
  try {
    let resFromDB = await deactiveMatch.findOne(data, {
      _id: 1,
      block_by_parent: 1
    }).lean();
    if (resFromDB)
      return resultResponse(SUCCESS, resFromDB);
    else
      return resultResponse(NOT_FOUND);
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function createDeactiveMatch(data) {
  try {
    let createDeactiveRes = await deactiveMatch.create(data);
    return resultResponse(SUCCESS, createDeactiveRes);
  } catch (error) {
    return resultResponse(SERVER_ERROR, DATA_NULL);
  }
}

async function deleteDeactiveMatch(data) {
  try {
    let resFromDB = await deactiveMatch.deleteOne({
      user_id: data.user_id,
      match_id: data.match_id
    });
    return resultResponse(SUCCESS, resFromDB);
  } catch (error) {
    return resultResponse(SERVER_ERROR, DATA_NULL);
  }
}

async function getAllMatches(FilterQuery = {}, Projection = {}) {
  try {
    let matchDetails = await Match.find(FilterQuery, Projection);
    if (matchDetails)
      return resultResponse(SUCCESS, matchDetails);
    else
      return resultResponse(NOT_FOUND, DATA_NULL);
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
};

async function getMatches(parentIds, user_id, series_id) {
  try {
    let query = matchServiceQuery.getMatches(parentIds, user_id, series_id);
    let result = await Match.aggregate(query);
    if (result)
      return resultResponse(SUCCESS, result);
    else
      return resultResponse(NOT_FOUND);
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function homeMatchesDetailsMain(req, res) {
  let isSocket = req?.isSocketCall || 0;
  const { socket, event } = req;

  // Capture start time for performance measurement
  const startTime = moment();

  // Generate a unique reference code for logging (optional)
  const LOG_REF_CODE = uuidv4();

  // Log function call
  // logger.info(`${LOG_REF_CODE} homeMatchesDetailsMain Started`);


  try {
    // Perform Req Body Validation !!
    let schema;
    if (req.functionName == 'homeMatches' || req.functionName == 'homeMatchesV2') {
      if (req.method == 'GET') {
        req.body = req.query;
      }
      schema = matchValidator.homeMatchesJoiSchema();
    } else if (req.functionName == 'matchDetails'
      || req.functionName == 'matchDetailsV2') {
      schema = matchValidator.matchDetailsJoiSchema();
    } else {
      let ErrorResponse = { msg: "Invalid Function Name" }
      if (isSocket)
        return socket.emit(event, ErrorResponse)
      return ResError(res, ErrorResponse)
    }
    req.body = await schema.validateAsync(req.body, {
      abortEarly: false
    });
    req.joiData = req.body;
  } catch (error) {
    // Send Error if Validation Failed !!
    let ErrorResponse = { msg: error.details.map(data => data.message).toString() };

    // Log Validation Error
    logger.error(`${LOG_REF_CODE} homeMatchesDetailsMain | Joi Validation Error : `, ErrorResponse);

    if (isSocket)
      return socket.emit(event, ErrorResponse)
    return ResError(res, error)
  }

  // Set Required Data to Req Body
  req.body["user_id"] = req.User.user_id;
  req.body["user_name"] = req.User.user_name;
  req.body["user_type_id"] = req.User.user_type_id;
  req.body["parent_level_ids"] = req.User.parent_level_ids;
  req.body["sports_permission"] = req.User.sports_permission;
  req.body["check_event_limit"] = req.User.check_event_limit;
  req.body["domain_name"] = req.User.domain_name;
  req.body["LOG_REF_CODE"] = LOG_REF_CODE;
  req.body["path"] = req.path;

  // Call the Function Accordingly
  let fetchedData = {};
  if (req.functionName == 'homeMatches') {
    fetchedData = await homeMatches(req.body);
  } else if (req.functionName == 'matchDetails') {
    fetchedData = await matchDetails(req.body);
  } else if (req.functionName == 'homeMatchesV2') {
    fetchedData = await homeMatchesV2(req.body);
  } else if (req.functionName == 'matchDetailsV2') {
    fetchedData = await matchDetailsWrapperV2(req);
  }

  // Log Validation Error
  // logger.info(`${LOG_REF_CODE} homeMatchesDetailsMain | Execution Time: ${getTimeTaken({ startTime })}`);

  if (fetchedData.statusCode === SUCCESS) {
    let SuccessResponse = { data: fetchedData.data };

    if (isSocket)
      return socket.emit(event, SuccessResponse);
    return ResSuccess(res, SuccessResponse);

  } else if (fetchedData.statusCode == NOT_FOUND) {
    let NotfoundResponse = { data: [], msg: fetchedData.data };

    if (isSocket)
      return socket.emit(event, NotfoundResponse);
    return ResError(res, NotfoundResponse);

  } else {
    let ErrorResponse = {
      msg: fetchedData.data == null
        ? 'Error : Sorry, A technical error occurred! Please try again later.'
        : fetchedData.data
    };

    if (isSocket)
      return socket.emit(event, ErrorResponse);
    return ResError(res, { msg: ErrorResponse.msg });

  }
}

// /homematches

async function homeMatchesV2(data) {
  // Capture start time for performance measurement
  const startTime = moment();

  // Generate a unique reference code for logging (optional)
  const LOG_REF_CODE = data?.LOG_REF_CODE;

  // Log function call
  logger.info(`${LOG_REF_CODE} homeMatchesV2 Data: ${JSON.stringify(data)}`);

  try {
    let {
      user_id, user_type_id, sports_permission, parent_level_ids, market_analysis, market_analysis_fields,
      sport_id, series_id, match_id, inplay, my_favorites, combine, only_runners, today, tomorrow, market_ids,
      only_sports
    } = data;

    if (only_runners) {
      // Log function call
      logger.info(`${LOG_REF_CODE} exchangeService.getMarketLiveData Started | market_ids: ${market_ids}`);

      let redisMarket = await exchangeService.getMarketLiveData(market_ids);

      // Log function Res
      logger.info(`${LOG_REF_CODE} exchangeService.getMarketLiveData End | Execution Time: ${getTimeTaken({ startTime })} | Res statusCode: ${redisMarket?.statusCode} Length: ${redisMarket?.data?.length}`);

      if (redisMarket.statusCode == SUCCESS) {
        const result = redisMarket.data.filter(i => i);

        // UnComment when Required !!
        // await BetCountService.getAndAppendBetCount(data.user_name, result);

        return resultResponse(SUCCESS, result);
      } else {
        return resultResponse(SERVER_ERROR, "No odds found in cache!");
      }
    }

    // Fetch Home Match Data from Cache
    const result = await homeMatchesRead();

    // Log function Res
    logger.info(`${LOG_REF_CODE} homeMatchesRead Called | Res statusCode: ${result?.statusCode} Length: ${result?.data?.length}`);

    if (result?.statusCode != SUCCESS) {
      return resultResponse(NOT_FOUND, "No Data Found");
    }

    let matchData = result.data;

    // Create SportPermissionSportId Arr
    // const sportPermissionSportIds = sports_permission.map(data => data.sport_id);

    // Set Start Date and End Date
    const startDate = new Date(), endDate = new Date();
    startDate.setHours(0, 0, 0, 0); endDate.setHours(23, 59, 59, 999);
    const tomorrowDate = new Date();
    if (tomorrow) {
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      tomorrowDate.setHours(0, 0, 0, 0);
      endDate.setDate(endDate.getDate() + 1);
    }

    // Market Analysis
    let marketAnalysisMatchIds = [];
    if (market_analysis) {
      let marketAnalysis = await MarketAnalysis.aggregate(matchServiceQuery.marketAnalysis(user_id));

      // Log function Res
      logger.info(`${LOG_REF_CODE} MarketAnalysis Query | Res Length: ${marketAnalysis.length}`);

      if (marketAnalysis.length) {
        marketAnalysisMatchIds = marketAnalysis.map(data => data._id);
      } else {
        return resultResponse(NOT_FOUND, "No Data Found");
      }
    }

    const userIdsSet = new Set([...parent_level_ids.map(data => data.user_id), user_id.toString()]);

    matchData = matchData.filter(i => {
      const {
        parent_blocked,
        self_blocked,
        sport_id: matchSportId,
        series_id: matchSeriesId,
        match_id: matchId,
        inplay: matchInplay,
        my_favorites: myFavorites,
        match_date: matchDate,
      } = i;

      // Ensure user is not blocked
      const isUserBlocked = parent_blocked.some(item => userIdsSet.has(item)) || self_blocked.some(item => userIdsSet.has(item));

      // Sport filter (with optional sport_id)
      const validSportId = !sport_id
        ? ![LIVE_GAME_SPORT_ID.toString(), DIAMOND_CASINO_SPORT_ID, UNIVERSE_CASINO_SPORT_ID].includes(matchSportId)
        : sport_id == matchSportId;

      // Series, match, inplay filters
      const validSeries = series_id ? matchSeriesId == series_id : true;
      const validMatch = match_id ? matchId == match_id : true;
      const validInplay = inplay ? [...LIVE_SPORTS, ...RACING_SPORTS].includes(matchSportId) && matchInplay == inplay : true;
      const validOnlySports = only_sports ? LIVE_SPORTS.includes(matchSportId) : true;

      // Favorites, market analysis
      const validFavorites = (my_favorites ? myFavorites.includes(user_id) : true);
      const validMarketAnalysis = market_analysis ? marketAnalysisMatchIds.includes(matchId) : true;

      // Date comparisons
      const validToday = today ? compareDates(new Date(matchDate), startDate, endDate) : true;
      const validTomorrow = tomorrow ? compareDates(new Date(matchDate), tomorrowDate, endDate) : true;

      return (
        !isUserBlocked &&
        validSportId &&
        validSeries &&
        validMatch &&
        validInplay &&
        validFavorites &&
        validMarketAnalysis &&
        validToday &&
        validTomorrow &&
        validOnlySports
      );
    });

    if (matchData.length) {

      // Sort by inplay status (true first) and then by match_date (earliest date first)
      matchData = matchData.sort((a, b) => {
        if (a.inplay !== b.inplay) {
          return b.inplay - a.inplay; // Sort inplay: true first
        }
        return new Date(a.match_date) - new Date(b.match_date); // Then sort by date ascending
      });

      matchData = matchData.map(i => {
        const my_favorites = i.my_favorites?.filter(i => i == user_id);
        i.my_favorites = my_favorites;
        i.is_favorites = Boolean(my_favorites.length)
        delete i.self_blocked;
        delete i.parent_blocked;
        return i;
      });

      if (market_analysis && market_analysis_fields) {
        matchData = matchData.map(({ sport_id, sport_name, match_id, match_name, match_date }) => ({ sport_id, sport_name, match_id, match_name, match_date }));
      }

      if (combine) {
        await combineMarketsV2(matchData);
      }

      if (user_type_id != USER_TYPE_SUPER_ADMIN) {
        await BetCountService.getAndAppendBetCount(data.user_name, matchData);
      }

    }

    // Log function Res
    logger.info(`${LOG_REF_CODE} HomeMatchesV2 End | Res: ${matchData.length} | Execution Time: ${getTimeTaken({ startTime })}`);

    return resultResponse(SUCCESS, matchData);
  } catch (error) {
    // Log function Error
    logger.error(`${LOG_REF_CODE} HomeMatchesV2 End | Error: ${error.message} | Execution Time: ${getTimeTaken({ startTime })}`);

    return resultResponse(SERVER_ERROR, error);
  }
}

function compareDates(date, startDate, endDate) {
  let sD = true, eD = true;
  if (startDate)
    sD = startDate <= date;
  if (endDate)
    eD = date <= endDate;
  return (sD && eD);
}

async function homeMatches(data) {
  try {
    if (await apiUrlSettingsService.isRatesFromRedis() && data.only_runners) {
      const { market_ids } = data;
      let redisMarket = await exchangeService.getMarketLiveData(market_ids);
      if (redisMarket.statusCode == SUCCESS) {
        const result = redisMarket.data;

        // UnComment when Required !!
        // await BetCountService.getAndAppendBetCount(data.user_name, result);

        return resultResponse(SUCCESS, result);
      } else
        return resultResponse(SERVER_ERROR, "No odds found in cache!");
    }
    let {
      user_id, user_type_id, sports_permission, parent_level_ids, market_analysis, market_analysis_fields,
      sport_id, series_id, match_id, inplay, my_favorites, combine, only_runners, today, tomorrow
    } = data;
    let FilterQuery = {
      is_active: 1, is_visible: true, is_abandoned: 0, is_result_declared: 0,
      '$and': [
        { sport_id: { '$nin': [LIVE_GAME_SPORT_ID.toString(), DIAMOND_CASINO_SPORT_ID, UNIVERSE_CASINO_SPORT_ID] } },
        { sport_id: { '$in': sports_permission.map(data => data.sport_id) } }
      ],
    };

    if (USER_BLOCK_TYPE == 'DEFAULT') {
      FilterQuery = {
        ...FilterQuery,
        parent_blocked: { '$nin': [...parent_level_ids.map(data => data.user_id), user_id.toString()] },
        self_blocked: { '$nin': [...parent_level_ids.map(data => data.user_id), user_id.toString()] }
      }
    }
    if (![LIVE_GAME_SPORT_ID.toString(), DIAMOND_CASINO_SPORT_ID, UNIVERSE_CASINO_SPORT_ID].includes(sport_id))
      FilterQuery["centralId"] = { "$ne": null };
    if (sport_id) {
      delete FilterQuery["$and"];
      FilterQuery["sport_id"] = sport_id;
    }
    if (series_id)
      FilterQuery["series_id"] = series_id;
    if (match_id)
      FilterQuery["match_id"] = match_id;
    if (inplay)
      FilterQuery["inplay"] = inplay;
    if (my_favorites)
      FilterQuery["my_favorites"] = { '$in': [user_id] };
    if (today) {
      var start = new Date();
      start.setHours(0, 0, 0, 0);
      var end = new Date();
      end.setHours(23, 59, 59, 999);
      FilterQuery["match_date"] = { "$gte": start, "$lt": end };
    }
    if (tomorrow) {
      var todayDate = new Date();
      todayDate.setDate(todayDate.getDate() + 1);
      FilterQuery["match_date"] = { "$gte": todayDate };
    }
    if (market_analysis) {
      let marketAnalysis = await MarketAnalysis.aggregate(matchServiceQuery.marketAnalysis(user_id));
      if (marketAnalysis.length)
        FilterQuery["match_id"] = { "$in": marketAnalysis.map(data => data._id) };
      else
        return resultResponse(NOT_FOUND, "No Data Found");
    }
    let Fields = [
      "-_id", "sport_name", "series_name", "market_name", "market_id", "marketId", "status", "inplay",
      "match_date", "enable_fancy", "sport_id", "series_id", "match_id", "match_tv_url",
      "match_name", "marketIds", "is_lock", "is_active", "my_favorites", "has_tv_url", "has_sc_url",
      "match_scoreboard_url", "market_count", "bookmaker_count", "fancy_count"
    ];
    if (market_analysis)
      if (market_analysis_fields)
        Fields = ["-_id", "sport_id", "sport_name", "match_id", "match_name", "match_date"];
    if (user_type_id == USER_TYPE_SUPER_ADMIN) {
      delete FilterQuery["is_active"];
      Fields.push("bet_count");
    }

    if (only_runners) {
      Fields = ["-_id", "match_id", "market_id", "marketId", "runners.ex"];
    }

    if (combine) {
      Fields.push(...["runners.selection_name", "runners.selection_id", "runners.selectionId", "runners.status", "runners.ex"]);
    }

    let result = await Match.find(FilterQuery)
      .select(Fields)
      .sort({ inplay: -1, match_date: -1 });

    if (result.length) {

      if (combine) {
        await combineMarkets(result);
      }

      if (user_type_id != USER_TYPE_SUPER_ADMIN) {
        await BetCountService.getAndAppendBetCount(data.user_name, result);
      }

      return resultResponse(SUCCESS, result);

    } else {
      return resultResponse(NOT_FOUND, "No Data Found");
    }

  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

// /homeMatchesOpen
async function homeMatchesOpen(data) {
  let FilterQuery = {
    is_active: 1, is_visible: true, is_abandoned: 0, is_result_declared: 0,
    $or: [
      { centralId: { '$ne': null }, },
      { sport_id: [DIAMOND_CASINO_SPORT_ID, UNIVERSE_CASINO_SPORT_ID, LIVE_GAME_SPORT_ID.toString()] }
    ]
  }, Fields = [
    "-_id", "sport_id", "sport_name", "series_id", "series_name", "match_id", "match_name", "market_name", "market_id", "marketId", "marketIds",
    "status", "inplay", "match_date", "has_tv_url", "is_active", "is_lock", "has_sc_url",
    "enable_fancy", "market_count", "bookmaker_count", "fancy_count", "runners.ex", "runners.selection_name", "runners.selectionId", "runners.selection_id", "runners.status",
    "parent_blocked", "self_blocked", 'my_favorites', 'match_scoreboard_url', 'match_tv_url',
    'bet_count'
  ], Sort = { inplay: -1, match_date: -1 }
    , { sport_id, series_id, inplay, today, tomorrow, matchesList, matchesListForFancy, matches } = data;
  if (sport_id)
    FilterQuery["sport_id"] = sport_id;
  if (series_id)
    FilterQuery["series_id"] = series_id;
  if (inplay)
    FilterQuery["inplay"] = inplay;
  if (today) {
    var start = new Date();
    start.setHours(0, 0, 0, 0);
    var end = new Date();
    end.setHours(23, 59, 59, 999);
    FilterQuery["match_date"] = { "$gte": start, "$lt": end };
  }
  if (tomorrow) {
    var todayDate = new Date();
    todayDate.setDate(todayDate.getDate() + 1);
    FilterQuery["match_date"] = { "$gte": todayDate };
  }
  if (matchesListForFancy) {
    FilterQuery["enable_fancy"] = 1;
    FilterQuery["sport_id"] = "4";
  }
  if (matchesList || matches)
    Fields = ["-_id", "match_id", "match_name"];
  if (matchesListForFancy)
    Fields = ["-_id", "match_id", "market_id"];
  if (matches)
    Sort = "match_date match_name";
  return Match.find(FilterQuery).select(Fields).sort(Sort).lean()
    .then(result => {
      if (result.length)
        return resultResponse(SUCCESS, result);
      else
        return resultResponse(NOT_FOUND, []);
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

async function homeMatchesOpenV2(data) {
  // Capture start time for performance measurement
  const startTime = moment();

  // Generate a unique reference code for logging (optional)
  const LOG_REF_CODE = uuidv4();

  // Log function call
  logger.info(`${LOG_REF_CODE} homeMatchesOpenV2 Data: ${JSON.stringify(data)}`);

  try {

    const result = await homeMatchesRead();

    if (result?.statusCode != SUCCESS)
      return resultResponse(NOT_FOUND, "No Data Found");

    let { sport_id, series_id, inplay, today, tomorrow, only_sports } = data;

    let matchData = result.data;

    // Set Start Date and End Date
    const startDate = new Date(), endDate = new Date();
    startDate.setHours(0, 0, 0, 0); endDate.setHours(23, 59, 59, 999);
    const tomorrowDate = new Date();
    if (tomorrow) {
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      tomorrowDate.setHours(0, 0, 0, 0);
      endDate.setDate(endDate.getDate() + 1);
    }

    matchData = matchData.filter(i => {
      const {
        sport_id: matchSportId,
        series_id: matchSeriesId,
        inplay: matchInplay,
        match_date: matchDate,
      } = i;

      // Sport filter (with optional sport_id)
      const validSportId = !sport_id
        ? ![LIVE_GAME_SPORT_ID.toString(), DIAMOND_CASINO_SPORT_ID, UNIVERSE_CASINO_SPORT_ID].includes(matchSportId)
        : sport_id == matchSportId;

      // Series, inplay filters
      const validSeries = series_id ? matchSeriesId == series_id : true;
      const validInplay = inplay ? [...LIVE_SPORTS, ...RACING_SPORTS].includes(matchSportId) && matchInplay == inplay : true;
      const validOnlySports = only_sports ? LIVE_SPORTS.includes(matchSportId) : true;

      // Date comparisons
      const validToday = today ? compareDates(new Date(matchDate), startDate, endDate) : true;
      const validTomorrow = tomorrow ? compareDates(new Date(matchDate), tomorrowDate, endDate) : true;

      return (
        validSportId &&
        validSeries &&
        validInplay &&
        validToday &&
        validTomorrow &&
        validOnlySports
      );
    });

    // Delete Unnecessary fields from response !!
    matchData = matchData.map(i => {
      delete i.self_blocked;
      delete i.parent_blocked;
      delete i.my_favorites
      delete i.bet_count
      delete i.match_scoreboard_url
      delete i.match_tv_url
      delete i.status
      delete i.is_lock
      return i;
    });

    // Log function call
    logger.info(`${LOG_REF_CODE} homeMatchesOpenV2 Res Length: ${matchData.length} | Execution Time: ${getTimeTaken({ startTime })}`);

    return resultResponse(SUCCESS, matchData);
  } catch (error) {
    // Log function Error
    logger.error(`${LOG_REF_CODE} homeMatchesOpenV2 Error: ${error.message} | Execution Time: ${getTimeTaken({ startTime })}`);

    return resultResponse(SERVER_ERROR, error);
  }
}

async function getMarketFromCache(marketIds, group) {
  let marketResult = await exchangeService.getOddsByMarketIds(marketIds, group);
  if (marketResult.statusCode == SUCCESS)
    return resultResponse(SUCCESS, marketResult.data);
  else
    return resultResponse(NOT_FOUND, "No odds found in cache!");
}
async function getMarketFromCacheV2(marketIds) {
  let marketResult = await exchangeService.getOddsByMarketIdsV2(marketIds);
  if (marketResult.statusCode == SUCCESS)
    return resultResponse(SUCCESS, marketResult.data);
  else
    return resultResponse(NOT_FOUND, "No odds found in cache!");
}

async function combineMarkets(result, user_event_limit = undefined, domain_name = undefined) {
  for (const market of result) {

    if (user_event_limit != undefined) {
      if (user_event_limit == false) { // if user limit is enabled.

        market.market_live_odds_validation = false; // Market setting is disabling.
        market.user_setting_limit = true;
      } else {
        let getWebsiteSettings = await websiteService.getWebsiteSettingsFromCache({
          domain_name,
        });
        let diamond_rate_limit_enabled = false;
        if (getWebsiteSettings.statusCode == SUCCESS) {
          diamond_rate_limit_enabled =
            getWebsiteSettings.data.diamond_rate_limit_enabled;
        }
        market.user_setting_limit = false; //  user limit is disabled

        if (diamond_rate_limit_enabled) {
          if (market?.market_live_odds_validation == true) {
            if (market?.live_market_max_stack != undefined) {
              market.market_max_stack = market.live_market_max_stack;
            }

            if (market?.live_market_min_stack != undefined) {
              market.market_min_stack = market.live_market_min_stack;
            }
          }
        }
        delete market.live_market_max_stack;
        delete market.live_market_min_stack;
      }
    }

    let marketsFromCache = await getMarketFromCache("ODDS_" + market.market_id);
    if (marketsFromCache.statusCode == SUCCESS) {
      marketsFromCache = marketsFromCache.data[0];
      const { runners } = marketsFromCache;
      market.status = marketsFromCache.status; market.inplay = marketsFromCache.inplay;
      for (const runner of market.runners) {
        let cacheRunner = runners.find(data => data.selectionId == runner.selectionId);
        if (cacheRunner) {
          const { status, ex } = cacheRunner;
          runner.status = status; runner.ex = ex;
        }
      }
    } else {
      const { status, inplay, runners } = getDefaultMarketFields();
      market.status = status; market.inplay = inplay;
      for (const runner of market.runners) {
        runner.status = status; runner.ex = runners.ex;
      }
    }
  }
}

async function combineMarketsV2(result) {
  const keys = result.map(market => "ODDS_" + market.market_id);

  let oddsData = [];
  if (keys?.length) {
    oddsData = await getMarketFromCacheV2(keys)
    oddsData = oddsData.data;
    if (!oddsData?.length)
      oddsData = keys.map(i => null);
  } else {
    oddsData = keys.map(i => null);
  }

  for (let i = 0; i < keys.length; i++) {
    const market = result[i];
    const oddsItem = oddsData[i];

    if (oddsItem) {
      const { runners } = oddsItem;
      market.status = oddsItem.status;
      market.inplay = oddsItem.inplay;
      for (const runner of market.runners) {
        let cacheRunner = runners.find(data => data.selectionId == runner.selectionId);
        if (cacheRunner) {
          const { status, ex } = cacheRunner;
          runner.status = status; runner.ex = ex;
        }
      }
    } else {
      const { status, inplay, runners } = getDefaultMarketFields();
      market.status = status; market.inplay = inplay;
      for (const runner of market.runners) {
        runner.status = status; runner.ex = runners.ex;
      }
    }
  }
}

// /matchDetails
async function matchDetails(data) {
  try {
    let { only_runners, group, combine, marketIds, check_event_limit, domain_name } = data;
    if (only_runners && await apiUrlSettingsService.isRatesFromRedis())
      if (marketIds)
        if (marketIds.length)
          return await getMarketFromCache(marketIds, group);
    let { match_id, market_id, user_id, user_type_id, sports_permission, parent_level_ids, book_button } = data,
      match_ids = match_id.split(",");
    let FilterQuery = {
      is_active: 1, is_visible: true, is_abandoned: 0, is_result_declared: 0, centralId: { "$ne": null },
      '$and': [
        { sport_id: { '$nin': [LIVE_GAME_SPORT_ID.toString(), DIAMOND_CASINO_SPORT_ID, UNIVERSE_CASINO_SPORT_ID] } },
        { sport_id: { '$in': sports_permission.map(data => data.sport_id) } }
      ],
    };

    if (USER_BLOCK_TYPE == 'DEFAULT') {
      FilterQuery = {
        ...FilterQuery,
        parent_blocked: { '$nin': [...parent_level_ids.map(data => data.user_id), user_id.toString()] },
        self_blocked: { '$nin': [...parent_level_ids.map(data => data.user_id), user_id.toString()] }
      }
    }
    FilterQuery["match_id"] = { "$in": match_ids };
    if (market_id)
      FilterQuery["market_id"] = market_id;
    const FilterRunners = {
      "runners.sort_priority": 1, "runners.sort_name": 1, "runners.name": 1,
      "runners.selectionId": 1, "runners.status": 1, "runners.ex": 1, "runners.win_loss": 1
    }
    let Fields = {
      _id: 0,
      sport_id: 1, match_id: 1, match_name: 1, market_id: 1, name: 1, market_name: 1, status: 1, inplay: 1, match_date: 1, enable_fancy: 1,
      is_lock: 1, is_active: 1, bet_count: 1, news: 1, market_type: 1, match_tv_url: 1, has_tv_url: 1,
      totalMatched: 1, matched: 1, market_min_stack: 1, market_max_stack: 1,
      live_market_min_stack: 1, live_market_max_stack: 1, market_live_odds_validation: 1,
      "runners.name": 1, "runners.selection_name": 1, "runners.selectionId": 1, "runners.win_loss": 1, "runners.metadata": 1
    };
    if (only_runners)
      Fields = ["-_id", "match_id", "market_id", ...Object.keys(FilterRunners)];
    if (book_button)
      Fields = ["-_id", "market_id", "market_name"];
    if (user_type_id == USER_TYPE_SUPER_ADMIN)
      delete FilterQuery["is_active"];
    let result = await Market.find(FilterQuery, Fields).sort({ market_order: 1 }).lean();
    if (result.length) {
      if (combine)
        await combineMarkets(result, check_event_limit, domain_name);
      if (group) {
        result = result.reduce((acc, obj) => {
          const { match_id } = obj;
          acc[match_id] = [...acc[match_id] || [], obj];
          return acc;
        }, {});
      }
      return resultResponse(SUCCESS, result);
    }
    else
      return resultResponse(NOT_FOUND, "No markets found.");
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function matchDetailsWrapperV2(req) {
  try {
    const { combine_fancy, category_wise_fancy } = req.body;

    const tasks = [];

    // By Details gets Data from Match Details V2
    tasks.push(matchDetailsV2(req.body));

    if (combine_fancy) {
      // Get Fany Data if combine fancy is true
      tasks.push(getFanciesV2(req))
    }

    const response = await Promise.all(tasks);

    if (!response.length) {
      return resultResponse(SERVER_ERROR, "Something Went Worng !!");
    }

    if (response.length == 1) {
      return response[0];
    } else if (response.length == 2) {

      const [matchDetailsRes, fancyRes] = response;
      if (matchDetailsRes.statusCode != SUCCESS) {
        // check Match Details V2 Response
        return resultResponse(matchDetailsRes.statusCode, matchDetailsRes.data);
      } else if (fancyRes.statusCode != SUCCESS) {
        // Check Fancy Response
        return resultResponse(fancyRes.statusCode, fancyRes.data);
      } else {
        return resultResponse(SUCCESS, {
          markets: matchDetailsRes.data,
          fancies: fancyRes.data,
        });
      }
    }

  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function matchDetailsV2(data) {
  try {
    let {
      marketIds,
      match_id,
      market_id,
      path,
    } = data;

    if (typeof marketIds == "string") {
      marketIds = marketIds.split(",");
    }

    const isOpen = (path.includes('/matchDetailsOpen'));

    let {
      only_runners,
      group,
      combine,
      book_button,
    } = data;

    // User Related Data
    let {
      user_id,
      user_type_id,
      sports_permission,
      parent_level_ids,
      check_event_limit,
      user_name,
      domain_name,
    } = data;


    const match_ids = match_id.split(",");

    const startTime = moment();

    const market_keys = [];

    const market_ids_extracted = marketIds ? marketIds.map(i => {
      const market_id = i.replace("ODDS_", "");
      return market_id;
    }) : [];

    for (const match_id of match_ids) {
      let temp_market_keys = []
      if (market_ids_extracted.length) {
        for (const market_id of market_ids_extracted) {
          const pattern = `${MARKET_KEY}${match_id}:${market_id}:*${UNIQUE_IDENTIFIER_KEY}`;
          const keys = await redisClient.keys(pattern);
          temp_market_keys.push(...keys);
        }
      } else {
        const market_pattern = `${MARKET_KEY}${match_id}:*${UNIQUE_IDENTIFIER_KEY}`;
        temp_market_keys = await redisClient.keys(market_pattern);
      }
      market_keys.push(...temp_market_keys);
    }

    if (!market_keys.length) {
      return resultResponse(VALIDATION_ERROR, "No Data In Redis !");
    }

    let market_redis_data = await redisClient.mget(...market_keys);

    market_redis_data = market_redis_data.map((i) => JSON.parse(i));

    const sportPermissionSportIds = isOpen ? [] : sports_permission.map(
      (data) => data.sport_id,
    );
    const userIdsSet = new Set(isOpen ? [] : [
      ...parent_level_ids.map((data) => data.user_id),
      user_id.toString(),
    ]);
    const isSuperAdmin = isOpen ? false : user_type_id == USER_TYPE_SUPER_ADMIN;

    market_redis_data = market_redis_data
      .filter((i) => {
        if (!i) return false;

        const {
          sport_id: marketSportId,
          is_active,
          is_visible,
          is_abandoned,
          is_result_declared,
          centralId,
        } = i;

        let parent_blocked = i.parent_blocked ?? [];
        let self_blocked = i.self_blocked ?? [];

        // Ensure user is not blocked
        const isUserBlocked = isOpen
          ? false
          : (USER_BLOCK_TYPE == 'DEFAULT')
            ? (parent_blocked.some((item) => userIdsSet.has(item)) || self_blocked.some((item) => userIdsSet.has(item)))
            : false;

        // Check Is Active
        const checkIsActive = isSuperAdmin ? true : is_active == 1;

        // Check Is Visivle
        const checkIsVisible = is_visible == true;

        // Check Is Abandoned
        const checkIsAbandoned = is_abandoned == 0;

        // Check Is Resut Declared
        const checkIsResultDeclared = is_result_declared == 0;

        // Check Is Central Id Not NULL
        const checkIsCentralId = centralId != null;

        // Check If not a Casino Sport Id
        const checkIfSportPermissionAllowed = isOpen ? true :
          sportPermissionSportIds.includes(marketSportId);

        // Check If Market Id should be Filtered
        const marketIdFilter = market_id ? i.market_id == market_id : true;

        return (
          checkIsActive &&
          checkIsVisible &&
          checkIsAbandoned &&
          checkIsResultDeclared &&
          checkIsCentralId &&
          checkIfSportPermissionAllowed &&
          !isUserBlocked &&
          marketIdFilter
        );
      })
      .sort((a, b) => a.market_order - b.market_order);

    let Fields = [
      "match_id",
      "market_id",
      "name",
      "market_name",
      "status",
      "inplay",
      "match_date",
      "enable_fancy",
      "is_lock",
      "news",
      "market_type",
      "match_tv_url",
      "matched",
      "market_min_stack",
      "market_max_stack",
      "has_tv_url",
      "live_market_min_stack",
      "live_market_max_stack",

      ...(isOpen ? [] : [

        "is_active",
        "bet_count",
        "totalMatched",
        "market_live_odds_validation",

        // Event Limit Fields
        "sport_id",
        "sport_name",
        "series_id",
        "series_name",
        "match_name",
        "market_min_odds_rate",
        "market_max_odds_rate",
        "market_back_rate_range",
        "market_lay_rate_range",
        "market_bookmaker_min_odds_rate",
        "market_bookmaker_max_odds_rate",
        "market_max_profit",
        "market_advance_bet_stake",
        "unmatch_bet_allowed",
        "no_of_unmatch_bet_allowed",
        "volume_stake_enable",
        "min_volume_limit",
        "betting_will_start_time",
        "is_back_bet_allowed",
        "is_lay_bet_allowed",
        "inplay_max_volume_stake_0_10",
        "inplay_max_volume_stake_10_40",
        "inplay_max_volume_stake_40",
        "max_volume_stake_0_10",
        "max_volume_stake_10_40",
        "max_volume_stake_40",
        "inplay_betting_allowed",
      ])
    ];

    let runnerFields = [
      "name",
      "selection_name",
      "selectionId",
      "win_loss",
      "metadata",

      ...(isOpen ? ['status', 'ex'] : [])
    ];

    if (only_runners) {
      Fields = [
        "match_id",
        "market_id",
        "status",
        "totalMatched",
        "updateTime",
        "inplay",
        "marketId",
        "max",
        "min",
        "news",
      ];
      runnerFields = [
        "sort_priority",
        "sort_name",
        "name",
        "selectionId",
        "status",
        "ex",
        "win_loss",
        "adjustmentFactor",
        "handicap",
        "lastPriceTraded",
        "totalMatched",
      ];
    } else if (book_button) {
      Fields = ["match_id", "market_id", "market_name"];
      runnerFields = null;
    } else if (combine) {
      Fields = [...Fields];
      runnerFields = [...runnerFields, "ex", "status"];
    }

    let getWebsiteSettings;

    if (!isOpen && combine) {
      getWebsiteSettings = await websiteService.getWebsiteSettingsFromCache({
        domain_name,
      });
    }
    market_redis_data = market_redis_data.map((market) => {
      let data = {};

      Fields.map((key) => {
        data[key] = market[key];
      });

      if (!isOpen && combine) {
        // if user limit is enabled.
        if (!check_event_limit) {
          // Market setting is disabling.
          data.market_live_odds_validation = false;
          data.user_setting_limit = true;
        } else {
          let diamond_rate_limit_enabled = false;
          if (getWebsiteSettings?.statusCode == SUCCESS) {
            diamond_rate_limit_enabled =
              getWebsiteSettings.data.diamond_rate_limit_enabled;
          }
          //  user limit is disabled
          data.user_setting_limit = false;
          if (diamond_rate_limit_enabled) {
            if (market?.market_live_odds_validation) {
              if (market?.live_market_max_stack) {
                data.market_max_stack = market.live_market_max_stack;
              }
              if (market?.live_market_min_stack) {
                data.market_min_stack = market.live_market_min_stack;
              }
            }
          }
        }
      }

      if (runnerFields) {
        data.runners = [];
        const runnerName = isOpen ? 'dbRunners' : 'runners';
        market[runnerName].map((runner) => {
          let runnerData = {};
          runnerFields.map((key) => {
            runnerData[key] = runner[key];
          });
          data.runners.push(runnerData);
        });
      }

      return data;
    });

    if (group) {
      market_redis_data = market_redis_data.reduce((acc, obj) => {
        const { match_id } = obj;
        acc[match_id] = [...(acc[match_id] || []), obj];
        return acc;
      }, {});
    }

    if (!isOpen) {
      await BetCountService.getAndAppendBetCount(user_name, market_redis_data, 'MARKET');
    }

    return resultResponse(SUCCESS, market_redis_data);
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}


// /matchDetailsOpen
async function matchDetailsOpen(data) {
  const FilterQuery = {
    is_active: 1, is_visible: true, is_abandoned: 0, is_result_declared: 0, centralId: { "$ne": null },
  }, Fields = {
    _id: 0,
    sport_id: 1, match_id: 1, match_name: 1, market_id: 1, market_name: 1, status: 1, match_date: 1, market_min_stack: 1, market_max_stack: 1, matched: 1,
    name: 1, market_type: 1, inplay: 1, enable_fancy: 1, is_lock: 1, match_tv_url: 1, has_tv_url: 1,
    "runners.selection_name": 1, "runners.selectionId": 1, "runners.status": 1, "runners.ex": 1, "runners.win_loss": 1, "runners.metadata": 1,
    "runners.name": 1,
  }, { match_id, market_id, marketIds } = data;
  if (match_id)
    FilterQuery["match_id"] = match_id;
  if (market_id)
    FilterQuery["market_id"] = market_id;
  if (marketIds && marketIds.length)
    FilterQuery["market_id"] = { $in: marketIds };
  return Market.find(FilterQuery, Fields).sort({ market_order: 1 }).lean()
    .then(result => {
      if (result.length)
        return resultResponse(SUCCESS, result);
      else
        return resultResponse(NOT_FOUND, []);
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

async function matchesListForFancy() {
  try {
    var today = new Date();
    today.setDate(today.getDate() - 5);
    let responseFromDB = await getMatchesDetails({
      is_result_declared: 0, sport_id: "4", enable_fancy: 1, is_abandoned: 0,
      match_date: { "$gte": today }
    }, { _id: 0, match_id: 1, market_id: 1 });
    if (responseFromDB.statusCode == SUCCESS)
      return resultResponse(SUCCESS, responseFromDB.data);
    else
      return resultResponse(NOT_FOUND, []);
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function getMatchesDetails(FilterQuery = {}, Projection = {}, findOne = false) {
  try {
    let matchDetails;
    if (findOne)
      matchDetails = await Match.findOne(FilterQuery, Projection).lean();
    else
      matchDetails = await Match.find(FilterQuery, Projection).lean();
    if (matchDetails)
      return resultResponse(SUCCESS, JSON.parse(JSON.stringify(matchDetails)));
    else
      return resultResponse(NOT_FOUND, DATA_NULL);
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
};

async function getMatchDetails(FilterQuery = {}, Projection = {}) {
  return await getMatchesDetails(FilterQuery, Projection, true);
}

let getSelectionByMatchId = async (FilterQuery, Projection) => {
  try {
    let selections = await Market.findOne(FilterQuery, Projection);
    if (selections)
      return resultResponse(SUCCESS, selections);
    else
      return resultResponse(NOT_FOUND, DATA_NULL);
  } catch (error) {
    return resultResponse(SERVER_ERROR, DATA_NULL);
  }
};

let isMatchIsActive = async (match_id) => {
  try {
    let resFromDB = await Match.findOne({ match_id: match_id }, { series_id: 1, is_active: 1 }).lean();
    if (resFromDB)
      return resultResponse(SUCCESS, resFromDB.is_active);
    else
      return resultResponse(NOT_FOUND);
  } catch (error) {
    return resultResponse(SERVER_ERROR, DATA_NULL);
  }
};

async function updateTVandScoreBoardURLs(provider) {
  var today = new Date();
  today.setDate(today.getDate() - 3);
  let matches = await Match.find({
    is_active: 1, is_visible: true, is_abandoned: 0, is_result_declared: 0,
    centralId: { "$ne": null }, sport_id: { $nin: [LIVE_GAME_SPORT_ID.toString(), DIAMOND_CASINO_SPORT_ID, UNIVERSE_CASINO_SPORT_ID] },
    match_date: { "$gte": today }
  }).or([{ match_scoreboard_url: null }, { match_tv_url: null }]).select("_id match_id name sport_id");
  for (const match of matches) {
    try {
      if (match.sport_id == "4")
        SCOREBOARD = { url: SCOREBOARD_FRNK_2_URL, type: SCOREBOARD_FRNK_2 }
      else if (["1", "2"].includes(match.sport_id))
        SCOREBOARD = { url: SCOREBOARD_FRNK_3_URL, type: SCOREBOARD_FRNK_3 }
      else
        SCOREBOARD = SCOREBOARD;
      // Getting TV url
      let getTV = await getTvUrl(TV_DEFAULT, match.match_id)
        // Getting ScoreBoard url
        , getScoreboard = await getScoreboardUrl(SCOREBOARD, match.match_id)
        , streamData = {};
      if (getTV.statusCode == SUCCESS) {
        if (TV_DEFAULT.type == TV_FRNK_1) {
          if (getTV.data.data.url)
            streamData["tvUrl"] = getTV.data.data.url;
        } else if (TV_DEFAULT.type == TV_FRNK_3) {
          if (getTV.data.data.livetv)
            streamData["tvUrl"] = getTV.data.data.livetv;
        } else if ([TV_FRNK_4, TV_FRNK_5, TV_FRNK_6, TV_FRNK_7].includes(TV_DEFAULT.type)) {
          if (getTV.data.data.url)
            streamData["tvUrl"] = getTV.data.data.url;
        }
        if (streamData.tvUrl)
          match.match_tv_url = streamData.tvUrl;
      }
      if (getScoreboard.statusCode == SUCCESS) {
        if ([SCOREBOARD_FRNK_1, SCOREBOARD_FRNK_2, SCOREBOARD_FRNK_3].includes(SCOREBOARD_DEFAULT.type))
          if (getScoreboard.data.data.data.score)
            streamData["scoreUrl"] = getScoreboard.data.data.data.score;
        if (streamData.scoreUrl)
          match.match_scoreboard_url = streamData.scoreUrl;
      }
      if (streamData.tvUrl || streamData.scoreUrl)
        match.save();
    } catch (error) {
      // console.error(error);
    }
  }
}

async function updateTVandScoreBoardURL(provider) {
  var today = new Date();
  today.setDate(today.getDate() - 3);
  let matches = await Match.find({
    is_active: 1, is_visible: true, is_abandoned: 0, is_result_declared: 0,
    centralId: { "$ne": null }, sport_id: { $nin: [LIVE_GAME_SPORT_ID.toString(), DIAMOND_CASINO_SPORT_ID, UNIVERSE_CASINO_SPORT_ID, HR, GHR] },
    match_date: { "$gte": today }
  }).or([{ match_scoreboard_url: null }, { match_tv_url: null }]).select("_id match_id name sport_id");
  if (matches.length) {
    try {
      let getEventsData = await getEventsAPIData();
      if (getEventsData.statusCode == SUCCESS) {
        getEventsData = getEventsData?.data?.data?.data?.getMatches;
        if (getEventsData)
          if (getEventsData.length) {
            getEventsData = getEventsData.map(item => ({
              'updateOne': {
                'filter': { match_id: item.MatchID },
                'update': { match_tv_url: TV_DEFAULT.url + item.Channel, has_tv_url: true }
              }
            }));
            await Match.bulkWrite(getEventsData, { ordered: false });
          }
      }
    } catch (error) {
      console.error(error);
    }
    try {
      for (const match of matches) {
        if (match.sport_id == "4")
          SCOREBOARD = { url: SCOREBOARD_FRNK_2_URL, type: SCOREBOARD_FRNK_2 }
        else if (["1", "2"].includes(match.sport_id))
          SCOREBOARD = { url: SCOREBOARD_FRNK_3_URL, type: SCOREBOARD_FRNK_3 }
        else
          SCOREBOARD = SCOREBOARD;
        // Getting ScoreBoard url
        let getScoreboard = await getScoreboardUrl(SCOREBOARD, match.match_id)
          , streamData = {};
        if (getScoreboard.statusCode == SUCCESS) {
          if ([SCOREBOARD_FRNK_1, SCOREBOARD_FRNK_2, SCOREBOARD_FRNK_3].includes(SCOREBOARD_DEFAULT.type))
            if (getScoreboard.data.data.data.score)
              streamData["scoreUrl"] = getScoreboard.data.data.data.score;
          if (streamData.scoreUrl)
            match.match_scoreboard_url = streamData.scoreUrl;
        }
        if (streamData.scoreUrl)
          match.save();
      }
    } catch (error) {
      console.error(error);
    }
  }
}

async function updateTVandScoreBoardURLV1(provider) {
  try {
    var today = new Date();
    today.setDate(today.getDate() - 3);
    let matches = await Match.find({
      is_active: 1, is_visible: true, is_abandoned: 0, is_result_declared: 0,
      centralId: { "$ne": null }, sport_id: { $nin: [LIVE_GAME_SPORT_ID.toString(), DIAMOND_CASINO_SPORT_ID, UNIVERSE_CASINO_SPORT_ID, HR, GHR] },
      match_date: { "$gte": today },
      $or: [
        { has_tv_url: false },
        { has_sc_url: false },
        { has_sc_url: { $exists: false } }
      ]
    }).select("_id match_id name sport_id match_date");
    if (matches.length) {
      let getEventsData = await getEventsAPIData();

      if (getEventsData.statusCode == SUCCESS) {
        getEventsData = getEventsData?.data?.data?.data?.getMatches;

        if (getEventsData && getEventsData.length) {

          let webData = await websiteSetting.find({ is_tv_url_premium: 1 }, { domain_name: 1, is_tv_url_premium: 1 }).lean().exec();
          let domainNameArray = [];
          if (webData.length) {
            const domainNames = webData.map(item => item.domain_name);
            domainNameArray = domainNames;
          }

          const addDaysToDate = (dateStr, days) => {
            let date = new Date(dateStr);
            date.setDate(date.getDate() + days);
            return date.toISOString();
          };

          getEventsData = await Promise.all(
            getEventsData.map(async (item) => {
              const match = matches.find(
                ({ match_id, name }) =>
                  match_id == item.MatchID || name.toLowerCase() == item.Name.toLowerCase()
              );

              if (!match) return null;

              const { match_id, match_date } = match;
              const updatedDateStr = addDaysToDate(match_date, 7);
              const hasChannel = Boolean(item.Channel?.trim());

              if (hasChannel) {
                await Match.updateOne({ match_id }, { $set: { has_tv_url: true } });
              }

              return {
                updateOne: {
                  filter: { match_id },
                  update: {
                    premimum_match_tv_url: hasChannel ? TV_DEFAULT.url + item.Channel : "",
                    domains: domainNameArray,
                    expireAt: updatedDateStr,
                  },
                  upsert: true,
                },
              };
            })
          );

          // Remove null values before processing
          getEventsData = getEventsData.filter(Boolean);

          // Perform bulkWrite operation
          try {
            const bulkWriteResult = await tvAndScoreboardUrlSetting.bulkWrite(getEventsData, { ordered: false });
          } catch (error) {
            console.error("Error occurred during bulkWrite:", error);
          }
        }
      }

      const addDaysToDate = (dateStr, days) => {
        let date = new Date(dateStr);
        date.setDate(date.getDate() + days);
        return date.toISOString();
      };

      for (const match of matches) {
        const expireAt = addDaysToDate(match.match_date, 7);
        let SCOREBOARD;

        switch (match.sport_id) {
          case "4":
            SCOREBOARD = { url: SCOREBOARD_FRNK_2_URL, type: SCOREBOARD_FRNK_2 };
            break;
          case "1":
          case "2":
            SCOREBOARD = { url: SCOREBOARD_FRNK_3_URL, type: SCOREBOARD_FRNK_3 };
            break;
        }

        const getScoreboard = await getScoreboardUrl(SCOREBOARD, match.match_id);
        if (getScoreboard.statusCode !== SUCCESS) continue;

        const isValidScoreboard = [SCOREBOARD_FRNK_1, SCOREBOARD_FRNK_2, SCOREBOARD_FRNK_3].includes(SCOREBOARD_DEFAULT.type);
        const scoreUrl = isValidScoreboard ? getScoreboard?.data?.data?.data?.score : null;

        if (scoreUrl) {
          await Promise.all([
            tvAndScoreboardUrlSetting.updateOne(
              { match_id: match.match_id },
              {
                $set: {
                  match_scoreboard_url: scoreUrl,
                  non_premimum_match_tv_url: TV_DEFAULT.non_premium_url + match.match_id,
                  expireAt,
                },
              },
              { upsert: true }
            ),
            Match.updateOne({ match_id: match.match_id }, { $set: { has_sc_url: true } })
          ]);
        }
      }
    }
  } catch (error) {
    console.error(error);
  }
}

async function getEventsAPIData() {
  config = {
    method: 'get',
    url: TV_EVENTS_FETCH_API,
  };
  return await sendRequest(config);
}

async function updateTVForHrAndGHrURL(provider) {

  let markets = await Market.find({
    is_active: 1, is_visible: true, is_abandoned: 0, is_result_declared: 0, market_id: { $regex: ".+(?<!_m)$" },
    centralId: { "$ne": null }, sport_id: { $in: [HR, GHR] }, match_tv_url: null
  }).select("-_id name market_id");

  if (markets.length) {

    let getEventsData = await getHrAndGHrAPIData();

    try {

      if (getEventsData.statusCode == SUCCESS) {

        getEventsData = getEventsData?.data?.data;

        if (getEventsData) {

          if (Array.isArray(getEventsData)) {

            if (getEventsData.length) {

              getEventsData = getEventsData.map(item => ({
                'updateOne': {
                  'filter': { market_id: item.MatchID },
                  'update': { match_tv_url: TV_DEFAULT.url + item.Channel, has_tv_url: true }
                }
              }));

              await Market.bulkWrite(getEventsData, { ordered: false });

            }

          }

        }

      }

    } catch (error) {
      console.error(error);
    }

  }

}

async function getHrAndGHrAPIData() {
  config = {
    method: 'get',
    url: TV_EVENTS_FETCH_API_FOR_HRGHR,
    timeout: 1000,
  };
  return await sendRequest(config);
}


async function getScoreboardUrl(config, match_id) {
  config = {
    method: 'post',
    url: config.url,
    timeout: 1000,
    ...config
  };
  if (config.type == SCOREBOARD_FRNK_1) {
    config['method'] = 'get';
    config["url"] = config["url"] + match_id;
  } else if ([SCOREBOARD_FRNK_2, SCOREBOARD_FRNK_3].includes(config.type))
    return resultResponse(SUCCESS, { data: { data: { score: config.url + match_id } } });
  else if (config.type == SCOREBOARD_XCENTRAL_1) {
    config["data"] = {
      "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhZ2VudGlkIjoia2NjZW50cmFsMl9pbiIsImRhdGV0aW1lIjoxNjY0ODYxNTM0NzUzLCJpYXQiOjE2NjQ4NjE1MzR9.9g8YMI6IEIgSc65iHBKupqPoxQeNc_GRw3cB1bmYPQw",
      match_id
    }
  }
  return await sendRequest(config);
}

async function getTvUrl(config, match_id) {
  config = {
    method: 'post',
    url: config.url,
    timeout: 1000,
    ...config
  };
  if (config.type == TV_FRNK_1) {
    config["data"] = {
      token: FRNK_SECRETKEY,
      eventId: match_id
    }
  } else if (config.type == TV_FRNK_2) {
    config["url"] = config["url"] + match_id;
  } else if (config.type == TV_FRNK_3) {
    config["url"] = config["url"] + match_id;
    config["method"] = 'get';
  } else if ([TV_FRNK_4, TV_FRNK_5, TV_FRNK_6, TV_FRNK_7].includes(config.type))
    return resultResponse(SUCCESS, { data: { url: config.url + match_id } });
  else if (config.type == TV_XCENTRAL_1) {
    config["data"] = {
      "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhZ2VudGlkIjoia2NjZW50cmFsMl9pbiIsImRhdGV0aW1lIjoxNjY0ODYxNTM0NzUzLCJpYXQiOjE2NjQ4NjE1MzR9.9g8YMI6IEIgSc65iHBKupqPoxQeNc_GRw3cB1bmYPQw",
      match_id
    }
  }
  return await sendRequest(config);
}

async function sendRequest(config) {
  try {
    let response = (await axios(config)).data;
    if (response)
      return resultResponse(SUCCESS, { data: response });
    return resultResponse(NOT_FOUND, "No data found!");
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

function matchOldCreateUpdate(data, select = ['_id'], transaction = false, session) {
  let options = { upsert: true, new: true, runValidators: true };
  if (transaction)
    options["session"] = session;
  return Match.findOneAndUpdate(
    { match_id: data.match_id },
    data,
    options
  ).lean().select(select)
    .then(match => {
      if (match)
        return resultResponse(SUCCESS, match);
      return resultResponse(NOT_FOUND, "Match not found!");
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

function matchCreateUpdate(data, select = ['_id'], transaction = false, session, retries = 0) {
  const MAX_RETRIES = 5;
  const RETRY_DELAY_MS = 100;
  let options = { upsert: true, new: true, runValidators: true };
  if (transaction)
    options["session"] = session;

  return Match.findOneAndUpdate(
    { match_id: data.match_id },
    data,
    options
  )
    .lean()
    .select(select)
    .then(match => {
      if (match)
        return resultResponse(SUCCESS, match);
      return resultResponse(NOT_FOUND, "Match not found!");
    })
    .catch(error => {
      if (error.message.includes("Transaction with { txnNumber:") && retries < MAX_RETRIES) {
        // Write conflict occurred, retry after delay
        return new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
          .then(() => matchCreateUpdate(data, select, transaction, session, retries + 1));
      }
      throw error;
    });
}

function getDefaultMarketFields() {
  return {
    "status": "SUSPENDED",
    "inplay": false,
    "runners": {
      "ex": {
        "availableToBack": [
          {
            "price": "--",
            "size": "--"
          }
        ],
        "availableToLay": [
          {
            "price": "--",
            "size": "--"
          }
        ]
      }
    }
  }
}

async function flushCache() {
  let redisResponse = await exchangeService.flushCache();
  if (redisResponse.statusCode == SUCCESS) return resultResponse(SUCCESS, redisResponse.data);
  else return resultResponse(SERVER_ERROR, redisResponse.data);
}

async function getMatch(params) {
  return Market.aggregate(matchServiceQuery.getMatch(params))
    .then(result => result.length ? resultResponse(SUCCESS, result) : resultResponse(NOT_FOUND, "No matches found."))
    .catch(error => resultResponse(SERVER_ERROR, error.message));
}

async function updateMatchMarketDateTime(req) {

  const { match_id, match_date } = req.body;

  return Match
    .updateOne(
      { match_id }, {
      $set: { match_date, start_date: match_date }
    }).then(data => {

      if (data.modifiedCount) {
        return Market.updateMany({
          match_id, is_result_declared: 0, is_abandoned: 0
        }, {
          $set: { match_date }
        }).then().catch(console.error);
      }

    }).catch(error => resultResponse(SERVER_ERROR, error.message));

}

async function resetTVandScoreBoardURL() {
  try {
    var today = new Date();
    today.setDate(today.getDate() - 3);
    let matches = await Match.find({
      is_active: 1, is_visible: true, is_abandoned: 0, is_result_declared: 0,
      centralId: { "$ne": null }, sport_id: { $nin: [LIVE_GAME_SPORT_ID.toString(), DIAMOND_CASINO_SPORT_ID, UNIVERSE_CASINO_SPORT_ID, HR, GHR] },
      match_date: { "$gte": today },
      $or: [
        { has_tv_url: true },
        { has_sc_url: true }
      ]
    }).select("_id match_id name sport_id match_date");
    if (matches.length) {
      let bulkOperations = matches.map(match => {
        // Define the fields to update
        let updateFields = {
          has_tv_url: false,
          has_sc_url: false,
          match_tv_url: null,
          match_scoreboard_url: null,
        };
        return {
          updateOne: {
            filter: { match_id: match.match_id },
            update: { $set: updateFields }
          }
        };
      });
      // Perform the bulk write operation
      if (bulkOperations.length > 0) {
        const bulkWriteResult = await Match.bulkWrite(bulkOperations, { ordered: false });
      }
      await updateTVandScoreBoardURLV1(API_PROVIDER);
    }
    let markets = await Market.find({
      is_active: 1, is_visible: true, is_abandoned: 0, is_result_declared: 0, market_id: { $regex: ".+(?<!_m)$" },
      centralId: { "$ne": null }, sport_id: { $in: [HR, GHR] }, match_tv_url: { $ne: null }, has_tv_url: true
    }).select("-_id name market_id");
    if (markets.length) {
      let bulkOperations = markets.map(market => {
        // Define the fields to update
        let updateFields = {
          match_tv_url: null,
          has_tv_url: false
        };
        return {
          updateOne: {
            filter: { market_id: market.market_id },
            update: { $set: updateFields }
          }
        };
      });
      // Perform the bulk write operation
      if (bulkOperations.length > 0) {
        try {
          const bulkWriteResult = await Market.bulkWrite(bulkOperations, { ordered: false });
          await updateTVForHrAndGHrURL(API_PROVIDER);
        } catch (error) {
          console.error("Error occurred during bulkWrite for markets:", error);
        }
      }
    }
  } catch (error) {
    console.error(error);
  }
}

async function homeMatchesWrite() {
  try {
    const result = await homeMatchesOpen({});

    if (result.statusCode == SUCCESS) {
      await exchangeService.homeMatchesWrite(result.data);
    }
  } catch (error) {
    console.log("homeMatchesWrite: ", error)
  }
}

async function homeMatchesRead() {
  try {
    const result = await exchangeService.homeMatchesRead();

    return result;

    // if (result.statusCode == SUCCESS) {
    //   return resultResponse(result.statusCode, result.data);
    // } else {
    //   return resultResponse(result.statusCode, resul.data);
    // }

  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }

}

function getTimeTaken(params = {
  startTime: moment()
}) {

  const { startTime } = params;

  // Step 1: Create two Moment objects
  // const startTime = moment('2024-08-26 08:00:00'); // Example start time
  const endTime = moment();   // Example end time

  // Step 2: Calculate the difference in milliseconds
  const durationInMilliseconds = endTime.diff(startTime);

  // Step 3: Convert the duration to a human-readable format
  const duration = moment.duration(durationInMilliseconds);

  const hours = duration.hours();     // Extract hours
  const minutes = duration.minutes(); // Extract minutes
  const seconds = duration.seconds(); // Extract seconds
  const milliseconds = duration.milliseconds(); // Extract seconds

  return (`Total time taken: ${hours ? hours + " hours, " : ""}${minutes ? minutes + " minutes, " : ""}${seconds ? seconds + " seconds and " : ""}${milliseconds} milliseconds`);

}

// if (process.env.NODE_APP_INSTANCE == "0" || process.env.NODE_APP_INSTANCE == undefined) {
//   MatchEvent.on(MARKET_CHANGE_EVENT, async (change) => {
//     genericEventHandler(change, marketDataUpdateRedis)
//   });

//   MatchEvent.on(FANCY_CHANGE_EVENT, async (change) => {
//     genericEventHandler(change, fancyDataUpdateRedis)
//   });
// }

async function marketDataUpdateRedis(data) {
  try {
    const { _id } = data;

    const market = await Market.findOne({ _id }, ['match_id', 'market_id']).lean();

    // Return if no data found !!
    if (!market) return;

    const { match_id, market_id } = market;
    const KEY = `${MARKET_KEY}${match_id}:${market_id}${UNIQUE_IDENTIFIER_KEY}`;
    let marketRedis = await redisClient.get(KEY);

    const runnersKeys = Object.keys(data)
      .filter(key => key.includes('runners.') && key.includes('.ex'));

    if (marketRedis) {
      marketRedis = JSON.parse(marketRedis);

      // Update Blank Runner Update
      if (runnersKeys.length) {
        runnersKeys.map(key => {
          const index = Number(key.split('.')[1]);
          let runnerItem = marketRedis.runners[index];
          runnerItem.ex = data[key];
          marketRedis.runners[index] = runnerItem;
          delete data[key];
        })
      }

      // If Whole Runner is Updated 
      if (Object.keys(data).includes("runners") && Array.isArray(data.runners)) {
        marketRedis.runners = marketRedis.runners.map((runner, index) => {
          const newRunner = data.runners[index];
          return { ...runner, ...(newRunner ? newRunner : {}) };
        });
      }

      marketRedis = { ...marketRedis, ...data };
    } else {
      marketRedis = await Market.findOne({ _id }).lean();
    }
    await redisClient.set(KEY, JSON.stringify(marketRedis));
  } catch (error) {
    console.error("Error occurred in marketDataUpdateRedis:", error);
  }
}

async function fancyDataUpdateRedis(data) {
  try {
    const { _id } = data;
    const fancy = await Fancy.findOne({ _id }, ['match_id', 'fancy_id']).lean();

    // Return if no data found !!
    if (!fancy) return;

    const { match_id, fancy_id } = fancy;
    const KEY = `${FANCY_KEY}${match_id}:${fancy_id}${UNIQUE_IDENTIFIER_KEY}`;
    let fancyRedis = await redisClient.get(KEY);

    if (fancyRedis) {
      fancyRedis = JSON.parse(fancyRedis);
      fancyRedis = { ...fancyRedis, ...data };
    } else {
      fancyRedis = await Fancy.findOne({ _id }).lean();
    }
    await redisClient.set(KEY, JSON.stringify(fancyRedis));
  } catch (error) {
    console.error("Error occurred in fancyDataUpdateRedis:", error);
  }
}

async function genericEventHandler(change, callback) {
  try {
    const { operationType, documentKey, updateDescription, fullDocument } = change;
    let data;

    if (operationType == 'insert') {
      data = fullDocument;
    } else if (operationType == "update" && updateDescription?.updatedFields) {
      const { updatedFields } = updateDescription;
      if (!(Object.keys(updatedFields).length == 1 && updatedFields.updatedAt)) {
        data = { ...documentKey, ...updatedFields };
      }
    }

    if (data) {
      callback(data);
    }
  } catch (error) {
    console.error("Error occurred in genericEventHandler:", error);
  }
}
module.exports = {
  checkMatchExist, updateMatchStatus, getDeactiveMatch, createDeactiveMatch, homeMatches, homeMatchesOpen,
  deleteDeactiveMatch, getAllMatches, getMatches, updateDeactiveMatch, matchDetails, matchDetailsOpen,
  getMatchDetails, getMatchesDetails, getSelectionByMatchId, isMatchIsActive, updateTVandScoreBoardURL,
  matchCreateUpdate, matchesListForFancy, matchOldCreateUpdate, getMatch, updateTVForHrAndGHrURL, isMatchDataExists,
  updateTVandScoreBoardURLV1, flushCache, updateMatchMarketDateTime, resetTVandScoreBoardURL, homeMatchesDetailsMain,
  homeMatchesWrite, homeMatchesRead, homeMatchesOpenV2,
  matchDetailsV2,
}