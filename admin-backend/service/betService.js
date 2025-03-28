const getCurrentLine = require('get-current-line')
  , { ObjectId } = require("bson")
  , mongoose = require('mongoose')
  , moment = require('moment')
  , User = require("../../models/user")
  , UserLoginLogs = require("../../models/userLoginLogs")
  , PasswordHistory = require("../../models/passwordHistory")
  , OAuthToken = require("../../models/oAuthToken")
  , Match = require("../../models/match")
  , Market = require("../../models/market")
  , Fancy = require('../../models/fancy')
  , BetsOdds = require("../../models/betsOdds")
  , BetsFancy = require("../../models/betsFancy")
  , OddsProfitLoss = require("../../models/oddsProfitLoss")
  , MarketAnalysis = require('../../models/marketAnalysis')
  , FancyScorePosition = require("../../models/fancyScorePosition")
  , UserProfitLoss = require("../../models/userProfitLoss")
  , BetResults = require("../../models/betResults")
  , BetCount = require("../../models/betCount")
  , QTechCrDrWinLoss = require('../../models/qtechCrDrWinLoss')
  , AccountStatement = require("../../models/accountStatement")
  , LotusCalculatedExposures = require("../../models/lotusCalculatedExposures")
  , EventActionStatus = require("../../models/eventActionStatus")
  , publisher = require("../../connections/redisConnections")
  , redisClient = require("../../connections/redisConnections")
  , betQueryService = require("./betQueryService")
  , fancyQueryService = require("./fancyQueryService")
  , userQuery = require("./userQuery")
  , fancyService = require("./fancyService")
  , marketService = require("./marketService")
  , betServiceUser = require("../../users-backend/service/betService")
  , statementService = require('./statementService')
  , logger = require('../../utils/loggers')
  , {
    SUCCESS,
    NOT_FOUND,
    SERVER_ERROR,
    VALIDATION_FAILED,
    USER_TYPE_USER,
    LIVE_GAME_SPORT_ID,
    DIAMOND_CASINO_SPORT_ID,
    USERS,
    AGENTS,
    MATCH_ODDS,
    WINNER,
    REMOVED,
    FANCY_CATEGORY,
    TO_BE_PLACED_TYPE,
    CRICKET,
    INPLAY,
    UN_MATCHED_BETS,
    UNIQUE_IDENTIFIER_KEY,
    BET_COUNT,
    LIVE_SPORTS,
    RACING_SPORTS,
    VALIDATION_ERROR,
  } = require("../../utils/constants")
  , { generateReferCode, generateUUID, getChunkSize, getTimeTaken, fixFloatingPoint } = require("../../utils")
  , { resultResponse } = require('../../utils/globalFunction')
  , { SocSuccess } = require('../../lib/socketResponder');
const {
  finalActionForMarketSettle
} = require("./betService/marketSettle");
const {
  finalActionForFancySettle
} = require("./betService/fancySettle");
const {
  getExposuresEventWise
} = require('./userService/getLiabilityFullAndShare');
const {
  eventAnalysis
} = require('./reportService/eventAnalysis');
const {
  getBetsEventTypesList
} = require('./betService/betsEventTypesDiamond');
const {
  processBetFancyInBatches,
  betFancyBatchHelper,
  getUserAndAgentCalculatedUpdateObject,
  getDataInBatchesForQueues,
  processBetOddsInBatches,
  betOddsBatchHelper,
} = require('./betService/resultHelpers');

const { concurrencyCheck, checkIfConcurrencyExists, deleteConcurrencyById, deleteConcurrencyByKey } = require("./concurrencyControl");
const {
  getOddsResultUID,
  getOddsAbandonedUID,
  getOddsRollbackUID,
  getSessionAbandonedUID,
  getSessionResultUID,
  getSessionRollbackUID,
} = require("../../utils/getter-setter");
const fs = require("fs");


const MAX_RETRY_LIMIT = 15;
const {
  IS_STATEMENT_GENRATE_FOR_ZERO_SHARE,
} = require("../../config/constant/user");
const { SESSION_RESULT_VERSION,
  SESSION_RESULT_TYPE,
  SESSION_ROLLBACK_TYPE,
  MARKET_RESULT_VERSION,
  MARKET_RESULT_TYPE,
  MARKET_ROLLBACK_TYPE,
  BET_FANCY_FETCH_BATCH_SIZE,
  BET_FANCY_UPDATE_BATCH_SIZE, } = require('../../config/constant/result');
let SessionResultQueue;

if (SESSION_RESULT_VERSION == 'V3' || MARKET_RESULT_VERSION == 'V3') {
  SessionResultQueue = require("../../bull/queue").SessionResultQueue;
}

async function startConvertUnMatchedBets() {
  try {
    // Get Market Form DataBase
    const marketsResponse = await marketService.getMarketDetails({
      is_active: 1,
      is_visible: true,
      is_abandoned: 0,
      is_result_declared: 0,
      "unmatch_bets.is_matched": 0,
      "unmatch_bets.delete_status": 0,
    }, ["-_id", "market_name", "market_type", "market_id", "match_id", "unmatch_bets"]);

    // If there is no markets are exist that contain un-matched bets.
    if (marketsResponse.statusCode !== SUCCESS) {
      return;
    }

    const markets = marketsResponse.data;
    const marketIds = markets.map(data => data.market_id);
    const chunkSize = getChunkSize(INPLAY);

    // Fetch Market Odds From API
    const oddsResponse = await marketService.getOddsRates({
      markets_ids: marketIds,
      sport_id: CRICKET,
      API_TYPE: INPLAY,
      chunkSize,
    });

    if (oddsResponse.statusCode !== SUCCESS) {
      console.error('Failed to fetch market odds');
      return;
    }

    const marketsData = oddsResponse.data;
    const dataToInsertInRedis = [];

    // Concurrency via Promise.all: This ensures multiple bets can be processed concurrently, 
    // avoiding sequential processing that may slow down the application.
    await Promise.all(markets.map(async (market) => {
      const marketOddsData = marketsData.find(i => i.marketId === market.market_id);
      if (!marketOddsData) return;

      await processUnmatchedBets(market, marketOddsData, dataToInsertInRedis);
    }));

    // If we have data to insert into Redis, insert it
    if (dataToInsertInRedis.length) {
      await publisher.mset(dataToInsertInRedis);
      console.log("Saved data in Redis:", dataToInsertInRedis.length / 2);
    }
  } catch (error) {
    console.error('Error in startConvertUnMatchedBets:', error);
  }
}

// Process the unmatched bets and store them in Redis if conditions are met
async function processUnmatchedBets(market, marketOddsData, dataToInsertInRedis) {
  const { unmatch_bets, match_id } = market;

  unmatch_bets
    // filter only un-matched bets only.
    // [
    //   {
    //     bet_id: "ObjectId",
    //     user_name: "String",
    //     odds: "Number",
    //     is_back: "Number",
    //     selection_id: "Number",
    //     is_matched: "Number", 0, 1,
    //     delete_status: "Number", 0, 1
    //       }
    // ]
    .filter(bet => bet.is_matched !== 1)
    .forEach(unmatch_bet => {
      const { odds, is_back, selection_id } = unmatch_bet;
      let currentOdd = getCurrentOddsForSelection(marketOddsData, selection_id, is_back);

      if (shouldInsertInRedis(is_back, odds, currentOdd)) {
        const data = { unmatch_bet, match_id };
        const redisKey = `${UN_MATCHED_BETS}${UNIQUE_IDENTIFIER_KEY}-${unmatch_bet.bet_id}`;
        dataToInsertInRedis.push(redisKey, JSON.stringify(data));
      }
    });
}

// Get the current odds for a selection in the market
function getCurrentOddsForSelection(marketOddsData, selection_id, is_back) {
  let currentOdd = -1;
  marketOddsData.runners.forEach(runner => {
    if (runner.selectionId !== selection_id) return;

    const { availableToBack, availableToLay } = runner.ex;
    currentOdd = is_back === 1 ? availableToBack[0].price : availableToLay[0].price;
  });

  return currentOdd;
}

// Determine if the unmatched bet should be inserted into Redis
function shouldInsertInRedis(is_back, odds, currentOdd) {
  return (is_back === 1 && odds <= currentOdd) || (is_back === 0 && odds >= currentOdd);
}

async function startUnMatchedBetConversion(io) {

  const KEY = `${UN_MATCHED_BETS}${UNIQUE_IDENTIFIER_KEY}*`;

  const keys = await publisher.keys(KEY);

  if (!keys.length) return 0;

  const dataAll = await publisher.mget(...keys);

  let count = 0;

  await Promise.all(keys.map(async (key, i) => {
    try {
      let data = dataAll[i];

      if (data) {
        data = JSON.parse(data);
        const { unmatch_bet, match_id } = data;
        const { bet_id, user_id, user_name } = unmatch_bet;
        const res = await convertToMatchedBet({ unmatch_bet });

        if (res.statusCode == SUCCESS) {

          await publisher.del(key);
          let bets = await betServiceUser.myBets(
            {
              "search": {
                "_id": bet_id,
                "delete_status": { "$in": [0, 2] },
                "bet_result_id": null
              },
              "limit": 1, "page": 1, user_id
            }
          );
          bets = bets.statusCode == SUCCESS ? bets?.data[0]?.data[0] : {};
          logger.info(`
            Function: startUnMatchedBetConversion
            Message:  Unmatched Bet Coverted Successfully !!
            Data: ${JSON.stringify(unmatch_bet)}
            Res: ${JSON.stringify(res)}
           `);
          io.emit(match_id + "_bet_converted_" + user_id, SocSuccess({
            data: bets,
            hasData: true,
            msg: "Bet Converted Successfully !!"
          }));
          count++;
        }
      }
    } catch (err) {
      console.log("StartUnMatchedBetConversion Error: ", err)
    }
  }));

  return count;
}


async function convertToMatchedBet(data) {
  const { unmatch_bet } = data;
  const { bet_id } = unmatch_bet;

  const session = await mongoose.startSession();
  try {
    const betsData = await BetsOdds.findOne(
      { "_id": bet_id },
      {
        "_id": 0,
        "user_id": 1,
        "bet_result_id": 1,
        "is_matched": 1,
        "delete_status": 1,
        "sport_id": 1,
        "series_id": 1,
        "match_id": 1,
        "market_id": 1,
        "match_date": 1,
        "sort_name": 1,
        "runners.user_id": 1,
        "runners.user_name": 1,
        "runners.domain_name": 1,
        "runners.sport_id": 1,
        "runners.sport_name": 1,
        "runners.series_id": 1,
        "runners.series_name": 1,
        "runners.match_id": 1,
        "runners.match_name": 1,
        "runners.market_id": 1,
        "runners.market_name": 1,
        "runners.selectionId": 1,
        "runners.selection_id": 1,
        "runners.name": 1,
        "runners.selection_name": 1,
        "runners.sort_priority": 1,
        "runners.sort_name": 1,
        "runners.status": 1
      });

    if (betsData != null) {
      const { match_id, market_id, is_matched, delete_status, bet_result_id, match_date, user_id } = betsData;
      let { runners } = betsData;
      if (bet_result_id != null)
        return resultResponse(SUCCESS, "Bet result already declared...");
      if (is_matched == 0) {
        await session.startTransaction();

        const user = await User.findOne({ _id: user_id }, { markets_liability: 1 }).lean();
        if (!user) {
          return resultResponse(NOT_FOUND, "User Not Found...");
        }
        let markets_liability = user.markets_liability;

        await BetsOdds.updateOne(
          { _id: bet_id },
          { "$set": { is_matched: 1 } },
          { session });

        let oldLiability = markets_liability[market_id];
        oldLiability = oldLiability.liability == undefined ? 0 : (oldLiability.liability > 0 ? 0 : oldLiability.liability);
        const match = {
          '$match': {
            'user_id': ObjectId(user_id),
            market_id,
            'delete_status': 0,
          }
        };

        let oddsProfitLoss = await BetsOdds.aggregate(betQueryService.fnSaveOddsProfitLoss(match)).session(session);
        if (oddsProfitLoss.length) {
          runners = runners.map(runner => {
            runner.match_date = match_date;
            const { selection_id } = runner;
            let OPL = oddsProfitLoss.find(data => data.selection_id == selection_id);
            if (OPL.user_pl > 0)
              OPL.user_commission_pl = -(OPL.user_pl * OPL.user_commission / 100);
            else
              OPL.user_commission_pl = 0;
            OPL.win_loss_distribution.map(agent => {
              if (OPL.user_pl > 0)
                agent.commission = (-(agent.p_l) * agent.match_commission / 100);
              else
                agent.commission = 0;
              return agent;
            });
            return Object.assign(
              runner,
              OPL,
            );
          });
          let win_loss = runners.map(OPL => OPL.win_loss + OPL.unmatched_loss_value);
          let newLiability = Math.min(...win_loss);
          newLiability = (newLiability > 0 ? 0 : newLiability)
          let liability = -(Math.abs(newLiability) - Math.abs(oldLiability));
          markets_liability[market_id].liability = newLiability;
          runners = runners.map(runner => ((runner.max_liability = newLiability), runner));
          await OddsProfitLoss.deleteMany({ "user_id": user_id, "market_id": market_id }, { session });

          await OddsProfitLoss.insertMany(runners, { session });

          await User.updateOne(
            { _id: user_id },
            { $inc: { liability: liability, balance: liability }, markets_liability },
            { upsert: true, setDefaultsOnInsert: true }
          ).session(session);

          await Market.updateOne(
            { market_id, "unmatch_bets.bet_id": bet_id },
            { $set: { "unmatch_bets.$.is_matched": 1 } }
          ).lean();

          await session.commitTransaction();
          session.endSession();
          return resultResponse(SUCCESS, `Bet matched successfully...`);
        }
      } else {
        return resultResponse(SUCCESS, "Bet already matched!");
      }
    } else {
      return resultResponse(NOT_FOUND, "Bet not found!");
    }
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return resultResponse(SERVER_ERROR, "Error in bet delete" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` : ""));
  }
}

function getRatioAgainstSelection(agentTeamPosition) {
  try {
    // Step 1: Group data by market_id
    const groupedByMarket = agentTeamPosition.reduce((acc, item) => {
      if (!acc[item.market_id]) acc[item.market_id] = [];
      acc[item.market_id].push(item);
      return acc;
    }, {});

    // Step 2: Calculate ratio_against_selection
    const result = Object.entries(groupedByMarket).reduce((acc, [market_id, selections]) => {
      if (selections.length === 2) {
        const [teamA, teamB] = selections;

        // Calculate for Team A
        const teamAKey = `${market_id}_${teamA.selection_id}`;
        let teamARatio = 0;
        if (teamA.win_loss != 0 && teamB.win_loss != 0) {
          teamARatio = Math.abs((teamA.win_loss + teamB.win_loss) / teamB.win_loss - 1).toFixed(2);
        }
        acc[teamAKey] = { ratio_against_selection: fixFloatingPoint(teamARatio) };

        // Calculate for Team B
        const teamBKey = `${market_id}_${teamB.selection_id}`;
        let teamBRatio = 0;
        if (teamA.win_loss != 0 && teamB.win_loss != 0) {
          teamBRatio = Math.abs((teamA.win_loss + teamB.win_loss) / teamA.win_loss - 1).toFixed(2);
        }
        acc[teamBKey] = { ratio_against_selection: fixFloatingPoint(teamBRatio) };
      }

      return acc;
    }, {});

    return resultResponse(SUCCESS, result);
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function getTeamPosition(user_id, match_ids, market_ids) {
  let query = betQueryService.getTeamPositionQuery(user_id, match_ids, market_ids);
  return OddsProfitLoss.aggregate(query).then(agentTeamPosition => {
    if (agentTeamPosition.length) {
      // console.log(agentTeamPosition);
      agentTeamPosition = agentTeamPosition.reduce((acc, obj) => {

        try {
          const marketSelectionId = `${obj.market_id}_${obj.selection_id}`;
          let result = getRatioAgainstSelection(agentTeamPosition);
          if (result.statusCode == SUCCESS) {
            rasOfTeam = result.data[marketSelectionId].ratio_against_selection;
            obj.ratio_against_selection = `${rasOfTeam}%`;
          }
        } catch (error) { }

        acc[obj.market_id] = [...acc[obj.market_id] || [], obj]; return acc;
      }, {});
      return resultResponse(SUCCESS, agentTeamPosition);
    } else
      return resultResponse(NOT_FOUND, "Agent(s) team position data not found!");
  }).catch(error => resultResponse(SERVER_ERROR, error.message))
}

async function getFancyLiability(user_id, match_ids, fancy_ids) {
  let query = fancyQueryService.getFancyLiabilityQuery(user_id, match_ids, fancy_ids);
  return FancyScorePosition.aggregate(query).then(getFancyLiability => {
    if (getFancyLiability.length) {
      getFancyLiability = getFancyLiability.reduce((acc, obj) => {
        acc[obj.fancy_id] = obj.liability;
        acc[obj.fancy_id + "_full"] = obj.liability_full;
        return acc;
      }, {});
      return resultResponse(SUCCESS, getFancyLiability);
    } else
      return resultResponse(NOT_FOUND, "Agent(s) fancy liability data not found!");
  }).catch(error => resultResponse(SERVER_ERROR, error.message))
}

async function getFancyLiabilityBySharing(params) {
  return fancyService.getFancyLiabilityBySharing(params).then(getFancyLiabilityBySharing => {
    if (getFancyLiabilityBySharing.statusCode != SUCCESS)
      return resultResponse(SERVER_ERROR, getFancyLiabilityBySharing.data);
    return resultResponse(SUCCESS, getFancyLiabilityBySharing.data);
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

async function bets(params) {
  let query = betQueryService.BetsQuery(params);
  return BetsOdds.aggregate(query).then(betsData => {
    if (betsData[0].data.length)
      return resultResponse(SUCCESS, betsData);
    else
      return resultResponse(NOT_FOUND, "No bets yet!");
  }).catch(error => resultResponse(SERVER_ERROR, error.message))
}

async function deleteBet(request) {
  const session = await mongoose.startSession();
  try {
    request.body.deleted_from_ip = request.ip_data;
    request.body.deleted_by = request.User.user_name;
    if (request.body.is_void)
      request.body.deleted_reason = `Void by ${request.User.user_name}`;
    else
      request.body.deleted_reason = `Deleted by ${request.User.user_name}`;
    let { _id: user_id, markets_liability, sessions_liability } = request.user;
    let { bet_id, deleted_by, deleted_reason, deleted_from_ip, is_fancy, is_void } = request.body;
    bet_id = ObjectId(bet_id);
    if (is_fancy == 1) {
      return BetsFancy.findOne(
        { "_id": bet_id },
        {
          "_id": 0,
          "bet_result_id": 1,
          "delete_status": 1,
          "match_id": 1,
          "fancy_id": 1,
        }).then(betsData => {
          if (betsData != null) {
            const { match_id, fancy_id, delete_status, bet_result_id } = betsData;
            if (bet_result_id != null)
              return resultResponse(SUCCESS, "Bet result already declared...");
            if (delete_status == 0) {
              session.startTransaction();
              return fancyService.getFancyPosition(user_id, fancy_id).then(getFancyPosition => {
                if (getFancyPosition.statusCode != SUCCESS)
                  return resultResponse(SERVER_ERROR, getFancyPosition.data);
                let oldLiability = getFancyPosition.data.liability;
                let fancy_score_position_id = getFancyPosition.data._id;
                return BetsFancy.updateOne(
                  { _id: bet_id },
                  {
                    "$set": {
                      delete_status: is_void ? 2 : 1, deleted_reason, deleted_by, deleted_from_ip
                    }
                  },
                  { session }).then(() => {
                    return fancyService.getRunTimeFancyPosition(user_id, fancy_id, USER_TYPE_USER, bet_id).then(async getRunTimeFancyPosition => {
                      if (getRunTimeFancyPosition.statusCode == SERVER_ERROR) {
                        session.endSession();
                        return resultResponse(SERVER_ERROR, getRunTimeFancyPosition.data);
                      }
                      let newLiability = (getRunTimeFancyPosition.data) ? getRunTimeFancyPosition.data.liability : 0;
                      let liability = -(Math.abs(newLiability) - Math.abs(oldLiability));
                      let newProfit = (getRunTimeFancyPosition.data) ? getRunTimeFancyPosition.data.profit : 0;
                      let newStack = (getRunTimeFancyPosition.data) ? getRunTimeFancyPosition.data.stack_sum : 0;
                      let newFancyPosition = (getRunTimeFancyPosition.data) ? getRunTimeFancyPosition.data.fancy_position : [];
                      let newBetsFancies = (getRunTimeFancyPosition.data) ? getRunTimeFancyPosition.data.bets_fancies : [];
                      let fancyScorePositionData = {
                        stack: newStack,
                        liability: newLiability,
                        profit: newProfit,
                        fancy_score_position_json: newFancyPosition,
                        bets_fancies: newBetsFancies,
                      };
                      return FancyScorePosition.updateOne(
                        { _id: fancy_score_position_id },
                        fancyScorePositionData
                      ).session(session).then(() => {
                        sessions_liability[fancy_id].liability = newLiability;
                        return User.updateOne(
                          { _id: user_id },
                          { $inc: { liability: liability, balance: liability }, sessions_liability },
                          { upsert: true, setDefaultsOnInsert: true }
                        ).session(session).then(async () => {
                          Fancy.updateOne(
                            { fancy_id },
                            { '$inc': { bet_count: -1 } }
                          ).lean().then().catch(console.error);
                          Match.updateOne(
                            { match_id },
                            { '$inc': { bet_count: -1 } },
                          ).lean().then().catch(console.error);
                          BetCount.updateOne({
                            user_id, match_id, event_id: fancy_id,
                          }, { $set: { last_update_type: -1 }, $inc: { bet_count: -1 } }
                          ).lean().then().catch(console.error);
                          await session.commitTransaction();
                          session.endSession();
                          return resultResponse(SUCCESS, is_void ? "Fancy Bet Void Successfully" : "Fancy Bet Deleted Successfully");
                        }).catch(async error => {
                          await session.abortTransaction();
                          session.endSession();
                          return resultResponse(SERVER_ERROR, "User balance & exposure update error" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` : ""));
                        });
                      }).catch(async error => {
                        await session.abortTransaction();
                        session.endSession();
                        return resultResponse(SERVER_ERROR, `fancy Score Position error` + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` : ""));
                      });
                    })
                  }).catch(async error => {
                    await session.abortTransaction();
                    session.endSession();
                    return resultResponse(SERVER_ERROR, "Error in bet delete" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` : ""));
                  });
              }).catch(error => resultResponse(SERVER_ERROR, error.message))
            } else if (delete_status == 1)
              return resultResponse(NOT_FOUND, "Bet already deleted!");
            else
              return resultResponse(NOT_FOUND, "Bet already void!");
          } else
            return resultResponse(NOT_FOUND, "Bet not found!");
        }).catch(error => resultResponse(SERVER_ERROR, (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` : "")));
    } else {
      return BetsOdds.findOne(
        { "_id": bet_id },
        {
          "_id": 0,
          "bet_result_id": 1,
          "delete_status": 1,
          "sport_id": 1,
          "series_id": 1,
          "match_id": 1,
          "market_id": 1,
          "match_date": 1,
          "sort_name": 1,
          "runners.user_id": 1,
          "runners.user_name": 1,
          "runners.domain_name": 1,
          "runners.sport_id": 1,
          "runners.sport_name": 1,
          "runners.series_id": 1,
          "runners.series_name": 1,
          "runners.match_id": 1,
          "runners.match_name": 1,
          "runners.market_id": 1,
          "runners.market_name": 1,
          "runners.selectionId": 1,
          "runners.selection_id": 1,
          "runners.name": 1,
          "runners.selection_name": 1,
          "runners.sort_priority": 1,
          "runners.sort_name": 1,
          "runners.status": 1
        }).then(betsData => {
          if (betsData != null) {
            const { match_id, market_id, delete_status, bet_result_id, match_date } = betsData;
            let { runners } = betsData;
            if (bet_result_id != null)
              return resultResponse(SUCCESS, "Bet result already declared...");
            if (delete_status == 0) {
              session.startTransaction();
              return BetsOdds.updateOne(
                { _id: bet_id },
                {
                  "$set": {
                    delete_status: is_void ? 2 : 1, deleted_reason, deleted_by, deleted_from_ip
                  }
                },
                { session }).then(async () => {
                  let oldLiability = markets_liability[market_id];
                  oldLiability = oldLiability.liability == undefined ? 0 : (oldLiability.liability > 0 ? 0 : oldLiability.liability);
                  const match = {
                    '$match': {
                      'user_id': ObjectId(user_id),
                      market_id,
                      'delete_status': 0,
                      "_id": { "$ne": ObjectId(bet_id) }
                    }
                  };
                  const BET_NOT_DELETE = "Bet delete & settlement not done!";
                  let oddsProfitLoss = await BetsOdds.aggregate(betQueryService.fnSaveOddsProfitLoss(match)).session(session);
                  if (oddsProfitLoss.length) {
                    runners = runners.map(runner => {
                      runner.match_date = match_date;
                      const { selection_id } = runner;
                      let OPL = oddsProfitLoss.find(data => data.selection_id == selection_id);
                      if (OPL.user_pl > 0)
                        OPL.user_commission_pl = -(OPL.user_pl * OPL.user_commission / 100);
                      else
                        OPL.user_commission_pl = 0;
                      OPL.win_loss_distribution.map(agent => {
                        if (OPL.user_pl > 0)
                          agent.commission = (-(agent.p_l) * agent.match_commission / 100);
                        else
                          agent.commission = 0;
                        return agent;
                      });
                      return Object.assign(
                        runner,
                        OPL,
                      );
                    });
                    let win_loss = runners.map(OPL => OPL.win_loss + (OPL.unmatched_loss_value || 0));
                    let newLiability = Math.min(...win_loss);
                    newLiability = (newLiability > 0 ? 0 : newLiability)
                    let liability = -(Math.abs(newLiability) - Math.abs(oldLiability));
                    markets_liability[market_id].liability = newLiability;
                    runners = runners.map(runner => ((runner.max_liability = newLiability), runner));
                    return OddsProfitLoss.deleteMany({ "user_id": user_id, "market_id": market_id }, { session }).then(() => {
                      return OddsProfitLoss.insertMany(runners, { session }).then(() => {
                        return User.updateOne(
                          { _id: user_id },
                          { $inc: { liability: liability, balance: liability }, markets_liability },
                          { upsert: true, setDefaultsOnInsert: true }
                        ).session(session).then(async () => {
                          Market.updateOne(
                            { market_id },
                            { '$inc': { bet_count: -1 } }
                          ).lean().then().catch(console.error);
                          Match.updateOne(
                            { match_id },
                            { '$inc': { bet_count: -1 } },
                          ).lean().then().catch(console.error);
                          BetCount.updateOne({
                            user_id, match_id, event_id: market_id,
                          }, { $set: { last_update_type: -1 }, $inc: { bet_count: -1 } }
                          ).lean().then().catch(console.error);
                          await session.commitTransaction();
                          session.endSession();
                          return resultResponse(SUCCESS, `Bet ${is_void ? "void" : "delete"} successfully...`);
                        }).catch(async error => {
                          await session.abortTransaction();
                          session.endSession();
                          return resultResponse(SERVER_ERROR, BET_NOT_DELETE + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` : ""));
                        })
                      }).catch(async error => {
                        await session.abortTransaction();
                        session.endSession();
                        return resultResponse(SERVER_ERROR, BET_NOT_DELETE + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` : ""));
                      })
                    }).catch(async error => {
                      await session.abortTransaction();
                      session.endSession();
                      return resultResponse(SERVER_ERROR, BET_NOT_DELETE + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` : ""));
                    });
                  } else {
                    oldLiability = -(markets_liability[market_id].liability);
                    markets_liability[market_id].liability = 0;
                    return User.updateOne(
                      { _id: user_id },
                      { $inc: { liability: oldLiability, balance: oldLiability }, markets_liability },
                      { upsert: true, setDefaultsOnInsert: true }
                    ).session(session).then(() => {
                      return OddsProfitLoss.deleteMany({ "user_id": user_id, "market_id": market_id }, { session }).then(async () => {
                        Market.updateOne(
                          { market_id },
                          { '$inc': { bet_count: -1 } }
                        ).lean().then().catch(console.error);
                        Match.updateOne(
                          { match_id },
                          { '$inc': { bet_count: -1 } },
                        ).lean().then().catch(console.error);
                        BetCount.updateOne({
                          user_id, match_id, event_id: market_id,
                        }, { $set: { last_update_type: -1 }, $inc: { bet_count: -1 } }
                        ).lean().then().catch(console.error);
                        await session.commitTransaction();
                        session.endSession();
                        return resultResponse(SUCCESS, `Bet ${is_void ? "void" : "delete"} successfully...`);
                      }).catch(async error => {
                        await session.abortTransaction();
                        session.endSession();
                        return resultResponse(CONSTANTS.SERVER_ERROR, BET_NOT_DELETE + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` : ""));
                      });
                    }).catch(async error => {
                      await session.abortTransaction();
                      session.endSession();
                      return resultResponse(CONSTANTS.SERVER_ERROR, BET_NOT_DELETE + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` : ""));
                    });
                  }
                }).catch(async error => {
                  await session.abortTransaction();
                  session.endSession();
                  return resultResponse(SERVER_ERROR, "Error in bet delete" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` : ""));
                });
            } else if (delete_status == 1)
              return resultResponse(NOT_FOUND, "Bet already deleted!");
            else
              return resultResponse(NOT_FOUND, "Bet already void!");
          } else
            return resultResponse(NOT_FOUND, "Bet not found!");
        }).catch(error => resultResponse(SERVER_ERROR, error.message))
    }
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return resultResponse(SERVER_ERROR, "Error in bet delete" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` : ""));
  }
}

