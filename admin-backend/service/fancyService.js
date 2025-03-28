const { ObjectId } = require("bson")
  , axios = require('axios')
  , _ = require('lodash')
  , moment = require('moment')
  , Match = require('../../models/match')
  , Fancy = require('../../models/fancy')
  , DeactiveFancy = require('../../models/deactiveFancy')
  , BetsFancy = require('../../models/betsFancy')
  , FancyScorePosition = require('../../models/fancyScorePosition')
  , UserProfitLoss = require('../../models/userProfitLoss')
  , client = require("../../connections/redisConnections")
  , fancyQueryService = require('./fancyQueryService')
  , websiteService = require("./websiteService")
  , userService = require('./userService')
  , matchService = require('./matchService')
  , fancyQueryServiceUser = require('../../users-backend/service/fancyQueryService')
  , CONSTANTS = require('../../utils/constants')
  , exchangeService = require('./exchangeService')
  , apiUrlSettingsService = require('./apiUrlSettingsService')
  , logger = require("../../utils/loggers")
  , {
    SUCCESS, NOT_FOUND, SERVER_ERROR, USER_TYPE_USER, SUSPENDED,
    BRLN_X_APP, GET_MARKET_STATUS, API_PROVIDER, GET_FANCY_ODDS_API_INPLAY, GET_MANUAL_FANCY_ODDS_API_INPLAY,
    LIVE_GAME_SPORT_ID, DIAMOND_CASINO_SPORT_ID, UNIVERSE_CASINO_SPORT_ID, FANCY_CATEGORY,
    INPLAY, DELAY, MANUAL_FANCY_TYPE,
    FANCY_KEY,
    UNIQUE_IDENTIFIER_KEY,
    FANCY_CATEGORY_DIAMOND
  } = require("../../utils/constants")
  , { resultResponse } = require('../../utils/globalFunction')
  , { getAllEvents, fixFloatingPoint, getTimeTaken } = require('../../utils');

const {
  updateFanciesInRedis,
  deleteFanciesInRedis,
  fancyDumpRedis,
  getFanciesV2,
  manualFancyOddsDumpRedis,
} = require('./fancy/fancyRedisService');
const { v4: uuidv4 } = require('uuid');
const { USER_BLOCK_TYPE } = require("../../config/constant/user");
const GET_FANCY_ODDS_API_INPLAY_d247 = process.env.GET_FANCY_ODDS_API_INPLAY_d247;
const GET_FANCY_ODDS_API_INPLAY_PARKER777 = process.env.GET_FANCY_ODDS_API_INPLAY_PARKER777;
const PROVIDER_API_FANCY = process.env.PROVIDER_API_FANCY;
const { ALLOW_MANUAL_FANCY } = require("../../config/constant/rateConfig");

