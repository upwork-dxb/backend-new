const { ObjectId } = require("bson")
  , axios = require('axios')
  , _ = require('lodash')
  , moment = require('moment')
  , User = require('../../models/user')
  , Match = require('../../models/match')
  , Market = require('../../models/market')
  , Fancy = require('../../models/fancy')
  , marketSelections = require('../../models/marketSelection')
  , DeactiveMarket = require('../../models/deactiveMarket')
  , OddsProfitLoss = require('../../models/oddsProfitLoss')
  , BetsOdds = require('../../models/betsOdds')
  , BetResults = require('../../models/betResults')
  , userService = require('./userService')
  , apiUrlSettingsService = require('./apiUrlSettingsService')
  , marketQueryService = require('./marketQueryService')
  , client = require("../../connections/redisConnections")
  , globalFunction = require('../../utils/globalFunction')
  , CONSTANTS = require('../../utils/constants')
  , betQueryService = require("./betQueryService")
  , logger = require("../../utils/loggers")
  , {
    SUCCESS, NOT_FOUND, SERVER_ERROR, USER_TYPE_USER, GET_MARKET_STATUS, LIVE_GAME_SPORT_ID, DIAMOND_CASINO_SPORT_ID,
    GET_ODDS_API_INPLAY, GET_ODDS_API_DELAY, GET_MANUAL_ODDS_API_INPLAY, REMOVED, WINNER, LOSER, INPLAY, DELAY, HR, GHR,
    MANUAL_BOOKMAKER_TYPE, BRLN_X_APP, UNIVERSE_CASINO_SPORT_ID, MATCH_ODDS_TYPE, BOOKMAKER_TYPE, TIED_MATCH_TYPE, CRICKET
  } = require('../../utils/constants')
  , { getChunkSize, blockEvent, getTimeTaken } = require('../../utils')
  , ODDS_ = "ODDS_";

// Market Redis Service
const { marketsDumpRedis,
  updateMarketsInRedis,
  getMarketFronRedis,
  suspendMarketsInRedis,
  manualMarketOddsDumpRedis,
} = require('./market/marketRedisService');
// Market User Book
const { diamondUserBook,
} = require('./market/marketUserBook');

const { setTWTTRates } = require('./market/setTWTTRates');

const PROVIDER_API_BOOKMAKER = process.env.PROVIDER_API_BOOKMAKER;
let resultResponse = globalFunction.resultResponse;

async function checkMarketExist(market_id) {
  try {
    let checkMarketExist = await Market.findOne({ market_id }, { market_id: 1, _id: 0 });
    if (checkMarketExist != null)
      if (checkMarketExist["market_id"])
        return resultResponse(SUCCESS, true);
    return resultResponse(NOT_FOUND, false);
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function updateMarketStatus(market_id, is_active) {
  try {
    let resFromDB = await Market.updateOne({ market_id }, { $set: { is_active } }).lean();
    if (resFromDB.modifiedCount)
      return Market.findOne({ market_id }).lean().select("-_id match_id")
        .then(market => resultResponse(CONSTANTS.SUCCESS, market))
        .catch(error => resultResponse(SERVER_ERROR, error.message));
    else if (!resFromDB.matchedCount)
      return resultResponse(CONSTANTS.NOT_FOUND, CONSTANTS.DATA_NULL);
    else
      return resultResponse(CONSTANTS.ALREADY_EXISTS, CONSTANTS.DATA_NULL);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, error.message);
  }
};

async function getDeactiveMarket(data) {
  try {
    let resFromDB = await DeactiveMarket.findOne(data, {
      _id: 1,
      block_by_parent: 1
    }).lean();
    if (resFromDB)
      return resultResponse(CONSTANTS.SUCCESS, resFromDB);
    else
      return resultResponse(CONSTANTS.NOT_FOUND);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, error.message);
  }
};

