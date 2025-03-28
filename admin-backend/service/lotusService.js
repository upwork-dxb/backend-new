const { ObjectId } = require("bson")
  , axios = require('axios')
  , _ = require("lodash")
  , mongoose = require('mongoose')
  , moment = require('moment')
  , getCurrentLine = require('get-current-line')
  , User = require("../../models/user")
  , Partnerships = require("../../models/partnerships")
  , Lotus = require('../../models/lotus')
  , LotusBets = require('../../models/lotusBets')
  , QtechCrDrWinLoss = require('../../models/qtechCrDrWinLoss')
  , LotusExposures = require('../../models/lotusExposures')
  , LotusCalculatedExposures = require('../../models/lotusCalculatedExposures')
  , LotusRoundStatus = require("../../models/lotusRoundStatus")
  , BetResults = require("../../models/betResults")
  , Sports = require("../../models/sports")
  , Series = require('../../models/series')
  , Match = require('../../models/match')
  , Market = require('../../models/market')
  , UserProfitLoss = require("../../models/userProfitLoss")
  , publisher = require("../../connections/redisConnections")
  , betService = require('./betService')
  , lotusQuery = require('./lotusQuery')
  , resultResponse = require('../../utils/globalFunction').resultResponse
  , lotusConfig = require("../../utils/lotusConfig").getLotusOperator()
  , logger = require('../../utils/loggers')
  , { sendMessageAlertToTelegram } = require('./messages/telegramAlertService')
  , { delay, generateReferCode, exponentialToFixed, fixFloatingPoint, generateUUID } = require('../../utils')
  , {
    SUCCESS, NOT_FOUND, SERVER_ERROR, LIVE_GAME_SPORT_ID, LOTUS_GET_RESULT,
    USER_TYPE_SUPER_ADMIN, USER_TYPE_USER, WINNER, LOSER, UNIQUE_IDENTIFIER_KEY
  } = require("../../utils/constants");
const PdfDocService = require('./document/pdf/index');
const CsvDocService = require("./document/csv");

const MAX_RETRY_LIMIT = 15;
const NumberNestgame = "70009";