async function createFancy(data) {
  try {
    let resFromDB = await Fancy.create(data);
    return resultResponse(CONSTANTS.SUCCESS, resFromDB);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

async function checkFancyExist(fancy_id) {
  try {
    let fancyDetails = await Fancy.findOne({ fancy_id: fancy_id }).lean();
    if (fancyDetails)
      return resultResponse(CONSTANTS.SUCCESS, fancyDetails);
    else
      return resultResponse(CONSTANTS.NOT_FOUND, CONSTANTS.DATA_NULL);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

async function updatefancyData(updateDataObject, fancy_id) {
  try {
    delete updateDataObject["fancy_id"];
    let resFromDB = await Fancy.updateOne({ fancy_id: fancy_id }, { $set: updateDataObject }).lean();
    if (resFromDB.n > 0)
      return resultResponse(CONSTANTS.SUCCESS, resFromDB);
    else
      return resultResponse(CONSTANTS.NOT_FOUND, CONSTANTS.DATA_NULL);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

let getFancy = async (data) => {
  try {

    let userTypeId = data.user_type_id;
    let fancyMatchingFields = '';
    let query = '';
    let totalCountQuery = {
      $count: "total"
    };

    if (userTypeId != 0) {
      if (data.match_id && data.name) {
        fancyMatchingFields = {
          "$match": {
            "match_id": data.match_id,
            "is_active": 1,
            "name": { $regex: data.name, $options: 'i' }
          }
        }
      }
      if (data.match_id) {
        fancyMatchingFields = {
          "$match": {
            "match_id": data.match_id,
            "is_active": 1
          }
        }
      }
      if (data.name) {
        fancyMatchingFields = {
          "$match": {
            "is_active": 1,
            "name": { $regex: data.name, $options: 'i' }
          }
        }
      }
    }
    else {
      if (data.match_id && data.name) {
        fancyMatchingFields = {
          "$match": {
            "is_active": 1,
            "match_id": data.match_id,
            "name": { $regex: data.name, $options: 'i' }
          }
        }
      }
      if (data.match_id) {
        fancyMatchingFields = {
          "$match": {
            "is_active": 1,
            "match_id": data.match_id
          }
        }
      }
      if (data.name) {
        fancyMatchingFields = {
          "$match": {
            "is_active": 1,
            "name": { $regex: data.name, $options: 'i' }
          }
        }
      }
    }

    if (userTypeId == 0)
      query = fancyQueryService.getFancyQueryUserTypeIdZero(data.page, data.limit);
    else
      query = fancyQueryService.getFancyQueryUserTypeIdNonZero(data.parentIds, data.user_id, data.page, data.limit);

    if (data.match_id || data.name)
      query.unshift(fancyMatchingFields);
    let result = await Fancy.aggregate(query);
    query.push(totalCountQuery);
    let totalCountResult = await Fancy.aggregate(query);
    if (totalCountResult.length) totalCountResult = totalCountResult[0].total;
    else totalCountResult = 0;
    if (result)
      return resultResponse(CONSTANTS.SUCCESS, { fencyData: result, total: totalCountResult });
    else
      return resultResponse(CONSTANTS.NOT_FOUND);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

let getOnlineFancyList = async (match_id) => {
  try {
    let getAllFancyFromAPI = [];
    try {
      let fancySwitch = await apiUrlSettingsService.liveFancyDataFrom();
      if (fancySwitch == "A") {
        getAllFancyFromAPI = await axios.get(await apiUrlSettingsService.getFancyUrl() + match_id, { timeout: 3000 });
        getAllFancyFromAPI = getAllFancyFromAPI.data;
        if (!Array.isArray(getAllFancyFromAPI))
          getAllFancyFromAPI = [];
      } else if (fancySwitch == "R") {
        let redisFancy = await exchangeService.getFancyLiveData(match_id);
        if (redisFancy.statusCode == SUCCESS) {
          getAllFancyFromAPI = redisFancy.data;
        }
      }
    } catch (error) { getAllFancyFromAPI = []; }
    // parse api data according to db columns.
    let events = await getAllEvents({ match_id });
    if (events.SUCCESS != SUCCESS)
      return resultResponse(NOT_FOUND, []); // Some events could not be retrieved!
    getAllFancyFromAPI = getAllFancyFromAPI.map(element => {
      return {
        ...events,
        selection_id: element.SelectionId,
        name: element.RunnerName,
        fancy_name: element.RunnerName,
        BackPrice1: element.BackPrice1,
        BackSize1: element.BackSize1,
        GameStatus: element.GameStatus,
        LayPrice1: element.LayPrice1,
        LaySize1: element.LaySize1,
        MarkStatus: element.MarkStatus,
        centralId: element.centralId || null,
        category: element.Category || '0',
        chronology: element.Srno || '0',
        is_manual: element?.IsManual ?? '0',
        is_active: 0,
        is_visible: 0,
        is_created: '0',
      };
    });
    return resultResponse(SUCCESS, getAllFancyFromAPI);
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

let updateFancyStatus = async (fancy_id, is_active) => {
  return Fancy.updateOne({ fancy_id }, { $set: { is_active } }).lean().then(updateAndGetFancyStatus => {
    if (updateAndGetFancyStatus.modifiedCount)
      return Fancy.findOne({ fancy_id }).lean().select("-_id match_id")
        .then(fancy => resultResponse(CONSTANTS.SUCCESS, fancy))
        .catch(error => resultResponse(SERVER_ERROR, error.message));
    else if (!updateAndGetFancyStatus.matchedCount)
      return resultResponse(CONSTANTS.NOT_FOUND, CONSTANTS.DATA_NULL);
    else
      return resultResponse(CONSTANTS.ALREADY_EXISTS, CONSTANTS.DATA_NULL);
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

let getDeactiveFancy = async (data) => {
  try {
    let resFromDB = await DeactiveFancy.findOne({ user_id: data.user_id, fancy_id: data.fancy_id }).lean();
    if (resFromDB)
      return resultResponse(CONSTANTS.SUCCESS, resFromDB);
    else
      return resultResponse(CONSTANTS.NOT_FOUND);

  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

let deleteDeactiveFancy = async (data) => {
  try {
    let resFromDB = await DeactiveFancy.deleteOne({ user_id: data.user_id, fancy_id: data.fancy_id })
    return resultResponse(CONSTANTS.SUCCESS, resFromDB);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

let createDeactiveFancy = async (data) => {
  try {
    let createDeactiveRes = await DeactiveFancy.create(data);
    return resultResponse(CONSTANTS.SUCCESS, createDeactiveRes);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

let checkParentIdsDeactiveFancy = async (fancy_id, parentIds) => {
  try {
    let resFromDB = await DeactiveFancy.findOne({ fancy_id: fancy_id, user_id: { $in: parentIds } }).lean();
    if (resFromDB) {
      return resultResponse(CONSTANTS.SUCCESS, resFromDB);
    } else {
      return resultResponse(CONSTANTS.NOT_FOUND);
    }
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

let getAllFancyByMatchId = async (match_id) => {
  try {
    let query = fancyQueryService.getFancyQuerySuperAdmin(match_id);
    let result = await Fancy.aggregate(query);
    if (result)
      return resultResponse(CONSTANTS.SUCCESS, result);
    else
      return resultResponse(CONSTANTS.NOT_FOUND);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

let getAllFancyForAgentsByMatchId = async (match_id, parentIds, user_id) => {
  try {

    let query = fancyQueryService.getFancyQueryForAgents(match_id, parentIds, user_id);

    let result = await Fancy.aggregate(query);
    if (result)
      return resultResponse(CONSTANTS.SUCCESS, result);
    else
      return resultResponse(CONSTANTS.NOT_FOUND);

  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

function getFancyDetails(FilterQuery = {}, Projection = {}, populates = [], findOne = false) {
  let fancyData;
  if (findOne)
    fancyData = Fancy.findOne(FilterQuery);
  else
    fancyData = Fancy.find(FilterQuery);
  fancyData.select(Array.isArray(Projection) ? Projection : Projection);
  if (populates.length) {
    populates.map(populate => {
      fancyData.populate(
        Object.keys(populate).toString(),
        populate[Object.keys(populate).toString()]
      );
    });
  }
  return fancyData
    .lean()
    .then(fancy => {
      if (fancy != null)
        if (Object.keys(fancy).length || fancy.length)
          return resultResponse(CONSTANTS.SUCCESS, fancy);
      return resultResponse(CONSTANTS.NOT_FOUND, "Fancy(s) or it's Setting(s) not found!");
    }).catch(error => resultResponse(CONSTANTS.SERVER_ERROR, error.message));
};

function getFancyDetail(FilterQuery = {}, Projection = {}, populates = []) {
  return getFancyDetails(FilterQuery, Projection, populates, true).then();
}

let getFancyByFancyId = (fancy_id) => {
  return getFancyDetail(
    { fancy_id },
    ["-_id", "session_value_yes", "session_value_no", "session_size_no", "session_size_yes", "display_message"]
  ).then(fancy => {
    if (fancy.statusCode == SUCCESS) {
      return {
        "data": {
          BackPrice1: fancy.data.session_value_yes,
          BackSize1: fancy.data.session_size_yes,
          LayPrice1: fancy.data.session_value_no,
          LaySize1: fancy.data.session_size_no,
          GameStatus: fancy.data.display_message,
        }
      };
    }
    return { "data": null };
  }).catch(error => ({ "data": null }));
}

let getFancyPosition = async (user_id, fancy_id) => {
  return FancyScorePosition.aggregate(
    fancyQueryService.getFancyPositionQuery(user_id, fancy_id)
  ).then(fancyScore => {
    if (fancyScore.length)
      return resultResponse(SUCCESS, fancyScore[0]);
    else
      return resultResponse(SUCCESS, {
        "_id": 0,
        "liability": 0,
        "profit": 0,
        "fancy_score_position_json": []
      });
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

// This function is used inside another function i.e. createFancyPosition.
let getFancyBetForUserPosition = async (user_id, fancy_id, user_type_id, bet_id = null) => {
  let query;
  if (user_type_id == USER_TYPE_USER)
    query = fancyQueryServiceUser.getFancyBetForUserPositionQuery(user_id, fancy_id, bet_id);
  else
    query = fancyQueryService.getFancyBetForAgentPositionQuery(user_id, fancy_id);
  return BetsFancy.aggregate(query).then(FancyUserPosition => {
    if (FancyUserPosition.length)
      return resultResponse(SUCCESS, FancyUserPosition);
    else
      return resultResponse(NOT_FOUND);
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
};

// This function call when we need to see the book of fancy in agent & user.
let getRunTimeFancyPosition = async (user_id, fancy_id, user_type_id, bet_id = null) => {
  return getFancyBetForUserPosition(user_id, fancy_id, user_type_id, bet_id).then(fancyList => {
    let data;
    let fancyListData = [];
    if (fancyList.statusCode === SUCCESS) {
      fancyListData = fancyList.data;
      if (fancyListData.length > 0) {
        let run = [], resultValues = [], orgRun = [];
        let lastPosition = 0, max_exposure = 0, max_profit = 0, stack_sum = 0;
        for (let i in fancyListData) {
          let fancy = fancyListData[i];
          stack_sum += fancy.stack;
          run.push(fancy.run - 1);
        }
        run.push(fancyListData[fancyListData.length - 1].run);
        orgRun = run;
        run = [...new Set(run)];
        run.map(function (r, ind) {
          let tempTotal = 0, tempFullTotal = 0;
          fancyListData.map(async function (f) {
            let stack = (f.stack * f.per) / 100;
            let stackFull = f.stack;
            if (f.is_back == 1) {
              if (f.run <= r) {
                tempTotal -= stack * (f.size / 100);
                tempFullTotal -= stackFull * (f.size / 100);
              } else {
                tempTotal += stack;
                tempFullTotal += stackFull;
              }
            } else {
              if (f.run > r) {
                tempTotal -= stack;
                tempFullTotal -= stackFull;
              } else {
                tempTotal += stack * (f.size / 100);
                tempFullTotal += stackFull * (f.size / 100);
              }
            }
          });
          if (user_type_id == USER_TYPE_USER)
            tempTotal = -(tempTotal);
          if ((orgRun.length) - 1 == ind)
            resultValues.push({ "key": lastPosition + '+', "value": tempTotal.toFixed(2), "valueFull": tempFullTotal.toFixed(2) });
          else {
            if (lastPosition == r)
              resultValues.push({ "key": lastPosition.toString(), "value": tempTotal.toFixed(2), "valueFull": tempFullTotal.toFixed(2) });
            else
              resultValues.push({ "key": lastPosition + '-' + r, "value": tempTotal.toFixed(2), "valueFull": tempFullTotal.toFixed(2) });
          }
          lastPosition = r + 1;
          if (max_exposure > tempTotal)
            max_exposure = tempTotal;
          if (max_profit < tempTotal)
            max_profit = tempTotal;
        });
        data = { "fancy_position": resultValues, "liability": max_exposure, "profit": max_profit, stack_sum, bets_fancies: fancyListData };
      } else
        data = { "fancy_position": [], "liability": 0, "profit": 0, "stack_sum": 0, bets_fancies: [] };
    } else
      data = { "fancy_position": [], "liability": 0, "profit": 0, "stack_sum": 0, bets_fancies: [] };
    return resultResponse(SUCCESS, data);
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

let getFancyLiabilityBySharing = (params) => {
  let query = fancyQueryService.getFancyLiabilityBySharing(params);
  return FancyScorePosition.aggregate(query).then(fanciesBets => {
    if (fanciesBets.length) {
      return resultResponse(SUCCESS, createFancyLiability(params, fanciesBets));
    } else
      return resultResponse(NOT_FOUND, []);
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

let createFancyLiability = (data, params) => {
  let fancies = params, FancyLiability = {}, exposure = false, exposureData = [];
  for (const fancy of fancies) {
    let { user_type_id, needSinglePosition, needExposure, analysis } = data, fancy_id = fancy.fancy_id
      , fancyListData = fancy.bets_fancies;
    exposure = needExposure;
    let run = [], resultValues = [], orgRun = [];
    let lastPosition = 0, max_exposure = 0, max_full_exposure = 0, max_profit = 0, max_full_profit = 0, stack_sum = 0;
    for (let i in fancyListData) {
      let fancy = fancyListData[i];
      stack_sum += fancy.stack;
      run.push(fancy.run - 1);
    }
    run.push(fancyListData[fancyListData.length - 1].run);
    orgRun = run;
    run = [...new Set(run)];
    run.map(function (r, ind) {
      let tempTotal = 0, tempFullTotal = 0;
      fancyListData.map(async function (f) {
        let stack = (f.stack * f.per) / 100;
        let stackFull = f.stack;
        if (f.is_back == 1) {
          if (f.run <= r) {
            tempTotal -= stack * (f.size / 100);
            tempFullTotal -= stackFull * (f.size / 100);
          } else {
            tempTotal += stack;
            tempFullTotal += stackFull;
          }
        } else {
          if (f.run > r) {
            tempTotal -= stack;
            tempFullTotal -= stackFull;
          } else {
            tempTotal += stack * (f.size / 100);
            tempFullTotal += stackFull * (f.size / 100);
          }
        }
      });
      if (user_type_id == USER_TYPE_USER)
        tempTotal = -(tempTotal);
      if ((orgRun.length) - 1 == ind)
        resultValues.push({ "key": lastPosition + '+', "value": tempTotal.toFixed(2), "valueFull": tempFullTotal.toFixed(2) });
      else {
        if (lastPosition == r)
          resultValues.push({ "key": lastPosition.toString(), "value": tempTotal.toFixed(2), "valueFull": tempFullTotal.toFixed(2) });
        else
          resultValues.push({ "key": lastPosition + '-' + r, "value": tempTotal.toFixed(2), "valueFull": tempFullTotal.toFixed(2) });
      }
      lastPosition = r + 1;
      if (max_exposure > tempTotal)
        max_exposure = tempTotal;
      if (max_full_exposure > tempFullTotal)
        max_full_exposure = tempFullTotal;
      if (max_profit < tempTotal)
        max_profit = tempTotal;
      if (max_full_profit < tempFullTotal)
        max_full_profit = tempFullTotal;
    });
    if (needSinglePosition)
      return { "fancy_position": resultValues, "liability": max_exposure, "profit": max_profit, stack_sum, bets_fancies: fancyListData };
    if (needExposure)
      exposureData.push({
        sport_id: fancy.sport_id,
        sport_name: fancy.sport_name,
        series_id: fancy.series_id,
        series_name: fancy.series_name,
        match_id: fancy.match_id,
        match_name: fancy.match_name,
        event_name: fancy.event_name,
        event_id: fancy.event_id,
        type: fancy.type,
        liability: max_exposure
      });

    if (analysis) {
      exposure = true
      exposureData.push({
        sport_id: fancy.sport_id,
        sport_name: fancy.sport_name,
        series_id: fancy.series_id,
        series_name: fancy.series_name,
        match_id: fancy.match_id,
        match_name: fancy.match_name,
        match_date: fancy.match_date,
        fancy_name: fancy.fancy_name,
        fancy_id: fancy.fancy_id,
        category: fancy.category,
        event_name: fancy.event_name,
        event_id: fancy.event_id,
        type: fancy.type,
        type_name: fancy.type_name,
        max_profit: fixFloatingPoint(max_profit),
        max_full_profit: fixFloatingPoint(max_full_profit),
        win_loss: fixFloatingPoint(max_exposure),
        win_loss_total_exposure: fixFloatingPoint(max_full_exposure)
      });
    }
    FancyLiability[fancy_id] = max_exposure;
  }
  if (exposure)
    return exposureData;
  else
    return FancyLiability;
}

let getMatchesForFancyResult = () => {
  return BetsFancy.aggregate(fancyQueryService.getMatchesForFancyResult()).then(getMatchesForFancyResult => {
    return resultResponse(SUCCESS, getMatchesForFancyResult);
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

function results(params) {

  // Conditions to Show List of Fancies whose Result / Rollback Not Request for Cron
  if (params?.search?.is_result_declared === 0) {
    params.search.result_cron_progress = null;
  } else if (params?.search?.is_result_declared === 1) {
    params.search.rollback_cron_progress = null;
  }

  let query = fancyQueryService.ResultQuery(params);
  return Fancy.aggregate(query).then(fancy => {
    if (fancy.length)
      return resultResponse(SUCCESS, fancy);
    else
      return resultResponse(NOT_FOUND, "No session available for declaring the result!");
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

function fancyStake(params) {
  let query = fancyQueryService.fancyStake(params);
  return UserProfitLoss.aggregate(query).then(fancyStake => {
    if (fancyStake.length)
      return resultResponse(SUCCESS, fancyStake);
    else
      return resultResponse(NOT_FOUND, "No session data found yet!");
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

function fancyStakeUsersWise(params) {
  let { event_id, event_name, type, user_id } = params;
  return userService.getUsersDetails(
    { parent_id: user_id },
    ["_id", "user_type_id"]
  ).then(usersByParentId => {
    if (usersByParentId.statusCode == SUCCESS) {
      let lastAgentsId = [], AgentsDirectUsers = [];
      usersByParentId = usersByParentId.data;
      usersByParentId.map(data => {
        if (data.user_type_id == USER_TYPE_USER)
          AgentsDirectUsers.push(data._id);
        else
          lastAgentsId.push(data._id);
      });
      let queryUsers = fancyQueryService.getStackOfUsers(JSON.parse(JSON.stringify({ event_id, event_name, type })), AgentsDirectUsers, params);
      let queryAgents = fancyQueryService.getStackOfAgents(JSON.parse(JSON.stringify({ event_id, event_name, type })), user_id, lastAgentsId, params);
      return Promise.all([
        UserProfitLoss.aggregate(queryAgents),
        UserProfitLoss.aggregate(queryUsers)
      ]).then(agentsAndUsers => {
        let data = [...agentsAndUsers[0], ...agentsAndUsers[1]];
        return resultResponse(SUCCESS, data);
      }).catch(error => resultResponse(SERVER_ERROR, error.message));
    } else return resultResponse(NOT_FOUND, "No agents and its users are found!");
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

async function autoImportFancy() {
  // Generate a unique reference code for logging (optional)
  const LOG_REF_CODE = uuidv4();
  try {
    logger.info(`================ ${LOG_REF_CODE} autoImportFancy ================`);
    logger.info(`${LOG_REF_CODE} 1. autoImportFancy Started`);
    // Get list of matches that have enable_fancy = 1, is_active = 1 & is_result_declared = 0
    let matches = await Match.find({ is_active: 1, is_visible: true, is_result_declared: 0, sport_id: "4", enable_fancy: 1, is_abandoned: 0 })
      .select("_id match_id match_date session_min_stack session_max_stack session_max_profit");

    if (matches.length) {
      logger.info(`${LOG_REF_CODE} 2. autoImportFancy Matches: ${JSON.stringify(matches.map(({ match_id, match_date }) => ({ match_id, match_date })))}`);
      for (const match of matches) {
        let fanciesByMatchId = await getOnlineFancyList(match.match_id);

        if (fanciesByMatchId.statusCode == SUCCESS) {

          logger.info(`${LOG_REF_CODE} 3. autoImportFancy MatchId: ${match.match_id} fanciesByMatchId: ${JSON.stringify(fanciesByMatchId.data.length)}`);

          let fancyIds = [];
          fanciesByMatchId = fanciesByMatchId.data;

          if (!ALLOW_MANUAL_FANCY) {
            // This will execute every time, when ALLOW_MANUAL_FANCY is set to true this block will not execute.
            fanciesByMatchId = fanciesByMatchId.filter(data => data.is_manual == '0');
          }

          fanciesByMatchId = fanciesByMatchId.map(data => {
            const { sport_id, sport_name, series_id, series_name, match_id, match_name, selection_id, name, fancy_name, centralId, category, chronology, is_manual } = data;
            let fancy_id = `${match.match_id}_${data.selection_id}`;
            const category_name = FANCY_CATEGORY_DIAMOND[category] || "NORMAL";
            fancyIds.push(fancy_id);
            return {
              match_id: match.match_id, match_date: match.match_date, session_min_stack: match.session_min_stack, session_max_stack: match.session_max_stack,
              session_max_profit: match.session_max_profit, fancy_id,
              sport_id, sport_name, series_id, series_name, match_id, match_name, selection_id, name, fancy_name, centralId, category, chronology, is_manual,
              category_name
            }
          });

          let fanciesInDB = await Fancy.find({ fancy_id: { '$in': fancyIds } }).select("-_id fancy_id is_active is_visible is_result_declared").lean()
            , ids = new Set(fanciesInDB.map(({ fancy_id }) => fancy_id))
            , faciesNotInDB = fanciesByMatchId.filter(({ fancy_id }) => !ids.has(fancy_id));

          let fancy_count = fanciesInDB.map(data => data.is_active == 1 && data.is_visible == true && data.is_result_declared == 0).filter(data => data).length;

          logger.info(`${LOG_REF_CODE} 4. autoImportFancy fancy_count: ${fancy_count} faciesNotInDB: ${JSON.stringify(faciesNotInDB)}`);
          if (fancy_count) {
            match.fancy_count = fancy_count;
            match.save();
          }
          if (faciesNotInDB.length)
            return await Fancy.insertMany(faciesNotInDB);
        } else {
          logger.info(`${LOG_REF_CODE} 3. autoImportFancy MatchId: ${match.match_id} fanciesByMatchId: Error ${fanciesByMatchId.statusCode}`);
        }
      }
    }
  } catch (error) {
    console.error(error);
    logger.info(`${LOG_REF_CODE} Error 1. autoImportFancy Error: ${error.message}`);
  }
}

async function inactiveAutoImportFancy(provider) {
  // Generate a unique reference code for logging (optional)
  const LOG_REF_CODE = uuidv4();
  try {

    logger.info(`================ ${LOG_REF_CODE} InactiveAutoImportFancy ================`);
    logger.info(`${LOG_REF_CODE} 1. InactiveAutoImportFancy Started: Data: ${provider}`);
    if (provider == API_PROVIDER) {
      let matches = await matchService.getMatchesDetails({
        is_active: 1, is_visible: true, is_result_declared: 0, sport_id: "4", enable_fancy: 1, is_abandoned: 0,
      }, ["-_id", "match_id"]);
      logger.info(`${LOG_REF_CODE} 2. InactiveAutoImportFancy matches: ${JSON.stringify(matches)}`);
      if (matches.statusCode == SUCCESS) {
        matches = matches.data;
        let emitMatchesIds = [];
        for (const match of matches) {
          let fancies = []
          try {
            logger.info(`${LOG_REF_CODE} 3. InactiveAutoImportFancy Fetch From API  Match Id: ${match.match_id}`);

            fancies = (await axios.get(await apiUrlSettingsService.getFancyUrl() + match.match_id, { timeout: 3000 })).data;

            if (!ALLOW_MANUAL_FANCY) {
              // This will execute every time, when ALLOW_MANUAL_FANCY is set to true this block will not execute.
              fancies = fancies.filter(data => data.IsManual == '0');
            }

            logger.info(`${LOG_REF_CODE} 4. InactiveAutoImportFancy Fetch From API Result Fancies: ${fancies.length}`);
          } catch (error) {
            logger.info(`${LOG_REF_CODE} Error 1: InactiveAutoImportFancy Error: ${error.message}`);
          }
          if (fancies.length) {
            let fanciesIds = fancies.map(fancy => `${match.match_id}_${fancy.SelectionId}`);
            // We have updated all the fancies that were received in API.

            const filterObj1 = {
              match_id: match.match_id, fancy_id: { $in: fanciesIds },
              is_active: { $in: [0, 2, 4] }, is_result_declared: 0,
            };
            let getFancyStatus = await Fancy.updateMany(filterObj1, { is_active: 1 });

            logger.info(`${LOG_REF_CODE} 5. InactiveAutoImportFancy Fancy Update to {is_active: 1} Result: ${JSON.stringify(getFancyStatus)} Filter1 ${JSON.stringify(filterObj1)}`);

            const filterObj2 = {
              match_id: match.match_id, fancy_id: { $nin: fanciesIds },
              is_active: 1, is_result_declared: 0,
            };
            let getActiveFancyToInactiveCount = await Fancy.updateMany(filterObj2, { is_active: 0 });

            logger.info(`${LOG_REF_CODE} 6. InactiveAutoImportFancy Fancy Update to {is_active: 0} Result: ${JSON.stringify(getActiveFancyToInactiveCount)}`);

            const filterObj3 = {
              match_id: match.match_id, fancy_id: { $nin: fanciesIds },
              is_active: { $in: [0, 1] }, bet_count: 0, is_result_declared: 0,
            };
            let getFancyStatusBetCount = await Fancy.updateMany(filterObj3, { is_active: 4 });

            logger.info(`${LOG_REF_CODE} 7. InactiveAutoImportFancy Fancy Update to {is_active: 4} Result: ${JSON.stringify(getFancyStatusBetCount)}`);

            if ([0, 0, 0].toString() != [getFancyStatus.modifiedCount, getActiveFancyToInactiveCount.modifiedCount, getFancyStatusBetCount.modifiedCount].toString())
              emitMatchesIds.push(match.match_id);
          }
        }
        if (emitMatchesIds.length)
          return emitMatchesIds;
      }
    } else if (provider == API_PROVIDER) {
      let fancies = await Fancy.find({ is_active: 1, is_result_declared: 0, centralId: { $ne: null } }).select("-_id match_id fancy_id centralId").lean();
      if (fancies.length) {
        let config = {
          method: 'post',
          url: GET_MARKET_STATUS,
          data: {
            "requestFrom": "self",
            "strCentralizedID": fancies.map(data => data.centralId).toString()
          }
        }
        let marketStatus = [];
        try {
          let response = (await axios(config)).data;
          if (response.hasOwnProperty("data")) {
            if (response.data.length)
              marketStatus = response.data;
          }
        } catch (error) {
          marketStatus = []
        }
        if (marketStatus.length) {
          marketStatus = marketStatus.filter(data => data.appMarketStatus == "4");
          if (marketStatus.length) {
            let centralIds = marketStatus.map(data => data.appCentralizedID);
            await Fancy.updateMany({
              centralId: { $in: centralIds }
            }, {
              is_active: 0
            });
            await Fancy.updateMany({
              bet_count: 0, centralId: { $in: centralIds }
            }, {
              is_active: 4
            });
            return [...new Set(fancies.map(data => data.match_id))];
          }
        }
      }
    }
  } catch (error) {
    console.error(error);
    logger.info(`${LOG_REF_CODE} Error 2: InactiveAutoImportFancy Error: ${error.message}`);
  }
}

async function fancyOddsService() {
  Match.find(
    { enable_fancy: 1, is_active: 1, is_result_declared: 0, is_visible: true, is_abandoned: 0, centralId: { "$ne": null } },
    { _id: 0, match_id: 1 }
  ).then(match => {
    match.map(async ({ match_id }) => {
      Fancy.find(
        { match_id, result: null, is_active: 1, centralId: { "$ne": null } },
        { _id: 0, fancy_id: 1 }
      ).then(fancies => {
        if (fancies.length) {
          fancies = fancies.map(item => item.fancy_id);
          client.mget(fancies).then(fancy => {
            fancy = fancy.filter(data => data).map(row => (row = JSON.parse(row), row));
            fancy.map(item => {
              if (item) {
                let fancy_id = `${match_id}_${item.SelectionId}`;
                Fancy.updateOne(
                  { fancy_id },
                  {
                    '$set': {
                      session_value_yes: item.BackPrice1,
                      session_size_yes: item.BackSize1,
                      session_value_no: item.LayPrice1,
                      session_size_no: item.LaySize1,
                      display_message: item.GameStatus,
                      session_live_min_stack: item.Min,
                      session_live_max_stack: item.Max,
                    }
                  }).then().catch(console.error);
              }
            });
            let filteredFancyWithNoData = fancies.filter(value => !fancy.map(item => item.fancy_id).includes(value));
            if (filteredFancyWithNoData.length) {
              filteredFancyWithNoData = filteredFancyWithNoData.map(item => ({
                'updateOne': {
                  'filter': { fancy_id: item },
                  'update': {
                    '$set': {
                      display_message: "SUSPENDED",
                    }
                  }
                }
              }));
              Fancy.bulkWrite(filteredFancyWithNoData).then().catch(console.error);
            }
          }).catch(console.error);
        }
      }).catch(console.error);
    });
  });
}

let getOddsAPI = async (data) => {
  try {
    if (!data.hasOwnProperty('methodName'))
      return resultResponse(NOT_FOUND, "methodName property not found!");
    const { methodName } = data;
    return await methodName(data);
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function getOddsRates(data) {
  try {
    const { API_TYPE } = data;
    const methodName = await getMethodName(PROVIDER_API_FANCY);
    switch (API_TYPE) {
      case INPLAY:
      case DELAY:
        return await getOddsAPI({ ...data, method: 'get', timeout: 100000, methodName: methodName });
      case MANUAL_FANCY_TYPE:
        return await getOddsAPI({ ...data, method: 'post', timeout: 150, methodName: getOddsDiamondManualAPI });
      default:
        return resultResponse(NOT_FOUND, "API_TYPE not found!");
    }
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function getOddsForemostAPI(data) {
  try {
    let { id } = data,
      FANCY_URL = await apiUrlSettingsService.getFancyOddsApiUrl() + id,
      config = {
        method: 'get',
        url: FANCY_URL,
        timeout: 2000
      };
    let response = await axios(config);
    if (response.data) {
      response = response.data;
      if (response.length)
        return resultResponse(SUCCESS, response);
    }
    return resultResponse(NOT_FOUND, "No data found in provider api!");
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function getOddsDiamondAPI(data) {
  try {
    let { id, method, timeout } = data,
      config = {
        method,
        url: GET_FANCY_ODDS_API_INPLAY + id,
        timeout
      };
    let response;
    try {
      response = await axios(config);
    } catch (error) { console.error("GET_FANCY_ODDS_API_INPLAY failed", error.message); }
    let result = getDiamondFormatedData(response);
    return resultResponse(result.statusCode, result.data);
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function getOddsDiamondManualAPI(data) {
  try {
    let { id, method, timeout } = data,
      config = {
        method,
        url: GET_MANUAL_FANCY_ODDS_API_INPLAY,
        timeout,
        headers: {
          'x-app': BRLN_X_APP,
          'Content-Type': 'application/json'
        },
        data: { "eventid": id }
      };
    let response;
    try {
      response = await axios(config);
    } catch (error) { console.error("GET_MANUAL_FANCY_ODDS_API_INPLAY failed", error.message); }
    let result = getDiamondFormatedData(response);
    if (result.statusCode == SUCCESS)
      result.data = result.data.map(data => (data.SelectionId = `${id.substring(0, 2)}${data.SelectionId}`, data));
    return resultResponse(result.statusCode, result.data);
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

function getDiamondFormatedData(response) {
  try {
    if (response)
      if (response.data) {
        response = response.data;
        if (response.hasOwnProperty("success"))
          if (response.success)
            response = response.data;
        if (response.hasOwnProperty("t3"))
          if (response.hasOwnProperty("t3") && response["t3"] != null)
            return resultResponse(SUCCESS, diamondParser(response["t3"]));
      }
    return resultResponse(NOT_FOUND, "No data found in provider api!");
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

function diamondParser(response) {
  return response.filter(data => data).map(element => {
    let data = {
      "SelectionId": element.sid,
      "RunnerName": element.nat,
      "LayPrice1": parseInt(element.l1),
      "LaySize1": parseInt(element.ls1),
      "BackPrice1": parseInt(element.b1),
      "BackSize1": parseInt(element.bs1),
      "GameStatus": element.gstatus,
      "MarkStatus": element.gvalid,
    };
    if (element.hasOwnProperty("ballsess"))
      data["Category"] = element.ballsess;
    if (element.hasOwnProperty("srno"))
      data["Srno"] = element.srno;
    if (element.hasOwnProperty("min"))
      data["Min"] = parseInt(element.min);
    if (element.hasOwnProperty("max"))
      data["Max"] = parseInt(element.max);
    // if (element.hasOwnProperty("remark"))
    //   if (element.remark)
    //     data["news"] = element.remark;
    return data;
  });
}

async function getResult(data) {

  try {
    let url = `${await apiUrlSettingsService.getFancyUrl()}${data.match_id}&fancy_id=${data.fancy_id}&result`;

    let result = (await axios.get(url, { timeout: 3000 })).data;

    if (result.length) {
      return resultResponse(SUCCESS, result[0]);
    }

    return resultResponse(NOT_FOUND, "Result Not Found!");
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

function createOrUpdate(data, select = ['_id'], transaction = false, session) {
  let options = { upsert: true, new: true, runValidators: true };
  if (transaction)
    options["session"] = session;
  return Fancy.findOneAndUpdate(
    { fancy_id: data.fancy_id },
    data,
    options
  ).lean().select(select)
    .then(result => {
      if (result)
        return resultResponse(SUCCESS, result);
      return resultResponse(NOT_FOUND, "Fancy not found!");
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

function editFancyData(request) {
  const { body: data } = request;
  return createOrUpdate(data, Object.keys(data)).then(result => resultResponse(result.statusCode, result.data));
}

async function updateFancyOrder(request) {
  try {
    // Extract body from the request
    const { joiData: body } = request;

    // Prepare bulk update operations for MongoDB
    const data = body.map((item) => ({
      updateOne: {
        filter: { fancy_id: item.fancy_id }, // Match by fancy_id
        update: {
          $set: { category: item.category, chronology: item.chronology }, // Update category and chronology
        },
      },
    }));

    // Execute bulk write operation with unordered updates for better performance
    await Fancy.bulkWrite(data, { ordered: false });

    // Retrieve updated records with specified fields
    const result = await Fancy.find({
      fancy_id: { $in: body.map((item) => item.fancy_id) },
    }).select("-_id fancy_id category chronology"); // Exclude MongoDB _id field

    // Return "not found" response if no records match
    if (!result || result.length === 0) {
      return resultResponse(NOT_FOUND, "Fancy not found!");
    }

    // Return success response with the updated records
    return resultResponse(SUCCESS, { data: result });
  } catch (error) {
    // Handle and return server error
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function getFancyFromCache(params) {
  const { match_id } = params;
  return exchangeService.getFancyLiveData(match_id).then(redisFancy => {
    if (redisFancy.statusCode == CONSTANTS.SUCCESS)
      return resultResponse(SUCCESS, redisFancy.data);
    return resultResponse(NOT_FOUND, redisFancy.data);
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

function getFancies(request) {
  let { match_id, combine } = request.body
    , { user_id, sports_permission, parent_level_ids, check_event_limit, domain_name } = request.User
    , FilterQuery = {
      match_id, is_active: 1, centralId: { "$ne": null },
      '$and': [
        { sport_id: { '$nin': [LIVE_GAME_SPORT_ID.toString(), DIAMOND_CASINO_SPORT_ID, UNIVERSE_CASINO_SPORT_ID] } },
        { sport_id: { '$in': sports_permission.map(data => data.sport_id) } }
      ],
    },
    columns = "-_id fancy_id name fancy_name selection_id is_active is_lock is_created news chronology category session_min_stack session_max_stack session_live_odds_validation";

  if (USER_BLOCK_TYPE == 'DEFAULT') {
    FilterQuery = {
      ...FilterQuery,
      parent_blocked: { '$nin': [...parent_level_ids.map(data => data.user_id), user_id.toString()] },
      self_blocked: { '$nin': [...parent_level_ids.map(data => data.user_id), user_id.toString()] }
    }
  }
  return Fancy.find(FilterQuery).select(columns).sort({ chronology: 1, createdAt: 1 }).lean()
    .then(async data => {
      if (combine) {
        try {
          let fanciesFromCache = await getFancyFromCache({ match_id });
          if (fanciesFromCache.statusCode == SUCCESS) {
            fanciesFromCache = fanciesFromCache.data;
            for (const fancy of data) {
              fancy.LayPrice1 = 0; fancy.LaySize1 = 0; fancy.BackPrice1 = 0; fancy.BackSize1 = 0;
              fancy.backLayLength = 1;
              fancy.GameStatus = SUSPENDED; fancy.MarkStatus = ""; fancy.Min = 0; fancy.Max = 0;
              let redisFancy = fanciesFromCache.find(redisFancy => redisFancy.fancy_id == fancy.fancy_id);
              if (redisFancy) {
                const {
                  // LayPrice1, LaySize1, BackPrice1, BackSize1, 
                  GameStatus, MarkStatus, Min, Max, backLayLength,
                } = redisFancy;

                const tempBackLayData = {};
                for (let i = 1; i <= (backLayLength || 1); i++) {
                  tempBackLayData[`LayPrice${i}`] = redisFancy[`LayPrice${i}`]
                  tempBackLayData[`LaySize${i}`] = redisFancy[`LaySize${i}`]
                  tempBackLayData[`BackPrice${i}`] = redisFancy[`BackPrice${i}`]
                  tempBackLayData[`BackSize${i}`] = redisFancy[`BackSize${i}`]
                }

                redisFancy = {
                  // LayPrice1, LaySize1, BackPrice1, BackSize1,
                  ...tempBackLayData,
                  GameStatus, MarkStatus, Min, Max,
                  backLayLength: (backLayLength || 1),
                };

                // redisFancy = (
                //   ({ LayPrice1, LaySize1, BackPrice1, BackSize1, GameStatus, MarkStatus, Min, Max }) =>
                //     ({ LayPrice1, LaySize1, BackPrice1, BackSize1, GameStatus, MarkStatus, Min, Max })
                // )(redisFancy);

                if (check_event_limit == false) { // if user limit is enabled.
                  redisFancy.session_live_odds_validation = false; // Session setting is disabling.
                  redisFancy.user_setting_limit = true;
                } else {
                  redisFancy.user_setting_limit = false; //  user limit is disabled
                  let getWebsiteSettings = await websiteService.getWebsiteSettingsFromCache({
                    domain_name,
                  });
                  let diamond_rate_limit_enabled = false;
                  if (getWebsiteSettings.statusCode == SUCCESS) {
                    diamond_rate_limit_enabled =
                      getWebsiteSettings.data.diamond_rate_limit_enabled;
                  }
                  if (diamond_rate_limit_enabled) {
                    // Assign Min and Max based on session_live_odds_validation
                    if (fancy.session_live_odds_validation == true) {
                      if (redisFancy.hasOwnProperty("Min"))
                        redisFancy.Min = parseInt(redisFancy.Min);
                      if (redisFancy.hasOwnProperty("Max"))
                        redisFancy.Max = parseInt(redisFancy.Max);
                    } else {
                      if (fancy.hasOwnProperty("session_min_stack"))
                        redisFancy.Min = fancy.session_min_stack;
                      if (fancy.hasOwnProperty("session_max_stack"))
                        redisFancy.Max = fancy.session_max_stack;
                    }
                  } else {
                    if (fancy.hasOwnProperty("session_min_stack"))
                      redisFancy.Min = fancy.session_min_stack;
                    if (fancy.hasOwnProperty("session_max_stack"))
                      redisFancy.Max = fancy.session_max_stack;
                  }
                  // delete fancy.session_min_stack;
                  // delete fancy.session_max_stack;
                }
                Object.assign(fancy, redisFancy);
              }
            }
          }
        } catch (error) { }
      }
      return resultResponse(SUCCESS, { data, fancy_category: FANCY_CATEGORY });
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

async function getFancyLiveDataV2({ match_id, category }) {
  try {
    const pattern = `${FANCY_KEY}${match_id}:*${UNIQUE_IDENTIFIER_KEY}`;
    const keys = await client.keys(pattern);

    if (!keys.length) {
      return resultResponse(CONSTANTS.VALIDATION_ERROR, { msg: "No Fancies Found !!" });
    }

    let fanciesDataRedis = await client.mget(keys);
    const fanciesOddsData = [];

    fanciesDataRedis = fanciesDataRedis
      .map((i) => JSON.parse(i))
      .filter((i) => {
        const {
          is_active,
          centralId,
        } = i;

        // Check Is Active
        const checkIsActive = is_active == 1;

        // Check Is Central Id Not NULL
        const checkIsCentralId = centralId != null;

        const checkCategory = category ? i.category == category : true;

        return (
          checkIsActive &&
          checkIsCentralId &&
          checkCategory
        );
      });

    fanciesDataRedis.map(i => {
      if (i) {
        const oddsObj = i?.oddsObj;
        if (oddsObj) {
          fanciesOddsData.push(oddsObj);
        }
      }
    });

    return resultResponse(SUCCESS, fanciesOddsData);
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function getFancyD247API(data) {
  try {
    let { id, timeout } = data;
    let response;
    try {
      response = await axios.get(GET_FANCY_ODDS_API_INPLAY_d247 + id, { timeout });
      if (response && response.data.data != undefined) {
        const data = response.data.data;
        const finalData = data
          .filter(item => item.gtype === CONSTANTS.FANCY)
          .flatMap(item => item.section.map(section => {
            item.mname = (item.mname.toLowerCase()).trim();

            const backLayData = {};
            const backLayLength = section.odds.length / 2;

            for (let i = 1; i <= backLayLength; i++) {
              backLayData[`LayPrice${i}`] = getOddsAndSizeValue(section.odds, CONSTANTS.LAY, `${CONSTANTS.LAY}${i}`, CONSTANTS.ODDS)
              backLayData[`LaySize${i}`] = getOddsAndSizeValue(section.odds, CONSTANTS.LAY, `${CONSTANTS.LAY}${i}`, CONSTANTS.SIZE)
              backLayData[`BackPrice${i}`] = getOddsAndSizeValue(section.odds, CONSTANTS.BACK, `${CONSTANTS.BACK}${i}`, CONSTANTS.ODDS)
              backLayData[`BackSize${i}`] = getOddsAndSizeValue(section.odds, CONSTANTS.BACK, `${CONSTANTS.BACK}${i}`, CONSTANTS.SIZE)
            }

            return {
              SelectionId: safeToString(section.sid),
              RunnerName: section.nat,
              ...backLayData,
              backLayLength,
              // LayPrice1: getOddsAndSizeValue(section.odds, CONSTANTS.LAY, CONSTANTS.LAY1, CONSTANTS.ODDS),
              // LaySize1: getOddsAndSizeValue(section.odds, CONSTANTS.LAY, CONSTANTS.LAY1, CONSTANTS.SIZE),
              // BackPrice1: getOddsAndSizeValue(section.odds, CONSTANTS.BACK, CONSTANTS.BACK1, CONSTANTS.ODDS),
              // BackSize1: getOddsAndSizeValue(section.odds, CONSTANTS.BACK, CONSTANTS.BACK1, CONSTANTS.SIZE),
              GameStatus: safeToString(section.gstatus),
              MarkStatus: "0",
              Min: section.min,
              Max: section.max,
              fancy_id: `${safeToString(id)}_${safeToString(section.sid)}`
            };
          }));
        return resultResponse(SUCCESS, finalData);
      } else {
        return resultResponse(SUCCESS, []);
      }
    } catch (error) {
      console.error("GET_MANUAL_FANCY_ODDS_API_INPLAY_247 failed", error.message);
    }
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function getFancyPARKER777API(data) {
  try {
    let { id, timeout } = data;
    let response;
    try {
      response = await axios.get(GET_FANCY_ODDS_API_INPLAY_PARKER777 + id, { timeout });
      if (response && response?.data?.data) {

        const { status, data } = response.data || {};
        const fancies = Object.values(data || {});

        if (!fancies.length) {
          return resultResponse(SUCCESS, []);
        }

        const finalData = fancies.map((item, index) => {
          item = JSON.parse(item);

          const backLayData = {};
          let backLayLength = 3;
          for (let i = 1; i <= backLayLength; i++) {

            if (i != 1) {

              if (item[`l${i}`] == 0 &&
                item[`ls${i}`] == 0 &&
                item[`b${i}`] == 0 &&
                item[`bs${i}`] == 0) {

                backLayLength = i - 1;
                break;
              }
            }
            backLayData[`LayPrice${i}`] = Number(item[`l${i}`]) || 0;
            backLayData[`LaySize${i}`] = Number(item[`ls${i}`]) || 0;
            backLayData[`BackPrice${i}`] = Number(item[`b${i}`]) || 0;
            backLayData[`BackSize${i}`] = Number(item[`bs${i}`]) || 0;
          }

          const res = {
            SelectionId: Number(item.id),
            RunnerName: item.name,
            ...backLayData,
            backLayLength,
            GameStatus: safeToString(item.status1 == "ACTIVE" ? "" : item.status1),
            MarkStatus: item.bet_allow == "1" ? "0" : "1",
            Min: Number(item.min_bet) || 0,
            Max: Number(item.max_bet) || 0,
            fancy_id: `${safeToString(id)}_${safeToString(item.id)}`
          }
          return res;
        });

        return resultResponse(SUCCESS, finalData);
      } else {
        return resultResponse(SUCCESS, []);
      }
    } catch (error) {
      console.error("GET_MANUAL_FANCY_ODDS_API_INPLAY_247 failed", error.message);
    }
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}
// Helper function to safely get the string representation of a property
const safeToString = (prop) => (prop !== undefined && prop !== null) ? prop.toString() : "";

// Helper function to safely access odds
const getOddsAndSizeValue = (odds, otype, oname, field) => {
  const odd = odds.find(o => o.otype === otype && o.oname === oname);
  if (field === "odds") {
    return odd ? odd.odds : 0;
  } else {
    return odd ? odd.size : 0;
  }
};

async function getMethodName(provider) {
  let methodName;

  switch (provider) {
    case "D247":
      methodName = getFancyD247API;
      break;
    case "PARKER777":
      methodName = getFancyPARKER777API;
      break;
    default:
      methodName = getOddsDiamondAPI;
      break;
  }

  return methodName;
}

async function getFanciesOpen(req) {
  const body = req.joiData;
  let FilterQuery = { match_id: body.match_id, is_active: 1, centralId: { "$ne": null } }
    , columns = `-_id fancy_id fancy_name session_value_yes session_value_no session_size_no session_size_yes display_message 
          session_min_stack session_max_stack`;
  return Fancy.find(FilterQuery).select(columns).lean()
    .then(data => resultResponse(SUCCESS, data))
    .catch(error => resultResponse(SERVER_ERROR, error.message));
}

async function getFanciesCategory(req) {
  try {
    const { match_id } = req.joiData;
    const user_id = req.joiData.user_id || req.User._id;
    const match = await Match.findOne({ match_id }).select("_id session_category_locked").lean().exec();

    if (!match) {
      return resultResponse(CONSTANTS.VALIDATION_ERROR, { msg: "Invalid MatchId Provided !!" });
    }
    const session_category_locked = match.session_category_locked || {};

    let FilterQuery = {
      match_id,
      is_result_declared: 0,
      is_active: 1,
      is_visible: true,
      centralId: { $ne: null },
    };
    const fancyData = await Fancy.aggregate([
      { $match: FilterQuery },
      { $group: { _id: "$category" } }
    ]).exec();

    const response = fancyData.map(({ _id: category }) => {
      let is_active = true;
      const { parent_blocked, self_blocked } = session_category_locked[category] || {};

      if ((parent_blocked?.length && parent_blocked.includes(user_id.toString())) ||
        (self_blocked?.length && self_blocked.includes(user_id.toString()))) {
        is_active = false;
      }

      return {
        category,
        category_name: CONSTANTS.FANCY_CATEGORY_DIAMOND[category],
        is_active
      }
    }).sort((a, b) => a.category - b.category);

    return resultResponse(SUCCESS, {
      msg: "Fancy Category Fetched Successfully.",
      data: response,
    });

  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }

}


module.exports = {
  createFancy,
  checkFancyExist,
  updatefancyData,
  getFancy,
  updateFancyStatus,
  getDeactiveFancy,
  deleteDeactiveFancy,
  createDeactiveFancy,
  checkParentIdsDeactiveFancy,
  getAllFancyByMatchId,
  getAllFancyForAgentsByMatchId,
  getFancyDetail,
  getFancyDetails,
  getFancyByFancyId,
  getResult,
  getRunTimeFancyPosition,
  getFancyPosition,
  getMatchesForFancyResult,
  results,
  fancyStake,
  fancyStakeUsersWise,
  getOnlineFancyList,
  autoImportFancy,
  inactiveAutoImportFancy,
  fancyOddsService,
  getFancyLiabilityBySharing,
  editFancyData,
  getOddsAPI,
  getOddsDiamondAPI,
  getFancies,
  getOddsRates,
  getFancyD247API,
  getFancyLiveDataV2,
  getFanciesOpen,
  // Fancy Redis Service
  updateFanciesInRedis,
  deleteFanciesInRedis,
  fancyDumpRedis,
  getFanciesV2,
  manualFancyOddsDumpRedis,
  updateFancyOrder,
  createFancyLiability,

  getFanciesCategory,
};
