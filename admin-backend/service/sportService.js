const Sports = require('../../models/sports');
const Market = require('../../models/market');
const GameLock = require('../../models/gameLock');
const DeactiveSport = require('../../models/deactiveSport');
const sportServiceQuery = require('./sportServiceQuery');
const CONSTANTS = require('../../utils/constants');
const globalFunction = require('../../utils/globalFunction');
let resultResponse = globalFunction.resultResponse;
let { ObjectId } = require("bson");
const { USER_BLOCK_TYPE } = require('../../config/constant/user');

let isSportDataExists = async (sport_id) => {
  try {
    let sportDetails = await Sports.findOne({ sport_id }).select("_id is_active is_visible").lean();
    if (sportDetails)
      return resultResponse(CONSTANTS.SUCCESS, sportDetails);
    else
      return resultResponse(CONSTANTS.NOT_FOUND, "Sports data not found!");
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

let validateUserAndParentSportsSettings = async (userSportSetting, parentSportSetting) => {
  try {
    if (userSportSetting.market_fresh_delay < parentSportSetting.market_fresh_delay)
      return resultResponse(CONSTANTS.VALIDATION_FAILED, { message: ` ${userSportSetting.name} Market fresh delay can not be less than parent market fresh delay` });
    else if (userSportSetting.market_min_stack < parentSportSetting.market_min_stack || userSportSetting.market_min_stack >= userSportSetting.market_max_stack) {
      if (userSportSetting.market_min_stack < parentSportSetting.market_min_stack)
        return resultResponse(CONSTANTS.VALIDATION_FAILED, { message: ` ${userSportSetting.name} Market min stack can not be less than parent market min stack` });
      else
        return resultResponse(CONSTANTS.VALIDATION_FAILED, { message: ` ${userSportSetting.name} Market min stack can not be greater than or equal to market max stack` });
    }
    else if (userSportSetting.market_max_stack > parentSportSetting.market_max_stack || userSportSetting.market_max_stack <= userSportSetting.market_min_stack) {
      if (userSportSetting.market_max_stack > parentSportSetting.market_max_stack)
        return resultResponse(CONSTANTS.VALIDATION_FAILED, { message: ` ${userSportSetting.name} Market max stack can not be greater than parent market max stack` });
      else
        return resultResponse(CONSTANTS.VALIDATION_FAILED, { message: `  ${userSportSetting.name} Market max stack can not be less than or equal to market min stack` });
    }
    // else if (userSportSetting.market_max_loss > parentSportSetting.market_max_loss)
    //   return resultResponse(CONSTANTS.VALIDATION_FAILED, { message: `  ${userSportSetting.name} Market max loss can not be greater than parent market max loss` });
    else if (userSportSetting.market_max_profit > parentSportSetting.market_max_profit)
      return resultResponse(CONSTANTS.VALIDATION_FAILED, { message: `  ${userSportSetting.name} Market max profit can not be greater than parent market max profit` });
    // else if (userSportSetting.market_rate_limit > parentSportSetting.market_rate_limit)
    //   return resultResponse(CONSTANTS.VALIDATION_FAILED, { message: `  ${userSportSetting.name} Market rate limit can not be greater than parent market rate limit` });
    // else if (userSportSetting.point_place_before_in_play > parentSportSetting.point_place_before_in_play)
    //   return resultResponse(CONSTANTS.VALIDATION_FAILED, { message: `  ${userSportSetting.name} Point place before in play can not be greater than parent point place before in play` });
    else if (userSportSetting.sport_id == 4) {
      if (userSportSetting.session_fresh_delay < parentSportSetting.session_fresh_delay)
        return resultResponse(CONSTANTS.VALIDATION_FAILED, { message: ` ${userSportSetting.name} Session fresh delay can not be less than parent session fresh delay` });
      else if (userSportSetting.session_min_stack < parentSportSetting.session_min_stack || userSportSetting.session_min_stack >= userSportSetting.session_max_stack) {
        if (userSportSetting.session_min_stack < parentSportSetting.session_min_stack)
          return resultResponse(CONSTANTS.VALIDATION_FAILED, { message: `  ${userSportSetting.name} Session min stack can not be less than parent session min stack` });
        else
          return resultResponse(CONSTANTS.VALIDATION_FAILED, { message: ` ${userSportSetting.name} Session min stack can not be greater than or equal session max stack` });
      } else if (userSportSetting.session_max_stack > parentSportSetting.session_max_stack || userSportSetting.session_max_stack <= userSportSetting.session_min_stack) {
        if (userSportSetting.session_max_stack > parentSportSetting.session_max_stack)
          return resultResponse(CONSTANTS.VALIDATION_FAILED, { message: ` ${userSportSetting.name} Session max stack can not be greater than parent session max stack` });
        else
          return resultResponse(CONSTANTS.VALIDATION_FAILED, { message: ` ${userSportSetting.name} Session max stack can not be less than or equal to session min stack` });
      }
      // else if (userSportSetting.session_max_loss > parentSportSetting.session_max_loss)
      //   return resultResponse(CONSTANTS.VALIDATION_FAILED, { message: `  ${userSportSetting.name} Session max loss can not be greater than parent session max loss` });
      // else if (userSportSetting.session_max_profit > parentSportSetting.session_max_profit)
      //   return resultResponse(CONSTANTS.VALIDATION_FAILED, { message: `  ${userSportSetting.name} Session max profit can not be greater than parent session max profit` });
      // else if (userSportSetting.session_per_rate_max_stack > parentSportSetting.session_per_rate_max_stack)
      //   return resultResponse(CONSTANTS.VALIDATION_FAILED, { message: `  ${userSportSetting.name} Session per rate max stack can not be greater than parent session per rate max stack` });
      else
        return resultResponse(CONSTANTS.SUCCESS, { message: 'valid success' });
    }
    else
      return resultResponse(CONSTANTS.SUCCESS, { message: 'valid success' });
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

let updateSportsStatus = async (sport_id, is_active) => {
  try {
    let updateAndGetSportStatus = await Sports.findOneAndUpdate({ sport_id: sport_id }, { $set: { is_active: is_active } }, { fields: { is_active: 1 }, new: true }).lean();
    if (updateAndGetSportStatus)
      return resultResponse(CONSTANTS.SUCCESS, updateAndGetSportStatus);
    else
      return resultResponse(CONSTANTS.NOT_FOUND);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

let getDeactiveSport = async (data) => {
  try {
    let resFromDB = await DeactiveSport.findOne({ user_id: data.user_id, sport_id: data.sport_id }).lean();
    if (resFromDB) {
      return resultResponse(CONSTANTS.SUCCESS, resFromDB);
    } else {
      return resultResponse(CONSTANTS.NOT_FOUND);
    }
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

let deleteDeactiveSport = async (data) => {
  try {
    let resFromDB = await DeactiveSport.deleteOne({ user_id: data.user_id, sport_id: data.sport_id }).lean();
    return resultResponse(CONSTANTS.SUCCESS, resFromDB);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

let createDeactiveSport = async (data) => {
  try {
    let resFromDB = await DeactiveSport.create(data);
    return resultResponse(CONSTANTS.SUCCESS, resFromDB);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

let getAllActiveSports = async () => {
  try {
    let activeSports = await Sports.find({ is_active: 1 }).lean();
    return resultResponse(CONSTANTS.SUCCESS, activeSports);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

let getAllSports = async (FilterQuery = {}, Projection = {}, sort = {}) => {
  try {
    let sportsResult = await Sports.find(FilterQuery, Projection).sort(sort);
    if (sportsResult)
      return resultResponse(CONSTANTS.SUCCESS, sportsResult);
    else
      return resultResponse(CONSTANTS.NOT_FOUND, CONSTANTS.DATA_NULL);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, error.message);
  }
};

let getUserAndParentAllDeactiveSport = async (userAndAllParentIds) => {
  try {
    let resFromDB = await DeactiveSport.find({ user_id: { $in: userAndAllParentIds } }).lean();
    if (resFromDB)
      return resultResponse(CONSTANTS.SUCCESS, resFromDB);
    else
      return resultResponse(CONSTANTS.NOT_FOUND);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

let isSportIsActive = async (sport_id) => {
  try {
    let resFromDB = await Sports.findOne({ sport_id: sport_id }, { sport_id: 1, is_active: 1 }).lean();
    if (resFromDB)
      return resultResponse(CONSTANTS.SUCCESS, resFromDB.is_active);
    else
      return resultResponse(CONSTANTS.NOT_FOUND);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

let checkParentIdsDeactiveSport = async (sport_id, parentIds) => {
  try {
    let resFromDB = await DeactiveSport.findOne({ sport_id: sport_id, user_id: { $in: parentIds } }).lean();
    if (resFromDB) {
      return resultResponse(CONSTANTS.SUCCESS, resFromDB);
    } else {
      return resultResponse(CONSTANTS.NOT_FOUND);
    }
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

let getParentsAllDeactiveSport = async (parentIds) => {
  try {
    let resFromDB = await DeactiveSport.find({ user_id: { $in: parentIds } }).lean();
    if (resFromDB)
      return resultResponse(CONSTANTS.SUCCESS, resFromDB);
    else
      return resultResponse(CONSTANTS.NOT_FOUND);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

let getSportBySportId = async (sport_id) => {
  try {
    let sportDetails = await Sports.findOne({ sport_id: sport_id }).lean();
    if (sportDetails)
      return resultResponse(CONSTANTS.SUCCESS, sportDetails);
    else
      return resultResponse(CONSTANTS.NOT_FOUND, CONSTANTS.DATA_NULL);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

let getAllSportsNotInDeactiveSports = async (deactiveSportsIds) => {
  try {
    let activeSports = await Sports.find({ sport_id: { $nin: deactiveSportsIds } }).lean();
    if (activeSports)
      return resultResponse(CONSTANTS.SUCCESS, activeSports);
    else
      return resultResponse(CONSTANTS.NOT_FOUND, CONSTANTS.DATA_NULL);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

async function getAgentSports(parentIds, user_id, sports_permission) {
  try {
    let query = sportServiceQuery.getAgentSports(parentIds, user_id, sports_permission);
    let result = await Sports.aggregate(query);
    if (result)
      return resultResponse(CONSTANTS.SUCCESS, result);
    else
      return resultResponse(CONSTANTS.NOT_FOUND);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, error.message);
  }
}

async function getSportsDetails(FilterQuery = {}, Projection = {}, findOne = false) {
  try {
    let matchDetails;
    if (findOne)
      matchDetails = await Sports.findOne(FilterQuery, Projection);
    else
      matchDetails = await Sports.find(FilterQuery, Projection);
    if (matchDetails)
      return resultResponse(CONSTANTS.SUCCESS, matchDetails);
    else
      return resultResponse(CONSTANTS.NOT_FOUND, CONSTANTS.DATA_NULL);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, error.message);
  }
};

async function getSportDetails(FilterQuery = {}, Projection = {}) {
  return await getSportsDetails(FilterQuery, Projection, true);
}

function getMatchCountQuery(userIds) {
  let matchObj = {
    is_active: 1, is_visible: true, is_abandoned: 0, is_result_declared: 0,
    sport_id: { $in: [CONSTANTS.CRICKET, CONSTANTS.SOCCER, CONSTANTS.TENNIS] },
    // market_type: CONSTANTS.MATCH_ODDS_TYPE,
  }

  if (USER_BLOCK_TYPE == 'DEFAULT') {
    matchObj = {
      ...matchObj,
      parent_blocked: { '$nin': userIds },
      self_blocked: { '$nin': userIds }
    }
  }
  return [
    {
      $match: matchObj
    },
    {
      $group: {
        _id: "$sport_id",
        count: { $count: {} }
      }
    }
  ]
}

function getMarketCountQuery(userIds) {
  let matchObj = {
    is_active: 1, is_visible: true, is_result_declared: 0,
    sport_id: { $in: [CONSTANTS.HR, CONSTANTS.GHR] },
    market_id: { '$regex': '.+(?<!_m)$' },
  }

  if (USER_BLOCK_TYPE == 'DEFAULT') {
    matchObj = {
      ...matchObj,
      parent_blocked: { '$nin': userIds },
      self_blocked: { '$nin': userIds }
    }
  }
  return [
    {
      $match: matchObj
    },
    {
      $group: {
        _id: "$sport_id",
        count: { $count: {} }
      }
    }
  ]
}

async function userLockV1(req) {
  try {
    let { user_id } = req.joiData;
    user_id = ObjectId(user_id ? user_id : (req.User.user_id || req.User._id));
    const parent_id = ObjectId(req.User.user_id || req.User._id);
    let query = sportServiceQuery.userLockV1({ user_id });
    let result = await Market.aggregate(query);
    let gamelockData = await GameLock.find({ user_id: user_id, parent_id });

    // console.log("%j", query)
    const groupedData = gamelockData.reduce((acc, lock) => {
      const { sport_id, series_id, match_id, market_id, category, is_self_block, event } = lock;

      // for sport_id
      if (
        // sport_id !== undefined && series_id === undefined && 
        // match_id === undefined && market_id === undefined && category === undefined
        event == "Sport"
      ) {
        acc.sports = acc.sports || {};
        if (!acc.sports[sport_id]) {
          acc.sports[sport_id] = is_self_block;
        }
      }

      // for series_id
      if (
        // sport_id !== undefined && series_id !== undefined && 
        // match_id === undefined && market_id === undefined && category === undefined
        event == "Series"
      ) {
        acc.series = acc.series || {};
        if (!acc.series[series_id]) {
          acc.series[series_id] = is_self_block;
        }
      }

      // for match_id
      if (
        // sport_id !== undefined && series_id !== undefined && 
        // match_id !== undefined && market_id === undefined && category === undefined
        event == "Match"
      ) {
        acc.matches = acc.matches || {};
        if (!acc.matches[match_id]) {
          acc.matches[match_id] = is_self_block;
        }
      }

      // for market_id
      if (
        // sport_id !== undefined && series_id !== undefined && 
        // match_id !== undefined && market_id !== undefined && category === undefined
        event == "Market"
      ) {
        acc.markets = acc.markets || {};
        if (!acc.markets[market_id]) {
          acc.markets[market_id] = is_self_block;
        }
      }

      // for fancy
      if (
        // sport_id !== undefined && series_id !== undefined && 
        // match_id !== undefined && category !== undefined
        event == "Fancy"
      ) {
        acc.category = acc.category || {};
        if (!acc.category[`${match_id}_${category}`]) {
          acc.category[`${match_id}_${category}`] = is_self_block;
        }
      }

      return acc;
    }, {});

    const updatedResult = result.map(sport => {
      sport.is_self_block = groupedData?.sports?.hasOwnProperty(sport.sport_id) ?? false;
      const updatedSeries = sport.series.map(series => {
        series.is_self_block = groupedData?.series?.hasOwnProperty(series.series_id) ?? false;
        const updatedMatches = series.matches.map(match => {
          match.is_self_block = groupedData?.matches?.hasOwnProperty(match.match_id) ?? false;
          const updatedMarkets = match.Match.map(market => {
            if (market.type == "market")
              market.is_self_block = groupedData?.markets?.hasOwnProperty(market.market_id) ?? false;
            if (market.type == "fancy")
              market.is_self_block = groupedData?.category?.hasOwnProperty(`${match.match_id}_${market.category}`) ?? false;

            return market;
          });

          return match
        });
        return series
      });
      return sport
    });
    if (updatedResult)
      return resultResponse(CONSTANTS.SUCCESS, updatedResult.sort((a, b) => Number(a.sport_id) - Number(b.sport_id)));
    else
      return resultResponse(CONSTANTS.NOT_FOUND);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, error.message);
  }
}

async function getLiveCasinoSports(req) {
  try {
    let result = await Sports.find({ casinoProvider: "QT" }, {
      name: 1, providerCode: 1, _id: 0
    }).lean().exec();
    if (result)
      return resultResponse(CONSTANTS.SUCCESS, result);
    else
      return resultResponse(CONSTANTS.NOT_FOUND);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, error.message);
  }
}

module.exports = {
  validateUserAndParentSportsSettings, updateSportsStatus, getDeactiveSport,
  deleteDeactiveSport, createDeactiveSport, getAllActiveSports, getAllSports,
  getUserAndParentAllDeactiveSport, isSportIsActive, checkParentIdsDeactiveSport,
  getParentsAllDeactiveSport, getSportBySportId, getAllSportsNotInDeactiveSports,
  getAgentSports, getSportsDetails, getSportDetails, isSportDataExists,
  getMatchCountQuery, getMarketCountQuery,
  userLockV1,
  getLiveCasinoSports,
}