async function launchUrl(request) {
  try {
    const { game_type } = request?.joiData || {}
      , TOKEN = request.User.user_id
      , OPERATOR_ID = (request.User.is_demo) ? lotusConfig.operatorIdDemo : ((request.User.point == 100) ? lotusConfig.operatorIdHKD : lotusConfig.operatorId);

    let { game_id } = request?.joiData || {};

    if (game_id) {
      let getGameBlockStatus = await validateGameLock(request);
      if (getGameBlockStatus.statusCode != SUCCESS) {
        return resultResponse(getGameBlockStatus.statusCode, getGameBlockStatus.data);
      }
    }

    let launchUrl = "https://aura.fawk.app";
    if (game_id) {
      switch (game_type) {
        case "new":
          game_id = `${game_id}_1`;
          break;
        case "instant":
          game_id = `${game_id}_8`;
          break;
        case "old":
          game_id = `${game_id}_2`;
          break;
        default:
          game_id = `${game_id}_2`;
          break;
      }
    }
    launchUrl = `${launchUrl}/${TOKEN}/${OPERATOR_ID}/${game_id ? game_id : ""}`;
    return resultResponse(SUCCESS, { launchUrl });
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function launchInstantUrl(request) {
  try {
    const { game_id } = request.joiData
      , USER_ID = request.User.user_id
      , OPERATOR_ID = (request.User.is_demo) ? lotusConfig.operatorIdDemo : ((request.User.point == 100) ? lotusConfig.operatorIdHKD : lotusConfig.operatorId);

    if (game_id) {
      let getGameBlockStatus = await validateGameLock(request);
      if (getGameBlockStatus.statusCode != SUCCESS) {
        return resultResponse(getGameBlockStatus.statusCode, getGameBlockStatus.data);
      }
    }

    let launchUrl = "https://aura.fawk.app";
    launchUrl = `${launchUrl}/${USER_ID}/${OPERATOR_ID}/${game_id ? `${game_id}_8` : ""}`;
    return resultResponse(SUCCESS, { launchUrl });
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function lotusResultDeclare(req, retryCount = 0) {

  const session = await mongoose.startSession();
  const transactionOptions = {
    readPreference: 'primary',
    readConcern: { level: 'majority' },
    writeConcern: { w: 'majority' }
  };

  let { market, result, operatorId } = req.body;

  const roundId = market.roundId, marketId = market._id, gameId = market.gameId;

  await LotusRoundStatus.deleteMany({ gameId, roundId, marketId });

  let gameData = await LotusRoundStatus.create({ gameId, roundId, marketId, operatorId });

  let statusCode = SERVER_ERROR, statusMsg = "";

  try {

    await session.withTransaction(async () => {

      let generatedUserProfitLoss = await generateUserProfitLoss(market, result);

      if (generatedUserProfitLoss.statusCode != SUCCESS) {
        await LotusRoundStatus.updateOne({ _id: gameData._id }, { error: generatedUserProfitLoss.data });
        throw new Error(generatedUserProfitLoss.data);
      }

      const { user_profit_loss, bet_result_id, event_id } = generatedUserProfitLoss.data;

      let users_liability_balance = await UserProfitLoss.insertMany(user_profit_loss, { session, ordered: false });

      if (!users_liability_balance.length) {
        let error = "An error occurred while generating the UserProfitLoss data. Please try again!";
        await LotusRoundStatus.updateOne({ _id: gameData._id }, { error });
        throw new Error(error);
      }

      await betService.fn_update_balance_liability_of_users(session, users_liability_balance);

      let status = await betService.fn_update_balance_on_resultV2(session, bet_result_id, event_id, 0, "Result declared successfully...", {}, 0);

      if (status.statusCode == SUCCESS) {

        let finalRoundStatus = { "$set": { resultMessage: status.data, isProcessed: 1 } };
        if (retryCount) {
          finalRoundStatus["retryCount"] = retryCount;
        }
        await LotusRoundStatus.updateOne({ _id: gameData._id }, finalRoundStatus);

        // LotusBets.updateMany({ marketId, roundId }, { "$set": { isProcessed: 1 } }).then().catch(console.error);
        LotusExposures.updateMany({ marketId, roundId }, { "$set": { isProcessed: 1 } }).then().catch(console.error);
        LotusCalculatedExposures.updateMany({ marketId, roundId }, { "$set": { isProcessed: 1 } }).then().catch(console.error);
        lotusBetsUpdate(result);
        betResult(market);
      } else {

        await LotusRoundStatus.updateOne({ _id: gameData._id }, { error: status.data });

      }

      statusCode = status.statusCode;
      statusMsg = status.data;

      if (statusCode == SERVER_ERROR)
        throw new Error(statusMsg);

    }, transactionOptions);

    return resultResponse(statusCode, statusMsg);

  } catch (error) {

    if (error.message.includes("TransientTransactionError:")) {

      retryCount++;

      if (retryCount == MAX_RETRY_LIMIT) {
        let errorMsg = "Please try to declare the result once again.";
        await LotusRoundStatus.updateOne({ _id: gameData._id }, { error: errorMsg, retryCount, forCron: true });
        return resultResponse(SERVER_ERROR, errorMsg);
      }

      await delay(1000);

      let result = await lotusResultDeclare(req, retryCount);
      return resultResponse(result.statusCode, result.data);

    }

    await LotusRoundStatus.updateOne({ _id: gameData._id }, { error: error.message });
    return resultResponse(SERVER_ERROR, "Error in result declare: " + error.message);

  } finally {
    session.endSession();
  }
}

async function generateUserProfitLoss(gameData, usersGameData) {

  try {

    let { roundId, gameId, runnerType, winnerSelectionName, _id: marketId } = gameData
      , user_profit_loss = [];

    let market_id = `${LIVE_GAME_SPORT_ID}.${gameId}.${runnerType}`;

    if ([NumberNestgame].includes(gameId)) {
      market_id = `${LIVE_GAME_SPORT_ID}.${gameId}.${gameData.gameSubType}`;
    }

    const users_id = usersGameData.map(data => ObjectId(data.userId));

    const user = await User.find({ _id: { "$in": users_id } }).select("user_name domain_name is_demo").lean();

    if (!user.length)
      return resultResponse(NOT_FOUND, "User(s) not found!");

    const partnerships = await Partnerships.find({
      user_id: { "$in": users_id },
      "sports_share.sport_id": LIVE_GAME_SPORT_ID
    }).select(`
      -_id user_id sports_share.percentage.share.$ sports_share.percentage.user_id 
      sports_share.percentage.user_name sports_share.percentage.user_type_id
    `).lean();

    if (!partnerships.length)
      return resultResponse(NOT_FOUND, "Partnership(s) not found!");

    let distribution =
      _.map(partnerships, function (partnerships) {
        partnerships.agents_pl_distribution = partnerships.sports_share[0].percentage;
        delete partnerships.sports_share;
        return _.merge(
          partnerships,
          _.find(user, { _id: partnerships.user_id })
        )
      });

    let getCalculatedExposureAndStack = await LotusCalculatedExposures.find({ marketId, roundId }).select("-_id userId calculateExposure stackSum");

    let marketData = await Market.findOne({ market_id }).select("sport_id sport_name series_id series_name match_id match_name market_name");

    let sport_name = marketData.sport_name
      , match_name = marketData.match_name
      , event_id = `${market_id}.${roundId}`
      , event_name = marketData.market_name
      , betResultId = mongoose.Types.ObjectId();

    for (const userGameData of usersGameData) {

      let userData = distribution.find(o => o.user_id.toString() == userGameData.userId.toString());

      if (userData) {

        let liabilityAndStack = getCalculatedExposureAndStack.find(o => o.userId == userGameData.userId.toString());

        let agents_pl_distribution = userData.agents_pl_distribution
          , chips = userGameData.downpl
          , user_winning_status = chips > 0 ? "Win" : "Lose";

        let totalPl = 0;
        for (const [index, distribution] of agents_pl_distribution.entries()) {
          distribution.commission = 0;
          distribution.index = index;
          let p_l = 0;
          if (chips < 0) {
            p_l = fixFloatingPoint(Math.abs(chips * distribution.share) / 100);
          } else {
            p_l = fixFloatingPoint(-(Math.abs(chips * distribution.share) / 100));
          }
          distribution.p_l = p_l;

          // Set Added PL 
          // -> Super Admin (Self PL) 
          // -> Others (Sum of Parents PL excluding self PL)
          distribution.added_pl = index == 0 ? p_l : totalPl;
          distribution.added_comm = 0;

          totalPl = fixFloatingPoint(totalPl + p_l);
        }

        user_profit_loss.push({
          user_id: userData.user_id,
          user_name: userData.user_name,
          domain_name: userData.domain_name,
          is_demo: userData?.is_demo,
          sport_id: marketData.sport_id,
          sport_name: marketData.sport_name,
          series_id: marketData.series_id,
          series_name: marketData.series_name,
          match_id: marketData.match_id,
          match_name,
          match_date: moment().subtract(5, 'minutes'),
          event_id,
          event_name: marketData.market_name,
          winner_name: winnerSelectionName,
          bet_result_id: betResultId,
          stack: liabilityAndStack.stackSum,
          user_pl: chips,
          user_commission_pl: 0,
          max_liability: -(liabilityAndStack.calculateExposure),
          liability: -(liabilityAndStack.calculateExposure),
          // description: `${sport_name} - ${match_name} - ${event_name}(${marketId}) - RoundId(${roundId}) - Winner Name [ ${winnerSelectionName} ] ${user_winning_status == "Win" ? "Profit" : "Loss"} [ User : ${user_winning_status} ]`,
          description: `${match_name} / R.No : ${roundId} / ${winnerSelectionName}`,
          reffered_name: `${sport_name} -> ${match_name} -> ${event_name}`,
          agents_pl_distribution,
          auraMarketId: marketId,
          auraRountId: roundId,
          // casinoProvider: "AURA"
        });

      }

    }

    if (user_profit_loss.length) {
      return resultResponse(SUCCESS, { user_profit_loss, bet_result_id: betResultId, event_id });
    }

    return resultResponse(NOT_FOUND, "No profit loss found!");

  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }

}

function gettingWinnerDetails(req) {

  let { market } = req.body;

  let winnerSelectionId = 0, winnerSelectionName = market?.runnerType;

  try {

    let winnerSelection = market.marketRunner.find(data => data.status == WINNER);

    if (winnerSelection != undefined) {

      winnerSelectionId = winnerSelection.id;
      winnerSelectionName = winnerSelection.name;

    } else {

      // In some cases the winner status not come.
      let selectionId;
      for (let i = 0; i < market.marketRunner.length; i++)
        selectionId = market.marketRunner[i].id;
      winnerSelectionId = parseInt(`${selectionId}` + market.gameId);
      winnerSelectionName = LOSER;

    }

  } catch (error) { }

  return { winnerSelectionId, winnerSelectionName };

}

async function voidResult(req) {

  let { market } = req.body;

  const roundId = market.roundId, marketId = market._id, gameId = market.gameId;

  let gameData = await LotusRoundStatus.create({ gameId, roundId, marketId });

  try {

    let getCalculatedExposures = await LotusCalculatedExposures.find({ marketId, roundId }).select("-_id userId calculateExposure");

    if (getCalculatedExposures.length) {

      let usersRefundData = [], users = [], usersCalExp = {};

      for (const item of getCalculatedExposures) {

        usersCalExp[item.userId] = -(item.calculateExposure);

        let user_id = ObjectId(item.userId);

        users.push(user_id);

        usersRefundData.push({
          'updateOne': {
            'filter': { '_id': user_id },
            'update': { '$inc': { 'liability': -(item.calculateExposure), 'balance': -(item.calculateExposure) } }
          }
        });

      }

      try {

        const LOG_REF_CODE = generateReferCode();

        const preUserDetails = await User.find({ _id: { $in: users } }, { user_name: 1, balance: 1, liability: 1 }).lean();

        let preUsersDetailsString = "";

        for (const preUser of preUserDetails) {

          preUsersDetailsString += `[${preUser?.user_name}(${preUser?._id})] old_balance: ${preUser?.balance} - old_liability: ${preUser?.liability} - cal_amount: ${usersCalExp[preUser?._id.toString()]}`;

          preUsersDetailsString = preUsersDetailsString.trim();

          preUsersDetailsString += "\n";

        }

        logger.BalExp(`
          --PRE LOG--
          FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
          FUNCTION: clearExposureforClosedRoundsLotus
          EVENT_DETAILS: roundId(${roundId})
          LOG_REF_CODE: ${LOG_REF_CODE}
          DETAILS: ${preUsersDetailsString}
        `);

        await User.bulkWrite(usersRefundData);

        const postUserDetails = await User.find({ _id: { $in: users } }, { user_name: 1, balance: 1, liability: 1 }).lean();

        let postUsersDetailsString = "";

        for (const postUser of postUserDetails) {

          postUsersDetailsString += `[${postUser?.user_name}(${postUser?._id})] new_balance: ${postUser?.balance} - new_liability: ${postUser?.liability}`;

          postUsersDetailsString = postUsersDetailsString.trim();

          postUsersDetailsString += "\n";

          if ((exponentialToFixed(postUser?.liability) > 0) ? true : (exponentialToFixed(postUser?.balance) < 0) ? true : false) {
            sendMessageAlertToTelegram({ message: `\nLOG_REF_CODE: ${LOG_REF_CODE}\nUSER: ${postUser?.user_name}(${postUser?._id}) : balance ${postUser?.balance}, liability ${postUser?.liability}` });
          }

        }

        logger.BalExp(`
          --POST LOG--
          FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
          FUNCTION: clearExposureforClosedRoundsLotus
          EVENT_DETAILS: roundId(${roundId})
          LOG_REF_CODE: ${LOG_REF_CODE}
          DETAILS: ${postUsersDetailsString}
        `);

      } catch (error) {

        error.message = `Error in users refund bulk write: ${error.message}`;
        await LotusRoundStatus.updateOne({ _id: gameData._id }, { error: error.message });
        return resultResponse(SERVER_ERROR, error.message);

      }

    } else {

      let error = "No user's in calculated exposure collection.";
      await LotusRoundStatus.updateOne({ _id: gameData._id }, { error });
      return resultResponse(NOT_FOUND, error);

    }

    let resultMessage = "Users balance and exposure are return successfully...";
    await LotusRoundStatus.updateOne({ _id: gameData._id }, { "$set": { resultMessage, isProcessed: 1 } });
    LotusBets.updateMany({ marketId, roundId }, { "$set": { isProcessed: 1, betvoid: true } }).then().catch(console.error);
    LotusExposures.updateMany({ marketId, roundId }, { "$set": { isProcessed: 1 } }).then().catch(console.error);
    LotusCalculatedExposures.updateMany({ marketId, roundId }, { "$set": { isProcessed: 1 } }).then().catch(console.error);
    return resultResponse(SUCCESS, resultMessage);

  } catch (error) {

    await LotusRoundStatus.updateOne({ _id: gameData._id }, { error: error.message });
    return resultResponse(SERVER_ERROR, "Error in result void: " + error.message);

  }

}

async function clearPendingRoundsWithRetryLimitOver(request) {

  try {

    const { body } = request;

    let filter = { isProcessed: 0, error: { $exists: true }, retryCount: { $exists: true }, forCron: true };

    if (!body.hasOwnProperty("multiple")) {

      const { gameId, roundId, marketId } = body;

      filter = { ...filter, gameId, roundId, marketId };

    }

    let pendingRounds = await LotusRoundStatus
      .find(filter)
      .select("marketId operatorId")
      .sort({ createdAt: 1 })
      .lean();

    if (pendingRounds.length) {

      const operatorId = pendingRounds[0]?.operatorId;
      const marketsIds = pendingRounds.map(data => data.marketId);

      let data = JSON.stringify({
        operatorId,
        "markets": marketsIds
      });

      let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: LOTUS_GET_RESULT,
        headers: {
          'Content-Type': 'application/json'
        },
        data: data
      }

      let response = await axios(config);

      if (response.data) {

        response = response.data;

        if (response.success) {

          for (let result of response.result) {

            // Getting winners details
            let winnerData = gettingWinnerDetails({ body: result });

            try {

              let winnerSelectionId = winnerData.winnerSelectionId, winnerSelectionName = winnerData.winnerSelectionName;
              result.market.winnerSelectionId = winnerSelectionId;
              result.market.winnerSelectionName = winnerSelectionName;

            } catch (error) { }

            // Declaring the result.
            await lotusResultDeclare({ body: result });

          }

          return resultResponse(SUCCESS, "Pending rounds are clear");

        }

      }

    }

    return resultResponse(NOT_FOUND, "No pending rounds yet!");

  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function clearExposureforClosedRoundsLotus(request) {

  try {

    let filter = { isProcessed: 0 }, returnResult = false;

    if (request) {

      const { userId, marketId } = request.body;

      filter["userId"] = userId;
      filter["marketId"] = marketId;

      returnResult = true;

    }

    let endTime = moment().subtract(15, 'minutes');

    filter["updatedAt"] = { '$lte': new Date(endTime) };

    let getCalculatedExposures = await LotusCalculatedExposures
      .find(filter)
      .select("-_id userId roundId marketId calculateExposure operatorId");

    if (returnResult) {
      if (!getCalculatedExposures.length) {
        return resultResponse(SUCCESS, "The user exposure has already been cleared.");
      }
    }

    for (let item of getCalculatedExposures) {

      let data = JSON.stringify({
        operatorId: item.operatorId,
        "markets": [item.marketId]
      });

      let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: LOTUS_GET_RESULT,
        headers: {
          'Content-Type': 'application/json'
        },
        data: data
      }
      try {

        let getMarketResultStatus = await axios(config);

        if (getMarketResultStatus.data.success) {

          getMarketResultStatus = getMarketResultStatus.data.result;

          // if result equal to empty array
          if (getMarketResultStatus.length == 0) {

            // Here we will wait for a few seconds to prevent multiple rounds clearing.
            await delay(3000);

            const LOG_REF_CODE = generateReferCode();

            const preUserDetails = await User.findOne({ _id: ObjectId(item.userId) }, { user_name: 1, balance: 1, liability: 1 }).lean();

            logger.BalExp(`
              --PRE LOG--
              FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
              FUNCTION: clearExposureforClosedRoundsLotus
              EVENT_DETAILS: roundId(${item.roundId})
              LOG_REF_CODE: ${LOG_REF_CODE}
              DETAILS: [${preUserDetails?.user_name}(${preUserDetails?._id})] old_balance: ${preUserDetails?.balance} - old_liability: ${preUserDetails?.liability} - cal_amount: ${-(item.calculateExposure)}
            `);

            await User.updateOne(
              { '_id': ObjectId(item.userId) },
              { '$inc': { 'liability': -(item.calculateExposure), 'balance': -(item.calculateExposure) } }
            );

            const postUserDetails = await User.findOne({ _id: ObjectId(item.userId) }, { user_name: 1, balance: 1, liability: 1 }).lean();

            logger.BalExp(`
              --POST LOG--
              FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
              FUNCTION: clearExposureforClosedRoundsLotus
              EVENT_DETAILS: roundId(${item.roundId})
              LOG_REF_CODE: ${LOG_REF_CODE}
              DETAILS: [${postUserDetails?.user_name}(${postUserDetails?._id})] new_balance: ${postUserDetails?.balance} - new_liability: ${postUserDetails?.liability}
            `);

            if ((exponentialToFixed(postUserDetails?.liability) > 0) ? true : (exponentialToFixed(postUserDetails?.balance) < 0) ? true : false) {
              sendMessageAlertToTelegram({ message: `\nLOG_REF_CODE: ${LOG_REF_CODE}\nUSER: ${postUserDetails?.user_name}(${postUserDetails?._id}) : balance ${postUserDetails?.balance}, liability ${postUserDetails?.liability}` });
            }

            let filter = { marketId: item.marketId, roundId: item.roundId, userId: item.userId, isProcessed: 0 };
            const isProcessed = 2;

            LotusBets.updateMany(filter, { "$set": { isProcessed, betvoid: true } }).then().catch(console.error);
            LotusExposures.updateMany(filter, { "$set": { isProcessed } }).then().catch(console.error);
            LotusCalculatedExposures.updateOne(filter, { "$set": { isProcessed } }).then().catch(console.error);

            if (returnResult) {
              return resultResponse(SUCCESS, "User pending exposure is cleared now.");
            }

          }

          if (returnResult) {
            return resultResponse(NOT_FOUND, "Please try to declare the result, receiving a result from provider.");
          }

        }

        if (returnResult) {
          return resultResponse(NOT_FOUND, "The result did not give us a success in response.");
        }

      } catch (error) {
        if (returnResult) {
          return resultResponse(SERVER_ERROR, "The resultJson API is not responding. Error: " + error.message);
        }
      }

      if (returnResult) {
        return resultResponse(NOT_FOUND, "The round is still active from the provider's side.");
      }

    }

    return resultResponse(SUCCESS, "No pending actions have been taken yet.");

  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }

}

async function declareResultForClosedRoundsLotus(request) {

  try {

    let filter = {};

    if (request) {

      const { marketId } = request.body;

      filter["marketId"] = marketId;

    }

    let endTime = moment().subtract(20, 'minutes');

    filter["updatedAt"] = { '$lte': new Date(endTime) };

    let getCalculatedExposures = await LotusCalculatedExposures.aggregate(lotusQuery.getPendingMarketsList(filter));

    if (!getCalculatedExposures.length) {
      return resultResponse(SUCCESS, "Round(s) already cleared...");
    }

    const operatorId = getCalculatedExposures[0].operatorId;
    const marketsIds = getCalculatedExposures.map(data => data.marketId);

    let data = JSON.stringify({
      operatorId,
      "markets": marketsIds
    });

    let config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: LOTUS_GET_RESULT,
      headers: {
        'Content-Type': 'application/json'
      },
      data: data
    }

    let response = await axios(config);

    if (response.data) {

      response = response.data;

      if (response.success) {

        for (let result of response.result) {

          // Here we will wait for a few seconds to prevent multiple result declarations.
          await delay(3000);

          const roundStatusKey = `aura-round-id-${result.roundId}-${result.market._id}${UNIQUE_IDENTIFIER_KEY}`;
          const EXPIRE = 10 * 60; // 10 min.
          const getRoundStatus = await publisher.get(roundStatusKey);

          // If key data not foundm set the data and declare the result or void the result.
          if (!getRoundStatus) {

            // Setting the round key data.
            await publisher.set(roundStatusKey, new Date(), 'EX', EXPIRE).then();

            // If reposne contain void = true
            if (result.betvoid) {

              await voidResult({ body: result });

            } else {

              // Getting winners details
              let winnerData = gettingWinnerDetails({ body: result });

              try {

                let winnerSelectionId = winnerData.winnerSelectionId, winnerSelectionName = winnerData.winnerSelectionName;
                result.market.winnerSelectionId = winnerSelectionId;
                result.market.winnerSelectionName = winnerSelectionName;

              } catch (error) { }

              // Declaring the result.
              await lotusResultDeclare({ body: result });

            }

          }

        }

      }

    }

    return resultResponse(SUCCESS, "Pending round(s) are clear");

  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }

}

async function getRoundStatus(request) {

  const { objectId: _id } = request.body;

  return LotusBets
    .findById(_id)
    .select("-_id userId gameId roundId marketId operatorId isProcessed")
    .then(async result => {

      if (!result) {
        return resultResponse(NOT_FOUND, "Record not found!");
      }

      if (result.isProcessed != 0) {
        return resultResponse(NOT_FOUND, "It's already settled please try to refresh the page!");
      }

      let data = JSON.stringify({
        operatorId: result.operatorId,
        "markets": [result.marketId]
      });

      let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: LOTUS_GET_RESULT,
        headers: {
          'Content-Type': 'application/json'
        },
        data: data
      }

      try {

        let getMarketResultStatus = await axios(config);

        if (getMarketResultStatus.data.success) {

          getMarketResultStatus = getMarketResultStatus.data.result;

          if (getMarketResultStatus.length) {

            return resultResponse(SUCCESS, {
              msg: "Result is received, Please declare the result.",
              actionType: "manualResultDeclare",
              data: {
                marketId: result.marketId
              }
            });

          } else {

            return resultResponse(SUCCESS, {
              msg: "Please clear the exposure.",
              actionType: "clearExposure",
              data: {
                userId: result.userId,
                marketId: result.marketId
              }
            });

          }

        }

      } catch (error) {
        return resultResponse(SERVER_ERROR, error.message);
      }

    })
    .catch(error => resultResponse(SERVER_ERROR, error.message));

}

async function getExposures(request) {

  let { user_id } = request.body;

  user_id = user_id ? user_id : request.User.user_id.toString();

  let filter = { isProcessed: 0 };

  // If user wants to see the active exposure.
  if (request.User.user_type_id == USER_TYPE_USER) {

    filter["userId"] = user_id;

    // If super admin want to see the specific user active exposure.
  } else if (request.User.user_type_id == USER_TYPE_SUPER_ADMIN) {

    // If super admin user id is not equal to self id.
    if (user_id != request.User.user_id) {
      filter["userId"] = user_id;
    }

  } else {

    // If agent want to see their users exposure.
    filter["parentLevels.user_id"] = request.User.user_id;
    if (user_id != request.User.user_id) {
      if (user_id) {
        filter["userId"] = user_id;
      }
    }

  }

  return LotusCalculatedExposures
    .find(filter)
    .select("-_id sportName userName marketType matchName marketName calculateExposure operatorId")
    .then(data => {

      if (!data.length) {
        return resultResponse(NOT_FOUND, "No active exposure available yet!");
      }

      return resultResponse(SUCCESS, { data });

    }).catch(error => resultResponse(SERVER_ERROR, error.message));

}

async function bets(request) {

  let { user_id, is_void, bets_type, from_date, to_date, limit, page, isBack } = request.joiData;

  let skip = (page - 1) * limit;

  let filter = {};

  if (from_date && to_date)
    filter["createdAt"] = { '$gte': new Date(from_date), '$lte': new Date(to_date) };

  if (is_void) {
    filter["betvoid"] = is_void;
  }

  if (request.joiData?.marketId) {
    filter["marketId"] = request.joiData.marketId;
  }

  if (request.joiData?.gameId) {
    filter["gameId"] = request.joiData.gameId;
  }

  if (request.joiData?.roundId) {
    filter["roundId"] = request.joiData.roundId;
  }
  if (isBack) {
    filter["isBack"] = isBack;
  }

  filter["isProcessed"] = (bets_type == "settled") ? 1 : (bets_type == "cancelled") ? 2 : 0;

  user_id = user_id ? user_id : request.User.user_id.toString();

  // If user wants to see the active exposure.
  if (request.User.user_type_id == USER_TYPE_USER) {

    filter["userId"] = user_id;

    // If super admin want to see the specific user active exposure.
  } else if (request.User.user_type_id == USER_TYPE_SUPER_ADMIN) {

    // If super admin user id is not equal to self id.
    if (user_id != request.User.user_id) {
      filter["userId"] = user_id;
    }

  } else {

    // If agent want to see their users exposure.
    filter["parentLevels.user_id"] = request.User.user_id;
    if (user_id != request.User.user_id) {
      if (user_id) {
        filter["userId"] = user_id;
      }
    }

  }

  return LotusBets
    .find(filter)
    .limit(limit)
    .skip(skip)
    .select("_id userName userId domainName matchName marketType marketId runnerName stake odds pnl liability isBack roundId marketName betvoid operatorId createdAt")
    .sort({ createdAt: -1 })
    .then(data => {

      if (!data.length) {
        return resultResponse(NOT_FOUND, `No ${bets_type} bets data not found!`);
      }

      return LotusBets.countDocuments(filter).then(total => {
        return resultResponse(SUCCESS, { data: { metadata: { total, totalPages: Math.ceil(total / limit), currentPage: page }, data } });
      });

    }).catch(error => resultResponse(SERVER_ERROR, error.message));

}

async function logs(request) {

  let { marketId, roundId, from_date, to_date } = request.body, filter = {};

  if (marketId) {
    filter = { marketId };
  }

  if (roundId) {
    filter = { roundId };
  }

  if (from_date && to_date)
    filter["createdAt"] = { '$gte': new Date(from_date), '$lte': new Date(to_date) };

  return Lotus
    .find(filter)
    .sort({ createdAt: 1 })
    .select("-_id")
    .limit(100)
    .then(result => {

      if (!result.length) {
        return resultResponse(NOT_FOUND, "No logs found!");
      }

      return resultResponse(SUCCESS, { data: result });

    }).catch(error => resultResponse(SERVER_ERROR, error.message));

}

async function createNewGame(req) {

  try {

    let { gameId, matchName, marketType, runners } = req.body;

    const sport_id = LIVE_GAME_SPORT_ID, sport_name = "Casino";

    const series_id = gameId, series_name = matchName;

    const match_id = gameId, match_name = matchName;

    const market_id = `${sport_id}.${gameId}.${marketType}`, market_name = matchName, centralId = 0;

    runners = createRunners({ market_id, runners });

    const seriesData = {
      sport_id, sport_name, series_id, series_name, name: series_name
    };

    const matchData = {
      sport_id, sport_name, series_id, series_name, match_id, match_name, name: match_name, runners
    };

    const marketData = {
      sport_id, sport_name, series_id, series_name, match_id, match_name, market_id, marketId: market_id, market_name, name: market_name, centralId, runners
    };

    let isSeriesExists = await Series.findOne({ series_id: gameId }).select("-_id series_id");

    if (isSeriesExists) {

      let isMatchExists = await Match.findOne({ match_id }).select("-_id match_id");

      if (isMatchExists) {

        let isMarketExists = await Market.findOne({ market_id }).select("-_id market_id");

        if (!isMarketExists) {

          // If market data not found, Creating market data.
          await Market.create(marketData);

        }

      } else {

        // If match data not found, Creating match data along with market data.

        const session = await mongoose.startSession();

        await session.withTransaction(async (session) => {

          await Match.create([matchData], { session: session });

          await Market.create([marketData], { session: session });

        });

      }

    } else {

      // If series, match & market data not available will create it.

      const session = await mongoose.startSession();

      await session.withTransaction(async (session) => {

        await Series.create([seriesData], { session: session });

        await Match.create([matchData], { session: session });

        await Market.create([marketData], { session: session });

      });

    }

    return resultResponse(NOT_FOUND, "Please try again later...");

  } catch (error) {

    return resultResponse(NOT_FOUND, error.message);

  }

}

function createRunners(params) {

  let { market_id, runners } = params;

  if (!runners) {
    return [];
  }

  try {

    runners = runners.map(data => ({
      market_id,
      selectionId: data?.id,
      selection_id: data?.id,
      name: data?.name,
      selection_name: data?.name,
      sort_name: data?.type,
      sort_priority: data?.sortPriority
    }));

    return runners;

  } catch (error) {
    return [];
  }

}

async function lotusBetsUpdate(result) {
  const betsNetPL = result.flatMap((item) =>
    item.orders.map((item) => ({
      updateOne: {
        filter: { orderId: item.orderId },
        update: {
          $set: { chips: item.downPl, status: item.status, isProcessed: 1 },
        },
      },
    })),
  );
  await LotusBets.bulkWrite(betsNetPL);
}

async function betResult(market) {
  try {
    let lotusBets = await LotusBets.findOne({ marketId: market._id }, { marketName: 1, matchName: 1, marketId: 1, gameId: 1 }).lean().exec()
    let betResult = {};
    let cards = [];
    let indexCard = [];
    // Get cards from each runner, keeping them separate
    cards = market?.marketRunner?.map((runner) => ({
      runnerId: runner.id,
      name: runner.name,
      status: runner.status,
      cards: runner.cards,
    }));
    // Use indexCard if not empty
    indexCard = market.indexCard;
    betResult.cards = cards
    betResult.index_cards = indexCard
    betResult.winner_name = market.winnerSelectionName;
    betResult.market_id = lotusBets.marketId;
    betResult.market_name = lotusBets.marketName;
    betResult.series_id = lotusBets.gameId;
    betResult.series_name = lotusBets.matchName;
    betResult.match_id = lotusBets.gameId;
    betResult.match_name = lotusBets.matchName;
    betResult.sport_id = LIVE_GAME_SPORT_ID;
    betResult.sport_name = 'Casino';
    betResult.selection_id = market.winnerSelectionId;
    betResult.round_id = market.roundId
    BetResults.create(betResult);
  } catch (error) { }
}

async function casinoResults(request) {
  return BetResults.aggregate(lotusQuery.casinoResults(request))
    .then(lotusBets => {
      if (lotusBets[0].data.length)
        return resultResponse(SUCCESS, lotusBets[0]);
      else
        return resultResponse(NOT_FOUND, "No Data found!");
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

async function casinoResultsDocument(request, res) {
  try {
    const { document_type } = request.body;
    const casinoResultsRes = await casinoResults(request);
    if (casinoResultsRes.statusCode != SUCCESS) {
      return casinoResultsRes;
    }
    const list =
      Array.isArray(casinoResultsRes?.data?.data) &&
        casinoResultsRes.data.data.length
        ? casinoResultsRes.data.data
        : [];
    const phead = [
      { title: "Market Id" },
      { title: "Winner" },
    ];
    const ptextProperties = { title: "Casino Result Report", x: 162, y: 9 };
    let columnCount = phead.length;
    const cellWidth = "auto",
      pbodyStyles = Object.fromEntries(
        phead.map((col, index) => [
          index,
          { cellWidth: col.width !== undefined ? col.width : cellWidth },
        ]),
      );
    let pbody = list
      .map((item, index) => [
        item.market_id,
        item.winner_name,
      ]);
    if (document_type == "PDF") {
      const pdfRes = await PdfDocService.createPaginatedPdf(res, {
        orientation: "l",
        ptextProperties,
        phead,
        pbody,
        pbodyStyles,
        fileName: "casinoresults",
      });

      return pdfRes;
    }
    if (document_type == "CSV") {
      let data = await CsvDocService.formatExcelData(phead, pbody);
      const csvbRes = await CsvDocService.createPaginatedCsv(res, {
        data,
        fileName: "casinoresults",
        columnCount: columnCount,
      });
      return csvbRes;
    }
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function lotusBets(request) {
  return LotusBets.aggregate(lotusQuery.lotusBetsQuery(request))
    .then(lotusBets => {
      if (lotusBets[0].data.length)
        return resultResponse(SUCCESS, lotusBets[0]);
      else
        return resultResponse(NOT_FOUND, "No Data found!");
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

async function lotusBetsDocument(request, res) {
  try {
    const { document_type } = request.body;
    const lotusBetsRes = await lotusBets(request);
    if (lotusBetsRes.statusCode != SUCCESS) {
      return lotusBetsRes;
    }
    const list =
      Array.isArray(lotusBetsRes?.data?.data) &&
        lotusBetsRes.data.data.length
        ? lotusBetsRes.data.data
        : [];
    const phead = [
      { title: "UserName" },
      { title: "nation" },
      { title: "userrate" },
      { title: "bettype" },
      { title: "amount" },
      { title: "winloss" },
      { title: "ismatched" },
      { title: "PlaceDate" },
      { title: "IpAddress" },
      { title: "Nationjson" },
      { title: "bhav" },
    ];
    let columnCount = phead.length;
    let pbody = list
      .map((item, index) => [
        item.userName,
        item.runnerName,
        item.odds,
        item.isBack ? 'back' : 'lay',
        item.stake,
        item.chips,
        'TRUE',
        moment(item.createdAt).format('DD/MM/YYYY HH:mm:ss A'), // Formatted date
        "",
        "",
        "",
      ]);
    if (document_type == "CSV") {
      let data = await CsvDocService.formatExcelData(phead, pbody);
      const csvbRes = await CsvDocService.createPaginatedCsv(res, {
        data,
        fileName: generateUUID(),
        columnCount: columnCount,
      });
      return csvbRes;
    }
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function lotusBetsCrDr(request) {
  return QtechCrDrWinLoss.aggregate(lotusQuery.lotusBetsCrDrQuery(request))
    .then(lotusBets => {
      if (lotusBets[0].data.length)
        return resultResponse(SUCCESS, lotusBets[0]);
      else
        return resultResponse(NOT_FOUND, "No Data found!");
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

async function lotusBetsCrDrDocument(request, res) {
  try {
    const { document_type } = request.body;
    const lotusBetsRes = await lotusBetsCrDr(request);
    if (lotusBetsRes.statusCode != SUCCESS) {
      return lotusBetsRes;
    }
    const list =
      Array.isArray(lotusBetsRes?.data?.data) &&
        lotusBetsRes.data.data.length
        ? lotusBetsRes.data.data
        : [];
    const phead = [
      { title: "Game Name" },
      { title: "Type" },
      { title: "Amount" },
      { title: "Total" },
      { title: "Date" },
      { title: "Transaction Id" },
    ];
    const ptextProperties = { title: "Live Casino Results", x: 105, y: 8 };
    let columnCount = phead.length;
    const cellWidth = "auto",
      pbodyStyles = Object.fromEntries(
        phead.map((col, index) => [
          index,
          { cellWidth: col.width !== undefined ? col.width : cellWidth },
        ]),
      );
    let pbody = list
      .map((item, index) => [
        item.gameName,
        item.txnType,
        item.amount,
        item.total,
        moment(item.createdAt).format('DD/MM/YYYY HH:mm:ss'), // Formatted date
        item.txnId,

      ]);
    if (document_type == "PDF") {
      const pdfRes = await PdfDocService.createPaginatedPdf(res, {
        orientation: "l",
        ptextProperties,
        phead,
        pbody,
        pbodyStyles,
        fileName: "livecasinoresults",
      });

      return pdfRes;
    }
    if (document_type == "CSV") {
      let data = await CsvDocService.formatExcelData(phead, pbody);
      const csvbRes = await CsvDocService.createPaginatedCsv(res, {
        data,
        fileName: "livecasinoresults",
        columnCount: columnCount,
      });
      return csvbRes;
    }
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function lotusCurrentBetsDocument(request, res) {
  try {
    const { document_type } = request.body;
    const lotusBetsRes = await lotusBets(request);
    if (lotusBetsRes.statusCode != SUCCESS) {
      return lotusBetsRes;
    }
    const list =
      Array.isArray(lotusBetsRes?.data?.data) &&
        lotusBetsRes.data.data.length
        ? lotusBetsRes.data.data
        : [];
    const phead = [
      { title: "Event Name" },
      { title: "User Name" },
      { title: "Nation" },
      { title: "User Rate" },
      { title: "Amount" },
      { title: "Place Date" },
      { title: "IP" },
      { title: "Browser" },
    ];
    const ptextProperties = { title: "Current Bets", x: 150, y: 8 };
    let columnCount = phead.length;
    const cellWidth = "auto",
      pbodyStyles = Object.fromEntries(
        phead.map((col, index) => [
          index,
          { cellWidth: col.width !== undefined ? col.width : cellWidth },
        ]),
      );
    let pbody = list
      .map((item, index) => [
        item.matchName + ' / ' + item.roundId,
        item.userName,
        item.marketName,
        item.odds,
        item.stake,
        moment(item.createdAt).format('DD/MM/YYYY HH:mm:ss'), // Formatted date
        "",
        ""
      ]);

    if (document_type == "PDF") {
      const pdfRes = await PdfDocService.createPaginatedPdf(res, {
        orientation: "l",
        ptextProperties,
        phead,
        pbody,
        pbodyStyles,
        fileName: "current_bet",
      });

      return pdfRes;
    }
    if (document_type == "CSV") {
      let data = await CsvDocService.formatExcelData(phead, pbody);
      const csvbRes = await CsvDocService.createPaginatedCsv(res, {
        data,
        fileName: "current_bet",
        columnCount: columnCount,
      });
      return csvbRes;
    }
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function validateLobbyUrl(req, res, next) {
  const { User: user } = req;
  let blockedUsers = user.parent_level_ids.map(data => (data.user_id).toString());
  blockedUsers.push(user._id.toString());
  let event = await Sports.findOne({ sport_id: LIVE_GAME_SPORT_ID.toString() }).select("-_id self_blocked parent_blocked is_active is_visible").lean().exec();

  if (!event || event?.is_active == 0 || event?.is_visible == false) {
    return resultResponse(NOT_FOUND, "Game is locked. Please Contact Upper Level. SA");
  }

  const self_blocked = blockedUsers.some(element => event.self_blocked.includes(element));
  const parent_blocked = blockedUsers.some(element => event.parent_blocked.includes(element));

  if ((event.self_blocked.length && self_blocked) || (event.parent_blocked.length && parent_blocked)) {
    return resultResponse(NOT_FOUND, "Game is locked. Please Contact Upper Level.");
  }

  return resultResponse(SUCCESS, "Ok");
}

async function validateGameLock(req) {
  const { User: user } = req;
  const { game_id } = req.body;
  let blockedUsers = user.parent_level_ids.map(data => (data.user_id).toString());
  blockedUsers.push(user._id.toString());
  let event = await Match.findOne({ match_id: game_id.toString() }).select("-_id self_blocked parent_blocked is_active is_visible").lean().exec();

  if (!event || event?.is_active == 0 || event?.is_visible == false) {
    return resultResponse(NOT_FOUND, "Game is locked. Please Contact Upper Level. SA");
  }

  const self_blocked = blockedUsers.some(element => event.self_blocked.includes(element));
  const parent_blocked = blockedUsers.some(element => event.parent_blocked.includes(element));

  if ((event.self_blocked.length && self_blocked) || (event.parent_blocked.length && parent_blocked)) {
    return resultResponse(NOT_FOUND, "Game is locked. Please Contact Upper Level.");
  }

  return resultResponse(SUCCESS, "Ok");
}

module.exports = {
  launchUrl, lotusResultDeclare, voidResult, clearPendingRoundsWithRetryLimitOver, clearExposureforClosedRoundsLotus,
  getExposures, bets, logs, createNewGame, gettingWinnerDetails, getRoundStatus, declareResultForClosedRoundsLotus,
  launchInstantUrl, casinoResults, lotusBets, validateLobbyUrl, lotusBetsDocument, casinoResultsDocument,
  lotusCurrentBetsDocument, lotusBetsCrDrDocument, lotusBetsCrDr
}