async function deleteDeactiveMarket(data) {
  try {
    let resFromDB = await DeactiveMarket.deleteOne({
      user_id: data.user_id,
      market_id: data.market_id
    });
    return resultResponse(CONSTANTS.SUCCESS, resFromDB);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

async function createDeactiveMarket(data) {
  try {
    let createDeactiveRes = await DeactiveMarket.create(data);
    return resultResponse(CONSTANTS.SUCCESS, createDeactiveRes);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

async function checkParentIdsDeactiveMarket(market_id, parentIds) {
  try {
    let resFromDB = await DeactiveSeries.findOne({ market_id: market_id, user_id: { $in: parentIds } }).lean();
    if (resFromDB) {
      return resultResponse(CONSTANTS.SUCCESS, resFromDB);
    } else {
      return resultResponse(CONSTANTS.NOT_FOUND);
    }
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

async function getAllMarkets(FilterQuery = {}, Projection = {}) {
  try {
    let matchDetails = await Market.find(FilterQuery, Projection);
    if (matchDetails)
      return resultResponse(CONSTANTS.SUCCESS, matchDetails);
    else
      return resultResponse(CONSTANTS.NOT_FOUND, CONSTANTS.DATA_NULL);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, error.message);
  }
};

async function getUserAndParentAllDeactiveMarket(userAndAllParentIds) {
  try {
    let resFromDB = await DeactiveMarket.find({ user_id: { $in: userAndAllParentIds } }).lean();
    if (resFromDB)
      return resultResponse(CONSTANTS.SUCCESS, resFromDB);
    else
      return resultResponse(CONSTANTS.NOT_FOUND);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

async function getAllMarketsNotInDeactiveMarket(deactiveMarketIds, getMarketFieldsName) {
  try {
    let activeMarket = await Market.find({ market_id: { $nin: deactiveMarketIds } }, getMarketFieldsName).lean();
    if (activeMarket)
      return resultResponse(CONSTANTS.SUCCESS, activeMarket);
    else
      return resultResponse(CONSTANTS.NOT_FOUND, CONSTANTS.DATA_NULL);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

async function getAllMarketForAgents(match_id, sport_id, parentIds, user_id) {
  try {
    let query = marketQueryService.getMarketQueryForAgents(match_id, sport_id, parentIds, user_id);
    let result = await Market.aggregate(query);
    if (result)
      return resultResponse(CONSTANTS.SUCCESS, result);
    else
      return resultResponse(CONSTANTS.NOT_FOUND);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

let getDataByMarketId = async (FilterQuery = {}, Projection = {}) => {
  return await getMarketDetails(FilterQuery, Projection, true);
}

function getMarketDetails(FilterQuery = {}, Projection = {}, populates = [], findOne = false) {
  let marketData;
  if (findOne)
    marketData = Market.findOne(FilterQuery);
  else
    marketData = Market.find(FilterQuery);
  marketData.select(Array.isArray(Projection) ? Projection : Projection);
  if (populates.length) {
    populates.map(populate => {
      marketData.populate(
        Object.keys(populate).toString(),
        populate[Object.keys(populate).toString()]
      );
    });
  }
  return marketData
    .lean()
    .then(market => {
      if (market != null)
        if (Object.keys(market).length || market.length)
          return resultResponse(CONSTANTS.SUCCESS, market);
      return resultResponse(CONSTANTS.NOT_FOUND, "Market(s) or it's Setting(s) not found!");
    }).catch(error => resultResponse(CONSTANTS.SERVER_ERROR, error.message));
};

function getMarketDetail(FilterQuery = {}, Projection = {}, populates = []) {
  return getMarketDetails(FilterQuery, Projection, populates, true).then();
}

let getSelectionByMarketId = async (FilterQuery, Projection) => {
  try {
    let selections = await Market.findOne(FilterQuery, Projection);
    if (selections)
      return resultResponse(CONSTANTS.SUCCESS, selections);
    else
      return resultResponse(CONSTANTS.NOT_FOUND, CONSTANTS.DATA_NULL);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

function results(params) {
  let query = marketQueryService.ResultQuery(params);
  return Market.aggregate(query).then(markets => {
    if (markets.length)
      return resultResponse(SUCCESS, markets);
    else
      return resultResponse(NOT_FOUND, "No markets available to declare the result!");
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

function getMarketAgentUserPositions(params, parents) {
  let { user_id, parent_id, market_id, user_type_id, master_book, user_book } = params;
  let parentsAndViewer = JSON.parse(JSON.stringify(parents));
  parentsAndViewer = parentsAndViewer.map(o => ObjectId(o));
  let FilterQuery = { parent_id: user_id };
  if (master_book)
    FilterQuery["user_type_id"] = { '$ne': USER_TYPE_USER };
  if (user_book)
    FilterQuery["user_type_id"] = USER_TYPE_USER;
  return userService.getUsersDetails(
    FilterQuery,
    ["_id", "user_type_id", "parent_level_ids"]
  ).then(usersByParentId => {
    let lastAgentsId = [], AgentsDirectUsers = [], allChilds = [];
    if (usersByParentId.statusCode == SUCCESS) {
      usersByParentId = usersByParentId.data;
      usersByParentId.map(data => {
        if (data.user_type_id == USER_TYPE_USER)
          AgentsDirectUsers.push(data._id);
        else
          lastAgentsId.push(data._id);
        allChilds.push(data._id);
      });
      let ownAndParents = parents, users = AgentsDirectUsers;
      ownAndParents.push(user_id);
      let matchTotalOwnParent = { "$or": [] };
      lastAgentsId.map(agentsUsers => {
        let parentsIds = [...parents, agentsUsers];
        matchTotalOwnParent["$or"].push({
          "win_loss_distribution.user_id": {
            '$all': parentsIds
          }
        });
      });
      if (AgentsDirectUsers.length)
        matchTotalOwnParent["$or"].push({
          "user_id": {
            '$in': AgentsDirectUsers
          }
        });
      let queryUsers = marketQueryService.getMarketUserPositions(market_id, users);
      let queryTotalOwnParent = marketQueryService.positionTotalOwnParent(user_id, parent_id, market_id, lastAgentsId, ownAndParents, matchTotalOwnParent, users, parentsAndViewer);
      let queryTeamPositionFullBook = betQueryService.getTeamPositionQuery(user_id, 0, market_id);
      if ((user_type_id - 1) == USER_TYPE_USER) {
        return Promise.all([
          OddsProfitLoss.aggregate(queryUsers),
          OddsProfitLoss.aggregate(queryTotalOwnParent),
          OddsProfitLoss.aggregate(queryTeamPositionFullBook),
        ]).then((agentsAndUsers) => {
          const total_exposure = agentsAndUsers[2];
          let data = agentsAndUsers[0];
          data = groupUsersData(data);
          const { team, columns } = teamAndColumns(agentsAndUsers[1][0]);
          agentsAndUsers[1][0]["teams"] = team;
          agentsAndUsers[1][0]["columns"] = columns;
          agentsAndUsers[1][0]["total_exposure"] = total_exposure;
          return resultResponse(SUCCESS, { users: data, metadata: agentsAndUsers[1][0] });
        }).catch(error => resultResponse(SERVER_ERROR, error.message));
      }
      let queryAgents = marketQueryService.getMarketAgentUserPositions(market_id, lastAgentsId, AgentsDirectUsers, ownAndParents);
      return Promise.all([
        OddsProfitLoss.aggregate(queryAgents),
        OddsProfitLoss.aggregate(queryUsers),
        OddsProfitLoss.aggregate(queryTotalOwnParent),
        OddsProfitLoss.aggregate(queryTeamPositionFullBook),
      ]).then(agentsAndUsers => {
        const total_exposure = agentsAndUsers[3];
        let data = [...agentsAndUsers[0], ...agentsAndUsers[1]];
        data = groupUsersData(data);
        const { team, columns } = teamAndColumns(agentsAndUsers[2][0]);
        agentsAndUsers[2][0]["teams"] = team;
        agentsAndUsers[2][0]["columns"] = columns;
        agentsAndUsers[2][0]["total_exposure"] = total_exposure;
        return resultResponse(SUCCESS, { users: data, metadata: agentsAndUsers[2][0] });
      }).catch(error => resultResponse(SERVER_ERROR, error.message));
    } else return resultResponse(NOT_FOUND, "No agents and its users are found!");
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

function groupUsersData(data) {
  return data.reduce((prev, current) => {
    const found = prev.some(prev => prev.user_name === current.user_name);
    if (!found) {
      let tempObject = {
        user_id: current.user_id,
        user_type_id: current.user_type_id,
        user_name: current.user_name,
        domain_name: current.domain_name,
      };
      tempObject[current.selection_name.toLowerCase().replace(/ /g, "_")] = current.win_loss;
      tempObject[current.selection_name.toLowerCase().replace(/ /g, "_") + "_total_exposure"] = current.win_loss_total_exposure;
      prev.push(tempObject);
    }
    if (found) {
      var foundIndex = prev.findIndex(x => x.user_name == current.user_name);
      let tempObject = {};
      tempObject[current.selection_name.toLowerCase().replace(/ /g, "_")] = current.win_loss;
      tempObject[current.selection_name.toLowerCase().replace(/ /g, "_") + "_total_exposure"] = current.win_loss_total_exposure;
      prev[foundIndex] = { ...prev[foundIndex], ...tempObject };
    }
    return prev;
  }, []);
}

function teamAndColumns(data) {
  let team = [], columns = [];
  data.total.map(teamAndColumns => {
    team.push(teamAndColumns.selection_name);
    columns.push(teamAndColumns.selection_name.toLowerCase().replace(/ /g, "_"));
  });
  return { team, columns };
}

async function abandonedExchangeGame(match_id, market_id, full_market_id, live_game_sport_id = false) {
  return BetResults.findOne(
    { market_id: full_market_id }
  ).then(betResultAlreadyDeclared => {
    if (betResultAlreadyDeclared != null)
      return resultResponse(NOT_FOUND, "Result already declared!");
    return getMarketDetail({ market_id }, ["-_id", "series_id"])
      .then(async market => {
        if (market.statusCode == SUCCESS) {
          market = market.data;
          const ABANDONED = 'Abandoned'
            , selection_id = result = winner_name = ABANDONED
          let BetResult = new BetResults({
            sport_id: `${!live_game_sport_id ? CONSTANTS.LIVE_GAME_SPORT_ID : CONSTANTS.DIAMOND_CASINO_SPORT_ID}`,
            ...market, match_id, market_id: full_market_id, selection_id, result, winner_name, type: 1
          });
          let bet_result_id = BetResult._id;
          return OddsProfitLoss.aggregate(betQueryService.fn_update_balance_liability_Query(full_market_id, 0, "sub"))
            .then(async users => {
              if (users.length) {
                users = users.map(item => ({
                  'updateOne': {
                    'filter': { '_id': item.user_id },
                    'update': { '$inc': { 'liability': (item.liability).toFixed(2), 'balance': (item.liability).toFixed(2) } }
                  }
                }));
                try {
                  await User.bulkWrite(users);
                } catch (error) {
                  console.error(error);
                }
              }
              return BetsOdds.updateMany(
                { match_id, market_id: full_market_id },
                { result: -1, bet_result_id, winner_name: ABANDONED, is_result_declared: -1 }
              ).then(async () => {
                await BetResult.save();
                return resultResponse(SUCCESS, "Game result abandoned successfully...");
              }).catch(error => resultResponse(SERVER_ERROR, "Error while updating bet status. " + error.message));
            }).catch(error => resultResponse(SERVER_ERROR, "Error in fn_update_balance_liability_Query " + error));
        } else
          return resultResponse(SERVER_ERROR, market.data);
      }).catch(error => resultResponse(SERVER_ERROR, error.message));
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

async function marketOddsService(getActiveMarkets) {
  try {
    let template = marketSelections(true);
    let markets = getActiveMarkets;
    let getActiveMarketIds = getActiveMarkets.map(row => `${ODDS_}${row.market_id}`);
    getActiveMarkets = getActiveMarkets.reduce((acc, obj) => {
      const { market_id, runners } = obj;
      acc[market_id] = runners;
      return acc;
    }, {});
    if (getActiveMarketIds.length) {
      let odds = await client.mget(getActiveMarketIds);
      odds = odds.map(row => (row = JSON.parse(row), row))//.filter(data => data);
      odds.map(async (data, index) => {
        if (data != null) {
          if (typeof data == 'string')
            data = JSON.parse(data);
          // let market_live_odds_validation;
          let marketCondition = (market) => market.market_id == data.marketId &&
            [MATCH_ODDS_TYPE, BOOKMAKER_TYPE, TIED_MATCH_TYPE].includes(market.market_type)
            && market.sport_id == CRICKET;
          let fetchMarket = markets.find(market => marketCondition(market));

          if (fetchMarket) {

            let matchData = await Match.findOne({ match_id: fetchMarket.match_id }).select("market_live_odds_validation").lean();

            if (matchData.market_live_odds_validation) {

              try {

                const methodName = await getMethodName(PROVIDER_API_BOOKMAKER);

                let url = await apiUrlSettingsService.getBaseUrl() + "/getOdds?function_name=" + methodName + "&ids=" + data.marketId;

                config = {
                  method: 'get',
                  url,
                  timeout: 2000
                };
                let response = await axios(config);

                if (response.data.length) {

                  response = response.data[0];

                  if (response?.min != undefined && response?.max != undefined) {

                    // market_live_odds_validation = true;
                    data.live_market_min_stack = response.min;
                    data.live_market_max_stack = response.max;

                  }
                } else {
                  // market_live_odds_validation = false;
                }
              } catch (error) {
                logger.error("marketOddsService failed to fetch odds Error: " + error.message);
              }

            }

          }
          let { marketId, status, inplay, matched, totalMatched, runners, live_market_min_stack, live_market_max_stack } = data;
          matched = matched ? matched : "0";
          totalMatched ? matched = totalMatched : "0";
          if (runners.length) {
            runners = runners.map(runner => {
              return {
                selectionId: runner.selectionId,
                status: runner.status,
                ex: runner.ex
              }
            });
            var original = [...getActiveMarkets[marketId], ...runners],
              updateRunners = Array.from(
                original
                  .reduce(
                    (m, o) => m.set(o.selectionId, Object.assign({}, m.get(o.selectionId) || template, o)),
                    new Map
                  )
                  .values()
              );
            runners = updateRunners;

            const query = { market_id: marketId };

            let update = { status, inplay, matched, totalMatched, runners };

            const matchUpdate = { $set: update };

            // if (market_live_odds_validation != undefined) {
            //   update["market_live_odds_validation"] = market_live_odds_validation;
            // }

            if (live_market_min_stack != undefined) {
              update["live_market_min_stack"] = live_market_min_stack;
            }
            if (live_market_max_stack != undefined) {
              update["live_market_max_stack"] = live_market_max_stack;
            }

            const marketUpdate = { $set: update };
            Match.updateOne(query, matchUpdate).then().catch(console.error);
            Market.updateOne(query, marketUpdate).then().catch(console.error);

          } else
            marketOddsBlank(index, getActiveMarketIds, getActiveMarkets);
        } else if (data == null) {
          try {
            marketOddsBlank(index, getActiveMarketIds, getActiveMarkets);
          } catch (error) { }
        }
      });
    }
  } catch (error) {
    console.error(error);
  }
}

async function marketOddsServiceForCoreSports() {
  let Filter = {
    is_active: 1, is_visible: true, is_abandoned: 0, is_result_declared: 0,
    centralId: { "$ne": null }, sport_id: { "$in": [CONSTANTS.SOCCER, CONSTANTS.TENNIS, CONSTANTS.CRICKET] }
  };
  const getActiveMarkets = await Market.find(Filter, { _id: 0, match_id: 1, market_id: 1, runners: 1, sport_id: 1, market_type: 1 }).lean();
  await marketOddsService(getActiveMarkets);
}

async function racingSportsOddsWrite() {
  let from_date = new Date(new Date().getTime() - 1000 * 60 * 15); // Subtracting 15 minutes from current date and time.
  let Filter = {
    is_active: 1, is_visible: true, is_abandoned: 0, is_result_declared: 0,
    centralId: { "$ne": null }, sport_id: { "$in": [CONSTANTS.HR, CONSTANTS.GHR] },
    market_id: { $regex: ".+(?<!_m)$" }, market_start_time: { '$gte': new Date(from_date) }
  }
  const getActiveMarkets = await Market.find(Filter, { _id: 0, market_id: 1, runners: 1 }).lean();
  await marketOddsService(getActiveMarkets);
}

function marketOddsBlank(index, getActiveMarketIds, getActiveMarkets) {
  const market_id = getActiveMarketIds[index].replace(ODDS_, "");
  let runners = {};
  getActiveMarkets[market_id].map((runner, index) => {
    runner.ex.availableToBack.map(bk_ly => {
      bk_ly.size = "--";
      bk_ly.price = "--";
      return bk_ly;
    });
    runner.ex.availableToLay.map(bk_ly => {
      bk_ly.size = "--";
      bk_ly.price = "--";
      return bk_ly;
    });
    runners[`runners.${index}.ex`] = runner.ex;
  });
  const query = { market_id };
  const update = { $set: { status: "SUSPENDED", inplay: false, ...runners } };
  Market.updateOne(query, update).then().catch(console.error);
  Match.updateOne(query, update).then().catch(console.error);
}

async function inactiveAutoMarkets(provider) {
  try {
    if (provider == "frnk") {
      let markets = await Market.find({
        is_active: 1, is_result_declared: 0, is_abandoned: 0,
        sport_id: { $nin: [LIVE_GAME_SPORT_ID.toString(), DIAMOND_CASINO_SPORT_ID, UNIVERSE_CASINO_SPORT_ID] },
        market_id: { $regex: ".+(?<!_m)$" }
      }).select("-_id sport_id match_id market_id market_type").lean();
      if (markets.length) {
        let MarketsIds = markets.filter(data => {
          if (!((data.sport_id != "4") == false && (data.market_type != WINNER) == false))
            return data;
        }).map(data => data.market_id), markets_data = [], chunkSize = getChunkSize(INPLAY);
        let markets_live = await getOddsRates({ markets_ids: MarketsIds, API_TYPE: INPLAY, chunkSize });
        if (markets_live.statusCode == SUCCESS)
          markets_data.push(...markets_live.data);
        chunkSize = getChunkSize(DELAY);
        let markets_delay = await getOddsRates({ markets_ids: MarketsIds, API_TYPE: DELAY, chunkSize });
        if (markets_delay.statusCode == SUCCESS)
          markets_data.push(...markets_delay.data);
        if (markets_data.length) {
          for (const data of markets_data) {
            if (typeof data == "object") {
              if (data.runners) {
                if (data.runners.length) {
                  let isMatchOdds = markets.find(item => item.market_id === data.marketId)
                    , market_status = [REMOVED, WINNER, LOSER];
                  if ([CONSTANTS.HR].includes(isMatchOdds.sport_id)) {
                    market_status = [WINNER, LOSER];
                    if ([...new Set(data.runners.map(v => v.status))].toString() == REMOVED)
                      market_status.push(REMOVED);
                  }
                  let resultStatus = data.runners.filter(data => market_status.includes(data.status));
                  if (resultStatus) {
                    if (resultStatus.length) {
                      await Market.updateMany({
                        market_id: data.marketId
                      }, {
                        is_active: 0,
                        is_visible: false
                      });
                      // If Match Odds are inactivated, it will also deactivate all Bookmakers.
                      if (isMatchOdds) {
                        if (isMatchOdds.market_type === MATCH_ODDS_TYPE) {
                          await Market.updateMany({
                            match_id: isMatchOdds.match_id,
                            market_type: BOOKMAKER_TYPE
                          }, {
                            is_active: 0,
                            is_visible: false
                          });
                          // Change fancy status//
                          await Fancy.updateMany({
                            match_id: isMatchOdds.match_id,
                            is_active: 1
                          }, {
                            is_active: 0
                          });
                        }
                        if ([CONSTANTS.HR, CONSTANTS.GHR].includes(isMatchOdds.sport_id)) {
                          const marketsCount = await Market.where({ match_id: isMatchOdds.match_id, is_active: 1, is_result_declared: 0, is_abandoned: 0 }).countDocuments();
                          if (marketsCount == 1)
                            await Match.updateMany({
                              match_id: isMatchOdds.match_id
                            }, {
                              is_active: 0,
                              is_visible: false,
                              inplay: false,
                            });
                        }
                      }

                      if ([CONSTANTS.HR, CONSTANTS.GHR].includes(isMatchOdds.sport_id)) {
                        await Match.updateMany({
                          market_id: data.marketId
                        }, {
                          inplay: false,
                        });
                      } else {
                        await Match.updateMany({
                          market_id: data.marketId
                        }, {
                          is_active: 0,
                          is_visible: false
                        });
                      }

                      return [markets.find(market => market.market_id == data.marketId).match_id];
                    }
                  }
                }
              }
            }
          }
        }
      }
    } else if (provider == "xcentral") {
      let markets = await Market.find({
        is_active: 1, is_result_declared: 0, is_abandoned: 0, centralId: { $ne: null }, centralId: { $ne: "" },
        sport_id: { $nin: [LIVE_GAME_SPORT_ID.toString(), DIAMOND_CASINO_SPORT_ID, UNIVERSE_CASINO_SPORT_ID] }
      }).select("-_id match_id market_id centralId").lean();
      if (markets.length) {
        let config = {
          method: 'post',
          url: GET_MARKET_STATUS,
          data: {
            "requestFrom": "self",
            "strCentralizedID": markets.map(data => data.centralId).toString()
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
          marketStatus = marketStatus.filter(data => data.appMarketStatus == 4);
          if (marketStatus.length) {
            let centralIds = marketStatus.map(data => data.appCentralizedID.toString());
            await Market.updateMany({
              centralId: { $in: centralIds }
            }, {
              is_active: 0,
              is_visible: false
            });
            for (const centralId of centralIds) {
              let match = await Match.findOne({ centralId }).select("-_id");
              if (match)
                await Match.updateMany({
                  centralId
                }, {
                  is_active: 0,
                  is_visible: false
                });
            }
            return [...new Set(markets.filter(data => centralIds.includes(data.centralId)).map(data => data.match_id))];
          }
        }
      }
    }
  } catch (error) {
    console.error(error);
  }
}

function marketCreateUpdate(data, select = ['_id'], transaction = false, session) {
  let options = { upsert: true, new: true, runValidators: true };
  if (transaction)
    options["session"] = session;
  return Market.findOneAndUpdate(
    { market_id: data.market_id },
    data,
    options
  ).lean().select(select)
    .then(market => {
      if (market)
        return resultResponse(SUCCESS, market);
      return resultResponse(NOT_FOUND, "Market not found!");
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

async function getResult(data) {
  const { market_id } = data;
  let market = await getMarketDetails({ market_id }, ["-_id", "runners.name", "runners.selectionId", "marketId", "centralId"]);
  if (market.statusCode != SUCCESS)
    return resultResponse(NOT_FOUND, "Market data Not Found!");
  market = market.data[0];
  let result = (await axios.get(await apiUrlSettingsService.getMarketResultUrl() + market_id + "&central_id=" + market.centralId, { timeout: 3000 })).data;
  if (result.length) {
    // result = result[0];
    if (result[0] == -999)
      return resultResponse(REMOVED, "Result abandoned!");
    market.runners = market.runners.map(data => {
      result.map(i => i).includes(data.selectionId) ? data.status = "WINNER" : data.status = "LOSER";
      return data;
    });
    return resultResponse(SUCCESS, market);
  }
  return resultResponse(NOT_FOUND, "Result Not Found!");
}

let getOddsRateFromAPI = async (data) => {
  try {
    let markets_ids = data.markets_ids, { API_TYPE_INPLAY } = data,
      config = {
        method: 'get',
        url: (API_TYPE_INPLAY ? GET_ODDS_API_INPLAY : GET_ODDS_API_DELAY) + markets_ids,
        timeout: 2000
      }
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
};

let getOddsRates = async (data) => {
  try {
    let { chunkSize } = data;
    chunkSize = chunkSize ? chunkSize : 0;
    if (chunkSize) {
      let marketIds = data.markets_ids, marketsData = [];
      for (let i = 0; i < marketIds.length; i += chunkSize) {
        const marketChunk = marketIds.slice(i, i + chunkSize);
        let commaSeparatedMarketsIds = marketChunk.toString();
        if (data?.sport_id)
          if ([CONSTANTS.HR, CONSTANTS.GHR].includes(data.sport_id))
            commaSeparatedMarketsIds = commaSeparatedMarketsIds.replace(/_m/g, "");
        if (commaSeparatedMarketsIds) {
          let markets_data = await getOddsAPI({ ...data, markets_ids: commaSeparatedMarketsIds });
          if (markets_data.statusCode == SUCCESS) {
            markets_data = markets_data.data;
            marketsData.push(...markets_data);
          }
        }
      }
      return resultResponse(SUCCESS, marketsData);
    } else {
      data.markets_ids = data.markets_ids.toString();
      return await getOddsAPI(data);
    }
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
};

let getOddsAPI = async (data) => {
  try {
    const methodName = await getMethodName(PROVIDER_API_BOOKMAKER);
    let markets_ids = data.markets_ids,
      { API_TYPE } = data,
      GET_ODDS_API_BOOKMAKER = "";
    GET_ODDS_API_BOOKMAKER = API_TYPE == BOOKMAKER_TYPE ? await apiUrlSettingsService.getBaseUrl() + "/getOdds?function_name=" + methodName + "&ids=" : "";
    let url = (
      API_TYPE == INPLAY ?
        GET_ODDS_API_INPLAY :
        API_TYPE == DELAY ?
          GET_ODDS_API_DELAY :
          API_TYPE == BOOKMAKER_TYPE ?
            GET_ODDS_API_BOOKMAKER : "") + markets_ids,
      config = {
        method: 'get',
        url,
        timeout: 2000
      };
    if (API_TYPE == MANUAL_BOOKMAKER_TYPE) {
      config = {
        method: 'post',
        url: GET_MANUAL_ODDS_API_INPLAY,
        timeout: 500,
        headers: {
          'x-app': BRLN_X_APP,
          'Content-Type': 'application/json'
        },
        data: { "marketid": markets_ids }
      };
    }
    if (!API_TYPE)
      return resultResponse(NOT_FOUND, "API_TYPE not Define!");
    let response = await axios(config);
    if (response.data) {
      response = response.data;
      return await setOddsAPIResponse({ ...data, response });
    }
    return resultResponse(NOT_FOUND, "No data found in provider api!");
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function setOddsAPIResponse(params) {
  try {
    let { response } = params;
    switch (params.API_TYPE) {
      case CONSTANTS.MANUAL_BOOKMAKER_TYPE:
        if (response.data.length) {
          response = response.data;
          for (const market of response) {
            market.status = market.status == 1 ? CONSTANTS.OPEN : CONSTANTS.SUSPENDED;
            for (const runner of market.runners) {
              runner.status = runner.status == 0 ? CONSTANTS.OPEN : CONSTANTS.SUSPENDED;
              runner.ex.availableToBack.map(data => (data.price = ((parseInt(data.price) / 100) + 1).toFixed(2), data));
              runner.ex.availableToLay.map(data => (data.price = ((parseInt(data.price) / 100) + 1).toFixed(2), data));
            }
          }
          return resultResponse(SUCCESS, response);
        }
      default:
        if (response.length) {
          return resultResponse(SUCCESS, postProcessMarketAPIData(response));
        }
    }
    return resultResponse(NOT_FOUND, "No data found in provider api!");
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

let postProcessMarketAPIData =
  (response) =>
    response.map(data => _.pick(data, ["marketId", "status", "inplay", "totalMatched", "runners", "max", "min", "news"]));

async function changeMarketInpayStatus() {

  try {

    var today = new Date();
    today.setDate(today.getDate() - 5);

    let filter = {
      is_active: 1, is_result_declared: 0, is_abandoned: 0, cron_inplay: false,
      market_start_time: { "$gte": today }, sport_id: { $in: [CONSTANTS.SOCCER, CONSTANTS.TENNIS, CONSTANTS.CRICKET] }
    }

    let markets = await Market.find(filter).select("-_id market_id market_name market_type").lean();

    if (markets.length) {

      const marketIds = markets.filter(data => data.market_type != BOOKMAKER_TYPE).map(data => data.market_id)
        , bookmakerMarketIds = markets.filter(data => data.market_type == BOOKMAKER_TYPE).map(data => data.market_id);

      let marketsData = [];

      if (marketIds.length) {

        let markets_data = await getOddsRates({ markets_ids: marketIds, API_TYPE: INPLAY, chunkSize: 10 });

        if (markets_data.statusCode == SUCCESS) {

          markets_data = markets_data.data;
          marketsData.push(...markets_data);

        }

      }

      if (bookmakerMarketIds.length) {

        let markets_data = await getOddsRates({ markets_ids: bookmakerMarketIds, API_TYPE: BOOKMAKER_TYPE, chunkSize: 1 });

        if (markets_data.statusCode == SUCCESS) {

          markets_data = markets_data.data;
          marketsData.push(...markets_data);

        }

      }

      marketsData = marketsData.filter(data => data.inplay);

      if (marketsData) {

        marketsData = marketsData.map(item => ({
          'updateOne': {
            'filter': { market_id: item.marketId },
            'update': {
              '$set': {
                cron_inplay: item.inplay,
                inplay: item.inplay,
              }
            }
          }
        }));

        Market.bulkWrite(marketsData).then().catch(console.error);
        Match.bulkWrite(marketsData).then().catch(console.error);

      }

    }

  } catch (error) {
    console.error(error);
  }

}

async function changeMarketInpayStatusForceFully() {
  try {
    let from_date = new Date().setUTCHours(0, 0, 0, 0);
    let to_date = new Date(new Date().getTime() + 1000 * 60 * 60); // +1 hour
    let filter = {
      is_active: 1,
      is_result_declared: 0,
      is_abandoned: 0,
      sport_id: {
        $in: [CONSTANTS.SOCCER, CONSTANTS.TENNIS, CONSTANTS.CRICKET],
      },
      cron_inplay: false,
    };

    let marketFilter = {
      ...filter,
      market_start_time: { $gte: new Date(from_date), $lte: new Date(to_date) },
    };

    let markets = await Market.find(marketFilter)
      .select("-_id market_id")
      .lean();

    if (markets.length) {
      const marketsBulkWrite = markets.map((item) => ({
        updateOne: {
          filter: { market_id: item.market_id },
          update: {
            $set: {
              cron_inplay: true,
              inplay: true,
            },
          },
        },
      }));

      Market.bulkWrite(marketsBulkWrite).then().catch(console.error);
    }

    to_date = new Date(new Date().getTime() + 1000 * 60 * 5); // 5 minutes
    let matchFilter = {
      ...filter,
      match_date: { $gte: new Date(from_date), $lte: new Date(to_date) },
    };

    let matches = await Match.find(matchFilter).select("-_id match_id").lean();

    if (matches.length) {
      const matchBulkWrite = matches.map((item) => ({
        updateOne: {
          filter: { match_id: item.match_id },
          update: {
            $set: {
              cron_inplay: true,
              inplay: true,
            },
          },
        },
      }));

      Match.bulkWrite(matchBulkWrite).then().catch(console.error);
    }
  } catch (error) {
    console.error(error);
  }
}

/**
 * The function `getUpcommingHRandGrMarkets` retrieves upcoming markets for horse racing and greyhound
 * racing and updates their status to inplay.
 */
async function getUpcommingHRandGrMarkets() {

  try {

    let from_date = new Date()
      , to_date = new Date(new Date().getTime() + 1000 * 60 * 5);

    let filter = {
      is_active: 1, is_result_declared: 0, is_abandoned: 0, sport_id: { $in: [HR, GHR] }, cron_inplay: false,
      market_start_time: { '$gte': new Date(from_date), '$lte': new Date(to_date) }
    };

    let markets = await Market.find(filter).select("-_id market_id match_id market_name").lean();

    if (markets.length) {
      const marketsBulkWrite = markets.map(item => ({
        'updateOne': {
          'filter': { market_id: item.market_id },
          'update': {
            '$set': {
              cron_inplay: true,
              inplay: true,
            }
          }
        }
      }));

      const matchBulkWrite = markets.map(item => ({
        'updateOne': {
          'filter': { match_id: item.match_id },
          'update': {
            '$set': {
              market_id: item.market_id,
              marketId: item.market_id,
              market_name: item.market_name,
              inplay: true,
            }
          }
        }
      }));

      Market.bulkWrite(marketsBulkWrite).then().catch(console.error);
      Match.bulkWrite(matchBulkWrite).then().catch(console.error);

    }
  } catch (error) {
    console.error(error);
  }

}

function getMarketsByCountryCode(request) {
  let { match_id, sport_id, user_id } = request.body, PARENT_LEVEL_IDS = [];
  if (user_id) {
    PARENT_LEVEL_IDS = request.user.parent_level_ids;
  } else {
    PARENT_LEVEL_IDS = request.User.parent_level_ids;
    user_id = (request.User.user_id || request.User._id);
  }
  let loggedInUserId = (request.User.user_id || request.User._id)
    , is_self_view = loggedInUserId.toString() == user_id.toString();
  return Market.aggregate(marketQueryService.getMarketsByCountryCode(request))
    .then(async events => {
      if (events.length) {
        let finalEventList = events;
        blockEvent({ finalEventList, user_id, is_self_view, PARENT_LEVEL_IDS });
        finalEventList = finalEventList.map(
          ({ venue, markets }) => ({ venue, markets })
        ).filter(data => data);
        return resultResponse(SUCCESS, finalEventList);
      } else
        return resultResponse(SERVER_ERROR, "No market(s) available yet!");
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

function getMarketsByCountryCodeOpen(request) {
  let { match_id, sport_id } = request.body;
  return Market.aggregate(marketQueryService.getMarketsByCountryCode(request))
    .then(async events => {
      if (events.length) {
        let finalEventList = events;
        finalEventList = finalEventList.map(
          ({ venue, markets }) => ({ venue, markets })
        ).filter(data => data);
        return resultResponse(SUCCESS, finalEventList);
      } else
        return resultResponse(SERVER_ERROR, "No market(s) available yet!");
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

async function getMethodName(provider) {
  let methodName;

  switch (provider) {
    case "D247":
      methodName = "getBookMaketOddsd247";
      break;
    case "PARKER777":
      methodName = "getParker777Bookmaker";
      break;
    default:
      methodName = "getBookMaketOddsV1";
      break;
  }

  return methodName;
}

module.exports = {
  checkMarketExist,
  updateMarketStatus,
  getDeactiveMarket,
  deleteDeactiveMarket,
  createDeactiveMarket,
  checkParentIdsDeactiveMarket,
  getAllMarkets,
  getUserAndParentAllDeactiveMarket,
  marketOddsService,
  getAllMarketsNotInDeactiveMarket,
  getAllMarketForAgents,
  getDataByMarketId,
  getSelectionByMarketId,
  getMarketDetails,
  getMarketDetail,
  results,
  getMarketAgentUserPositions,
  abandonedExchangeGame,
  inactiveAutoMarkets,
  marketCreateUpdate,
  getResult,
  changeMarketInpayStatus,
  getOddsRateFromAPI,
  getOddsRates,
  getMarketsByCountryCode,
  getUpcommingHRandGrMarkets,
  marketOddsServiceForCoreSports,
  racingSportsOddsWrite,
  getMarketsByCountryCodeOpen,
  // Market Redis Service
  marketsDumpRedis,
  updateMarketsInRedis,
  getMarketFronRedis,
  suspendMarketsInRedis,
  manualMarketOddsDumpRedis,
  // Market User Book
  diamondUserBook,
  changeMarketInpayStatusForceFully,
  setTWTTRates,
};