async function deleteBets(request) {
  let { body } = request, response = [];
  for (const bet of body.data) {
    request.user = await User.findOne({ _id: ObjectId(bet.user_id) }).select("markets_liability sessions_liability");
    request.body = bet;
    let result = await deleteBet(request);
    response.push(result.data);
  }
  return resultResponse(SUCCESS, [...new Set(response)].toString());
}

async function fn_update_balance_liability_on_result_change(
  session, bet_result_id, market_id, AddSub = 'sub', isRollback = 0, msg = "Result declared successfully...", callFrom = {}
) {/* EXEC UPL START */
  // here we are going to update user liability & balance to its original event initial data. odds_profit_loss.
  /* EXEC OPL START */
  return OddsProfitLoss.aggregate(betQueryService.fn_update_balance_liability_Query(market_id, 0, AddSub), { session })
    .then(async users => {
      try {
        if (users.length) {
          users = users.map(item => ({
            'updateOne': {
              'filter': { _id: item.user_id },
              'update': { $inc: { liability: (item.liability).toFixed(2), balance: (item.liability).toFixed(2) } }
            }
          }));
          await User.bulkWrite(users, { session });
        }
      } catch (error) {
        if (callFrom.hasOwnProperty("is_abandon") || callFrom.hasOwnProperty("is_odds_rollback"))
          if (callFrom.is_abandon || callFrom.is_odds_rollback)
            return resultResponse(SERVER_ERROR, "Error in settle the balance & exposure" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
        await session.abortTransaction();
        session.endSession();
        return resultResponse(SERVER_ERROR, "Error in settle the balance & exposure" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
      }
      if (callFrom.hasOwnProperty("is_abandon"))
        if (callFrom.is_abandon)
          return resultResponse(SUCCESS, msg);
      return fn_update_balance_on_result(session, bet_result_id, market_id, isRollback, msg, callFrom, 0).then(status => status);
    }).catch(async error => {
      if (callFrom.hasOwnProperty("is_abandon") || callFrom.hasOwnProperty("is_odds_rollback"))
        if (callFrom.is_abandon || callFrom.is_odds_rollback)
          return resultResponse(SERVER_ERROR, "Error in fn_update_balance_liability_Query" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
      await session.abortTransaction();
      session.endSession();
      return resultResponse(SERVER_ERROR, "Error in fn_update_balance_liability_Query" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""))
    });
  /* EXEC OPL END */
}

async function fn_update_balance_liability_on_result_changeV1(
  session, bet_result_id, market_id, AddSub = 'sub', isRollback = 0, msg = "Result declared successfully...", callFrom = {}
) {/* EXEC UPL START */
  // here we are going to update user liability & balance to its original event initial data. odds_profit_loss.
  /* EXEC OPL START */
  let users = [];
  try {
    users = await OddsProfitLoss.aggregate(betQueryService.fn_update_balance_liability_Query(market_id, 0, AddSub), { session });
  } catch (error) {
    if (callFrom.hasOwnProperty("is_abandon") || callFrom.hasOwnProperty("is_odds_rollback"))
      if (callFrom.is_abandon || callFrom.is_odds_rollback)
        return resultResponse(SERVER_ERROR, "Error in fn_update_balance_liability_Query" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
    return resultResponse(SERVER_ERROR, "Error in fn_update_balance_liability_Query" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
  }
  try {
    if (users.length) {
      users = users.map(item => ({
        'updateOne': {
          'filter': { _id: item.user_id },
          'update': { $inc: { liability: (item.liability).toFixed(2), balance: (item.liability).toFixed(2) } }
        }
      }));
      await User.bulkWrite(users, { session });
    }
  } catch (error) {
    if (callFrom.hasOwnProperty("is_abandon") || callFrom.hasOwnProperty("is_odds_rollback"))
      if (callFrom.is_abandon || callFrom.is_odds_rollback)
        return resultResponse(SERVER_ERROR, "Error in settle the balance & exposure" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
    await session.abortTransaction();
    session.endSession();
    return resultResponse(SERVER_ERROR, "Error in settle the balance & exposure" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
  }
  if (callFrom.hasOwnProperty("is_abandon"))
    if (callFrom.is_abandon)
      return resultResponse(SUCCESS, msg);
  let response = await fn_update_balance_on_resultV1(session, bet_result_id, market_id, isRollback, msg, callFrom, 0).then(status => status);
  return resultResponse(response.statusCode, response.data);
}

async function fn_update_balance_liability_on_result_changeV2(
  session, bet_result_id, market_id, AddSub = 'sub', isRollback = 0, msg = "Result declared successfully...", callFrom = {}
) {/* EXEC UPL START */
  // here we are going to update user liability & balance to its original event initial data. odds_profit_loss.
  /* EXEC OPL START */
  let users = [];
  try {
    users = await OddsProfitLoss.aggregate(betQueryService.fn_update_balance_liability_QueryV2(market_id, 0, AddSub), { session });
  } catch (error) {
    if (callFrom.hasOwnProperty("is_abandon") || callFrom.hasOwnProperty("is_odds_rollback"))
      if (callFrom.is_abandon || callFrom.is_odds_rollback)
        return resultResponse(SERVER_ERROR, "Error in fn_update_balance_liability_Query" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
    return resultResponse(SERVER_ERROR, "Error in fn_update_balance_liability_Query" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
  }
  try {
    await fn_update_balance_liability_of_users(session, users);
  } catch (error) {
    if (callFrom.hasOwnProperty("is_abandon") || callFrom.hasOwnProperty("is_odds_rollback"))
      if (callFrom.is_abandon || callFrom.is_odds_rollback)
        return resultResponse(SERVER_ERROR, "Error caused: " + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
    await session.abortTransaction();
    session.endSession();
    return resultResponse(SERVER_ERROR, "Error caused: " + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
  }
  if (callFrom.hasOwnProperty("is_abandon"))
    if (callFrom.is_abandon)
      return resultResponse(SUCCESS, msg);
  let response = await fn_update_balance_on_resultV2(session, bet_result_id, market_id, isRollback, msg, callFrom, 0).then(status => status);
  return resultResponse(response.statusCode, response.data);
}

async function fn_update_balance_liability_of_users(session, users) {
  try {
    if (users.length) {
      users = users.map(item => ({
        'updateOne': {
          'filter': { _id: item.user_id },
          'update': { '$inc': { liability: item.liability, balance: item.liability } }
        }
      }));
      let BulkWriteOptions = (session == false) ? { ordered: false } : { session, ordered: false };
      await User.bulkWrite(users, BulkWriteOptions);
    }
  } catch (error) {
    if (error.errorLabels.includes("TransientTransactionError")) {
      throw new Error("TransientTransactionError: users balance & exposure have not been settled" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
    } else {
      console.info('TransientTransactionError, users balance & exposure retry not possible');
      throw new Error("users balance & exposure have not been settled" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
    }
  }
}

async function fn_update_balance_liability_on_odds_result(
  session, bet_result_id, market_id, AddSub = 'sub', isRollback = 0, msg = "Result declared successfully...", callFrom = {}
) {
  let response = await fn_update_balance_on_resultV2(session, bet_result_id, market_id, isRollback, msg, callFrom, 0).then(status => status);
  return resultResponse(response.statusCode, response.data);
}

async function fn_update_balance_liability_on_session_result(
  session, bet_result_id, market_id, AddSub = 'sub', isRollback = 0, msg = "Result declared successfully...", callFrom = {}
) {
  let users = [];
  try {
    users = await FancyScorePosition.aggregate(betQueryService.fn_update_balance_liability_sessionV2(market_id, 0, AddSub), { session });
  } catch (error) {
    return resultResponse(SERVER_ERROR, "Error in fn_update_balance_liability_Query" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
  }
  try {
    await fn_update_balance_liability_of_users(session, users);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return resultResponse(SERVER_ERROR, error.message);
  }
  let response = await fn_update_balance_on_resultV2(session, bet_result_id, market_id, isRollback, msg, callFrom, 1).then(status => status);
  return resultResponse(response.statusCode, response.data);
}

async function fn_update_balance_liability_on_session_resultV3(
  market_id, msg, LOG_UUID, isFancy,
) {
  try {
    let st1 = Date.now();

    logger.SessionResultRollBack(`fn_update_balance_liability_on_session_resultV3: ${LOG_UUID}
    STAGE: 'Started_FetchUserProfitLoss'
    Params: ${JSON.stringify({ event_id: market_id })}
    `);

    const user_profit_loss = await UserProfitLoss.find({ event_id: market_id })
      .lean()
      .exec();


    logger.SessionResultRollBack(`fn_update_balance_liability_on_session_resultV3: ${LOG_UUID}
      STAGE: 'End_FetchUserProfitLoss'
      TimeTaken: ${Date.now() - st1} ms
    `);


    const userObjectRes = await getUserAndAgentCalculatedUpdateObject(
      {
        user_profit_loss,
        isRollback: true,
        LOG_UUID,
        isFancy,
      }
    );

    if (userObjectRes.statusCode != SUCCESS) {
      throw new Error(userObjectRes.data.msg);
    }

    return resultResponse(userObjectRes.statusCode, {
      combinedUserAgentArr: userObjectRes.data,
      msg
    });

  } catch (error) {
    console.error("Error in fn_update_balance_liability_on_session_resultV3: ", error);

    logger.SessionResultRollBack(`fn_update_balance_liability_on_session_resultV3: ${LOG_UUID}
      STAGE: 'ERROR_CATCH_BLOCK'
      Error: ${error.stack}
    `);
    return resultResponse(SERVER_ERROR, { msg: error.message });
  }
}

async function fn_update_balance_on_result(
  session, bet_result_id, event_id, isRollback, msg, callFrom, isFancy
) {
  // here we generate account statements
  /* EXEC ACC_STAT START */
  return UserProfitLoss.aggregate(
    betQueryService.account_statements(bet_result_id, isFancy, isRollback.toString()),
    { session }
  ).then(async (account_statements) => {
    return AccountStatement.insertMany(
      [
        ...account_statements[0].users_account_statement_pl,
        ...account_statements[0].agents_account_statement_pl,
        ...account_statements[0].users_account_statement_comm,
        ...account_statements[0].agents_account_statement_comm,
      ],
      { session }
    ).then(async (acc) => {
      // here we update users(profit loss & balance) & its agents(profit loss).
      /* EXEC UPL START */
      return UserProfitLoss.aggregate(
        betQueryService.fn_update_balance_on_result(bet_result_id, isFancy, isRollback),
        { session }
      ).then(async (updateUserBalanceAndProfitLoss) => {
        if (updateUserBalanceAndProfitLoss.length) {
          updateUserBalanceAndProfitLoss = updateUserBalanceAndProfitLoss[0];
          let users_pl = updateUserBalanceAndProfitLoss.users_pl;
          let agents_pl = updateUserBalanceAndProfitLoss.agents_pl;
          if (isFancy) {
            let fancy_liability = `$sessions_liability.${event_id}.liability`;
            if (isRollback) {
              users_pl = users_pl.map(item => ({
                'updateOne': {
                  'filter': { _id: item.user_id },
                  'update': [{
                    '$set': {
                      balance: {
                        '$cond': {
                          'if': {
                            // (a.user_pl > 0)
                            '$gt': [-(Math.round(item.user_pl * 100 + Number.EPSILON) / 100), 0] // if user has profit.
                          },
                          'then': {
                            "$add": [
                              "$balance",
                              {
                                "$add": [
                                  (Math.round(item.user_pl * 100 + Number.EPSILON) / 100), fancy_liability
                                ]
                              }
                            ]
                          },
                          'else': "$balance"
                        }
                      },
                      liability: { '$add': ["$liability", fancy_liability] },
                      profit_loss: { '$add': ["$profit_loss", (Math.round(item.user_pl * 100 + Number.EPSILON) / 100)] },
                      // Ukraine Concept
                      balance_reference: { '$add': ["$balance_reference", (Math.round(item.user_pl * 100 + Number.EPSILON) / 100)] }
                    }
                  }]
                }
              }));
            } else
              users_pl = users_pl.map(item => ({
                'updateOne': {
                  'filter': { _id: item.user_id },
                  'update': [{
                    '$set': {
                      balance: { '$add': ["$balance", { '$subtract': [(Math.round(item.user_pl * 100 + Number.EPSILON) / 100), fancy_liability] }] },
                      liability: { '$subtract': ["$liability", fancy_liability] },
                      profit_loss: { '$add': ["$profit_loss", (Math.round(item.user_pl * 100 + Number.EPSILON) / 100)] },
                      // Ukraine Concept
                      balance_reference: { '$add': ["$balance_reference", (Math.round(item.user_pl * 100 + Number.EPSILON) / 100)] }
                    }
                  }]
                }
              }));
          } else
            users_pl = users_pl.map(item => ({
              'updateOne': {
                'filter': { _id: item.user_id },
                'update': {
                  '$inc': {
                    balance: (Math.round(item.user_pl * 100 + Number.EPSILON) / 100),
                    profit_loss: (Math.round(item.user_pl * 100 + Number.EPSILON) / 100),
                    // Ukraine Concept
                    balance_reference: (Math.round(item.user_pl * 100 + Number.EPSILON) / 100)
                  }
                }
              }
            }));
          agents_pl = agents_pl.map(item => ({
            'updateOne': {
              'filter': { _id: item.user_id },
              'update': {
                '$inc': {
                  profit_loss: (Math.round(item.p_l * 100 + Number.EPSILON) / 100),
                  // Ukraine Concept
                  balance_reference: (Math.round(item.user_pl * 100 + Number.EPSILON) / 100)
                }
              }
            }
          }));
          return User.bulkWrite(
            users_pl.concat(agents_pl), { session }
          ).then(async (data) => {
            if (callFrom.hasOwnProperty("is_odds_rollback") || callFrom.hasOwnProperty("is_session_rollback"))
              if (callFrom.is_odds_rollback || callFrom.is_session_rollback)
                return resultResponse(SUCCESS, msg);
            await session.commitTransaction();
            // await session.abortTransaction();
            session.endSession();
            return resultResponse(SUCCESS, msg);
            // return resultResponse(SERVER_ERROR, "Error");
          }).catch(async error => {
            if (callFrom.hasOwnProperty("is_odds_rollback") || callFrom.hasOwnProperty("is_session_rollback"))
              if (callFrom.is_odds_rollback || callFrom.is_session_rollback)
                return resultResponse(SERVER_ERROR, "Error while updating users & agents pl & commission" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
            await session.abortTransaction();
            session.endSession();
            return resultResponse(SERVER_ERROR, "Error while updating users & agents pl & commission" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""))
          });
        }
        if (callFrom.hasOwnProperty("is_odds_rollback") || callFrom.hasOwnProperty("is_session_rollback"))
          if (callFrom.is_odds_rollback || callFrom.is_session_rollback)
            return resultResponse(NOT_FOUND, "User balance & profit loss not updated.");
        await session.abortTransaction();
        session.endSession();
        return resultResponse(NOT_FOUND, "User balance & profit loss not updated.");
      }).catch(async error => {
        if (callFrom.hasOwnProperty("is_odds_rollback") || callFrom.hasOwnProperty("is_session_rollback"))
          if (callFrom.is_odds_rollback || callFrom.is_session_rollback)
            return resultResponse(SERVER_ERROR, "Error in fn_update_balance_on_result Query" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
        await session.abortTransaction();
        session.endSession();
        return resultResponse(SERVER_ERROR, "Error in fn_update_balance_on_result Query" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""))
      });
      /* EXEC UPL END */
    }).catch(async error => {
      if (callFrom.hasOwnProperty("is_odds_rollback") || callFrom.hasOwnProperty("is_session_rollback"))
        if (callFrom.is_odds_rollback || callFrom.is_session_rollback)
          return resultResponse(SERVER_ERROR, "Error while generate account statements" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
      await session.abortTransaction();
      session.endSession();
      return resultResponse(SERVER_ERROR, "Error while generate account statements" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""))
    });
  }).catch(async error => {
    if (callFrom.hasOwnProperty("is_odds_rollback") || callFrom.hasOwnProperty("is_session_rollback"))
      if (callFrom.is_odds_rollback || callFrom.is_session_rollback)
        return resultResponse(SERVER_ERROR, "Error in account_statements Query" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
    await session.abortTransaction();
    session.endSession();
    return resultResponse(SERVER_ERROR, "Error in account_statements Query" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""))
  });
  /* EXEC ACC_STAT END */
}

async function fn_update_balance_on_resultV1(
  session, bet_result_id, event_id, isRollback, msg, callFrom, isFancy
) {
  // here we generate account statements
  /* EXEC ACC_STAT START */
  let account_statements;
  try {
    account_statements = await UserProfitLoss.aggregate(
      betQueryService.account_statements(bet_result_id, isFancy, isRollback.toString()),
      { session }
    );
  } catch (error) {
    if (callFrom.hasOwnProperty("is_odds_rollback") || callFrom.hasOwnProperty("is_session_rollback"))
      if (callFrom.is_odds_rollback || callFrom.is_session_rollback)
        return resultResponse(SERVER_ERROR, "Error in account_statements Query" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
    return resultResponse(SERVER_ERROR, "Error in account_statements Query" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
  }

  try {
    await AccountStatement.insertMany(
      [
        ...account_statements[0].users_account_statement_pl,
        ...account_statements[0].agents_account_statement_pl,
        ...account_statements[0].users_account_statement_comm,
        ...account_statements[0].agents_account_statement_comm,
      ],
      { session }
    )
  } catch (error) {
    if (callFrom.hasOwnProperty("is_odds_rollback") || callFrom.hasOwnProperty("is_session_rollback"))
      if (callFrom.is_odds_rollback || callFrom.is_session_rollback)
        return resultResponse(SERVER_ERROR, "Error while generate account statements" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
    return resultResponse(SERVER_ERROR, "Error while generate account statements" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
  }

  try {
    let updateUserBalanceAndProfitLoss = await UserProfitLoss.aggregate(
      betQueryService.fn_update_balance_on_result(bet_result_id, isFancy, isRollback),
      { session }
    );
    if (updateUserBalanceAndProfitLoss.length) {
      updateUserBalanceAndProfitLoss = updateUserBalanceAndProfitLoss[0];
      let users_pl = updateUserBalanceAndProfitLoss.users_pl;
      let agents_pl = updateUserBalanceAndProfitLoss.agents_pl;
      if (isFancy) {
        let fancy_liability = `$sessions_liability.${event_id}.liability`;
        if (isRollback) {
          users_pl = users_pl.map(item => ({
            'updateOne': {
              'filter': { _id: item.user_id },
              'update': [{
                '$set': {
                  balance: { "$add": [{ "$add": [(Math.round(item.user_pl * 100 + Number.EPSILON) / 100), fancy_liability] }, "$balance"] },
                  liability: { '$add': ["$liability", fancy_liability] },
                  profit_loss: { '$add': ["$profit_loss", (Math.round(item.user_pl * 100 + Number.EPSILON) / 100)] },
                  // Ukraine Concept
                  balance_reference: { '$add': ["$balance_reference", (Math.round(item.user_pl * 100 + Number.EPSILON) / 100)] }
                }
              }]
            }
          }));
        } else
          users_pl = users_pl.map(item => ({
            'updateOne': {
              'filter': { _id: item.user_id },
              'update': [{
                '$set': {
                  balance: { '$add': ["$balance", { '$subtract': [(Math.round(item.user_pl * 100 + Number.EPSILON) / 100), fancy_liability] }] },
                  liability: { '$subtract': ["$liability", fancy_liability] },
                  profit_loss: { '$add': ["$profit_loss", (Math.round(item.user_pl * 100 + Number.EPSILON) / 100)] },
                  // Ukraine Concept
                  balance_reference: { '$add': ["$balance_reference", (Math.round(item.user_pl * 100 + Number.EPSILON) / 100)] }
                }
              }]
            }
          }));
      } else
        users_pl = users_pl.map(item => ({
          'updateOne': {
            'filter': { _id: item.user_id },
            'update': {
              '$inc': {
                // Ukraine Concept
                balance: (Math.round(item.user_pl * 100 + Number.EPSILON) / 100),
                profit_loss: (Math.round(item.user_pl * 100 + Number.EPSILON) / 100),
                balance_reference: (Math.round(item.user_pl * 100 + Number.EPSILON) / 100)
              }
            }
          }
        }));
      agents_pl = agents_pl.map(item => ({
        'updateOne': {
          'filter': { _id: item.user_id },
          'update': {
            '$inc': {
              // Ukraine Concept
              profit_loss: (Math.round(item.p_l * 100 + Number.EPSILON) / 100),
              balance_reference: (Math.round(item.user_pl * 100 + Number.EPSILON) / 100)
            }
          }
        }
      }));

      try {
        await User.bulkWrite(users_pl.concat(agents_pl), { session });
        if (callFrom.hasOwnProperty("is_odds_rollback") || callFrom.hasOwnProperty("is_session_rollback"))
          if (callFrom.is_odds_rollback || callFrom.is_session_rollback)
            return resultResponse(SUCCESS, msg);
        return resultResponse(SUCCESS, msg);
        // await session.abortTransaction();
        // return resultResponse(SERVER_ERROR, "Error");
      } catch (error) {
        if (callFrom.hasOwnProperty("is_odds_rollback") || callFrom.hasOwnProperty("is_session_rollback"))
          if (callFrom.is_odds_rollback || callFrom.is_session_rollback)
            return resultResponse(SERVER_ERROR, "Error while updating users & agents pl & commission" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
        return resultResponse(SERVER_ERROR, "Error while updating users & agents pl & commission" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
      }
    }
    if (callFrom.hasOwnProperty("is_odds_rollback") || callFrom.hasOwnProperty("is_session_rollback"))
      if (callFrom.is_odds_rollback || callFrom.is_session_rollback)
        return resultResponse(NOT_FOUND, "User balance & profit loss not updated.");
    return resultResponse(NOT_FOUND, "User balance & profit loss not updated.");
  } catch (error) {
    if (callFrom.hasOwnProperty("is_odds_rollback") || callFrom.hasOwnProperty("is_session_rollback"))
      if (callFrom.is_odds_rollback || callFrom.is_session_rollback)
        return resultResponse(SERVER_ERROR, "Error in fn_update_balance_on_result Query" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
    return resultResponse(SERVER_ERROR, "Error in fn_update_balance_on_result Query" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
  }
  /* EXEC ACC_STAT END */
}

function generateCommissionEntries(account_statement_commissions, p_l = [], pl_type) {
  let account_statement_commissions_new = [];
  for (const account_statement_commission of account_statement_commissions) {
    let item = account_statement_commission;
    if (pl_type == USERS)
      p_l.push({
        'updateOne': {
          'filter': { _id: item.user_id },
          'update': [{
            '$set': {
              balance: {
                $round: [
                  {
                    $add: [
                      { $ifNull: ["$balance", 0] },
                      fixFloatingPoint(item.user_pl),
                    ],
                  },
                  2,
                ],
              },
              profit_loss: {
                $round: [
                  {
                    $add: [
                      { $ifNull: ["$profit_loss", 0] },
                      fixFloatingPoint(item.user_pl),
                    ],
                  },
                  2,
                ],
              },
              // Ukraine Concept
              balance_reference: {
                $round: [
                  {
                    $add: [
                      { $ifNull: ["$balance_reference", 0] },
                      fixFloatingPoint(item.user_pl),
                    ],
                  },
                  2,
                ],
              },
              //party in loss 
              // Update sport_pl if sport_id 
              ...([...LIVE_SPORTS, ...RACING_SPORTS].includes(item.sport_id)
                && {
                sport_pl: {
                  $round: [
                    {
                      $add: [
                        { $ifNull: ["$sport_pl", 0] },
                        fixFloatingPoint(item.user_pl)
                      ],
                    },
                    2,
                  ],
                },
              }),
              // Update other_pl if sport_id is 'QT'
              ...(item.sport_id === 'QT'
                && {
                third_party_pl: {
                  $round: [
                    {
                      $add: [
                        { $ifNull: ["$third_party_pl", 0] },
                        fixFloatingPoint(item.user_pl)
                      ],
                    },
                    2,
                  ],
                },
              }),
              // Update other_pl if sport_id is 'aura'
              ...(item.sport_id === '-100'
                && {
                casino_pl: {
                  $round: [
                    {
                      $add: [
                        { $ifNull: ["$casino_pl", 0] },
                        fixFloatingPoint(item.user_pl)
                      ],
                    },
                    2,
                  ],
                },
              }),

              // Chip Summary
              settlement_pl: {
                $round: [
                  {
                    $add: [
                      { $ifNull: ["$settlement_pl", 0] },
                      fixFloatingPoint(-item.amount),
                    ],
                  },
                  2,
                ],
              },
              settlement_comm: {
                $round: [
                  {
                    $add: [
                      { $ifNull: ["$settlement_comm", 0] },
                      fixFloatingPoint(-item.amount_comm),
                    ],
                  },
                  2,
                ],
              },
              settlement_pl_comm: {
                $round: [
                  {
                    $add: [
                      { $ifNull: ["$settlement_pl_comm", 0] },
                      fixFloatingPoint(-(item.amount + item.amount_comm)),
                    ],
                  },
                  2,
                ],
              },
            }
          }]
        }
      });
    else
      p_l.push({
        'updateOne': {
          'filter': { _id: item.user_id },
          'update': [{
            '$set': {
              profit_loss: {
                $round: [
                  {
                    $add: [
                      { $ifNull: ["$profit_loss", 0] },
                      fixFloatingPoint(item.p_l),
                    ],
                  },
                  2,
                ],
              },

              // Ukraine Concept
              balance_reference: {
                $round: [
                  {
                    $add: [
                      { $ifNull: ["$balance_reference", 0] },
                      fixFloatingPoint(item.user_pl),
                    ],
                  },
                  2,
                ],
              },
              //party win loss 
              // Update sport_pl if sport_id 
              ...([...LIVE_SPORTS, ...RACING_SPORTS].includes(item.sport_id)
                && {
                sport_pl: {
                  $round: [
                    {
                      $add: [
                        { $ifNull: ["$sport_pl", 0] },
                        fixFloatingPoint(-(item.user_pl))
                      ],
                    },
                    2,
                  ],
                },
              }),
              // Update other_pl if sport_id is 'QT'
              ...(item.sport_id === 'QT'
                && {
                third_party_pl: {
                  $round: [
                    {
                      $add: [
                        { $ifNull: ["$third_party_pl", 0] },
                        fixFloatingPoint(-(item.user_pl))
                      ],
                    },
                    2,
                  ],
                },
              }),
              // Update other_pl if sport_id is 'aura'
              ...(item.sport_id === '-100'
                && {
                casino_pl: {
                  $round: [
                    {
                      $add: [
                        { $ifNull: ["$casino_pl", 0] },
                        fixFloatingPoint(-(item.user_pl))
                      ],
                    },
                    2,
                  ],
                },
              }),

              // Chip Summary
              settlement_pl: {
                $round: [
                  {
                    $add: [
                      { $ifNull: ["$settlement_pl", 0] },
                      fixFloatingPoint(item.added_pl),
                    ],
                  },
                  2,
                ],
              },
              settlement_comm: {
                $round: [
                  {
                    $add: [
                      { $ifNull: ["$settlement_comm", 0] },
                      fixFloatingPoint(item.added_comm),
                    ],
                  },
                  2,
                ],
              },
              settlement_pl_comm: {
                $round: [
                  {
                    $add: [
                      { $ifNull: ["$settlement_pl_comm", 0] },
                      fixFloatingPoint(item.added_pl + item.added_comm),
                    ],
                  },
                  2,
                ],
              },
            }
          }]
        }
      });
    if (account_statement_commission.amount_comm != 0) {
      account_statement_commission.description = account_statement_commission.description_comm;
      account_statement_commission.statement_type = account_statement_commission.statement_type_comm;
      account_statement_commission.amount = account_statement_commission.amount_comm;
      account_statement_commission.available_balance = account_statement_commission.available_balance_comm;
      account_statement_commissions_new.push(account_statement_commission);
    }
  }
  return account_statement_commissions_new;
}

async function fn_update_balance_on_resultV2(
  session, bet_result_id, event_id, isRollback, msg, callFrom, isFancy
) {
  // here we generate account statements for users
  /* EXEC ACC_STAT START */
  let users_pl = [], agents_pl = [];
  let account_statements_users;
  let BulkWriteOptions = (session == false) ? { ordered: false } : { session, ordered: false };
  try {
    account_statements_users = await UserProfitLoss.aggregate(
      betQueryService.account_statementsV2(bet_result_id, isFancy, isRollback.toString(), USERS),
      (session == false) ? {} : { session }
    );
  } catch (error) {
    if (callFrom.hasOwnProperty("is_odds_rollback") || callFrom.hasOwnProperty("is_session_rollback"))
      if (callFrom.is_odds_rollback || callFrom.is_session_rollback)
        return resultResponse(SERVER_ERROR, "Error in account_statements_users Query" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
    return resultResponse(SERVER_ERROR, "Error in account_statements_users Query" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
  }
  try {
    let usersAndCommissionStatement = [];
    let account_statements_user = account_statements_users;
    if (account_statements_user.length)
      usersAndCommissionStatement.push(AccountStatement.insertMany(account_statements_user, BulkWriteOptions));
    let users_account_statement_comm_s = JSON.parse(JSON.stringify(account_statements_users));
    users_account_statement_comm_s = generateCommissionEntries(users_account_statement_comm_s, users_pl, USERS);
    if (users_account_statement_comm_s.length)
      usersAndCommissionStatement.push(AccountStatement.insertMany(users_account_statement_comm_s, BulkWriteOptions));
    if (usersAndCommissionStatement.length)
      await Promise.all(usersAndCommissionStatement);
  } catch (error) {
    if (callFrom.hasOwnProperty("is_odds_rollback") || callFrom.hasOwnProperty("is_session_rollback"))
      if (callFrom.is_odds_rollback || callFrom.is_session_rollback)
        return resultResponse(SERVER_ERROR, "Error while generate account statements for users" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
    return resultResponse(SERVER_ERROR, "Error while generate account statements for users" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
  }

  let account_statements_agents;
  try {
    account_statements_agents = await UserProfitLoss.aggregate(
      betQueryService.account_statementsV2(bet_result_id, isFancy, isRollback.toString(), AGENTS),
      (session == false) ? {} : { session }
    );
  } catch (error) {
    if (callFrom.hasOwnProperty("is_odds_rollback") || callFrom.hasOwnProperty("is_session_rollback"))
      if (callFrom.is_odds_rollback || callFrom.is_session_rollback)
        return resultResponse(SERVER_ERROR, "Error in account_statements_agents Query" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
    return resultResponse(SERVER_ERROR, "Error in account_statements_agents Query" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
  }
  try {
    let agentsAndCommissionStatement = [];
    let account_statements_agent = account_statements_agents;
    if (!IS_STATEMENT_GENRATE_FOR_ZERO_SHARE) {
      account_statements_agent = account_statements_agent.filter(data => data.amount != 0);
    }
    if (account_statements_agent.length)
      agentsAndCommissionStatement.push(AccountStatement.insertMany(account_statements_agent, BulkWriteOptions));
    let agents_account_statement_comm_s = JSON.parse(JSON.stringify(account_statements_agents));
    agents_account_statement_comm_s = generateCommissionEntries(agents_account_statement_comm_s, agents_pl, AGENTS);
    if (agents_account_statement_comm_s.length)
      agentsAndCommissionStatement.push(AccountStatement.insertMany(agents_account_statement_comm_s, BulkWriteOptions));
    if (agentsAndCommissionStatement.length)
      await Promise.all(agentsAndCommissionStatement);
  } catch (error) {
    if (callFrom.hasOwnProperty("is_odds_rollback") || callFrom.hasOwnProperty("is_session_rollback"))
      if (callFrom.is_odds_rollback || callFrom.is_session_rollback)
        return resultResponse(SERVER_ERROR, "Error while generate account statements for agents" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
    return resultResponse(SERVER_ERROR, "Error while generate account statements for agents" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
  }
  /* EXEC ACC_STAT END */

  try {
    await User.bulkWrite(users_pl.concat(agents_pl), BulkWriteOptions);
    if (callFrom.hasOwnProperty("is_odds_rollback") || callFrom.hasOwnProperty("is_session_rollback"))
      if (callFrom.is_odds_rollback || callFrom.is_session_rollback)
        return resultResponse(SUCCESS, msg);
    return resultResponse(SUCCESS, msg);
    await session.abortTransaction();
    return resultResponse(SERVER_ERROR, "Error");
  } catch (error) {
    if (callFrom.hasOwnProperty("is_odds_rollback") || callFrom.hasOwnProperty("is_session_rollback"))
      if (callFrom.is_odds_rollback || callFrom.is_session_rollback)
        return resultResponse(SERVER_ERROR, "Error while updating users & agents pl & commission" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
    if (error.errorLabels.includes("TransientTransactionError")) {
      return resultResponse(SERVER_ERROR, "TransientTransactionError: Error while updating users & agents pl & commission" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
    } else {
      console.info('TransientTransactionError, Error in users & agents pl retry not possible');
      return resultResponse(SERVER_ERROR, "Error while updating users & agents pl & commission" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
    }
  }
}

function generateCommissionEntriesCasino(account_statement_commissions, p_l = [], pl_type) {
  let account_statement_commissions_new = [];
  for (const account_statement_commission of account_statement_commissions) {
    let item = account_statement_commission;
    if (pl_type == USERS)
      p_l.push({
        'updateOne': {
          'filter': { _id: item.user_id },
          'update': [{
            '$set': {
              profit_loss: {
                $round: [
                  {
                    $add: [
                      { $ifNull: ["$profit_loss", 0] },
                      fixFloatingPoint(item.user_pl),
                    ],
                  },
                  2,
                ],
              },
              // Ukraine Concept
              balance_reference: {
                $round: [
                  {
                    $add: [
                      { $ifNull: ["$balance_reference", 0] },
                      fixFloatingPoint(item.user_pl),
                    ],
                  },
                  2,
                ],
              },
              //party win loss 
              // Update sport_pl if sport_id 
              ...([...LIVE_SPORTS, ...RACING_SPORTS].includes(item.sport_id) && {
                sport_pl: {
                  $round: [
                    {
                      $add: [
                        { $ifNull: ["$sport_pl", 0] },
                        fixFloatingPoint(item.user_pl)
                      ],
                    },
                    2,
                  ],
                },
              }),
              // Update other_pl if sport_id is 'QT'
              ...(item?.casinoProvider === 'QT' && {
                third_party_pl: {
                  $round: [
                    {
                      $add: [
                        { $ifNull: ["$third_party_pl", 0] },
                        fixFloatingPoint(item.user_pl)
                      ],
                    },
                    2,
                  ],
                },
              }),
              // Update other_pl if sport_id is 'aura'
              ...(item.sport_id === '-100' && {
                casino_pl: {
                  $round: [
                    {
                      $add: [
                        { $ifNull: ["$casino_pl", 0] },
                        fixFloatingPoint(item.user_pl)
                      ],
                    },
                    2,
                  ],
                },
              }),
              // Chip Summary
              settlement_pl: {
                $round: [
                  {
                    $add: [
                      { $ifNull: ["$settlement_pl", 0] },
                      fixFloatingPoint(-item.amount),
                    ],
                  },
                  2,
                ],
              },
              settlement_comm: {
                $round: [
                  {
                    $add: [
                      { $ifNull: ["$settlement_comm", 0] },
                      fixFloatingPoint(-item.amount_comm),
                    ],
                  },
                  2,
                ],
              },
              settlement_pl_comm: {
                $round: [
                  {
                    $add: [
                      { $ifNull: ["$settlement_pl_comm", 0] },
                      fixFloatingPoint(-(item.amount + item.amount_comm)),
                    ],
                  },
                  2,
                ],
              },
            }
          }]
        }
      });
    else
      p_l.push({
        'updateOne': {
          'filter': { _id: item.user_id },
          'update': [{
            '$set': {
              profit_loss: {
                $round: [
                  {
                    $add: [
                      { $ifNull: ["$profit_loss", 0] },
                      fixFloatingPoint(item.p_l),
                    ],
                  },
                  2,
                ],
              },
              // Ukraine Concept
              balance_reference: {
                $round: [
                  {
                    $add: [
                      { $ifNull: ["$balance_reference", 0] },
                      fixFloatingPoint(item.user_pl),
                    ],
                  },
                  2,
                ],
              },
              //party win loss 
              // Update sport_pl if sport_id 
              ...([...LIVE_SPORTS, ...RACING_SPORTS].includes(item.sport_id) && {
                sport_pl: {
                  $round: [
                    {
                      $add: [
                        { $ifNull: ["$sport_pl", 0] },
                        fixFloatingPoint(-(item.user_pl))
                      ],
                    },
                    2,
                  ],
                },
              }),
              // Update other_pl if sport_id is 'QT'
              ...(item?.casinoProvider === 'QT' && {
                third_party_pl: {
                  $round: [
                    {
                      $add: [
                        { $ifNull: ["$third_party_pl", 0] },
                        fixFloatingPoint(-(item.user_pl))
                      ],
                    },
                    2,
                  ],
                },
              }),
              // Update other_pl if sport_id is 'aura'
              ...(item.sport_id === '-100' && {
                casino_pl: {
                  $round: [
                    {
                      $add: [
                        { $ifNull: ["$casino_pl", 0] },
                        fixFloatingPoint(-(item.user_pl))
                      ],
                    },
                    2,
                  ],
                },
              }),
              // Chip Summary
              settlement_pl: {
                $round: [
                  {
                    $add: [
                      { $ifNull: ["$settlement_pl", 0] },
                      fixFloatingPoint(item.added_pl),
                    ],
                  },
                  2,
                ],
              },
              settlement_comm: {
                $round: [
                  {
                    $add: [
                      { $ifNull: ["$settlement_comm", 0] },
                      fixFloatingPoint(item.added_comm),
                    ],
                  },
                  2,
                ],
              },
              settlement_pl_comm: {
                $round: [
                  {
                    $add: [
                      { $ifNull: ["$settlement_pl_comm", 0] },
                      fixFloatingPoint(item.added_pl + item.added_comm),
                    ],
                  },
                  2,
                ],
              },
            }
          }]
        }
      });
  }
  return account_statement_commissions_new;
}

async function fn_update_balance_on_resultV2_casino(
  bet_result_id, event_id, isRollback, msg, callFrom, isFancy
) {
  // here we generate account statements for users
  /* EXEC ACC_STAT START */
  let users_pl = [], agents_pl = [];
  let account_statements_users;
  try {
    account_statements_users = await UserProfitLoss.aggregate(
      betQueryService.account_statementsV2_casino(bet_result_id, isFancy, isRollback.toString(), USERS),
    );
  } catch (error) {
    return resultResponse(SERVER_ERROR, "Error in account_statements_users Query " + error.message);
  }
  try {
    await AccountStatement.insertMany(account_statements_users, { ordered: false });
    let users_account_statement_comm_s = JSON.parse(JSON.stringify(account_statements_users));
    generateCommissionEntriesCasino(users_account_statement_comm_s, users_pl, USERS);
  } catch (error) {
    return resultResponse(SERVER_ERROR, "Error while generate account statements for users " + error.message);
  }

  let account_statements_agents;
  try {
    account_statements_agents = await UserProfitLoss.aggregate(
      betQueryService.account_statementsV2_casino(bet_result_id, isFancy, isRollback.toString(), AGENTS),
    );
  } catch (error) {
    return resultResponse(SERVER_ERROR, "Error in account_statements_agents Query " + error.message);
  }
  try {
    let account_statements_agent = account_statements_agents;
    if (!IS_STATEMENT_GENRATE_FOR_ZERO_SHARE) {
      account_statements_agent = account_statements_agent.filter(data => data.amount != 0);
    }
    await AccountStatement.insertMany(account_statements_agent, { ordered: false });
    let agents_account_statement_comm_s = JSON.parse(JSON.stringify(account_statements_agents));
    generateCommissionEntriesCasino(agents_account_statement_comm_s, agents_pl, AGENTS);
  } catch (error) {
    return resultResponse(SERVER_ERROR, "Error while generate account statements for agents " + error.message);
  }
  /* EXEC ACC_STAT END */

  try {
    await User.bulkWrite(users_pl.concat(agents_pl), { ordered: false });
    return resultResponse(SUCCESS, msg);
  } catch (error) {
    return resultResponse(SERVER_ERROR, "Error while updating users & agents pl & commission " + error.message);
  }
}

async function oddsResultPreProcess(request, { LOG_REF_CODE, fromCron }) {
  LOG_REF_CODE = LOG_REF_CODE || generateUUID();

  logger.SessionResultRollBack(`${LOG_REF_CODE} Starting oddsResultPreProcess
    Body: ${JSON.stringify(request.body)}
  `);

  try {
    logger.SessionResultRollBack(`${LOG_REF_CODE} oddsResultPreProcess
      Stage: Start_Fetching_Market_Data
    `);
    let market = await marketService.getMarketDetail(
      {
        "runners.market_id": request.body.market_id,
        "runners.selection_id": request.body.is_tbp
          ? {
            $in: request.body.selection_id.split(",").map((i) => parseInt(i)),
          }
          : request.body.selection_id,
      },
      {
        ...(request.body.is_tbp
          ? { "runners.selection_id": 1, "runners.selection_name": 1 }
          : { "runners.$": 1 }),
        sport_id: 1,
        sport_name: 1,
        series_id: 1,
        series_name: 1,
        match_id: 1,
        match_name: 1,
        market_id: 1,
        market_name: 1,
        match_date: 1,
        market_type: 1,
        result_cron_progress: 1,
        is_result_declared: 1,
        is_processing: 1,
        processing_message: 1,
      }
    );

    logger.SessionResultRollBack(`${LOG_REF_CODE} oddsResultPreProcess
      Stage: End_Fetching_Market_Data
      Res: ${JSON.stringify(market)}
    `);

    if (market.statusCode != SUCCESS)
      return resultResponse(market.statusCode, market.data);

    const {
      sport_id,
      sport_name,
      series_id,
      series_name,
      match_id,
      match_name,
      market_id,
      market_name,
      runners,
      match_date,
      market_type,
      is_processing,
      is_result_declared,
      result_cron_progress,
      processing_message,
    } = market.data;

    // Check if In Processing
    if (is_processing == 4) {
      logger.SessionResultRollBack(`WARN: ${LOG_REF_CODE} Result for market '${market_id}' is Struck around Queue`, market);
      return resultResponse(VALIDATION_FAILED, `Result for market '${market_id}' is Struck around Queue`);
    }

    // Check if the result is already declared.
    if (is_result_declared == 1) {
      logger.SessionResultRollBack(`WARN: ${LOG_REF_CODE} Result already declared for market '${market_id}'`, market);
      return resultResponse(VALIDATION_FAILED, `Result already declared for market '${market_id}'`);
    }

    // Check Bets Count
    const betOddsFilter = {
      match_id,
      market_id,
      delete_status: 0,
      ...(processing_message ? {} : { is_result_declared: 0 }),
    };
    const isBetsExist = await BetsOdds.findOne(betOddsFilter, { _id: 1 })
      .lean()
      .exec();

    if (!isBetsExist) {
      logger.SessionResultRollBack(
        `WARN: ${LOG_REF_CODE} No bets found for market '${market_id}'`,
        market
      );
      return resultResponse(
        VALIDATION_FAILED,
        `No bets found for market '${market_id}'`
      );
    }

    const filteredRunners = !request.body.is_tbp
      ? runners
      : runners.filter((i) =>
        request.body.selection_id.toString().includes(i.selection_id)
      );
    const selection_id = request.body.is_tbp
      ? filteredRunners.map((i) => i.selection_id).join(",")
      : runners[0].selection_id;
    const selection_name = request.body.is_tbp
      ? filteredRunners.map((i) => i.selection_name).join(",")
      : runners[0].selection_name;

    const data = {
      sport_id,
      sport_name,
      series_id,
      series_name,
      match_id,
      match_name,
      market_id,
      market_name,
      selection_id,
      selection_name,
      match_date,
      market_type,
    };
    try {
      const betResultQuery = {
        sport_id,
        series_id,
        match_id,
        market_id,
      };

      logger.SessionResultRollBack(`${LOG_REF_CODE} oddsResultPreProcess
        Stage: Start_Fetch_Bet_Results
        Query: ${JSON.stringify(betResultQuery)}
      `);

      let betResultAlreadyDeclared = await BetResults.findOne(betResultQuery);

      logger.SessionResultRollBack(`${LOG_REF_CODE} oddsResultPreProcess
        Stage: End_Fetch_Bet_Results
        Res: ${JSON.stringify(betResultAlreadyDeclared)}
      `);

      if (betResultAlreadyDeclared != null)
        return resultResponse(SERVER_ERROR, "Result already declared!");

      let betResult = new BetResults(
        Object.assign(data, { winner_name: selection_name })
      );

      try {
        if (!fromCron && MARKET_RESULT_TYPE == "CRON") {
          if (result_cron_progress || result_cron_progress === 0) {
            let message = "Result Already Requested";
            if (result_cron_progress === 1) {
              message = "Result is In Progress";
            } else if (result_cron_progress === 2) {
              message = "Result already Declared";
            } else if (result_cron_progress === 3) {
              message = "Some Error Occured During Result Cron";
            }
            message = `${message} for market '${market_name}(${market_id})'!`;
            logger.SessionResultRollBack(`${LOG_REF_CODE} ${message}`);
            return resultResponse(VALIDATION_FAILED, message);
          }

          const updateMarket = await Market.updateOne(
            { market_id },
            {
              $set: {
                result_value: request.body.selection_id,
                result_cron_progress: 0,
                result_cron_progress_message: "Result_Requested",
              },
            }
          );

          const msg = `Result successfully Requested for market_id: ${market_id}`;
          logger.SessionResultRollBack(`${LOG_REF_CODE} ${msg}`);
          return resultResponse(SUCCESS, { msg, data });
        } else {
          const resultFunctionParams = Object.assign(data, {
            bet_result_id: betResult._id,
            is_tbp: request.body.is_tbp,
            LOG_REF_CODE,
          });
          const functionName =
            MARKET_RESULT_VERSION == "V3" ? "oddsResultV3" : "oddsResultV2";

          logger.SessionResultRollBack(
            `${LOG_REF_CODE} Calling ${functionName} with data`,
            resultFunctionParams
          );

          let oddsResult;
          if (MARKET_RESULT_VERSION == "V3") {
            oddsResult = await oddsResultV3(resultFunctionParams);
          } else {
            oddsResult = await oddsResultV2(resultFunctionParams);
          }

          if (oddsResult.statusCode != SUCCESS) {
            try {
              await Market.updateOne(
                { sport_id, series_id, match_id, market_id },
                { result_status: oddsResult.data }
              );
            } catch (error) {
              return resultResponse(
                SERVER_ERROR,
                "Result not declared and error while updating market status when odds Result not getting succeeded!"
              );
            }
            return resultResponse(SERVER_ERROR, oddsResult.data);
          }

          const tasks = [
            betResult.save(),
            Market.updateOne(
              { sport_id, series_id, match_id, market_id },
              {
                result_status: oddsResult.data,
                is_active: 0,
                is_result_declared: 1,
                bet_result_id: betResult._id,
                result_selection_id: selection_id,
                result_selection_name: selection_name,
                result_settled_at: new Date(),
                result_settled_ip: request.ip_data || "Settled By Cron",
                is_processing: 2,
                processing_message: "Result_Success",
                rollback_cron_progress: null,
                rollback_cron_progress_message: "",
              }
            ),
          ];

          if (market_name == MATCH_ODDS) {
            tasks.push(
              ...[
                Match.updateOne(
                  { match_id },
                  { is_active: 0, is_result_declared: 1 }
                ),
                MarketAnalysis.deleteMany({ match_id }),
                Fancy.updateMany(
                  { match_id, is_active: 1 },
                  { is_active: 0, is_visible: false }
                ),
              ]
            );

          }

          await Promise.all(tasks);
          deleteConcurrencyByKey(getOddsResultUID(market_id));

          return resultResponse(SUCCESS, {
            msg: "Result declared successfully...",
            data,
          });
        }
      } catch (error) {
        console.log(error);
        logger.SessionResultRollBack(`${LOG_REF_CODE} oddsResultPreProcess
          Stage: Catch_Block_3
          Error: ${JSON.stringify(error)}
          Error Stack: ${error.stack}
        `);
        return resultResponse(
          SERVER_ERROR,
          `Result not declared: ${error.message}, Try again later...`
        );
      }
    } catch (error) {
      console.log(error);
      logger.SessionResultRollBack(`${LOG_REF_CODE} oddsResultPreProcess
        Stage: Catch_Block_2
        Error: ${JSON.stringify(error)}
        Error Stack: ${error.stack}
      `);
      return resultResponse(
        SERVER_ERROR,
        `Error while getting result: ${error.message}`
      );
    }
  } catch (error) {
    console.log(error);
    logger.SessionResultRollBack(`${LOG_REF_CODE} oddsResultPreProcess
      Stage: Catch_Block_1
      Error: ${JSON.stringify(error)}
      Error Stack: ${error.stack}
    `);
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function oddsResult(params) {
  const session = await mongoose.startSession({
    readPreference: 'primary',
    readConcern: { level: 'majority' },
    writeConcern: { w: 'majority' },
  });
  try {
    let { bet_result_id, market_id } = params;
    session.startTransaction();
    // here we update all the betOdds data with respect to the winning team.
    /* EXEC BODDS START */
    return BetsOdds.bulkWrite(
      betQueryService.updateBetRecordsOnResultDeclareQuery(params), { session }
    ).then(async () => {
      /* EXEC BODDS END */
      return BetsOdds.aggregate(betQueryService.sp_set_result_odds(params), { session }).then(async user_profit_loss => {
        // here we insert users profit losses with respect to the share & commission in user_profit_loss.
        /* EXEC UPL START */
        return UserProfitLoss.insertMany(user_profit_loss, { session }).then((user_profit_loss_pl) => {
          return fn_update_balance_liability_on_result_change(session, bet_result_id, market_id).then(status => status);
        }).catch(async error => {
          await session.abortTransaction();
          session.endSession();
          return resultResponse(SERVER_ERROR, "Error while inserting the user_profit_loss" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""))
        });
        /* EXEC UPL END */
      }).catch(async error => {
        await session.abortTransaction();
        session.endSession();
        return resultResponse(SERVER_ERROR, "Error in sp_set_result_odds Query" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""))
      });
    }).catch(async error => {
      await session.abortTransaction();
      session.endSession();
      return resultResponse(SERVER_ERROR, "Error while updating bets data" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""))
    })
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return resultResponse(SERVER_ERROR, "Error in result declare" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
  }
}

async function oddsResultV1(params) {
  const session = await mongoose.startSession();
  const transactionOptions = {
    readPreference: 'primary',
    readConcern: { level: 'majority' },
    writeConcern: { w: 'majority' }
  };
  try {
    let statusCode = SERVER_ERROR, statusMsg = "";
    await session.withTransaction(async () => {
      let { bet_result_id, market_id } = params;
      // here we update all the betOdds data with respect to the winning team.
      /* EXEC BODDS START */
      await BetsOdds.bulkWrite(betQueryService.updateBetRecordsOnResultDeclareQuery(params), { session });
      const user_profit_loss = await BetsOdds.aggregate(betQueryService.sp_set_result_odds(params), { session });
      await UserProfitLoss.insertMany(user_profit_loss, { session });
      let status = await fn_update_balance_liability_on_result_changeV1(session, bet_result_id, market_id);
      statusCode = status.statusCode;
      statusMsg = status.data;
      if (statusCode == SERVER_ERROR)
        throw new Error(statusMsg);
    }, transactionOptions);
    return resultResponse(statusCode, statusMsg);
  } catch (error) {
    return resultResponse(SERVER_ERROR, "Error in result declare" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
  } finally {
    session.endSession();
  }
}

/**
 * key : ODD_RESULT_${market_id}
 * key : BET_API_${user_id}${market_id}
 */


/**
 * 1. Result
 *    if (result && Abandoned) CC exists then ->  Return
 *    XX if rollback CC exists then Delete It
 *    on failure
 *        Delete Result CC entry.
 *    on Success
 *        5-10 Sleep -> Delete Result CC entry.
 * 
 * 2. Rollback
 *    if Rollback CC exists then -> Return
 *    XX If Result CC exists then Delete It.
 *    on Failure
 *        Delete Rollback CC Entry.
 *    on Success
 *        5-10 Sleep ->Delete Rollback CC Entry.
 *    
 * 3. Abadoned
 *    if (result && Abandoned) CC Exists then -> Return
 *    XX If Rollback CC exists then Delete It
 *    On Failure
 *        Delete Abandoned CC Entry
 *    On Success
 *        5-10 Sleep ->Delete Abandoned CC Entry
 *    
 */

async function oddsResultV2(params, retryCount = 0) {

  const KEY = `market-result-${params.market_id}${UNIQUE_IDENTIFIER_KEY}`;
  let getLastResultStatus = await publisher.get(KEY);
  const tryAgainMessage = `Result declaring already in under process, Please wait for 10-20 sec.`;

  if (!getLastResultStatus) {
    await publisher.set(KEY, `${new Date()} ${params.market_name}`, 'EX', 20);
  } else {
    // let getTTL = await publisher.ttl(KEY);
    return resultResponse(SERVER_ERROR, tryAgainMessage);
  }

  const resultKey = getOddsResultUID(params.market_id);
  const abandonedKey = getOddsAbandonedUID(params.market_id);

  // Check if Abandoned Entry Already Exists
  const abandonedCcCheck = await checkIfConcurrencyExists(abandonedKey);
  if (abandonedCcCheck.statusCode == SUCCESS) {
    return resultResponse(SERVER_ERROR, tryAgainMessage);
  }

  // Create a new Entry for result CC;
  // If Server Error that means Entry already Exists;
  const ccResponse = await concurrencyCheck(resultKey);
  if (ccResponse.statusCode == SERVER_ERROR) {
    return resultResponse(SERVER_ERROR, tryAgainMessage);
  }
  const ccId = ccResponse?.data?.cc?._id;
  params['ccId'] = ccId;

  // Fetching the initial result declaration status.
  let eventActionFilter = { event_id: params.market_id, action_type: "Result" }
    , getEventActionStatus = await EventActionStatus.findOne(eventActionFilter).select("_id in_progress_status");

  const session = await mongoose.startSession();
  const transactionOptions = {
    readPreference: 'primary',
    readConcern: { level: 'majority' },
    writeConcern: { w: 'majority' }
  };
  try {
    let statusCode = SERVER_ERROR, statusMsg = "";
    // If it is the first-time request and the record flag is not found, it will create an entry in the database.
    if (getEventActionStatus == null)
      getEventActionStatus = await EventActionStatus.create({ ...eventActionFilter, in_progress_status: 1, comment: "Result declare under process..." });
    // If the record is already present, and its status is 1 (in progress), the validation message will be displayed.
    else if (getEventActionStatus.in_progress_status == 1) {
      // Delete the Result CC Entry
      deleteConcurrencyById(ccId);
      return resultResponse(statusCode, `Result declaration for event(${params.market_name}) already in process!`);
    }
    // In case processing is completed and an attempt is made to declare the result, an "Already result declared" validation message will be displayed.
    else if (getEventActionStatus.in_progress_status == 2) {
      // Delete the Result CC Entry
      deleteConcurrencyById(ccId);
      return resultResponse(statusCode, `Result already declared for event(${params.market_name})!`);
    }
    await session.withTransaction(async () => {
      let { bet_result_id, sport_id, market_id } = params,
        original_market_id;
      // here we update all the betOdds data with respect to the winning team.
      /* EXEC BODDS START */
      if ([LIVE_GAME_SPORT_ID.toString(), DIAMOND_CASINO_SPORT_ID].includes(sport_id))
        original_market_id = params.original_market_id;
      else
        original_market_id = market_id;
      let selection_ids = await Market.findOne({ market_id: original_market_id }).select({ "runners.selection_id": 1 });
      selection_ids = selection_ids.runners.map(selection =>
        !params.selection_id.toString().includes(selection.selection_id)
          ? selection.selection_id
          : null).filter(selection => selection);
      params.selection_ids = selection_ids;
      await BetsOdds.bulkWrite(betQueryService.updateBetRecordsOnResultDeclareQueryV2(params), { session });
      if (params?.is_tbp) {
        await OddsProfitLoss.bulkWrite(betQueryService.updateOddsProfitLossForToBePlaceResult(params), { session });
      }
      const user_profit_loss = await OddsProfitLoss.aggregate(betQueryService.sp_set_result_oddsV2(params), { session });
      let users_liability_balance = await UserProfitLoss.insertMany(user_profit_loss, { session, ordered: false });
      if (!users_liability_balance.length)
        throw new Error("An error occurred while generating the UserProfitLoss data. Please try again!");
      // here we are going to update user liability & balance to its original event initial data. odds_profit_loss.
      await fn_update_balance_liability_of_users(session, users_liability_balance);
      let status = await fn_update_balance_liability_on_odds_result(session, bet_result_id, market_id);
      statusCode = status.statusCode;
      statusMsg = status.data;
      if (statusCode == SERVER_ERROR)
        throw new Error(statusMsg);

      // If the result declared successfully, release the key.
      await publisher.del(KEY);

      if (getEventActionStatus)
        // If market result declared action is completed, The entry will be removed from DB.
        EventActionStatus.deleteOne(eventActionFilter).then();

      // Update Bet Count Expire At
      updateBetCountExpire({ match_id: params.match_id, event_id: params.market_id });

      finalActionForMarketSettle(params);

    }, transactionOptions);
    return resultResponse(statusCode, statusMsg);
  } catch (error) {

    // If any error are occured release the key.
    await publisher.del(KEY);

    // Delete the Result CC Entry
    deleteConcurrencyById(ccId);

    if (getEventActionStatus) {
      getEventActionStatus.in_progress_status = 0;
      getEventActionStatus.comment = "Result declare stop due to error!";
      getEventActionStatus.error = error.message;
      await getEventActionStatus.save();
    }
    if (error.message.includes("TransientTransactionError:")) {
      retryCount++;
      if (retryCount == MAX_RETRY_LIMIT)
        return resultResponse(SERVER_ERROR, "Please try to declare the result once again.");
      let result = await oddsResultV2(params, retryCount);
      return resultResponse(result.statusCode, result.data);
    }
    return resultResponse(SERVER_ERROR, "Error in result declare" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
  } finally {
    session.endSession();
  }
}

async function oddsResultV3(params, retryCount = 0) {
  const LOG_UUID = params?.LOG_REF_CODE || generateUUID();
  params.LOG_REF_CODE = LOG_UUID;

  let st0 = Date.now();

  logger.SessionResultRollBack(`oddsResultV3: ${LOG_UUID}
      STAGE: 'Started'
      Params: ${JSON.stringify(params)}
      RetryCount: ${retryCount}
    `);

  const KEY = `market-result-${params.market_id}${UNIQUE_IDENTIFIER_KEY}`;
  let getLastResultStatus = await publisher.get(KEY);
  const tryAgainMessage = `Result declaring already in under process, Please wait for 10-20 sec.`;

  if (!getLastResultStatus) {
    await publisher.set(KEY, `${new Date()} ${params.market_name}`, "EX", 20);
  } else {
    // let getTTL = await publisher.ttl(KEY);
    return resultResponse(SERVER_ERROR, tryAgainMessage);
  }

  const resultKey = getOddsResultUID(params.market_id);
  const abandonedKey = getOddsAbandonedUID(params.market_id);

  // Check if Abandoned Entry Already Exists
  const abandonedCcCheck = await checkIfConcurrencyExists(abandonedKey);
  if (abandonedCcCheck.statusCode == SUCCESS) {
    logger.SessionResultRollBack(`oddsResultV3: ${LOG_UUID}
    STAGE: 'Abandoned_CC_Check'
    RETURN: ${SERVER_ERROR}-${tryAgainMessage}
    `);
    return resultResponse(SERVER_ERROR, tryAgainMessage);
  }

  // Create a new Entry for result CC;
  // If Server Error that means Entry already Exists;
  const ccResponse = await concurrencyCheck(resultKey);
  if (ccResponse.statusCode == SERVER_ERROR) {
    logger.SessionResultRollBack(`oddsResultV3: ${LOG_UUID}
        STAGE: 'Result_CC_Check'
        RETURN: ${SERVER_ERROR}-${tryAgainMessage}
        `);
    return resultResponse(SERVER_ERROR, tryAgainMessage);
  }
  const ccId = ccResponse?.data?.cc?._id;
  params["ccId"] = ccId;

  // Fetching the initial result declaration status.
  let eventActionFilter = { event_id: params.market_id, action_type: "Result" };
  let getEventActionStatus = await EventActionStatus.findOne(
    eventActionFilter
  ).select("_id in_progress_status");

  try {
    let statusCode = SERVER_ERROR,
      statusMsg = "";
    // If it is the first-time request and the record flag is not found, it will create an entry in the database.
    if (getEventActionStatus == null) {
      getEventActionStatus = await EventActionStatus.create({
        ...eventActionFilter,
        in_progress_status: 1,
        comment: "Result declare under process...",
      });
    } else if (getEventActionStatus.in_progress_status == 1) {
      // If the record is already present, and its status is 1 (in progress), the validation message will be displayed.

      // Delete the Result CC Entry
      deleteConcurrencyById(ccId);
      const message = `Result declaration for event(${params.market_name}) already in process!`;
      logger.SessionResultRollBack(`oddsResultV3: ${LOG_UUID}
          STAGE: 'EventActionStatus_InProgressStatus == 1'
          RETURN: ${SERVER_ERROR}-${message}
      `);
      return resultResponse(statusCode, message);
    } else if (getEventActionStatus.in_progress_status == 2) {
      // In case processing is completed and an attempt is made to declare the result, an "Already result declared" validation message will be displayed.

      // Delete the Result CC Entry
      deleteConcurrencyById(ccId);
      const message = `Result already declared for event(${params.market_name})!`;
      logger.SessionResultRollBack(`oddsResultV3: ${LOG_UUID}
          STAGE: 'EventActionStatus_InProgressStatus == 2'
          RETURN: ${SERVER_ERROR}-${message}
      `);
      return resultResponse(statusCode, message);
    }

    let { bet_result_id, sport_id, market_id } = params;
    let original_market_id;

    await Market.updateOne(
      { market_id },
      {
        is_processing: 1,
        processing_message: "Result Started",
      }
    );

    // here we update all the betOdds data with respect to the winning team.
    /* EXEC BODDS START */
    if (
      [LIVE_GAME_SPORT_ID.toString(), DIAMOND_CASINO_SPORT_ID].includes(
        sport_id
      )
    ) {
      original_market_id = params.original_market_id;
    } else {
      original_market_id = market_id;
    }

    let selection_ids = await Market.findOne(
      { market_id: original_market_id },
      { "runners.selection_id": 1 }
    )
      .lean()
      .exec();

    selection_ids = selection_ids.runners
      .map((selection) =>
        !params.selection_id.toString().includes(selection.selection_id)
          ? selection.selection_id
          : null
      )
      .filter((selection) => selection);

    params.selection_ids = selection_ids;

    let st1 = Date.now();
    logger.SessionResultRollBack(`oddsResultV3: ${LOG_UUID}
      STAGE: 'Start_BetOddsUpdate'
      `);

    await Market.updateOne(
      { market_id },
      {
        is_processing: 1,
        processing_message: "Start_BetOddsUpdate",
      }
    );

    // await BetsOdds.bulkWrite(betQueryService.updateBetRecordsOnResultDeclareQueryV2(params), { session });
    const betOddsBatchRes = await processBetOddsInBatches(params);

    if (betOddsBatchRes.statusCode != SUCCESS) {
      throw new Error(betOddsBatchRes.data.msg);
    }

    await Market.updateOne(
      { market_id },
      {
        is_processing: 1,
        processing_message: "End_BetOddsUpdate",
      }
    );

    logger.SessionResultRollBack(`oddsResultV3: ${LOG_UUID}
      STAGE: 'End_BetOddsUpdate'
      TimeTaken: ${Date.now() - st1} ms
    `);

    // Update Odds Profit Loss for To Be Placed Market
    if (params?.is_tbp) {
      let st2 = Date.now();
      const oddsProfitLossUpdateQuery =
        betQueryService.updateOddsProfitLossForToBePlaceResult(params);

      logger.SessionResultRollBack(`oddsResultV3: ${LOG_UUID}
        STAGE: 'Start_OddsProfitLossUpdate'
        query: ${JSON.stringify(oddsProfitLossUpdateQuery)}
      `);

      await Market.updateOne(
        { market_id },
        {
          is_processing: 1,
          processing_message: "Start_OddsProfitLossUpdate",
        }
      );

      await OddsProfitLoss.bulkWrite(oddsProfitLossUpdateQuery, {});

      await Market.updateOne(
        { market_id },
        {
          is_processing: 1,
          processing_message: "End_OddsProfitLossUpdate",
        }
      );

      logger.SessionResultRollBack(`oddsResultV3: ${LOG_UUID}
        STAGE: 'End_OddsProfitLossUpdate'
        TimeTaken: ${Date.now() - st2} ms
      `);
    }

    let st3 = Date.now();
    const oddsProfitLossAggregateQuery =
      betQueryService.sp_set_result_oddsV2(params);

    logger.SessionResultRollBack(`oddsResultV3: ${LOG_UUID}
      STAGE: 'Start_oddsProfitLossAggregate'
      query: ${JSON.stringify(oddsProfitLossAggregateQuery)}
    `);

    await Market.updateOne(
      { market_id },
      {
        is_processing: 1,
        processing_message: "Start_oddsProfitLossAggregate",
      }
    );

    const user_profit_loss = await OddsProfitLoss.aggregate(
      oddsProfitLossAggregateQuery,
      {}
    );

    await Market.updateOne(
      { market_id },
      {
        is_processing: 1,
        processing_message: "End_oddsProfitLossAggregate",
      }
    );

    logger.SessionResultRollBack(`oddsResultV3: ${LOG_UUID}
      STAGE: 'End_oddsProfitLossAggregate'
      TimeTaken: ${Date.now() - st3} ms
    `);

    let st4 = Date.now();
    logger.SessionResultRollBack(`oddsResultV3: ${LOG_UUID}
      STAGE: 'Start_userProfitLossInsert'
    `);

    await Market.updateOne(
      { market_id },
      {
        is_processing: 1,
        processing_message: "Start_userProfitLossInsert",
      }
    );

    await UserProfitLoss.deleteMany({ event_id: market_id });

    let users_liability_balance = await UserProfitLoss.insertMany(
      user_profit_loss,
      { ordered: false }
    );

    await Market.updateOne(
      { market_id },
      {
        is_processing: 1,
        processing_message: "End_userProfitLossInsert",
      }
    );

    logger.SessionResultRollBack(`oddsResultV3: ${LOG_UUID}
      STAGE: 'End_userProfitLossInsert'
      Length: ${users_liability_balance.length}
      TimeTaken: ${Date.now() - st4} ms
      `);

    if (!users_liability_balance.length)
      throw new Error(
        "An error occurred while generating the UserProfitLoss data. Please try again!"
      );


    const userObjectRes = await getUserAndAgentCalculatedUpdateObject({
      user_profit_loss: users_liability_balance,
      isRollback: false,
      LOG_UUID,
      isFancy: false,
    });

    if (userObjectRes.statusCode != SUCCESS) {
      throw new Error(userObjectRes.data.msg);
    }

    const combinedUserAgentArr = userObjectRes.data;

    const batchSize = 5;
    let st5 = Date.now();
    logger.SessionResultRollBack(`oddsResultV3: ${LOG_UUID}
          STAGE: 'Start_GenerateQueueBatches'
          QueueName: SessionResult
          BatchSize: ${batchSize}
    `);

    const queueResponse = getDataInBatchesForQueues(
      combinedUserAgentArr,
      "MarketResult",
      batchSize,
      market_id
    );

    logger.SessionResultRollBack(`oddsResultV3: ${LOG_UUID}
          STAGE: 'End_GenerateQueueBatches'
          TimeTaken: ${Date.now() - st5} ms
    `);

    if (queueResponse.statusCode != SUCCESS) {
      throw new Error(queueResponse.data.msg);
    }

    const queueData = queueResponse.data;

    let st6 = Date.now();

    logger.SessionResultRollBack(`oddsResultV3: ${LOG_UUID}
        STAGE: 'Start_AddBatchesToQueue'
        Input: Response of Last Stage
    `);

    await Market.updateOne(
      { market_id },
      {
        is_processing: 4,
        processing_message: "Start_AddBatchesToQueue",
      }
    );

    // throw Error("An error occurred while generating the UserProfitLoss data. Please try again!");

    const addBatchesRes = await SessionResultQueue.addBulk(queueData);
    const bull_job_ids = addBatchesRes.map(({ id }) => id);

    await Market.updateOne(
      { market_id },
      {
        is_processing: 4,
        processing_message: "End_AddBatchesToQueue",
        bull_job_ids,
        bull_job_count: bull_job_ids.length,
        bull_job_last_updated_at: new Date(),
      }
    );

    logger.SessionResultRollBack(`sessionResultV3: ${LOG_UUID}
      STAGE: 'End_AddBatchesToQueue'
      TimeTaken: ${Date.now() - st6} ms
    `);

    // If the result declared successfully, release the key.
    await publisher.del(KEY);

    if (getEventActionStatus)
      // If market result declared action is completed, The entry will be removed from DB.
      EventActionStatus.deleteOne(eventActionFilter).then();

    // Update Bet Count Expire At
    updateBetCountExpire({
      match_id: params.match_id,
      event_id: params.market_id,
    });

    finalActionForMarketSettle(params);

    logger.SessionResultRollBack(`oddsResultV3: ${LOG_UUID}
      STAGE: 'End'
      TimeTaken: ${Date.now() - st0} ms
    `);

    statusCode = SUCCESS;
    statusMsg = "Result declared successfully...";
    return resultResponse(statusCode, statusMsg);
  } catch (error) {
    console.error("Error in oddsResultV3: ", error);
    logger.SessionResultRollBack(`oddsResultV3: ${LOG_UUID}
      STAGE: 'ERROR_Catch_Block'
      error: ${error.stack}
    `);

    // If any error are occured release the key.
    await publisher.del(KEY);

    // Delete the Result CC Entry
    deleteConcurrencyById(ccId);

    if (getEventActionStatus) {
      getEventActionStatus.in_progress_status = 0;
      getEventActionStatus.comment = "Result declare stop due to error!";
      getEventActionStatus.error = error.message;
      await getEventActionStatus.save();
    }

    return resultResponse(
      SERVER_ERROR,
      "Error in result declare" +
      (process.env.DEBUG == "true"
        ? ` ${error.message} ${getCurrentLine
          .default()
          .file.split(/[\\/]/)
          .pop()}: ${getCurrentLine.default().line}`
        : "")
    );
  }
}

async function oddsResultV4(params) {
  // Fetching the initial result declaration status.
  let eventActionFilter = { event_id: params.market_id, action_type: "Result" }
    , getEventActionStatus = await EventActionStatus.findOne(eventActionFilter).select("_id in_progress_status");
  try {
    let statusCode = SERVER_ERROR, statusMsg = "";
    // If it is the first-time request and the record flag is not found, it will create an entry in the database.
    if (getEventActionStatus == null)
      getEventActionStatus = await EventActionStatus.create({ ...eventActionFilter, in_progress_status: 1, comment: "Result declare under process..." });
    // If the record is already present, and its status is 1 (in progress), the validation message will be displayed.
    else if (getEventActionStatus.in_progress_status == 1)
      return resultResponse(statusCode, `Result declaration for event(${params.market_name}) already in process!`);
    // In case processing is completed and an attempt is made to declare the result, an "Already result declared" validation message will be displayed.
    else if (getEventActionStatus.in_progress_status == 2)
      return resultResponse(statusCode, `Result already declared for event(${params.market_name})!`);
    let { bet_result_id, sport_id, market_id } = params,
      original_market_id;
    if ([LIVE_GAME_SPORT_ID.toString(), DIAMOND_CASINO_SPORT_ID].includes(sport_id))
      original_market_id = params.original_market_id;
    else
      original_market_id = market_id;
    let selection_ids = await Market.findOne({ market_id: original_market_id }).select({ "runners.selection_id": 1 });
    selection_ids = selection_ids.runners.map(selection => selection.selection_id != params.selection_id ? selection.selection_id : null)
      .filter(selection => selection);
    params.selection_ids = selection_ids;
    // here we update all the betOdds data with respect to the winning team.
    await BetsOdds.bulkWrite(betQueryService.updateBetRecordsOnResultDeclareQueryV2(params));
    const user_profit_loss = await OddsProfitLoss.aggregate(betQueryService.sp_set_result_oddsV2(params));
    let users_liability_balance = await UserProfitLoss.insertMany(user_profit_loss, { ordered: false });
    if (!users_liability_balance.length)
      throw new Error("An error occurred while generating the UserProfitLoss data. Please try again!");
    // here we are going to update user liability & balance to its original event initial data. odds_profit_loss.
    await fn_update_balance_liability_of_users(false, users_liability_balance);
    let status = await fn_update_balance_liability_on_odds_result(false, bet_result_id, market_id);
    statusCode = status.statusCode;
    statusMsg = status.data;
    if (statusCode == SERVER_ERROR)
      throw new Error(statusMsg);
    if (getEventActionStatus)
      // If market result declared action is completed, The entry will be removed from DB.
      EventActionStatus.deleteOne(eventActionFilter).then();
    return resultResponse(statusCode, statusMsg);
  } catch (error) {
    if (getEventActionStatus) {
      getEventActionStatus.in_progress_status = 0;
      getEventActionStatus.comment = "Result declare stop due to error!";
      getEventActionStatus.error = error.message;
      await getEventActionStatus.save();
    }
    return resultResponse(SERVER_ERROR, "Error in result declare" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
  }
}

async function oddsRollback(bet_result_id, market_id, match_id) {
  const tryAgainMessage = `Market rollback is already in under process!`;

  // CONCURRENCY CONTROL !!
  const rollbackKey = getOddsRollbackUID(market_id);

  // Create a new Entry for result CC;
  // If Server Error that means Entry already Exists;
  const ccResponse = await concurrencyCheck(rollbackKey);
  if (ccResponse.statusCode == SERVER_ERROR) {
    return resultResponse(SERVER_ERROR, tryAgainMessage);
  }
  const ccId = ccResponse?.data?.cc?._id;

  let eventActionFilter = { event_id: market_id, action_type: "Rollback" }
    // Getting rollback status.
    , getEventActionStatus = await EventActionStatus.findOne(eventActionFilter).select("_id in_progress_status");
  // If it is first rollback request the entry would be added in DB. 
  if (getEventActionStatus == null)
    getEventActionStatus = await EventActionStatus.create({ ...eventActionFilter, in_progress_status: 1, comment: "Result rollback is under process..." });
  // If rollback is under process and user try to rollback again the market event the error message will shown.
  else if (getEventActionStatus.in_progress_status == 1) {
    // Delete the Result CC Entry
    deleteConcurrencyById(ccId);
    return resultResponse(SERVER_ERROR, `Market rollback is already in under process!`);
  }
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    return fn_update_balance_liability_on_result_changeV2(
      session, bet_result_id, market_id, 'add', 1, "Market rollback successfully...", { is_odds_rollback: true }
    ).then(async status => {
      if (status.statusCode == SUCCESS) {
        return Promise.all(
          [
            BetsOdds.updateMany(
              { bet_result_id },
              { result: -11111, bet_result_id: null, chips: 0, winner_name: null, is_result_declared: 0 }
            ).session(session),
            UserProfitLoss.deleteMany(
              { bet_result_id }
            ).session(session),
            BetResults.deleteOne(
              { _id: bet_result_id }
            ).session(session),
            Market.updateOne(
              { market_id },
              {
                is_active: 1, is_result_declared: 0, is_abandoned: 0, is_rollback: 1,
                result_selection_id: "", result_selection_name: "", result_status: "",
                bet_result_id: null,
              }
            ).session(session),
            Match.updateOne(
              { match_id }, { is_active: 1, is_result_declared: 0 }
            ).session(session)
          ]
        ).then(async () => {
          await session.commitTransaction();
          session.endSession();
          if (getEventActionStatus)
            // If market rollback action is completed, The entry will be removed from DB.
            EventActionStatus.deleteOne(eventActionFilter).then();

          // Delete the Result CC Entry
          deleteConcurrencyById(ccId);
          return resultResponse(SUCCESS, status.data);
        }).catch(async error => {
          // Delete the Result CC Entry
          deleteConcurrencyById(ccId);

          // If any exception will occur the comment & error fields are being updated with the message.
          if (getEventActionStatus) {
            getEventActionStatus.in_progress_status = 0;
            getEventActionStatus.comment = "Rollback stop due to error!";
            getEventActionStatus.error = error.message;
            await getEventActionStatus.save();
          }
          return Market.updateOne(
            { bet_result_id, market_id },
            { result_status: `Error while rollback the status: ${error.message}` }
          ).session(session).then(async () => {
            await session.abortTransaction();
            session.endSession();
            return resultResponse(SERVER_ERROR, `Error while rollback the status: ${error.message}`);
          }).catch(async error => {
            await session.abortTransaction();
            session.endSession();
            return resultResponse(SERVER_ERROR, `Error while changing rollback status of market: ${error.message}`);
          });
        });
      }

      // Delete the Result CC Entry
      deleteConcurrencyById(ccId);

      await session.abortTransaction();
      session.endSession();
      return resultResponse(SERVER_ERROR, status.data);
    });
  } catch (error) {

    // Delete the Result CC Entry
    deleteConcurrencyById(ccId);
    await session.abortTransaction();
    session.endSession();
    return resultResponse(SERVER_ERROR, "Error in result rollback" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
  }
}

async function oddsRollbackV3(
  bet_result_id,
  market_id,
  match_id,
  { LOG_REF_CODE }
) {
  const LOG_UUID = LOG_REF_CODE || generateUUID();
  let st0 = Date.now();

  logger.SessionResultRollBack(`oddsRollbackV3: ${LOG_UUID}
    STAGE: 'Started'
    Params: ${JSON.stringify({ bet_result_id, market_id, match_id })}
  `);

  const tryAgainMessage = `Market rollback is already in under process!`;
  // CONCURRENCY CONTROL !!
  const rollbackKey = getOddsRollbackUID(market_id);

  // Create a new Entry for result CC;
  // If Server Error that means Entry already Exists;
  const ccResponse = await concurrencyCheck(rollbackKey);
  if (ccResponse.statusCode == SERVER_ERROR) {
    logger.SessionResultRollBack(`oddsRollbackV3: ${LOG_UUID}
      STAGE: 'Rollback_CC_Check'
      RETURN: ${SERVER_ERROR}-${tryAgainMessage}
      `);
    return resultResponse(SERVER_ERROR, tryAgainMessage);
  }
  const ccId = ccResponse?.data?.cc?._id;

  let eventActionFilter = { event_id: market_id, action_type: "Rollback" };
  // Getting rollback status.
  let getEventActionStatus = await EventActionStatus.findOne(
    eventActionFilter
  ).select("_id in_progress_status");

  // If it is first rollback request the entry would be added in DB.
  if (getEventActionStatus == null) {
    getEventActionStatus = await EventActionStatus.create({
      ...eventActionFilter,
      in_progress_status: 1,
      comment: "Result rollback is under process...",
    });
  } else if (getEventActionStatus.in_progress_status == 1) {
    // If rollback is under process and user try to rollback again the market event the error message will shown.
    // Delete the Result CC Entry
    deleteConcurrencyById(ccId);

    const msg = `Market rollback is already in under process!`;
    logger.SessionResultRollBack(`oddsRollbackV3: ${LOG_UUID}
      STAGE: 'EventActionStatus_InProgressStatus == 1'
      RETURN: ${SERVER_ERROR}-${msg}
      `);
    return resultResponse(SERVER_ERROR, msg);
  }

  await Market.updateOne(
    { market_id },
    {
      is_rollback_processing: 1,
      rollback_processing_message: "Rollback Started",
    }
  );

  try {
    let st1 = Date.now();

    logger.SessionResultRollBack(`oddsRollbackV3: ${LOG_UUID}
    STAGE: 'Start_fn_update_balance_liability_on_session_resultV3'
    Params: ${JSON.stringify({
      market_id,
      LOG_UUID,
      msg: "Market rollback successfully...",
      isFancy: false,
    })}
    `);

    await Market.updateOne(
      { market_id },
      {
        is_rollback_processing: 1,
        rollback_processing_message:
          "Start_fn_update_balance_liability_on_session_resultV3",
      }
    );

    let status = await fn_update_balance_liability_on_session_resultV3(
      market_id,
      "Market rollback successfully...",
      LOG_UUID,
      false
    );

    await Market.updateOne(
      { market_id },
      {
        is_rollback_processing: 1,
        rollback_processing_message:
          "End_fn_update_balance_liability_on_session_resultV3",
      }
    );

    logger.SessionResultRollBack(`oddsRollbackV3: ${LOG_UUID}
        STAGE: 'End_fn_update_balance_liability_on_session_resultV3'
        Response: ${JSON.stringify({ statusCode: status.statusCode })}
        TimeTaken: ${Date.now() - st1} ms
      `);

    // throw new Error("Custom Error");
    if (status.statusCode != SUCCESS) {
      throw new Error(status.data.msg);
    }

    let st2 = Date.now();

    const batchSize = 5;
    const combinedUserAgentArr = status.data.combinedUserAgentArr;

    logger.SessionResultRollBack(`oddsRollbackV3: ${LOG_UUID}
    STAGE: 'Start_GenerateQueueBatches'
    QueueName: MarketRollback
    BatchSize: ${batchSize}
    `);

    const queueResponse = getDataInBatchesForQueues(
      combinedUserAgentArr,
      "MarketRollback",
      batchSize,
      market_id
    );

    logger.SessionResultRollBack(`oddsRollbackV3: ${LOG_UUID}
          STAGE: 'End_GenerateQueueBatches'
          Response: ${JSON.stringify({ statusCode: queueResponse.statusCode })}
          TimeTaken: ${Date.now() - st2} ms
        `);

    if (queueResponse.statusCode != SUCCESS) {
      throw new Error(queueResponse.data.msg);
    }

    const queueData = queueResponse.data;

    let st3 = Date.now();

    logger.SessionResultRollBack(`oddsRollbackV3: ${LOG_UUID}
      STAGE: 'Start_PromiseAll_UpdateQueries'
      `);

    await Market.updateOne(
      { market_id },
      {
        is_rollback_processing: 1,
        rollback_processing_message: "Start_PromiseAll_UpdateQueries",
      }
    );

    const betOddsFilter = { market_id, bet_result_id };
    const betOddsUpdate = {
      result: -11111,
      bet_result_id: null,
      chips: 0,
      winner_name: null,
      is_result_declared: 0,
    };

    const resultOfQueries = await Promise.all([
      UserProfitLoss.deleteMany({ bet_result_id }),
      betOddsBatchHelper({
        filter: betOddsFilter,
        update: betOddsUpdate,
        LOG_REF_CODE: LOG_UUID,
      }),
    ]);

    await Market.updateOne(
      { market_id },
      {
        is_rollback_processing: 1,
        rollback_processing_message: "End_PromiseAll_UpdateQueries",
      }
    );

    logger.SessionResultRollBack(`oddsRollbackV3: ${LOG_UUID}
      STAGE: 'End_PromiseAll_UpdateQueries'
      TimeTaken: ${Date.now() - st3} ms
    `);

    let st4 = Date.now();

    logger.SessionResultRollBack(`oddsRollbackV3: ${LOG_UUID}
      STAGE: 'Start_AddBatchesToQueue'
      Input: QueueData
      `);

    await Market.updateOne(
      { market_id },
      {
        is_rollback_processing: 4,
        rollback_processing_message: "Start_AddBatchesToQueue",
      }
    );

    const addBatchesRes = await SessionResultQueue.addBulk(queueData);
    const rollback_bull_job_ids = addBatchesRes.map(({ id }) => id);

    await Market.updateOne(
      { market_id },
      {
        is_rollback_processing: 4,
        rollback_processing_message: "End_AddBatchesToQueue",
        rollback_bull_job_ids,
        rollback_bull_job_count: rollback_bull_job_ids.length,
        rollback_bull_job_last_updated_at: new Date(),
      }
    );

    logger.SessionResultRollBack(`oddsRollbackV3: ${LOG_UUID}
    STAGE: 'End_AddBatchesToQueue'
    TimeTaken: ${Date.now() - st4} ms
    `);

    if (getEventActionStatus)
      // If market rollback action is completed, The entry will be removed from DB.
      EventActionStatus.deleteOne(eventActionFilter).then();

    await Promise.all([
      BetResults.deleteOne({ _id: bet_result_id }),
      Market.updateOne(
        { market_id },
        {
          is_active: 1,
          is_result_declared: 0,
          is_abandoned: 0,
          is_rollback: 1,
          result_selection_id: "",
          result_selection_name: "",
          result_status: "",
          bet_result_id: null,
          is_rollback_processing: 2,
          rollback_processing_message: "Rollback_success",
          result_cron_progress: null,
          result_cron_progress_message: "",
        }
      ),
    ]);

    // Delete the Result CC Entry
    deleteConcurrencyById(ccId);

    logger.SessionResultRollBack(`oddsRollbackV3: ${LOG_UUID}
          STAGE: 'End'
          TimeTaken: ${Date.now() - st0} ms
        `);

    return resultResponse(SUCCESS, "Market Rollback Successfully..");
  } catch (error) {
    // Delete the Result CC Entry
    deleteConcurrencyById(ccId);
    console.error(error);

    logger.SessionResultRollBack(`oddsRollbackV3: ${LOG_UUID}
    STAGE: 'ERROR_Catch_Block'
    error: ${error.stack}
  `);

    // If any exception will occur the comment & error fields are being updated with the message.
    if (getEventActionStatus) {
      getEventActionStatus.in_progress_status = 0;
      getEventActionStatus.comment = "Rollback stop due to error!";
      getEventActionStatus.error = error.message;
      await getEventActionStatus.save();
    }

    return resultResponse(
      SERVER_ERROR,
      "Error in Market Result Rollback" +
      (process.env.DEBUG == "true"
        ? ` ${error.message} ${getCurrentLine
          .default()
          .file.split(/[\\/]/)
          .pop()}: ${getCurrentLine.default().line}`
        : "")
    );
  }
}

async function oddsAbandoned(market) {

  const tryAgainMessage = `Market abandoned or rollback is already in under process!`;

  // CONCURRENCY CONTROL !!
  const resultKey = getOddsResultUID(market.market_id);
  const abandonedKey = getOddsAbandonedUID(market.market_id);

  // Check if Result Entry Already Exists
  const resultCcCheck = await checkIfConcurrencyExists(resultKey);
  if (resultCcCheck.statusCode == SUCCESS) {
    return resultResponse(SERVER_ERROR, tryAgainMessage);
  }

  // Create a new Entry for result CC;
  // If Server Error that means Entry already Exists;
  const ccResponse = await concurrencyCheck(abandonedKey);
  if (ccResponse.statusCode == SERVER_ERROR) {
    return resultResponse(SERVER_ERROR, tryAgainMessage);
  }
  const ccId = ccResponse?.data?.cc?._id;
  market['ccId'] = ccId;


  let eventActionFilter = { event_id: market.market_id, action_type: "Abandoned" }
    // Getting abandoned status.
    , getEventActionStatus = await EventActionStatus.findOne(eventActionFilter).select("_id in_progress_status");
  // If it is first abandoned or rollback request the entry would be added in DB. 
  if (getEventActionStatus == null)
    getEventActionStatus = await EventActionStatus.create({ ...eventActionFilter, in_progress_status: 1, comment: `Result Abandoned ${market.rollback ? "rollback" : ""} is under process...` });
  // If abandoned or rollback is under process and user try to abandoned or rollback again the market event the error message will shown.
  else if (getEventActionStatus.in_progress_status == 1) {
    // Delete the Result CC Entry
    deleteConcurrencyById(ccId);
    return resultResponse(SERVER_ERROR, tryAgainMessage);
  }
  const session = await mongoose.startSession();
  try {
    const ABANDONED = 'Abandoned'
      , selection_id = result = winner_name = ABANDONED
      , { market_id, rollback, market_name } = market,
      is_abandon = !rollback;
    let bet_result_id = null, liabilityType = 'add', msg = 'Abandoned market rollback successfully...';
    let BetResult;
    if (is_abandon) {
      try {
        bet_result_id = new BetResults(Object.assign({
          type: 1, selection_id, result, winner_name
        }, market));
        BetResult = bet_result_id;
        bet_result_id = bet_result_id._id;
        liabilityType = 'sub';
        msg = 'Market abandoned successfully...';
        finalActionForMarketSettle(market)
      } catch (error) {
        // Delete the Result CC Entry
        deleteConcurrencyById(ccId);
        return resultResponse(SERVER_ERROR, "Error while saving Abandon result!" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""))
      }
    }
    let statusCode = SERVER_ERROR, statusMsg = "";
    await session.withTransaction(async (session) => {
      let status = await fn_update_balance_liability_on_result_changeV2(
        session, bet_result_id, market_id, liabilityType, rollback, msg, { is_abandon: true }
      );
      if (status.statusCode == SUCCESS) {
        let updatedMatchParameters = {};
        if (rollback) {
          await BetsOdds.updateMany(
            { market_id },
            { result: -11111, bet_result_id, winner_name: null, is_result_declared: 0 }
          ).session(session);
          await Market.updateOne(
            { market_id },
            {
              is_active: 1, is_result_declared: 0, is_abandoned: 0,
              result_selection_name: "", result_status: "",
              bet_result_id, is_rollback: 1,
            }
          ).session(session);
          await BetResults.deleteOne(
            { market_id }
          ).session(session);
          updatedMatchParameters = { is_active: 1, is_result_declared: 0, is_abandoned: 0 };
        } else {
          await BetsOdds.updateMany(
            { market_id },
            { result: -1, bet_result_id, winner_name: ABANDONED, is_result_declared: -1 }
          ).session(session);
          await Market.updateOne(
            { market_id },
            {
              is_active: 0, is_result_declared: 1, is_abandoned: 1,
              result_selection_name: ABANDONED, result_status: status.data,
              bet_result_id,
            }
          ).session(session);
          await BetResult.save();
          updatedMatchParameters = { is_active: 0, is_result_declared: 1, is_abandoned: 1 };
        }
        if (market_name == "Match Odds")
          await Match.updateOne({ match_id: market.match_id }, updatedMatchParameters).session(session);
      }
      statusCode = status.statusCode;
      statusMsg = status.data;
      if (getEventActionStatus)
        // If market abandoned or rollback action is completed, The entry will be removed from DB.
        EventActionStatus.deleteOne(eventActionFilter).then();
      if (statusCode == SERVER_ERROR)
        throw new Error(statusMsg);
    });

    // Delete the Result CC Entry
    deleteConcurrencyById(ccId);
    return resultResponse(statusCode, statusMsg);
  } catch (error) {

    // Delete the Result CC Entry
    deleteConcurrencyById(ccId);

    // If any exception will occur the comment & error fields are being updated with the message.
    if (getEventActionStatus) {
      getEventActionStatus.in_progress_status = 0;
      getEventActionStatus.comment = `Abandoned ${market.rollback ? "rollback" : ""} stop due to error!`;
      getEventActionStatus.error = error.message;
      await getEventActionStatus.save();
    }
    return resultResponse(SERVER_ERROR, "Error in odds abandon!" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
  } finally {
    session.endSession();
  }
}

async function sessionResult(params) {
  const session = await mongoose.startSession();
  try {
    let { bet_result_id, fancy_id } = params;
    session.startTransaction();
    // here we update all the BetsFancy data with respect to the winning team.
    /* EXEC BFANCY START */
    return BetsFancy.bulkWrite(
      fancyQueryService.updateBetRecordsOnResultDeclareQuery(params), { session }
    ).then(async () => {
      return BetsFancy.aggregate(fancyQueryService.sp_set_result_fancy(params), { session }).then(async user_profit_loss => {
        // here we insert users profit losses with respect to the share & commission in user_profit_loss.
        /* EXEC UPL START */
        return UserProfitLoss.insertMany(user_profit_loss, { session }).then((user_profit_loss_pl) => {
          return fn_update_balance_on_result(session, bet_result_id, fancy_id, 0, "Fancy result declared successfully...", {}, 1).then(status => status);
        }).catch(async error => {
          await session.abortTransaction();
          session.endSession();
          return resultResponse(SERVER_ERROR, "Error while inserting the user_profit_loss" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""))
        });
        /* EXEC UPL END */
      }).catch(async error => {
        await session.abortTransaction();
        session.endSession();
        return resultResponse(SERVER_ERROR, "Error in sp_set_result_fancy Query" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""))
      });
    }).catch(async error => {
      await session.abortTransaction();
      session.endSession();
      return resultResponse(SERVER_ERROR, "Error while updating session bets data" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""))
    });
    /* EXEC BFANCY END */
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return resultResponse(SERVER_ERROR, "Error in result declare" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
  }
}

async function sessionResultV1(params) {
  const session = await mongoose.startSession();
  const transactionOptions = {
    readPreference: 'primary',
    readConcern: { level: 'majority' },
    writeConcern: { w: 'majority' }
  };
  try {
    let statusCode = SERVER_ERROR, statusMsg = "";
    await session.withTransaction(async () => {
      let { bet_result_id, fancy_id } = params;
      await BetsFancy.bulkWrite(fancyQueryService.updateBetRecordsOnResultDeclareQuery(params), { session });
      let user_profit_loss = await BetsFancy.aggregate(fancyQueryService.sp_set_result_fancy(params), { session });
      await UserProfitLoss.insertMany(user_profit_loss, { session });
      let status = await fn_update_balance_on_resultV1(session, bet_result_id, fancy_id, 0, "Fancy result declared successfully...", {}, 1);
      statusCode = status.statusCode;
      statusMsg = status.data;
    }, transactionOptions);
    return resultResponse(statusCode, statusMsg);
  } catch (error) {
    return resultResponse(SERVER_ERROR, "Error in result declare" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
  } finally {
    session.endSession();
  }
}

async function sessionResultV2(params, retryCount = 0) {

  const KEY = `fancy-result-${params.fancy_id}${UNIQUE_IDENTIFIER_KEY}`;
  let getLastResultStatus = await publisher.get(KEY);
  const tryAgainMessage = `Result declaring already in under process, Please wait for 10-20 sec.`;

  if (!getLastResultStatus) {
    await publisher.set(KEY, `${new Date()} ${params.fancy_name}`, 'EX', 20);
  } else {
    // let getTTL = await publisher.ttl(KEY);
    return resultResponse(SERVER_ERROR, tryAgainMessage);
  }

  const resultKey = getSessionResultUID(params.fancy_id);
  const abandonedKey = getSessionAbandonedUID(params.fancy_id);

  // Check if Abandoned Entry Already Exists
  const abandonedCcCheck = await checkIfConcurrencyExists(abandonedKey);
  if (abandonedCcCheck.statusCode == SUCCESS) {
    return resultResponse(SERVER_ERROR, tryAgainMessage);
  }

  // Create a new Entry for result CC;
  // If Server Error that means Entry already Exists;
  const ccResponse = await concurrencyCheck(resultKey);
  if (ccResponse.statusCode == SERVER_ERROR) {
    return resultResponse(SERVER_ERROR, tryAgainMessage);
  }
  const ccId = ccResponse?.data?.cc?._id;
  params['ccId'] = ccId;

  // Fetching the initial result declaration status.
  let eventActionFilter = { event_id: params.fancy_id, action_type: "Result" }
    , getEventActionStatus = await EventActionStatus.findOne(eventActionFilter).select("_id in_progress_status");
  // If it is the first-time request and the record flag is not found, it will create an entry in the database.
  if (getEventActionStatus == null)
    getEventActionStatus = await EventActionStatus.create({ ...eventActionFilter, type: "fancy", in_progress_status: 1, comment: "Result declare under process..." });
  // If the record is already present, and its status is 1 (in progress), the validation message will be displayed.
  else if (getEventActionStatus.in_progress_status == 1) {
    // Delete the Result CC Entry
    deleteConcurrencyById(ccId);
    return resultResponse(SERVER_ERROR, `Result declaration for event(${params.fancy_name}) already in process!`);
  }
  // In case processing is completed and an attempt is made to declare the result, an "Already result declared" validation message will be displayed.
  else if (getEventActionStatus.in_progress_status == 2) {
    // Delete the Result CC Entry
    deleteConcurrencyById(ccId);
    return resultResponse(SERVER_ERROR, `Result already declared for event(${params.fancy_name})!`);
  }
  const session = await mongoose.startSession();
  const transactionOptions = {
    readPreference: 'primary',
    readConcern: { level: 'majority' },
    writeConcern: { w: 'majority' }
  };
  try {
    let statusCode = SERVER_ERROR, statusMsg = "";
    await session.withTransaction(async () => {
      let { bet_result_id, fancy_id } = params;
      await BetsFancy.bulkWrite(fancyQueryService.updateBetRecordsOnResultDeclareQueryV2(params), { session, ordered: false });
      await FancyScorePosition.bulkWrite(fancyQueryService.updateFSPBetRecordsOnResultDeclareQueryV2(params), { session, ordered: false });
      let user_profit_loss = await FancyScorePosition.aggregate(fancyQueryService.sp_set_result_fancyV2(params), { session });
      let users_liability_balance = await UserProfitLoss.insertMany(user_profit_loss, { session, ordered: false });
      if (!users_liability_balance.length)
        throw new Error("An error occurred while generating the UserProfitLoss data. Please try again!");
      // here we are going to update user liability & balance to its original event initial data. odds_profit_loss.
      await fn_update_balance_liability_of_users(session, users_liability_balance);
      let status = await fn_update_balance_on_resultV2(session, bet_result_id, fancy_id, 0, "Fancy result declared successfully...", {}, 1);
      statusCode = status.statusCode;
      statusMsg = status.data;
      if (statusCode == SERVER_ERROR)
        throw new Error(statusMsg);

      // If the result declared successfully, release the key.
      await publisher.del(KEY);

      if (getEventActionStatus)
        // If market result declared action is completed, The entry will be removed from DB.
        EventActionStatus.deleteOne(eventActionFilter).then();

      // Update Bet Count Expire At
      updateBetCountExpire({ match_id: params.match_id, event_id: params.fancy_id });

      finalActionForFancySettle(params);

    }, transactionOptions);
    return resultResponse(statusCode, statusMsg);
  } catch (error) {

    // Delete the Result CC Entry
    deleteConcurrencyById(ccId);

    // If any error are occured release the key.
    await publisher.del(KEY);

    if (getEventActionStatus) {
      getEventActionStatus.in_progress_status = 0;
      getEventActionStatus.comment = "Result declare stop due to error!";
      getEventActionStatus.error = error.message;
      await getEventActionStatus.save();
    }
    if (error.message.includes("TransientTransactionError:")) {
      retryCount++;
      if (retryCount == MAX_RETRY_LIMIT)
        return resultResponse(SERVER_ERROR, "Please try to declare the result once again.");
      let result = await sessionResultV2(params, retryCount);
      return resultResponse(result.statusCode, result.data);
    }
    return resultResponse(SERVER_ERROR, "Error in result declare" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
  } finally {
    session.endSession();
  }
}

async function sessionResultV3(params, retryCount = 0) {
  const LOG_UUID = params?.LOG_REF_CODE || generateUUID();

  let st0 = Date.now();

  logger.SessionResultRollBack(`sessionResultV3: ${LOG_UUID}
      STAGE: 'Started'
      Params: ${JSON.stringify(params)}
      RetryCount: ${retryCount}
    `);

  const KEY = `fancy-result-${params.fancy_id}${UNIQUE_IDENTIFIER_KEY}`;
  let getLastResultStatus = await publisher.get(KEY);
  const tryAgainMessage = `Result declaring already in under process, Please wait for 10-20 sec.`;

  if (!getLastResultStatus) {
    await publisher.set(KEY, `${new Date()} ${params.fancy_name}`, "EX", 20);
  } else {
    // let getTTL = await publisher.ttl(KEY);

    logger.SessionResultRollBack(`sessionResultV3: ${LOG_UUID}
      STAGE: 'Key_Exists_In_Redis'
      RETURN: ${SERVER_ERROR}-${tryAgainMessage}
      `);
    return resultResponse(SERVER_ERROR, tryAgainMessage);
  }

  const resultKey = getSessionResultUID(params.fancy_id);
  const abandonedKey = getSessionAbandonedUID(params.fancy_id);

  // Check if Abandoned Entry Already Exists
  const abandonedCcCheck = await checkIfConcurrencyExists(abandonedKey);
  if (abandonedCcCheck.statusCode == SUCCESS) {
    logger.SessionResultRollBack(`sessionResultV3: ${LOG_UUID}
      STAGE: 'Abandoned_CC_Check'
      RETURN: ${SERVER_ERROR}-${tryAgainMessage}
      `);
    return resultResponse(SERVER_ERROR, tryAgainMessage);
  }

  // Create a new Entry for result CC;
  // If Server Error that means Entry already Exists;
  const ccResponse = await concurrencyCheck(resultKey);
  if (ccResponse.statusCode == SERVER_ERROR) {
    logger.SessionResultRollBack(`sessionResultV3: ${LOG_UUID}
        STAGE: 'Result_CC_Check'
        RETURN: ${SERVER_ERROR}-${tryAgainMessage}
        `);
    return resultResponse(SERVER_ERROR, tryAgainMessage);
  }
  const ccId = ccResponse?.data?.cc?._id;
  params["ccId"] = ccId;

  // Fetching the initial result declaration status.
  let eventActionFilter = { event_id: params.fancy_id, action_type: "Result" },
    getEventActionStatus = await EventActionStatus.findOne(
      eventActionFilter
    ).select("_id in_progress_status");

  // If it is the first-time request and the record flag is not found, it will create an entry in the database.
  if (getEventActionStatus == null) {
    getEventActionStatus = await EventActionStatus.create({
      ...eventActionFilter,
      type: "fancy",
      in_progress_status: 1,
      comment: "Result declare under process...",
    });
  }
  // If the record is already present, and its status is 1 (in progress), the validation message will be displayed.
  else if (getEventActionStatus.in_progress_status == 1) {
    // Delete the Result CC Entry
    deleteConcurrencyById(ccId);
    const message = `Result declaration for event(${params.fancy_name}) already in process!`;
    logger.SessionResultRollBack(`sessionResultV3: ${LOG_UUID}
        STAGE: 'EventActionStatus_InProgressStatus == 1'
        RETURN: ${SERVER_ERROR}-${message}
        `);
    return resultResponse(SERVER_ERROR, message);
  }
  // In case processing is completed and an attempt is made to declare the result, an "Already result declared" validation message will be displayed.
  else if (getEventActionStatus.in_progress_status == 2) {
    // Delete the Result CC Entry
    deleteConcurrencyById(ccId);
    const message = `Result already declared for event(${params.fancy_name})!`;
    logger.SessionResultRollBack(`sessionResultV3: ${LOG_UUID}
        STAGE: 'EventActionStatus_InProgressStatus == 2'
        RETURN: ${SERVER_ERROR}-${message}
        `);
    return resultResponse(SERVER_ERROR, message);
  }

  await Fancy.updateOne(
    { fancy_id: params.fancy_id },
    {
      is_processing: 1,
      processing_message: "Result Started",
    }
  );

  try {
    /**
     * # Bet Fancy Model ->
     *    1. One user can have multiple entries with same fancy Id
     *
     * # What's Happening Here
     * Here we are Updating all the Bets for that particular Fancy and
     * Winners get Profit in the Chip Field and Losers gets Liability in the Chip Field.
     */
    let st1 = Date.now();

    logger.SessionResultRollBack(`sessionResultV3: ${LOG_UUID}
        STAGE: 'Start_BetFancyUpdate'
        `);

    await Fancy.updateOne(
      { fancy_id: params.fancy_id },
      {
        is_processing: 1,
        processing_message: "Start_BetFancyUpdate",
      }
    );

    const betFancyBatchRes = await processBetFancyInBatches(params);

    if (betFancyBatchRes.statusCode != SUCCESS) {
      throw new Error(betFancyBatchRes.data.msg);
    }

    await Fancy.updateOne(
      { fancy_id: params.fancy_id },
      {
        is_processing: 1,
        processing_message: "End_BetFancyUpdate",
      }
    );

    logger.SessionResultRollBack(`sessionResultV3: ${LOG_UUID}
          STAGE: 'End_BetFancyUpdate'
          TimeTaken: ${Date.now() - st1} ms
          `);

    /**
     * # FancyScorePosition Model ->
     *    1. One Entry for one user for a Fancy Id with an array for bets_fancy
     *          (contain all bets for the user in that fancy.)
     *
     * # What's Happening Here
     * Here we are updating the FancyScorePosition for each user and particular Fancy
     * Update the Bets_fancy array such that Winners get Profit in the Chip Field and
     * Losers gets Liability in the Chip Field.
     */
    let st2 = Date.now();
    const fancyScorePositionUpdateQuery =
      fancyQueryService.updateFSPBetRecordsOnResultDeclareQueryV2(params);

    logger.SessionResultRollBack(`sessionResultV3: ${LOG_UUID}
          STAGE: 'Start_FancyScorePositionUpdate'
          Query: ${JSON.stringify(fancyScorePositionUpdateQuery)}
          `);

    await Fancy.updateOne(
      { fancy_id: params.fancy_id },
      {
        is_processing: 1,
        processing_message: "Start_FancyScorePositionUpdate",
      }
    );

    const fancyScorePositionUpdateResponse = await FancyScorePosition.bulkWrite(
      fancyScorePositionUpdateQuery,
      { ordered: false }
    );

    await Fancy.updateOne(
      { fancy_id: params.fancy_id },
      {
        is_processing: 1,
        processing_message: "End_FancyScorePositionUpdate",
      }
    );

    logger.SessionResultRollBack(`sessionResultV3: ${LOG_UUID}
          STAGE: 'End_FancyScorePositionUpdate'
          TimeTaken: ${Date.now() - st2} ms
          fsRes: ${JSON.stringify(fancyScorePositionUpdateResponse)}
        `);

    /**
     *  Stages in the Aggregate Query
     *  Match -> find all the entries for that fancyid
     *  UnWind -> Bet Fancies
     *  Group -> By User Id & Sum of betFancies.Chips as user_pl
     *  replaceRoot -> Merge Objts $doc & user_pl
     *  AddFields -> UserCommissionPl if user_pl > 0 then (user_pl * sess_comm) / 100 * -1 else 0
     *  Add Fields -> Agents_pl_distribution, calculate added_comm, added_pl, comm value
     *              and the other fileds like userid & user_name etc
     *  Project -> Project all the Field Required for Profit Loss Collection
     */
    let st3 = Date.now();
    const fancyScorePositionAggregateQuery =
      fancyQueryService.sp_set_result_fancyV2(params);

    logger.SessionResultRollBack(`sessionResultV3: ${LOG_UUID}
          STAGE: 'Start_FancyScorePositionAggregate'
          Query: ${JSON.stringify(fancyScorePositionAggregateQuery)}
      `);

    await Fancy.updateOne(
      { fancy_id: params.fancy_id },
      {
        is_processing: 1,
        processing_message: "Start_FancyScorePositionAggregate",
      }
    );

    let user_profit_loss = await FancyScorePosition.aggregate(
      fancyScorePositionAggregateQuery,
      {}
    );

    await Fancy.updateOne(
      { fancy_id: params.fancy_id },
      {
        is_processing: 1,
        processing_message: "End_FancyScorePositionAggregate",
      }
    );

    logger.SessionResultRollBack(`sessionResultV3: ${LOG_UUID}
          STAGE: 'End_FancyScorePositionAggregate'
          TimeTaken: ${Date.now() - st3} ms
        `);

    /**
     * Insert the Aggregate Result to the User Profit Loss Collection.
     */
    let st4 = Date.now();

    logger.SessionResultRollBack(`sessionResultV3: ${LOG_UUID}
          STAGE: 'Start_UserProfitLossInsert_and_DeleteMany'
          Input: "Response of Last Stage" 
      `);

    await Fancy.updateOne(
      { fancy_id: params.fancy_id },
      {
        is_processing: 1,
        processing_message: "Start_UserProfitLossInsert_and_DeleteMany",
      }
    );

    await UserProfitLoss.deleteMany({ event_id: params.fancy_id });

    let users_liability_balance = await UserProfitLoss.insertMany(
      user_profit_loss,
      { ordered: false }
    );

    await Fancy.updateOne(
      { fancy_id: params.fancy_id },
      {
        is_processing: 1,
        processing_message: "End_UserProfitLossInsert_and_DeleteMany",
      }
    );

    logger.SessionResultRollBack(`sessionResultV3: ${LOG_UUID}
          STAGE: 'End_UserProfitLossInsert_and_DeleteMany'
          TimeTaken: ${Date.now() - st4} ms
        `);

    if (!users_liability_balance.length)
      throw new Error(
        "An error occurred while generating the UserProfitLoss data. Please try again!"
      );

    const userObjectRes = await getUserAndAgentCalculatedUpdateObject({
      user_profit_loss: users_liability_balance,
      isRollback: false,
      LOG_UUID,
      isFancy: true,
    });

    if (userObjectRes.statusCode != SUCCESS) {
      throw new Error(userObjectRes.data.msg);
    }

    const combinedUserAgentArr = userObjectRes.data;

    let st7 = Date.now();

    const batchSize = 5;

    logger.SessionResultRollBack(`sessionResultV3: ${LOG_UUID}
          STAGE: 'Start_GenerateQueueBatches'
          QueueName: SessionResult
          BatchSize: ${batchSize}
          `);

    const queueResponse = getDataInBatchesForQueues(
      combinedUserAgentArr,
      "SessionResult",
      batchSize,
      params.fancy_id
    );

    logger.SessionResultRollBack(`sessionResultV3: ${LOG_UUID}
          STAGE: 'End_GenerateQueueBatches'
          TimeTaken: ${Date.now() - st7} ms
        `);
    // Response: ${JSON.stringify(queueResponse)}

    if (queueResponse.statusCode != SUCCESS) {
      throw new Error(queueResponse.data.msg);
    }

    const queueData = queueResponse.data;

    let st8 = Date.now();

    logger.SessionResultRollBack(`sessionResultV3: ${LOG_UUID}
          STAGE: 'Start_AddBatchesToQueue'
          Input: Response of Last Stage
        `);

    await Fancy.updateOne(
      { fancy_id: params.fancy_id },
      {
        is_processing: 4,
        processing_message: "Start_AddBatchesToQueue",
      }
    );

    const addBatchesRes = await SessionResultQueue.addBulk(queueData);
    const bull_job_ids = addBatchesRes.map(({ id }) => id);

    await Fancy.updateOne(
      { fancy_id: params.fancy_id },
      {
        is_processing: 4,
        processing_message: "End_AddBatchesToQueue",
        bull_job_ids,
        bull_job_count: bull_job_ids.length,
        bull_job_last_updated_at: new Date(),
      }
    );

    logger.SessionResultRollBack(`sessionResultV3: ${LOG_UUID}
          STAGE: 'End_AddBatchesToQueue'
          TimeTaken: ${Date.now() - st8} ms
        `);

    // If the result declared successfully, release the key.
    await publisher.del(KEY);

    // If market result declared action is completed, The entry will be removed from DB.
    if (getEventActionStatus) {
      EventActionStatus.deleteOne(eventActionFilter).then();
    }

    // Update Bet Count Expire At
    updateBetCountExpire({ match_id: params.match_id, event_id: params.fancy_id });

    // Perform Additional Non Blocking Tasks !!
    finalActionForFancySettle(params);

    logger.SessionResultRollBack(`sessionResultV3: ${LOG_UUID}
      STAGE: 'End'
      TimeTaken: ${Date.now() - st0} ms
      `);

    statusCode = SUCCESS;
    statusMsg = "Session Result Declared Successfully";
    return resultResponse(statusCode, statusMsg);
  } catch (error) {
    // Delete the Result CC Entry
    deleteConcurrencyById(ccId);
    console.error(error);

    logger.SessionResultRollBack(`sessionResultV3: ${LOG_UUID}
      STAGE: 'ERROR_Catch_Block'
      error: ${error.stack}
    `);

    await Fancy.updateOne(
      { fancy_id: params.fancy_id },
      {
        is_processing: 3,
        processing_message: error.message,
      }
    );
    // If any error are occured release the key.
    await publisher.del(KEY);

    if (getEventActionStatus) {
      getEventActionStatus.in_progress_status = 0;
      getEventActionStatus.comment = "Result declare stop due to error!";
      getEventActionStatus.error = error.message;
      await getEventActionStatus.save();
    }

    return resultResponse(
      SERVER_ERROR,
      "Error in result declare" +
      (process.env.DEBUG == "true"
        ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}`
        : "")
    );
  }
}


async function sessionRollback(bet_result_id, fancy_id) {
  const session = await mongoose.startSession();
  try {
    let statusMsg = "";
    await session.withTransaction(async (session) => {
      let status = await fn_update_balance_on_resultV1(
        session, bet_result_id, fancy_id, 1, "Fancy rollback successfully...", { is_session_rollback: true }, 1
      );
      if (status.statusCode == SUCCESS) {
        await BetsFancy.updateMany(
          { bet_result_id },
          { result: -11111, bet_result_id: null, is_result_declared: 0, chips: 0, }
        ).session(session);
        await UserProfitLoss.deleteMany(
          { bet_result_id }
        ).session(session);
        await BetResults.deleteOne(
          { _id: bet_result_id }
        ).session(session);
        await Fancy.updateOne(
          { fancy_id, bet_result_id },
          {
            is_active: 0, display_message: "SUSPENDED", is_rollback: 1,
            result_status: "", is_result_declared: 0, result: -11111, bet_result_id: null
          }
        ).session(session);
        await BetsFancy.updateMany(
          { fancy_id, bet_result_id },
          {
            chips: 0, result: -11111, bet_result_id: null, is_result_declared: 0
          }
        ).session(session);
      }
      statusMsg = status.data;
    });
    return resultResponse(SUCCESS, statusMsg);
  } catch (error) {
    return resultResponse(SERVER_ERROR, "Error in result rollback" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
  } finally {
    session.endSession();
  }
}

async function sessionRollbackV2(bet_result_id, fancy_id) {
  const tryAgainMessage = `Fancy rollback is already in under process!`;
  let eventActionFilter = { event_id: fancy_id, action_type: "Rollback" }
    // Getting rollback status.
    , getEventActionStatus = await EventActionStatus.findOne(eventActionFilter).select("_id in_progress_status");
  // If it is first rollback request the entry would be added in DB. 
  if (getEventActionStatus == null)
    getEventActionStatus = await EventActionStatus.create({ ...eventActionFilter, type: "fancy", in_progress_status: 1, comment: "Result rollback is under process..." });
  // If rollback is under process and user try to rollback again the market event the error message will shown.
  else if (getEventActionStatus.in_progress_status == 1) {
    return resultResponse(SERVER_ERROR, tryAgainMessage);
  }

  const rollbackKey = getSessionRollbackUID(fancy_id);

  // Create a new Entry for result CC;
  // If Server Error that means Entry already Exists;
  const ccResponse = await concurrencyCheck(rollbackKey);
  if (ccResponse.statusCode == SERVER_ERROR) {
    return resultResponse(SERVER_ERROR, tryAgainMessage);
  }
  const ccId = ccResponse?.data?.cc?._id;

  const session = await mongoose.startSession();
  try {
    let statusCode = SERVER_ERROR, statusMsg = "";
    await session.withTransaction(async (session) => {
      let status = await fn_update_balance_liability_on_session_result(
        session, bet_result_id, fancy_id, 'add', 1, "Fancy rollback successfully...", { is_session_rollback: true }
      );
      if (status.statusCode == SUCCESS) {
        await BetsFancy.updateMany(
          { bet_result_id },
          { result: -11111, bet_result_id: null, is_result_declared: 0, chips: 0, }
        ).session(session);
        await UserProfitLoss.deleteMany(
          { bet_result_id }
        ).session(session);
        await BetResults.deleteOne(
          { _id: bet_result_id }
        ).session(session);
        await Fancy.updateOne(
          { fancy_id, bet_result_id },
          {
            is_active: 0, display_message: "SUSPENDED", is_rollback: 1,
            result_status: "", is_result_declared: 0, result: -11111, bet_result_id: null
          }
        ).session(session);
        await BetsFancy.updateMany(
          { fancy_id, bet_result_id },
          {
            chips: 0, result: -11111, bet_result_id: null, is_result_declared: 0
          }
        ).session(session);
      }
      statusCode = status.statusCode;
      statusMsg = status.data;
      if (statusCode == SERVER_ERROR)
        throw new Error(statusMsg);
    });
    if (getEventActionStatus)
      // If market rollback action is completed, The entry will be removed from DB.
      EventActionStatus.deleteOne(eventActionFilter).then();

    // Delete the Result CC Entry
    deleteConcurrencyById(ccId);
    return resultResponse(statusCode, statusMsg);
  } catch (error) {

    // Delete the Result CC Entry
    deleteConcurrencyById(ccId);
    // If any exception will occur the comment & error fields are being updated with the message.
    if (getEventActionStatus) {
      getEventActionStatus.in_progress_status = 0;
      getEventActionStatus.comment = "Rollback stop due to error!";
      getEventActionStatus.error = error.message;
      await getEventActionStatus.save();
    }
    return resultResponse(SERVER_ERROR, "Error in result rollback" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
  } finally {
    session.endSession();
  }
}

async function sessionRollbackV3(bet_result_id, fancy_id, LOG_REF_CODE = undefined) {
  const LOG_UUID = LOG_REF_CODE || generateUUID();
  let st0 = Date.now();

  logger.SessionResultRollBack(`sessionRollbackV3: ${LOG_UUID}
    STAGE: 'Started'
    Params: ${JSON.stringify({ bet_result_id, fancy_id })}
  `)

  const tryAgainMessage = `Fancy rollback is already in under process!`;
  let eventActionFilter = { event_id: fancy_id, action_type: "Rollback" }
    // Getting rollback status.
    , getEventActionStatus = await EventActionStatus.findOne(eventActionFilter).select("_id in_progress_status");
  // If it is first rollback request the entry would be added in DB. 
  if (getEventActionStatus == null)
    getEventActionStatus = await EventActionStatus.create({ ...eventActionFilter, type: "fancy", in_progress_status: 1, comment: "Result rollback is under process..." });
  // If rollback is under process and user try to rollback again the market event the error message will shown.
  else if (getEventActionStatus.in_progress_status == 1) {
    logger.SessionResultRollBack(`sessionRollbackV3: ${LOG_UUID}
      STAGE: 'EventActionStatus_InProgressStatus == 1'
      RETURN: ${SERVER_ERROR}-${tryAgainMessage}
      `)
    return resultResponse(SERVER_ERROR, tryAgainMessage);
  }

  const rollbackKey = getSessionRollbackUID(fancy_id);

  // Create a new Entry for result CC;
  // If Server Error that means Entry already Exists;
  const ccResponse = await concurrencyCheck(rollbackKey);
  if (ccResponse.statusCode == SERVER_ERROR) {
    logger.SessionResultRollBack(`sessionRollbackV3: ${LOG_UUID}
      STAGE: 'Rollback_CC_Check'
      RETURN: ${SERVER_ERROR}-${tryAgainMessage}
      `)
    return resultResponse(SERVER_ERROR, tryAgainMessage);
  }
  const ccId = ccResponse?.data?.cc?._id;

  await Fancy.updateOne({ fancy_id }, {
    is_rollback_processing: 1,
    rollback_processing_message: "Rollback Started",
  });

  try {
    let statusCode = SERVER_ERROR, statusMsg = "";
    let st1 = Date.now();

    logger.SessionResultRollBack(`sessionRollbackV3: ${LOG_UUID}
    STAGE: 'Start_fn_update_balance_liability_on_session_resultV3'
    Params: ${JSON.stringify({ fancy_id, LOG_UUID, msg: "Fancy rollback successfully...", isFancy: true })}
    `);

    await Fancy.updateOne({ fancy_id }, {
      is_rollback_processing: 1,
      rollback_processing_message: "Start_fn_update_balance_liability_on_session_resultV3",
    });

    let status = await fn_update_balance_liability_on_session_resultV3(
      fancy_id, "Fancy rollback successfully...", LOG_UUID, true
    );

    await Fancy.updateOne({ fancy_id }, {
      is_rollback_processing: 1,
      rollback_processing_message: "End_fn_update_balance_liability_on_session_resultV3",
    });

    logger.SessionResultRollBack(`sessionRollbackV3: ${LOG_UUID}
        STAGE: 'End_fn_update_balance_liability_on_session_resultV3'
        Response: ${JSON.stringify({ statusCode: status.statusCode })}
        TimeTaken: ${Date.now() - st1} ms
      `);

    // throw new Error("Custom Error");
    if (status.statusCode != SUCCESS) {
      throw new Error(status.data.msg);
    }

    let st2 = Date.now();

    const batchSize = 5;
    const combinedUserAgentArr = status.data.combinedUserAgentArr;

    logger.SessionResultRollBack(`sessionRollbackV3: ${LOG_UUID}
    STAGE: 'Start_GenerateQueueBatches'
    QueueName: SessionResult
    BatchSize: ${batchSize}
    `);

    const queueResponse = getDataInBatchesForQueues(
      combinedUserAgentArr,
      "SessionRollback",
      batchSize,
      fancy_id,
    );

    logger.SessionResultRollBack(`sessionRollbackV3: ${LOG_UUID}
          STAGE: 'End_GenerateQueueBatches'
          Response: ${JSON.stringify({ statusCode: queueResponse.statusCode })}
          TimeTaken: ${Date.now() - st2} ms
        `);

    if (queueResponse.statusCode != SUCCESS) {
      throw new Error(queueResponse.data.msg);
    }

    const queueData = queueResponse.data;

    let st3 = Date.now();

    logger.SessionResultRollBack(`sessionRollbackV3: ${LOG_UUID}
      STAGE: 'Start_PromiseAll_UpdateQueries'
      `);

    await Fancy.updateOne({ fancy_id }, {
      is_rollback_processing: 1,
      rollback_processing_message: "Start_PromiseAll_UpdateQueries",
    });

    const betFancyFilter = { fancy_id, bet_result_id };
    const betFancyUpdate = {
      chips: 0,
      result: -11111,
      bet_result_id: null,
      is_result_declared: 0
    };

    const resultOfQueries = await Promise.all([
      UserProfitLoss.deleteMany({ bet_result_id }),
      // BetsFancy.updateMany( betFancyFilter, betFancyUpdate ),
      betFancyBatchHelper({ filter: betFancyFilter, update: betFancyUpdate, LOG_REF_CODE: LOG_UUID }),
    ]);

    await Fancy.updateOne({ fancy_id }, {
      is_rollback_processing: 1,
      rollback_processing_message: "End_PromiseAll_UpdateQueries",
    });

    logger.SessionResultRollBack(`sessionRollbackV3: ${LOG_UUID}
      STAGE: 'End_PromiseAll_UpdateQueries'
      TimeTaken: ${Date.now() - st3} ms
    `);

    let st4 = Date.now();

    logger.SessionResultRollBack(`sessionRollbackV3: ${LOG_UUID}
        STAGE: 'Start_AddBatchesToQueue'
        Input: QueueData
      `);

    await Fancy.updateOne({ fancy_id }, {
      is_rollback_processing: 4,
      rollback_processing_message: "Start_AddBatchesToQueue",
    });

    const addBatchesRes = await SessionResultQueue.addBulk(queueData);
    const rollback_bull_job_ids = addBatchesRes.map(({ id }) => id);

    await Fancy.updateOne({ fancy_id }, {
      is_rollback_processing: 4,
      rollback_processing_message: "End_AddBatchesToQueue",
      rollback_bull_job_ids,
      rollback_bull_job_count: rollback_bull_job_ids.length,
      rollback_bull_job_last_updated_at: new Date(),
    });

    logger.SessionResultRollBack(`sessionRollbackV3: ${LOG_UUID}
    STAGE: 'End_AddBatchesToQueue'
    TimeTaken: ${Date.now() - st4} ms
    `);

    if (getEventActionStatus) {
      // If market rollback action is completed, The entry will be removed from DB.
      EventActionStatus.deleteOne(eventActionFilter).then();
    }

    // Delete the Result CC Entry
    deleteConcurrencyById(ccId);

    logger.SessionResultRollBack(`sessionRollbackV3: ${LOG_UUID}
      STAGE: 'End'
      TimeTaken: ${Date.now() - st0} ms
    `);

    await Promise.all([
      BetResults.deleteOne({ _id: bet_result_id }),
      Fancy.updateOne(
        { fancy_id, bet_result_id },
        {
          is_active: 0,
          display_message: "SUSPENDED",
          is_rollback: 1,
          result_status: "",
          is_result_declared: 0,
          result: -11111,
          bet_result_id: null,
          is_rollback_processing: 2,
          rollback_processing_message: "Rollback_success",
          result_cron_progress: null,
          result_cron_progress_message: "",
        }
      ),
    ]);

    return resultResponse(SUCCESS, "Fancy Rollback Successfully..");
  } catch (error) {

    // Delete the Result CC Entry
    deleteConcurrencyById(ccId);
    console.error(error);

    await Fancy.updateOne({ fancy_id }, {
      is_rollback_processing: 3,
      rollback_processing_message: error.message,
    });

    logger.SessionResultRollBack(`sessionRollbackV3: ${LOG_UUID}
    STAGE: 'ERROR_Catch_Block'
    error: ${error.stack}
  `)

    // If any exception will occur the comment & error fields are being updated with the message.
    if (getEventActionStatus) {
      getEventActionStatus.in_progress_status = 0;
      getEventActionStatus.comment = "Rollback stop due to error!";
      getEventActionStatus.error = error.message;
      await getEventActionStatus.save();
    }
    return resultResponse(SERVER_ERROR, "Error in result rollback" + (
      process.env.DEBUG == "true"
        ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}`
        : ""));
  }
}

async function sessionAbandoned(fancy) {
  const tryAgainMessage = `Fancy abandoned or rollback is already in under process!`;
  let eventActionFilter = { event_id: fancy.fancy_id, action_type: "Abandoned" }
    // Getting abandoned status.
    , getEventActionStatus = await EventActionStatus.findOne(eventActionFilter).select("_id in_progress_status");
  // If it is first abandoned or rollback request the entry would be added in DB. 
  if (getEventActionStatus == null)
    getEventActionStatus = await EventActionStatus.create({ ...eventActionFilter, type: "fancy", in_progress_status: 1, comment: `Result Abandoned ${fancy.rollback ? "rollback" : ""} is under process...` });
  // If abandoned or rollback is under process and user try to abandoned or rollback again the market event the error message will shown.
  else if (getEventActionStatus.in_progress_status == 1)
    return resultResponse(SERVER_ERROR, tryAgainMessage);

  const resultKey = getSessionResultUID(fancy.fancy_id);
  const abandonedKey = getSessionAbandonedUID(fancy.fancy_id);

  // Check if Result Entry Already Exists
  const resultCcCheck = await checkIfConcurrencyExists(resultKey);
  if (resultCcCheck.statusCode == SUCCESS) {
    return resultResponse(SERVER_ERROR, tryAgainMessage);
  }

  // Create a new Entry for result CC;
  // If Server Error that means Entry already Exists;
  const ccResponse = await concurrencyCheck(abandonedKey);
  if (ccResponse.statusCode == SERVER_ERROR) {
    return resultResponse(SERVER_ERROR, tryAgainMessage);
  }
  const ccId = ccResponse?.data?.cc?._id;
  fancy['ccId'] = ccId;

  const session = await mongoose.startSession();
  try {
    const ABANDONED = 'Abandoned'
      , selection_id = result = winner_name = deleted_reason = ABANDONED
      , { fancy_id, rollback } = fancy,
      is_abandon = !rollback;
    let bet_result_id = null, msg = 'Abandoned fancy rollback successfully...';
    let BetResult;
    if (is_abandon) {
      try {
        bet_result_id = new BetResults(Object.assign({
          market_id: fancy_id, type: 2, selection_id, result, winner_name
        }, fancy));
        BetResult = bet_result_id;
        bet_result_id = bet_result_id._id;
        msg = 'Fancy abandoned successfully...';
        finalActionForFancySettle(fancy)
      } catch (error) {
        return resultResponse(SERVER_ERROR, "Error while saving Abandon result!" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
      }
    }
    await session.withTransaction(async (session) => {
      let fancy_liability = `sessions_liability.${fancy_id}.liability`;
      let Filter = {}, Set = {};
      Filter[fancy_liability] = { '$exists': true, '$ne': null };
      fancy_liability = "$" + fancy_liability;
      if (rollback)
        Set = {
          balance: { '$add': ["$balance", { "$toInt": fancy_liability }] },
          liability: { '$add': ["$liability", { "$toInt": fancy_liability }] }
        };
      else
        Set = {
          balance: { '$subtract': ["$balance", { "$toInt": fancy_liability }] },
          liability: { '$subtract': ["$liability", { "$toInt": fancy_liability }] }
        };
      if (rollback) {
        try {
          await User.updateMany(Filter, [{ '$set': Set }]).session(session);
          await BetsFancy.updateMany(
            { fancy_id, delete_status: 3 },
            { deleted_reason: "", bet_result_id: null, delete_status: 0 }
          ).session(session);
          await Fancy.updateOne(
            { fancy_id },
            {
              is_active: 0, is_result_declared: 0, result_status: "",
              bet_result_id, display_message: "SUSPENDED", is_rollback: 1
            }
          ).session(session);
          await BetResults.deleteOne(
            { market_id: fancy_id, type: 2 }
          ).session(session);
        } catch (error) {
          throw new Error(error.message);
        }
      } else {
        try {
          await User.updateMany(Filter, [{ '$set': Set }]).session(session);
          await BetsFancy.updateMany(
            { fancy_id, delete_status: 0 },
            { deleted_reason, bet_result_id, delete_status: 3 }
          ).session(session);
          await Fancy.updateOne(
            { fancy_id },
            {
              is_active: 3, is_result_declared: 1, result_status: msg,
              bet_result_id, display_message: ABANDONED
            }
          ).session(session);
        } catch (error) {
          throw new Error(error.message);
        }
      }
    });
    if (getEventActionStatus)
      // If market abandoned or rollback action is completed, The entry will be removed from DB.
      EventActionStatus.deleteOne(eventActionFilter).then();

    // Delete the Result CC Entry
    deleteConcurrencyById(ccId);
    return resultResponse(SUCCESS, msg);
  } catch (error) {

    // Delete the Result CC Entry
    deleteConcurrencyById(ccId);

    // If any exception will occur the comment & error fields are being updated with the message.
    if (getEventActionStatus) {
      getEventActionStatus.in_progress_status = 0;
      getEventActionStatus.comment = `Abandoned ${fancy.rollback ? "rollback" : ""} stop due to error!`;
      getEventActionStatus.error = error.message;
      await getEventActionStatus.save();
    }
    return resultResponse(SERVER_ERROR, `Error in odds abandon!` + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
  } finally {
    session.endSession();
  }
}

async function getMarketWiseLiablity(params) {
  let query = betQueryService.getMarketWiseLiablity(params);
  return OddsProfitLoss.aggregate(query).then(agentTeamPosition => {
    if (agentTeamPosition.length)
      return resultResponse(SUCCESS, agentTeamPosition);
    else
      return resultResponse(NOT_FOUND, "No markets liablity found!");
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

async function getMarketMaxLiablity(params) {
  return getMarketWiseLiablity(params).then(marketWiseLiablity => {
    if (marketWiseLiablity.statusCode == SUCCESS) {
      marketWiseLiablity = marketWiseLiablity.data.map(data => {
        return {
          sport_id: data.sport_id,
          sport_name: data.sport_name,
          series_id: data.series_id,
          series_name: data.series_name,
          match_id: data.match_id,
          match_name: data.match_name,
          event_name: data.event_name,
          event_id: data.event_id,
          type: data.type,
          liability: Math.min(...data.exposure), liability_full: Math.min(...data.total_exposure)
        }
      });
      return resultResponse(SUCCESS, marketWiseLiablity);
    } else
      return resultResponse(NOT_FOUND, "No liablity found!");
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

let getExposures = (user_id, user_type_id) => {
  if (user_type_id == USER_TYPE_USER)
    return betServiceUser.getExposures(user_id);
  return User.aggregate(userQuery.getUsersExposure(user_id))
    .then(userDetails => {
      if (userDetails.length) {
        userDetails = userDetails[0];
        let { markets, fancies } = userDetails;
        markets = markets.reduce((acc, obj) => {
          let key, value
          Object.keys(obj).map(market_id => {
            key = market_id;
            value = obj[market_id].liability;
            acc[key] = (acc.hasOwnProperty(key) ? acc[key] : 0.00) + value;
          });
          return acc;
        }, {});

        fancies = fancies.reduce((acc, obj) => {
          let key, value
          Object.keys(obj).map(sessions_liability => {
            key = sessions_liability;
            value = obj[sessions_liability].liability;
            acc[key] = (acc.hasOwnProperty(key) ? acc[key] : 0.00) + value;
          });
          return acc;
        }, {});

        let marketIds = Object.keys(markets), fancyIds = Object.keys(fancies);
        if (!marketIds.length)
          marketIds = [""];
        if (!fancyIds.length)
          fancyIds = [""];
        let query = betQueryService.getExposuresQuery(marketIds, fancyIds);
        return Market.aggregate(query).then(eventData => {
          let eventIds = { ...markets, ...fancies };
          let liabilitySum = 0;
          eventData = eventData.map(data => {
            if (eventIds[data.event_id] != undefined) {
              liabilitySum += eventIds[data.event_id];
              return { ...data, liability: eventIds[data.event_id] };
            }
          });
          eventData.push({ liabilitySum });
          if (eventData.length)
            return resultResponse(SUCCESS, eventData);
          else
            return resultResponse(NOT_FOUND, "No exposures found!");
        }).catch(error => resultResponse(SERVER_ERROR, error.message));
      } else
        return resultResponse(NOT_FOUND, "No exposures found!");
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

let getExposuresV1 = (user_id, user_type_id) => {
  if (user_type_id == USER_TYPE_USER)
    return betServiceUser.getExposures(user_id);
  return User.aggregate(userQuery.getUsersExposure(user_id))
    .then(userDetails => {
      if (userDetails.length) {
        userDetails = userDetails[0];
        let { markets, fancies } = userDetails;
        markets = markets.reduce((acc, obj) => {
          let key, value
          Object.keys(obj).map(market_id => {
            key = market_id;
            value = obj[market_id].liability;
            acc[key] = (acc.hasOwnProperty(key) ? acc[key] : 0.00) + value;
          });
          return acc;
        }, {});

        fancies = fancies.reduce((acc, obj) => {
          let key, value
          Object.keys(obj).map(sessions_liability => {
            key = sessions_liability;
            value = obj[sessions_liability].liability;
            acc[key] = (acc.hasOwnProperty(key) ? acc[key] : 0.00) + value;
          });
          return acc;
        }, {});

        let market_ids = Object.keys(markets), fancy_ids = Object.keys(fancies);
        if (!market_ids.length)
          market_ids = [""];
        if (!fancy_ids.length)
          fancy_ids = [""];
        let query = betQueryService.getEventsHavingLiability(market_ids, fancy_ids);
        return Market.aggregate(query).then(async eventData => {
          market_ids = [], fancy_ids = [];
          eventData.map(data => {
            if (data.type == "Market")
              market_ids.push(data.event_id);
            else
              fancy_ids.push(data.event_id);
          });
          let marketsLiability = await getMarketMaxLiablity({ user_id, market_ids });
          if (marketsLiability.statusCode == SUCCESS)
            marketsLiability = marketsLiability.data;
          else
            marketsLiability = [];
          let fanciesLiability = await fancyService.getFancyLiabilityBySharing({ user_id, fancy_ids, needExposure: true });
          if (fanciesLiability.statusCode == SUCCESS)
            fanciesLiability = fanciesLiability.data;
          else
            fanciesLiability = [];
          let liabilitySum = 0;
          eventData = [...marketsLiability, ...fanciesLiability].map(data => ((liabilitySum += data.liability), data));
          eventData.push({ liabilitySum });
          if (eventData.length)
            return resultResponse(SUCCESS, eventData);
          else
            return resultResponse(NOT_FOUND, "No exposures found!");
        }).catch(error => resultResponse(SERVER_ERROR, error.message));
      } else
        return resultResponse(NOT_FOUND, "No exposures found!");
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

function resultMarkets(params) {
  return marketService.results(params).then(result => {
    if (result.statusCode == NOT_FOUND || !result.data[0].data.length)
      console.info("No markets for result declare!");
    else if (result.statusCode == SERVER_ERROR)
      console.info("Error in market result: " + result.data);
    else {
      if (result.data[0].data.length)
        return marketAutoResult(result.data[0].data).then();
    }
  }).catch(console.error);
}

async function marketAutoResult(marketData) {
  let marketSuccessResults = [];
  for await (const market of marketData) {
    const { market_id, market_type } = market;
    try {
      let result, is_tbp = (market_type == TO_BE_PLACED_TYPE);
      try { result = await marketService.getResult({ market_id }); } catch (error) { }
      if ([SUCCESS, REMOVED].includes(result?.statusCode)) {
        if (result?.statusCode == SUCCESS) { // result declare
          let runners = result.data.runners, selection_id = runners.filter(data => data.status == WINNER).map(i => i.selectionId).join(',');
          if (selection_id) {
            let request = {
              body: {
                market_id, is_tbp,
                selection_id: is_tbp ? selection_id : parseInt(selection_id),
              }
            };
            await Market.updateOne({ market_id }, { is_processing: 1 });
            let marketResult = await oddsResultPreProcess(request, {});
            if (marketResult.statusCode == SUCCESS) {
              await Market.updateOne({ market_id }, { is_processing: 2 });
              marketResult = marketResult.data.data;
              marketSuccessResults.push(marketResult);
            } else
              await Market.updateOne({ market_id }, { is_processing: 3 });
          }
        } else if (result.statusCode == REMOVED) { } // abandoned
      }
    } catch (error) {
      console.error(error);
    }
  }
  return marketSuccessResults;
}

function resultFancy(params) {
  return fancyService.results(params).then(result => {
    if (result.statusCode == NOT_FOUND || !result.data.length)
      console.info("No fancy for result declare!");
    else if (result.statusCode == SERVER_ERROR)
      console.info("Error in fancy result: " + result.data);
    else {
      if (result.data[0].data.length)
        return fancyAutoResult(result.data[0].data).then();
    }
  }).catch(console.error);
}

async function processOddsRollback({ market_id, fromCron, LOG_REF_CODE }) {
  LOG_REF_CODE = LOG_REF_CODE || generateUUID();
  try {
    const betResultAlreadyDeclared = await BetResults.findOne(
      { market_id }, { _id: 1, match_id: 1 }
    );
    if (betResultAlreadyDeclared != null) {
      const { _id: bet_result_id, match_id } = betResultAlreadyDeclared;
      try {
        if (!fromCron && MARKET_ROLLBACK_TYPE == 'CRON') {
          const market = await Market.findOne({
            market_id
          }).select("market_id market_name rollback_cron_progress").lean();

          if (!market) {
            return resultResponse(NOT_FOUND, `Market not found for market_id: ${market_id}`);
          }
          const { rollback_cron_progress, market_name } = market;

          if (rollback_cron_progress || rollback_cron_progress === 0) {
            let message = "Rollback Already Requested";
            if (rollback_cron_progress === 1) {
              message = "Rollback is In Progress";
            } else if (rollback_cron_progress === 2) {
              message = "Rollback already Declared";
            } else if (rollback_cron_progress === 3) {
              message = "Some Error Occured During Rollback Cron";
            }
            message = `${message} for market '${market_name}(${market_id})'!`;
            logger.SessionResultRollBack(`${LOG_REF_CODE} ${message}`);
            return resultResponse(VALIDATION_FAILED, message);
          }

          const updateMarket = await Market.updateOne({ market_id }, {
            $set: {
              rollback_cron_progress: 0,
              rollback_cron_progress_message: "Rollback_Requested",
            }
          });

          const msg = `Rollback successfully Requested for market_id: ${market_id}`;
          logger.SessionResultRollBack(`${LOG_REF_CODE} ${msg}`);
          return resultResponse(SUCCESS, { msg, match_id });
        } else {
          let rollbackResult;

          if (MARKET_RESULT_VERSION == 'V3') {
            rollbackResult = await oddsRollbackV3(bet_result_id, market_id, match_id, { LOG_REF_CODE });
          } else {
            rollbackResult = await oddsRollback(bet_result_id, market_id, match_id);
          }

          if (rollbackResult.statusCode != SUCCESS)
            return resultResponse(SERVER_ERROR, { msg: rollbackResult.data });

          return resultResponse(SUCCESS, { msg: rollbackResult.data, match_id });
        }

      } catch (error) {
        console.error("Error in processOddsRollback 1: ", error);
        return resultResponse(SERVER_ERROR, `Error while rollback the market result: ${error.message}`);
      }
    }

    return resultResponse(SERVER_ERROR, "Please declare the result first!");
  } catch (error) {
    console.error("Error in processOddsRollback 2: ", error);
    return resultResponse(SERVER_ERROR, `Error while getting result: ${error.message}`)
  }
}

async function fancyAutoResult(fancyData) {
  let fancySuccessResults = [];
  for await (const fancy of fancyData) {
    const {
      fancy_id, fancy_name, match_id, match_name,
      series_id, series_name, sport_id,
    } = fancy;
    try {
      let result = await fancyService.getResult({ fancy_id, match_id });
      if (result.statusCode == SUCCESS) {
        result = result.data.Result;
        if (result != -999 && result != null) {
          await Fancy.updateOne({ fancy_id }, { is_processing: 1 });
          let resultResponse = await processFancyResult({ fancy_id, result });
          if (resultResponse.statusCode == SUCCESS) {
            await Fancy.updateOne({ fancy_id }, { is_processing: 2 });
            fancySuccessResults.push({
              match_id,
              message: `Fancy result: ${series_name} -> ${match_name} -> ${fancy_name}(${result})`
            });
          } else
            await Fancy.updateOne({ fancy_id }, { is_processing: 3 });
        } else if (result == -999) {
          await Fancy.updateOne({ fancy_id }, { is_processing: 1 });
          let resultResponse = await sessionAbandoned({
            sport_id, series_id, match_id, fancy_id, rollback: 0
          })
          if (resultResponse.statusCode == SUCCESS) {
            await Fancy.updateOne({ fancy_id }, { is_processing: 2 });
            fancySuccessResults.push({
              match_id,
              message: `Fancy abandoned: ${series_name} -> ${match_name} -> ${fancy_name}`
            });
          } else
            await Fancy.updateOne({ fancy_id }, { is_processing: 3 });
        }
      }
    } catch (error) {
      console.error(error);
    }
  }
  return fancySuccessResults;
}

async function processFancyResult(data) {
  // Capture start time for performance measurement
  const startTime = moment();

  const { fancy_id, fromCron } = data;

  // Generate a unique reference code for logging (optional)
  const LOG_REF_CODE = data?.LOG_REF_CODE || generateUUID();

  logger.SessionResultRollBack(`${LOG_REF_CODE} Starting processFancyResult`, { fancy_id });

  try {
    // Fetch the fancy object
    logger.SessionResultRollBack(`${LOG_REF_CODE} Fetching fancy object`, { fancy_id });
    const fancy = await Fancy.findOne({ fancy_id })
      .select(`-_id sport_id sport_name series_id series_name match_id match_name match_date 
        fancy_name is_active is_result_declared category_name is_processing processing_message 
        result_cron_progress `)
      .lean();

    if (!fancy) {
      logger.SessionResultRollBack(`WARN: ${LOG_REF_CODE} Fancy not found!`, { fancy_id });
      return resultResponse(NOT_FOUND, `Fancy not found!`);
    }

    const fancyBetFilter = {
      fancy_id,
      delete_status: 0,
      ...(fancy.processing_message ? {} : { is_result_declared: 0 })
    };
    const isBetFancyAvailable = await BetsFancy.findOne(fancyBetFilter)
      .select(["_id"])
      .lean()
      .exec();

    if (!isBetFancyAvailable) {
      return resultResponse(VALIDATION_FAILED, `No bets are available for fancy (${fancy.fancy_name})`);
    }

    // Set additional fields in data
    Object.assign(data, fancy);
    data.market_id = fancy_id;
    data.selection_id = fancy_id;
    data.type = 2;

    const { sport_id, series_id, match_id, market_id, result, type, fancy_name } = data;

    // Check if In Processing
    if (fancy.is_processing == 4) {
      logger.SessionResultRollBack(`WARN: ${LOG_REF_CODE} Result for fancy '${fancy_name}' is Struck around Queue`, fancy);
      return resultResponse(VALIDATION_FAILED, `Result for fancy '${fancy_name}' is Struck around Queue`);
    }

    // Check if the result is already declared.
    if (fancy.is_result_declared == 1) {
      logger.SessionResultRollBack(`WARN: ${LOG_REF_CODE} Result already declared for fancy '${fancy_name}'`, fancy);
      return resultResponse(VALIDATION_FAILED, `Result already declared for fancy '${fancy_name}'`);
    }

    // Check if the fancy status is not result declarable.
    if ([2, 3, 4].includes(fancy.is_active)) {
      logger.SessionResultRollBack(`WARN: ${LOG_REF_CODE} The fancy[${fancy_name}] status is currently [Closed, Abandoned, NotUsed]`, fancy);
      return resultResponse(VALIDATION_FAILED, `The fancy[${fancy_name}] status is currently [Closed, Abandoned, NotUsed]'${fancy_name}'`);
    }

    // Check if the result is already declared.
    logger.SessionResultRollBack(`${LOG_REF_CODE} Checking if result already declared`, { sport_id, series_id, match_id, market_id, type });
    const betResultAlreadyDeclared = await BetResults.findOne({ sport_id, series_id, match_id, market_id, type });

    if (betResultAlreadyDeclared) {
      logger.SessionResultRollBack(`WARN: ${LOG_REF_CODE} Result already declared`, { fancy_id, fancy_name });
      return resultResponse(VALIDATION_FAILED, `Result already declared for fancy '${fancy_name}'!`);
    }

    // Create new bet result
    logger.SessionResultRollBack(`${LOG_REF_CODE} Creating new bet result`, { ...data, winner_name: result });
    const betResult = new BetResults({ ...data, winner_name: result });

    try {

      if (!fromCron && SESSION_RESULT_TYPE == 'CRON') {

        if (fancy.result_cron_progress || fancy.result_cron_progress === 0) {
          let message = "Result Already Requested";
          if (fancy.result_cron_progress === 1) {
            message = "Result is In Progress";
          } else if (fancy.result_cron_progress === 2) {
            message = "Result already Declared";
          } else if (fancy.result_cron_progress === 3) {
            message = "Some Error Occured During Result Cron";
          }

          return resultResponse(VALIDATION_FAILED, `${message} for fancy '${fancy_name}'!`);
        }

        const updateFancy = await Fancy.updateOne({ fancy_id }, {
          $set: {
            result_value: result,
            result_cron_progress: 0,
            result_cron_progress_message: "Result_Requested",
          }
        });

        const msg = `Result successfully Requested for fancy_id: ${fancy_id}`;
        logger.SessionResultRollBack(`${LOG_REF_CODE} ${msg}`);
        return resultResponse(SUCCESS, { msg, ...data });
      } else {

        const functionName = SESSION_RESULT_VERSION == 'V3' ? 'sessionResultV3' : 'sessionResultV2';
        const resultFunctionParams = { ...data, bet_result_id: betResult._id, LOG_REF_CODE }
        // Call sessionResultV2 and process its result
        logger.SessionResultRollBack(`${LOG_REF_CODE} Calling ${functionName} with data`, resultFunctionParams);

        let sessionResult;
        if (SESSION_RESULT_VERSION == 'V3') {
          sessionResult = await sessionResultV3(resultFunctionParams)
        } else {
          sessionResult = await sessionResultV2(resultFunctionParams)
        }

        if (sessionResult.statusCode !== SUCCESS) {
          logger.SessionResultRollBack(`ERROR: ${LOG_REF_CODE} ${functionName} returned an error`, { statusCode: sessionResult.statusCode, errorData: sessionResult.data });
          throw new Error(sessionResult.data);
        }

        // Log success response from sessionResultV2
        logger.SessionResultRollBack(`${LOG_REF_CODE} ${functionName} successful`, { response: sessionResult.data });

        // Update Fancy and save the bet result
        logger.SessionResultRollBack(`${LOG_REF_CODE} Updating Fancy and saving BetResult`, { fancy_id, result: sessionResult.data });
        const updateFancy = Fancy.updateOne({
          sport_id,
          series_id,
          match_id,
          fancy_id
        }, {
          result_status: sessionResult.data,
          is_active: 2,
          is_result_declared: 1,
          display_message: 'Fancy Closed',
          result,
          bet_result_id: betResult._id,
          result_settled_at: new Date(),
          result_settled_ip: data?.ip_data ? data.ip_data : "Settled By Cron",
          is_processing: 2,
          processing_message: "Result_Success",
          rollback_cron_progress: null,
          rollback_cron_progress_message: "",
        });

        betResult.market_id = fancy_id;
        betResult.market_name = fancy_name;
        betResult.category_name = fancy.category_name;

        await Promise.all([updateFancy, betResult.save()]);

        deleteConcurrencyByKey(getSessionResultUID(fancy_id));

        logger.SessionResultRollBack(`${LOG_REF_CODE} Result successfully declared for fancy_id: ${fancy_id}`);
        return resultResponse(SUCCESS, { msg: sessionResult.data, ...data });

      }
    } catch (error) {
      // Update Fancy with error status
      logger.SessionResultRollBack(`ERROR: ${LOG_REF_CODE} Error while declaring result ${JSON.stringify(error, ["message", "arguments", "type", "name"])}`);
      await Fancy.updateOne(
        { sport_id, series_id, match_id, fancy_id: fancy_id },
        { result_status: error.message }
      );

      return resultResponse(SERVER_ERROR, `Result not declared: ${error.message}, Try again later...`);
    }

  } catch (error) {
    logger.SessionResultRollBack(`ERROR: ${LOG_REF_CODE} General error in processFancyResult ${JSON.stringify(error, ["message", "arguments", "type", "name"])}`);
    return resultResponse(SERVER_ERROR, `Error while processing: ${error.message}`);
  } finally {
    logger.SessionResultRollBack(`${LOG_REF_CODE} processFancyResult Execution Time: ${getTimeTaken({ startTime })}`);
  }
}

async function processFancyRollback(data) {

  logger.SessionResultRollBack(`===============================processFancyRollback================================`);

  // Capture start time for performance measurement
  const startTime = moment();

  // Extract fancy_id from the data object
  const { fancy_id, fromCron } = data;

  // Generate a unique reference code for logging (optional)
  const LOG_REF_CODE = data?.LOG_REF_CODE || generateUUID();

  logger.SessionResultRollBack(`${LOG_REF_CODE} Starting session rollback for fancy_id: ${fancy_id}`);

  try {
    // Check if a bet result is already declared for this fancy
    const betResultAlreadyDeclared = await BetResults.findOne({ market_id: fancy_id, type: 2 }, { _id: 1 });

    if (!betResultAlreadyDeclared) {
      logger.SessionResultRollBack(`WARN: ${LOG_REF_CODE} No result declared for fancy_id: ${fancy_id}`);
      return resultResponse(VALIDATION_FAILED, "Please declare the result first!");
    }

    // Fetch fancy details excluding unnecessary fields
    const fancy = await Fancy.findOne({ fancy_id })
      .select("-_id match_id sport_name series_name match_name fancy_name is_result_declared is_rollback_processing rollback_cron_progress")
      .lean();

    if (!fancy) {
      logger.SessionResultRollBack(`WARN: ${LOG_REF_CODE} Fancy not found!`, { fancy_id });
      return resultResponse(NOT_FOUND, `Fancy not found!`);
    }

    if (fancy.is_rollback_processing == 4) {
      logger.SessionResultRollBack(`WARN: ${LOG_REF_CODE} Rollback for Fancy '${fancy.fancy_name}' is Struck Around Queue`, fancy);
      return resultResponse(VALIDATION_FAILED, `Rollback for Fancy '${fancy.fancy_name}' is Struck Around Queue`);
    }

    // Check if fancy result is already declared then process the rollback.
    if (fancy.is_result_declared) {
      const bet_result_id = betResultAlreadyDeclared._id;
      logger.SessionResultRollBack(`${LOG_REF_CODE} Found bet result with id: ${bet_result_id}`);

      if (!fromCron && SESSION_ROLLBACK_TYPE == 'CRON') {

        if (fancy.rollback_cron_progress || fancy.rollback_cron_progress === 0) {
          let message = "Rollback Already Requested";
          if (fancy.rollback_cron_progress === 1) {
            message = "Rollback is In Progress";
          } else if (fancy.rollback_cron_progress === 2) {
            message = "Rollback already Declared";
          } else if (fancy.rollback_cron_progress === 3) {
            message = "Some Error Occured During Rollback Cron";
          }

          return resultResponse(VALIDATION_FAILED, `${message} for fancy '${fancy.fancy_name}'!`);
        }

        const updateFancy = await Fancy.updateOne({ fancy_id }, {
          $set: {
            rollback_cron_progress: 0,
            rollback_cron_progress_message: "Rollback_Requested",
          }
        });

        const msg = `Rollback successfully Requested for fancy_id: ${fancy_id}`;
        logger.SessionResultRollBack(`${LOG_REF_CODE} ${msg}`);
        return resultResponse(SUCCESS, { msg, ...data });

      } else {

        // Perform session rollback using sessionRollbackV2 function
        let sessionRollback;
        if (SESSION_RESULT_VERSION == 'V3') {
          sessionRollback = await sessionRollbackV3(bet_result_id, fancy_id, LOG_REF_CODE);
        } else {
          sessionRollback = await sessionRollbackV2(bet_result_id, fancy_id);
        }

        if (sessionRollback.statusCode !== SUCCESS) {
          logger.SessionResultRollBack(`ERROR: ${LOG_REF_CODE} Session rollback failed for bet_result_id: ${bet_result_id}, fancy_id: ${fancy_id}`);
          return resultResponse(SERVER_ERROR, sessionRollback.data);
        }

        logger.SessionResultRollBack(`${LOG_REF_CODE} Successfully completed session rollback for fancy_id: ${fancy_id}`);
        return resultResponse(SUCCESS, { msg: sessionRollback.data, ...fancy });
      }
    } else {
      logger.SessionResultRollBack(`WARN: ${LOG_REF_CODE} Please declare the result for fancy '${fancy.fancy_name}'`, fancy);
      return resultResponse(VALIDATION_FAILED, `Please declare the result for fancy '${fancy.fancy_name}'`);
    }

    // Catch any errors during processing
  } catch (error) {
    logger.SessionResultRollBack(`ERROR: ${LOG_REF_CODE} Error during session rollback for fancy_id: ${fancy_id}`);
    return resultResponse(SERVER_ERROR, `Error while processing: ${error.message}`);
  } finally {
    logger.SessionResultRollBack(`${LOG_REF_CODE} processFancyRollback Execution Time: ${getTimeTaken({ startTime })}`);
  }
}

async function processMarketAndFancyResultRequests() {

  try {

    let fancies = [];
    let markets = [];

    if (SESSION_RESULT_TYPE == 'CRON') {
      fancies = await Fancy.find(
        { result_cron_progress: 0 },
        { fancy_id: 1, result_value: 1 }
      ).lean().exec();
    }

    if (MARKET_RESULT_TYPE == 'CRON') {
      markets = await Market.find(
        { result_cron_progress: 0 },
        { market_id: 1, result_value: 1, market_type: 1 }
      ).lean().exec();
    }


    const data = [
      ...fancies.map(i => ({
        isFancy: true,
        id: i.fancy_id,
        result: Number(i.result_value),
      })),
      ...markets.map(i => ({
        isFancy: false,
        id: i.market_id,
        result: i.result_value,
        market_type: i.market_type,
      })),
    ];

    for (const item of data) {

      const LOG_REF_CODE = generateUUID();
      logger.SessionResultRollBack(`${LOG_REF_CODE} Starting processMarketAndFancyResultRequests
        Data: ${JSON.stringify(item)}
      `);

      const { isFancy } = item;

      try {
        let result;
        let filter;
        let update;

        if (isFancy) {
          filter = { fancy_id: item.id };

          await Fancy.updateOne(filter, {
            $set: {
              result_cron_progress: 1,
              result_cron_progress_message: `Result Declare is in Progress...`
            }
          });

          result = await processFancyResult({
            fromCron: true,
            fancy_id: item.id,
            result: item.result,
            LOG_REF_CODE,
          });
        } else {
          const is_tbp = (item.market_type == TO_BE_PLACED_TYPE)
          filter = { market_id: item.id };

          await Market.updateOne(filter, {
            $set: {
              result_cron_progress: 1,
              result_cron_progress_message: `Result Declare is in Progress...`
            }
          });
          result = await oddsResultPreProcess({
            body: {
              market_id: item.id,
              is_tbp,
              selection_id: is_tbp ? item.result : parseInt(item.result),
            }
          }, { fromCron: true, LOG_REF_CODE });
        }

        if (result.statusCode != SUCCESS) {
          update = {
            $set: {
              result_cron_progress: 3,
              result_cron_progress_message: `${result?.data?.msg || result?.data}`
            }
          };
        } else {
          update = {
            $set: {
              result_cron_progress: 2,
              result_cron_progress_message: `${result?.data?.msg || result?.data}`
            }
          };
        }

        if (isFancy) {
          await Fancy.updateOne(filter, update);
        } else {
          await Market.updateOne(filter, update);
        }

        logger.SessionResultRollBack(`${LOG_REF_CODE} End processMarketAndFancyResultRequests
          Result: ${JSON.stringify(result)}
        `);

      } catch (error) {
        console.error(`Error occured during Execution of Result for ${isFancy ? 'Fancy' : "Market"} with Id:${item.id}`, error);

        logger.SessionResultRollBack(`${LOG_REF_CODE} ERROR processMarketAndFancyResultRequests
        Error: ${JSON.stringify(error)}
        Error_Stack: ${JSON.stringify(error.stack)}
      `);

      }
    }

  } catch (error) {
    console.error("Error in processMarketAndFancyResultRequests: ", error);

  }
}

async function processMarketAndFancyRollbackRequests() {

  try {

    let fancies = [];
    let markets = [];

    if (MARKET_ROLLBACK_TYPE == 'CRON') {
      markets = await Market.find(
        { rollback_cron_progress: 0 },
        { market_id: 1, }
      ).lean().exec();
    }

    if (SESSION_ROLLBACK_TYPE == 'CRON') {
      fancies = await Fancy.find(
        { rollback_cron_progress: 0 },
        { fancy_id: 1 }
      ).lean().exec();
    }


    const data = [
      ...fancies.map(i => ({
        isFancy: true,
        id: i.fancy_id,
      })),
      ...markets.map(i => ({
        isFancy: false,
        id: i.market_id,
      })),
    ];

    for (const item of data) {

      const LOG_REF_CODE = generateUUID();
      logger.SessionResultRollBack(`${LOG_REF_CODE} Starting processMarketAndFancyRollbackRequests
        Data: ${JSON.stringify(item)}
      `);

      const { isFancy } = item;

      try {
        let result;
        let filter;
        let update;

        if (isFancy) {
          filter = { fancy_id: item.id };

          await Fancy.updateOne(filter, {
            $set: {
              rollback_cron_progress: 1,
              rollback_cron_progress_message: `Rollback Declare is in Progress...`
            }
          });

          result = await processFancyRollback({
            fromCron: true,
            fancy_id: item.id,
            LOG_REF_CODE,
          });
        } else {
          filter = { market_id: item.id };

          await Market.updateOne(filter, {
            $set: {
              rollback_cron_progress: 1,
              rollback_cron_progress_message: `Result Declare is in Progress...`
            }
          });

          result = await processOddsRollback({
            market_id: item.id,
            fromCron: true,
            LOG_REF_CODE
          });
        }

        if (result.statusCode != SUCCESS) {
          update = {
            $set: {
              rollback_cron_progress: 3,
              rollback_cron_progress_message: `${result?.data?.msg || result?.data}`
            }
          };
        } else {
          update = {
            $set: {
              rollback_cron_progress: 2,
              rollback_cron_progress_message: `${result?.data?.msg || result?.data}`
            }
          };
        }

        if (isFancy) {
          await Fancy.updateOne(filter, update);
        } else {
          await Market.updateOne(filter, update);
        }

        logger.SessionResultRollBack(`${LOG_REF_CODE} End processMarketAndFancyRollbackRequests
          Result: ${JSON.stringify(result)}
        `);

      } catch (error) {
        console.error(`Error occured during Execution of Rollback for ${isFancy ? 'Fancy' : "Market"} with Id:${item.id}`, error);

        logger.SessionResultRollBack(`${LOG_REF_CODE} End processMarketAndFancyRollbackRequests
        Error: ${JSON.stringify(error)}
        Error_Stack: ${JSON.stringify(error.stack)}
        `);
      }
    }

  } catch (error) {
    console.error("Error in processMarketAndFancyResultRequests: ", error);

  }
}

async function resetDemoUsersData(params = {}) {
  try {
    const bcrypt = require('bcrypt');
    let getDemoUsers = await User.find({ is_demo: true }).select(`
      _id parent_id parent_user_name user_name name user_type_id balance default_balance domain_name 
      point belongs_to_credit_reference parent_level_ids is_demo
    `);
    if (getDemoUsers.length) {
      let usersByUserNames = [], parents = [];
      for (const users of getDemoUsers) {
        usersByUserNames.push(users.user_name);
        parents.push(users.parent_user_name);
      }
      parents = [...new Set(parents)];
      let acknowledgeStatus = {};

      // Here we are deleting demo users data from the respective collections.
      acknowledgeStatus["user_profit_loss"] = (await UserProfitLoss.deleteMany({ user_name: { '$in': usersByUserNames } })).deletedCount;
      acknowledgeStatus["user_login_logs"] = (await UserLoginLogs.deleteMany({ user_name: { '$in': usersByUserNames } })).deletedCount;
      acknowledgeStatus["password_history"] = (await PasswordHistory.deleteMany({ user_name: { '$in': usersByUserNames } })).deletedCount;
      acknowledgeStatus["odds_profit_loss"] = (await OddsProfitLoss.deleteMany({ user_name: { '$in': usersByUserNames } })).deletedCount;
      acknowledgeStatus["oauth_token"] = (await OAuthToken.deleteMany({ "user.user_name": { '$in': usersByUserNames } })).deletedCount;
      acknowledgeStatus["bets_odds"] = (await BetsOdds.deleteMany({ user_name: { '$in': usersByUserNames } })).deletedCount;
      acknowledgeStatus["bets_fancy"] = (await BetsFancy.deleteMany({ user_name: { '$in': usersByUserNames } })).deletedCount;

      // Getting the parents of the users.
      parents = await User.find({ user_name: { '$in': parents } }).select(`
        _id parent_id parent_user_name user_name name user_type_id domain_name point belongs_to parent_level_ids
      `);

      let reqForDeposit = [];
      for (const Users of getDemoUsers) { // Withdraw the remaining balance of the user and transfer the same deposit to its parent account.
        let req = {};
        let Parent = parents.find(data => Users.parent_user_name == data.user_name);
        req.User = Parent; req.user = Users;
        req.body = { "parent_id": Users["parent_id"], "user_id": Users["_id"], "amount": Users['balance'], "crdr": 2, "remark": "Demo user balance debit." };
        if (Users['balance'])
          await statementService.chipInOut(req);
        req.body["amount"] = Users["default_balance"];
        req.body["crdr"] = 1;
        req.body["remark"] = "Demo user balance credit.";
        req.user.balance = 0;
        reqForDeposit.push(req);
      }

      acknowledgeStatus["account_statement"] = (await AccountStatement.deleteMany({ user_name: { '$in': usersByUserNames } })).deletedCount;

      for (const Users of reqForDeposit) { // Refilling a user's balance with its default value.
        if (Users["body"]["amount"]) {
          let req = Users;
          await statementService.chipInOut(req);
          if (Users["user"]["belongs_to_credit_reference"])
            await User.updateOne({ _id: Users["user"]["_id"] }, { credit_reference: Users["body"]["amount"] });
        }
      }

      // Resetting all demo users passwords.
      const password = generateReferCode();
      await User.updateMany(
        { is_demo: true },
        {
          '$set': {
            profit_loss: 0, liability: 0, total_settled_amount: 0,
            // raw_password: password,
            self_lock_user: 0, parent_lock_user: 0, self_lock_betting: 0, parent_lock_betting: 0,
            self_lock_fancy_bet: 0, parent_lock_fancy_bet: 0, self_close_account: 0, parent_close_account: 0,
            is_change_password: 1, password: bcrypt.hashSync(password, bcrypt.genSaltSync(10))
          },
          '$unset': { sessions_liability: 1, markets_liability: 1 }
        },
      );

      return resultResponse(SUCCESS, { msg: "Demo users reset successfully...", acknowledgeStatus });
    }
    return resultResponse(NOT_FOUND, "No demo users found yet!");
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function getExposuresV2(data) {
  let betsMaxLiability = betQueryService.getExposuresV2Query(data);
  return OddsProfitLoss.aggregate(betsMaxLiability).then(items => resultResponse(SUCCESS, items)).catch(error => resultResponse(SERVER_ERROR, error.message))
}

async function casinoExposures(req) {

  let casinoExposuresQuery = betQueryService.casinoExposures(req);

  return LotusCalculatedExposures.aggregate(casinoExposuresQuery)
    .then(data => resultResponse(SUCCESS, data[0]))
    .catch(error => resultResponse(SERVER_ERROR, error.message));

}

async function qtechExposures(req) {
  let casinoExposuresQuery = betQueryService.qtechExposures(req);

  return QTechCrDrWinLoss.aggregate(casinoExposuresQuery)
    .then(data => resultResponse(SUCCESS, data[0]))
    .catch(error => resultResponse(SERVER_ERROR, error.message));

}

async function betCountUpdateInRedis(params) {
  try {
    const { fullDocument, operationType, updateDescription } = params;
    let updateTtl = false;
    const ttl = 1; // 172800 -> 2 Days  || 60 * 5 -> 5 mins

    if (operationType == 'update' && updateDescription?.updatedFields?.expire_at) {
      updateTtl = true;
    }

    if (fullDocument) {
      const dataToInsert = [];
      const { parent_ids, match_id, bet_count, event_id, user_id, last_update_type } = fullDocument;

      const keys = parent_ids.map(
        i => `${BET_COUNT}${i.user_name}:${match_id}:${event_id}${UNIQUE_IDENTIFIER_KEY}`
      );

      if (!keys.length) return;

      const data = await redisClient.mget(...keys);

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        let item = data[i];

        if (!updateTtl) {
          item = !item ? undefined : JSON.parse(item);
          let betCountNew = !item ? bet_count : item.bet_count + last_update_type;

          item = JSON.stringify({ bet_count: betCountNew, match_id, event_id });
          dataToInsert.push(key, item);
        } else {
          if (item) redisClient.expire(key, ttl);
        }

      }

      if (!updateTtl && dataToInsert.length) {
        await redisClient.mset(...dataToInsert);
      }
    }
  } catch (error) {
    console.log("Error in betCountUpdateInRedis: ", error)
  }
}

async function updateBetCountExpire(filter) {
  const expire_at = new Date(); // Current date
  // expire_at.setDate(expire_at.getDate() + 2); // Add 1 day
  // expire_at.setMinutes(expire_at.getMinutes() + 5); // Add 5 min

  BetCount
    .updateMany(filter, { $set: { expire_at } })
    .then().catch(console.error);
}

async function betResultDetails(req) {
  return BetResults.findOne({ market_id: req.body.market_id }, { _id: 0 }).lean().exec()
    .then(data => resultResponse(SUCCESS, data))
    .catch(error => resultResponse(SERVER_ERROR, error.message));
}

async function getResultProgress(req) {
  try {
    const { type, isFancy } = req.joiData;
    let model;
    let filter = {};
    let project = {
      _id: 1,
      match_name: 1,
      match_id: 1,
      type,
    }
    if (isFancy) {
      model = Fancy;
      project = {
        ...project,
        fancy_name: 1,
        fancy_id: 1,
      }
    } else {
      model = Market;
      project = {
        ...project,
        fancy_name: "$market_name",
        fancy_id: "$market_id",
      }
    }

    if (type == "RESULT") {
      filter = {
        $or: [
          { result_cron_progress: { $nin: [null, 2] }, },
          { bull_job_ids: { $gt: [] } }
        ]
      };

      project = {
        ...project,
        is_processing: 1,
        processing_message: 1,
        // bull_job_ids: 1,
        bull_job_count: "$bull_job_ids",
        cron_progress: '$result_cron_progress',
        cron_progress_message: '$result_cron_progress_message',
      }
    } else if (type == 'ROLLBACK') {
      filter = {
        $or: [
          { rollback_cron_progress: { $nin: [null, 2] }, },
          { rollback_bull_job_ids: { $gt: [] } }
        ]
      };

      project = {
        ...project,
        is_processing: '$is_rollback_processing',
        processing_message: "$rollback_processing_message",
        bull_job_count: '$rollback_bull_job_ids',
        // bull_job_count: '$rollback_bull_job_count',
        cron_progress: '$rollback_cron_progress',
        cron_progress_message: '$rollback_cron_progress_message',
      }
    }

    const fancies = await model.find(filter, project)
      .sort({ updatedAt: -1 })
      .lean()
      .exec();

    fancies.map(i => {
      i.bull_job_count = i.bull_job_count?.length || 0;
    });
    return resultResponse(SUCCESS, { msg: 'Success', data: fancies });
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function resetStruckResult(req) {
  try {
    const { isFancy, type, id } = req.joiData;

    let model;
    let filter = {};
    let project = {
      _id: 1,
      match_name: 1,
      match_id: 1,
      type,
    }
    if (isFancy) {
      model = Fancy;
      project = {
        ...project,
        fancy_name: 1,
        fancy_id: 1,
      }
      filter = {
        fancy_id: id,
      }
    } else {
      model = Market;
      project = {
        ...project,
        fancy_name: "$market_name",
        fancy_id: "$market_id",
      }
      filter = {
        market_id: id,
      }
    }

    if (type == "RESULT") {
      project = {
        ...project,
        is_processing: 1,
        processing_message: 1,
        bull_job_ids: 1,
        bull_job_count: 1,
        cron_progress: '$result_cron_progress',
        cron_progress_message: '$result_cron_progress_message',
      };

      update = {
        $set: {
          is_processing: 0,
          processing_message: 'Restarting...',
          result_cron_progress: 0,
          result_cron_progress_message: ""
        }
      };
    } else if (type == 'ROLLBACK') {

      project = {
        ...project,
        is_processing: '$is_rollback_processing',
        processing_message: "$rollback_processing_message",
        bull_job_ids: '$rollback_bull_job_ids',
        bull_job_count: '$rollback_bull_job_count',
        cron_progress: '$rollback_cron_progress',
        cron_progress_message: '$rollback_cron_progress_message',
      };
      update = {
        $set: {
          is_rollback_processing: 0,
          rollback_processing_message: 'Restarting...',
          rollback_cron_progress: 0,
          rollback_cron_progress_message: ""
        }
      };
    }

    const fancy = await model.findOne(filter, project).lean().exec();
    let message = '';

    if (!fancy) {
      message = `No Fancy Found with this Id ${id}!`;
      return resultResponse(VALIDATION_ERROR, message);
    }
    const { cron_progress, is_processing } = fancy;

    if (cron_progress == null || cron_progress == undefined) {
      message = `${type} is not requested yet!`;
      return resultResponse(VALIDATION_ERROR, message);
    } else if (cron_progress == 0) {
      message = `${type} is not started yet!`;
      return resultResponse(VALIDATION_ERROR, message);
    } else if (cron_progress == 1) {
      message = `${type} is in Progress!`;
      return resultResponse(VALIDATION_ERROR, message);
    } else if (cron_progress == 2) {
      message = `${type} is completed successfully!`;
      return resultResponse(VALIDATION_ERROR, message);
    }

    if (cron_progress == 3 && is_processing == 4) {
      message = `${type} can't Retry after Processing is 4 !!`
      return resultResponse(VALIDATION_ERROR, message);
    }

    let updateRes;
    let resultKey;
    if (isFancy) {
      resultKey = type == "RESULT" ? getSessionResultUID(id) : getSessionRollbackUID(id);
    } else {
      resultKey = type == "RESULT" ? getOddsResultUID(id) : getOddsRollbackUID(id);
    }

    updateRes = await Promise.all([
      model.updateOne(filter, update),
      EventActionStatus.deleteOne({ event_id: id }),
      deleteConcurrencyByKey(resultKey)
    ]);
    message = `${type} requested Again Successfully!!`;

    return resultResponse(SUCCESS, { msg: message, data: updateRes });
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

module.exports = {
  getTeamPosition,
  bets,
  deleteBet,
  deleteBets,
  getFancyLiability,
  getFancyLiabilityBySharing,
  getExposures,
  getExposuresV1,
  resultMarkets,
  resultFancy,
  resetDemoUsersData,
  oddsResultPreProcess,
  oddsResult,
  oddsResultV1,
  oddsResultV2,
  oddsResultV3,
  oddsRollback,
  oddsAbandoned,
  processFancyResult,
  sessionResult,
  sessionResultV1,
  sessionResultV2,
  sessionResultV3,
  processFancyRollback,
  sessionRollback,
  sessionRollbackV2,
  sessionAbandoned,
  fn_update_balance_on_resultV1,
  fn_update_balance_on_resultV2,
  fn_update_balance_on_resultV2_casino,
  fn_update_balance_liability_of_users,
  getMarketMaxLiablity,
  getExposuresV2,
  casinoExposures,
  convertToMatchedBet,
  startConvertUnMatchedBets,
  startUnMatchedBetConversion,
  betCountUpdateInRedis,
  eventAnalysis,
  getExposuresEventWise,
  betResultDetails,
  getBetsEventTypesList,
  qtechExposures,
  processMarketAndFancyResultRequests,
  processMarketAndFancyRollbackRequests,
  getResultProgress,
  resetStruckResult,
  processOddsRollback,
};
