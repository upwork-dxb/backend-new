const { ObjectId } = require("bson");
const getCurrentLine = require('get-current-line');
const User = require('../../../models/user');
const UniversalCasinoLogs = require('../../../models/casinos/universalCasinoLogs');
const UniversalCasinoBets = require('../../../models/casinos/universalCasinoBets');
const UniversalCasinoRoundsStatus = require('../../../models/casinos/universalCasinoRoundsStatus');
const UniversalCasinoExposures = require('../../../models/casinos/universalCasinoExposures');
const UniversalCasinoCalculatedExposures = require('../../../models/casinos/universalCasinoCalculatedExposures');
const userService = require('../../service/userService');
const marketsService = require('../../service/marketsService');
const universalCasinoService = require('../../../admin-backend/service/casinos/universalCasino');
const logger = require('../../../utils/loggers');
const { delay, generateReferCode, exponentialToFixed, getRequesterIp } = require('../../../utils');
const { resultResponse } = require('../../../utils/globalFunction');
const { UNIVERSAL_CASINO_OPERATORID, UNIVERSAL_CASINO_WHITELISTING_IP } = require("../../../utils/casinos/universalCasinoConfig");
const { UNIVERSE_CASINO, STATUS_401, STATUS_422, STATUS_200 } = require("../../../utils/casinos/universalCasinoConstants");
const { sendMessageAlertToTelegram } = require('../../../admin-backend/service/messages/telegramAlertService')
const {
  SUCCESS, NOT_FOUND, SERVER_ERROR, VALIDATION_ERROR, ALREADY_EXISTS, UNIVERSE_CASINO_SPORT_ID, LIVE_GAME_SPORT_ID
} = require('../../../utils/constants');
const {
  DEMO_USER_ALLOWED_BET_PLACE_ON_CASINOS,
} = require("../../../config/constant/user.js");
const allowedIps = UNIVERSAL_CASINO_WHITELISTING_IP.split(",");

async function auth(req) {

  let errorResponse = { "statusCode": STATUS_422 }, path = req.path;

  // Capturing the initial requested logs.
  UniversalCasinoLogs.create(
    { "request": req.body, "request_ip": getRequesterIp(req), path, line_no: getCurrentLine.default().line }
  ).then().catch(console.error);

  // If requested ip did't match with the the ip's that provied by casino.
  if (allowedIps.toString().length && !allowedIps.includes(getRequesterIp(req))) {

    errorResponse.message = "You are not allow to perform action.";

    UniversalCasinoLogs.create({
      "request": req.body, "response": errorResponse, "request_ip": getRequesterIp(req),
      comment: "Ip not allowed!", path, line_no: getCurrentLine.default().line
    }).then().catch(console.error);

    return resultResponse(NOT_FOUND, errorResponse);

  }

  const { userToken, operatorId } = req.body;

  // validating the operator id is valid.
  if (!operatorId || ![UNIVERSAL_CASINO_OPERATORID].includes(operatorId)) {

    errorResponse.message = "It seems that the Operator Id does't match!";

    UniversalCasinoLogs.create({
      "request": req.body, "response": errorResponse, "request_ip": getRequesterIp(req),
      comment: errorResponse.message, path, line_no: getCurrentLine.default().line
    }).then().catch(console.error);

    return resultResponse(NOT_FOUND, errorResponse);

  }

  try {

    // Getting user information based on provided token.
    return userService.getUserDetails({ _id: ObjectId(userToken) }, ["_id", "user_name", "balance", "liability", "domain_name"])
      .then(getUserById => {

        if (getUserById.statusCode == SUCCESS) {

          getUserById = getUserById.data;

          let authResponse = {
            "userId": getUserById._id,
            "username": getUserById.user_name,
            "userToken": getUserById._id,
            "operatorId": UNIVERSAL_CASINO_OPERATORID,
            "balance": getUserById.balance + -(getUserById.liability),
            "availableBalance": getUserById.balance,
            "domain": getUserById.domain_name,
            "exposure": getUserById.liability,
            "currency": "INR",
            "language": "en",
            "timestamp": Math.floor(new Date().getTime() / 1000),
            "statusCode": STATUS_200,
            "message": "ok"
          };

          UniversalCasinoLogs.create(
            { "request": req.body, "response": authResponse, "request_ip": getRequesterIp(req), path }
          ).then().catch(console.error);

          return resultResponse(SUCCESS, authResponse);

        } else {

          errorResponse.statusCode = STATUS_401;
          errorResponse.message = getUserById.data;
          UniversalCasinoLogs.create({
            "request": req.body, "response": errorResponse, "request_ip": getRequesterIp(req),
            "error": errorResponse.message, path, line_no: getCurrentLine.default().line
          }).then().catch(console.error);

          return resultResponse(NOT_FOUND, errorResponse);

        }

      }).catch(error => {
        errorResponse.statusCode = STATUS_401;
        errorResponse.message = error.message;
        UniversalCasinoLogs.create({
          "request": req.body, "response": errorResponse, "request_ip": getRequesterIp(req),
          "error": error.message, path, line_no: getCurrentLine.default().line
        }).then().catch(console.error);
        return resultResponse(SERVER_ERROR, errorResponse);
      });

  } catch (error) {
    errorResponse.message = error.message;
    UniversalCasinoLogs.create({
      "request": req.body, "response": errorResponse, "request_ip": getRequesterIp(req),
      "error": error.message, path, line_no: getCurrentLine.default().line
    }).then().catch(console.error);
    return resultResponse(SERVER_ERROR, errorResponse);
  }

}

async function getBalance(req) {

  return await auth(req);

}

async function placeBet(req) {

  let errorResponse = { "statusCode": STATUS_422 }, path = req.path;

  let { roundId, marketId: universeMarketId, userId, eventId: gameId, eventName: matchName, marketName, betInfo, calculateExposure } = req.body;

  try {

    // Capturing the initial requested logs.
    UniversalCasinoLogs.create({
      roundId, marketId: universeMarketId, "request": req.body, "request_ip": getRequesterIp(req),
      path, line_no: getCurrentLine.default().line
    }).then().catch(console.error);

    // If requested ip did't match with the the ip's that provied by casino.
    if (allowedIps.toString().length && !allowedIps.includes(getRequesterIp(req))) {
      errorResponse.message = "You are not allow to perform action.";
      UniversalCasinoLogs.create({
        roundId, "request": req.body, "response": errorResponse, "request_ip": getRequesterIp(req),
        marketId: universeMarketId, userId, comment: "Ip not allowed!", path, line_no: getCurrentLine.default().line
      }).then().catch(console.error);
      return resultResponse(NOT_FOUND, errorResponse);
    }

    betInfo.stake = parseInt(betInfo.stake);
    betInfo.betExposure = parseInt(betInfo.betExposure);
    betInfo.oddsPrice = parseFloat(betInfo.oddsPrice);
    calculateExposure = parseFloat(calculateExposure);
    calculateExposure = -(calculateExposure);

    const market_id = `${UNIVERSE_CASINO_SPORT_ID}.${gameId}.${marketName.replace(/\s+/g, '-').toLowerCase()}`
      , marketId = market_id;

    if (!betInfo?.betId) {
      errorResponse.message = "bet id is missing!";
      UniversalCasinoLogs.create({
        roundId, marketId: universeMarketId, "request": req.body, "response": errorResponse, "request_ip": getRequesterIp(req),
        error: errorResponse.message, path, line_no: getCurrentLine.default().line
      }).then().catch(console.error);
      return resultResponse(NOT_FOUND, errorResponse);
    }

    // Here we need to stop the request if betId already processed.
    let checkBetIdExists = await UniversalCasinoBets.findOne({ betId: betInfo.betId }).select("_id");
    if (checkBetIdExists) {
      errorResponse.message = "bet already processed!";
      UniversalCasinoLogs.create({
        roundId, marketId: universeMarketId, "request": req.body, "response": errorResponse, "request_ip": getRequesterIp(req),
        error: errorResponse.message, path, line_no: getCurrentLine.default().line
      }).then().catch(console.error);
      return resultResponse(ALREADY_EXISTS, errorResponse);
    }

    // Here we need to valiate the request with markets and users settings.

    req.internalData = { marketId, matchName, gameId };

    let validationStatus = await valiateBetPlaceSettings(req);

    if (validationStatus.statusCode != SUCCESS) {
      errorResponse.message = validationStatus.data;
      UniversalCasinoLogs.create({
        roundId, marketId: universeMarketId, "request": req.body, "response": errorResponse, "request_ip": getRequesterIp(req),
        "error": `Validation Error: ${errorResponse.message}`, path, line_no: getCurrentLine.default().line
      }).then().catch(console.error);
      return resultResponse(SERVER_ERROR, errorResponse);
    }

    let betDelay = validationStatus.data.user.market_bet_delay;

    if (betDelay)
      await delay(betDelay * 1000);

    // Here we need to stop the request in case of result already declared.
    let getResultStatus = await UniversalCasinoRoundsStatus.findOne({ gameId, roundId, marketId: universeMarketId }).select("_id");
    if (getResultStatus) {
      errorResponse.message = "Result already processed!";
      UniversalCasinoLogs.create({
        roundId, marketId: universeMarketId, "request": req.body, "response": errorResponse, "request_ip": getRequesterIp(req),
        error: errorResponse.message, path, line_no: getCurrentLine.default().line
      }).then().catch(console.error);
      return resultResponse(ALREADY_EXISTS, errorResponse);
    }

    // Retrieving the user details.
    let getUserData = await User.findOne({ _id: ObjectId(userId) }).select("balance liability user_name parent_level_ids domain_name is_demo");

    if (getUserData.is_demo && !DEMO_USER_ALLOWED_BET_PLACE_ON_CASINOS) {
      errorResponse.message = "Please use real user account!";
      return resultResponse(NOT_FOUND, errorResponse);
    }

    // If token of user is not match.
    if (!getUserData) {

      errorResponse.message = "User token not match!";
      UniversalCasinoLogs.create({
        roundId, marketId: universeMarketId, "request": req.body, "response": errorResponse, "request_ip": getRequesterIp(req),
        error: errorResponse.message, path, line_no: getCurrentLine.default().line
      }).then().catch(console.error);
      return resultResponse(NOT_FOUND, errorResponse);

    }

    // If in case liability goes to positive value.
    if (0 < exponentialToFixed(getUserData.liability)) {

      errorResponse.message = "Please contact upline for liability correction.";
      UniversalCasinoLogs.create({
        roundId, marketId: universeMarketId, "request": req.body, "response": errorResponse, "request_ip": getRequesterIp(req),
        error: `Liability become a positive number(${getUserData.liability})`, path, line_no: getCurrentLine.default().line
      }).then().catch(console.error);
      return resultResponse(NOT_FOUND, errorResponse);

    }

    // Active market calculateExposure is greater then available balance.
    if (-(calculateExposure) > getUserData.balance) {

      errorResponse.message = "Insufficient Balance!";
      UniversalCasinoLogs.create({
        roundId, marketId: universeMarketId, "request": req.body, "response": errorResponse, "request_ip": getRequesterIp(req),
        "error": errorResponse.message, path, line_no: getCurrentLine.default().line
      }).then().catch(console.error);
      return resultResponse(VALIDATION_ERROR, errorResponse);

    }

    let getLastCalcuatedExposure = await UniversalCasinoCalculatedExposures.findOne({ roundId, marketId: universeMarketId, userId }).select("calculateExposure").lean();
    getLastCalcuatedExposure = -(getLastCalcuatedExposure ? getLastCalcuatedExposure.calculateExposure : 0);

    let runTimeExposure = (getLastCalcuatedExposure + calculateExposure);

    // If current market exposure value is greater then the available balance.
    if (-(runTimeExposure) > getUserData.balance) {

      UniversalCasinoLogs.create({
        roundId, marketId: universeMarketId, "request": req.body, "response": errorResponse, "request_ip": getRequesterIp(req),
        "error": `Debiting exposure(${runTimeExposure}) value is greater then the available balance(${getUserData.balance}).`, path, line_no: getCurrentLine.default().line
      }).then().catch(console.error);
      errorResponse.message = `There is not enough balance to debit the amount of(${runTimeExposure})`;
      return resultResponse(VALIDATION_ERROR, errorResponse);

    }

    await updateUserExposure({ userId, liability: runTimeExposure, roundId });

    let operatorId = UNIVERSAL_CASINO_OPERATORID;

    await saveExposureAndBetsData({
      // Universe Casino usage fields.
      ...req.body, ...betInfo, matchName, operatorId, stake: betInfo.stake, odds: betInfo.oddsPrice, calculateExposure, gameId,
      // Internal usage fields.
      sportName: UNIVERSE_CASINO, userName: getUserData.user_name, parentLevels: getUserData.parent_level_ids,
      domainName: getUserData.domain_name
    });

    // Retrieving the final balance and exposure to send back a response to louts.
    return userService.getUserDetails({ _id: ObjectId(userId) }, ["balance", "liability"])
      .then(getUserById => {

        if (getUserById.statusCode == SUCCESS) {

          getUserById = getUserById.data;

          response = {
            "statusCode": STATUS_200,
            "Message": "Bet placed successfully...",
            "balance": getUserById.balance + -(getUserById.liability),
            "availableBalance": getUserById.balance,
            "exposure": getUserById.liability
          };

          UniversalCasinoLogs.create({
            roundId, "request": req.body, "response": response, "request_ip": getRequesterIp(req),
            marketId: universeMarketId, userId, path, line_no: getCurrentLine.default().line
          }).then().catch(console.error);

          return resultResponse(SUCCESS, response);

        } else {

          errorResponse.message = getUserById.data;
          UniversalCasinoLogs.create({
            roundId, "request": req.body, "response": errorResponse, "request_ip": getRequesterIp(req),
            marketId: universeMarketId, userId, path, line_no: getCurrentLine.default().line, "error": getUserById.data
          }).then().catch(console.error);
          return resultResponse(NOT_FOUND, errorResponse);
        }

      }).catch(error => {
        errorResponse.message = error.message;
        UniversalCasinoLogs.create({
          roundId, "request": req.body, "response": errorResponse, "request_ip": getRequesterIp(req),
          "error": error.message, marketId: universeMarketId, userId, path, line_no: getCurrentLine.default().line
        }).then().catch(console.error);
        return resultResponse(SERVER_ERROR, errorResponse);
      });

  } catch (error) {
    errorResponse.message = error.message;
    UniversalCasinoLogs.create({
      roundId, marketId: universeMarketId, "request": req.body, "response": errorResponse, "request_ip": getRequesterIp(req),
      "error": error.message, path, line_no: getCurrentLine.default().line
    }).then().catch(console.error);
    return resultResponse(SERVER_ERROR, errorResponse);
  }

}

async function updateUserExposure(params) {

  const { userId, liability, roundId } = params;

  var user = await User.findOne({ _id: ObjectId(userId) }, { user_name: 1, balance: 1, liability: 1 }).lean();

  const LOG_REF_CODE = generateReferCode();

  logger.BalExp(`
    --PRE LOG--
    FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
    FUNCTION: updateUserExposure universe casino
    EVENT_DETAILS: roundId(${roundId})
    LOG_REF_CODE: ${LOG_REF_CODE}
    DETAILS: [${user.user_name}(${ObjectId(userId)})] old_balance: ${user.balance} - old_liability: ${user.liability} - cal_liability: ${liability}
  `);

  await User.updateOne({ _id: ObjectId(userId) }, [
    {
      '$set': {
        balance: { '$add': ["$balance", liability] },
        liability: { '$add': ["$liability", liability] },
      }
    }
  ]);

  var user = await User.findOne({ _id: ObjectId(userId) }, { user_name: 1, balance: 1, liability: 1 }).lean();

  logger.BalExp(`
    --POST LOG--
    FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
    FUNCTION: updateUserExposure universe casino
    EVENT_DETAILS: roundId(${roundId})
    LOG_REF_CODE: ${LOG_REF_CODE}
    DETAILS: [${user.user_name}(${ObjectId(userId)})] new_balance: ${user.balance} - new_liability: ${user.liability} - cal_liability: ${liability}
  `);

  if ((exponentialToFixed(user.liability) > 0) ? true : (exponentialToFixed(user.balance) < 0) ? true : false) {
    sendMessageAlertToTelegram({ message: `\nLOG_REF_CODE: ${LOG_REF_CODE}\nUSER: ${user.user_name}(${ObjectId(userId)}) : balance ${user.balance}, liability ${user.liability}` });
  }

}

async function saveExposureAndBetsData(params) {

  // Saving the bets data.
  UniversalCasinoBets.create(params).then().catch(console.error);

  // Saving the exposure per bet wise.
  UniversalCasinoExposures.create(params).then().catch(console.error);

  const {
    roundId, marketId, userId, calculateExposure, stake, operatorId, userName, parentLevels, sportName, marketType,
    gameId, matchName, marketName, domainName
  } = params;

  const data = { userName, parentLevels, sportName, marketType, gameId, matchName, marketName, domainName };

  // Saving calculateExposure and override if already exists.
  await UniversalCasinoCalculatedExposures.findOneAndUpdate(
    { roundId, marketId, userId },
    [
      {
        $set: {
          calculateExposure,
          isProcessed: 0,
          operatorId: operatorId.toString(),
          stackSum: { '$add': [{ '$ifNull': ['$stackSum', 0] }, parseInt(stake)] },
          ...data,
        }
      }
    ],
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function valiateBetPlaceSettings(req) {

  try {

    const { betInfo, userId } = req.body;

    const { internalData } = req;

    const data = { stack: betInfo.stake, odds: betInfo.oddsPrice, market_id: internalData.marketId };

    if (data.stack <= 0)
      return resultResponse(VALIDATION_ERROR, `${data.stack} stack not allowed.`);

    if (data.odds == 0)
      return resultResponse(VALIDATION_ERROR, `Odds(${data.odds}) can't be zero`);

    if (data.odds <= 0)
      return resultResponse(VALIDATION_ERROR, `${data.odds} odds rate not allowed.`);

    let market = await marketsService.getMarketDetail(
      { market_id: data.market_id },
      [
        "-_id", "sport_id", "is_active", "is_visible", "is_lock", "market_min_stack", "market_max_stack", "market_min_odds_rate", "market_max_odds_rate"
      ]
    );

    if (market.statusCode == SUCCESS) {

      market = market.data;

      if (!market)
        return resultResponse(VALIDATION_ERROR, "Not an valid market");

      if (market.is_active == 0 || market.is_visible == false)
        return resultResponse(VALIDATION_ERROR, "Market is closed by agent(s)");

      if (market.is_lock)
        return resultResponse(VALIDATION_ERROR, "Market is locked!");

    } else {

      let result = await universalCasinoService.createNewGame(req);

      return resultResponse(result.statusCode, result.data);

    }

    let user = await userService.getUserDetails(
      { _id: ObjectId(userId), user_type_id: 1 },
      [
        "userSettingSportsWise", "partnerships", "self_lock_betting", "parent_lock_betting", "self_lock_user", "parent_lock_user", "balance",
        "self_close_account", "parent_close_account", "check_event_limit",
      ],
      [
        // here we need to remove extra sports_settings fields in future versions.
        { path: 'userSettingSportsWise', match: { "sports_settings.sport_id": LIVE_GAME_SPORT_ID.toString() }, select: "sports_settings.$" },
        { path: 'partnerships', match: { "sports_share.sport_id": LIVE_GAME_SPORT_ID.toString() }, select: "sports_share.percentage.share.$ sports_share.percentage.user_id" },
      ]
    );

    if (user.statusCode == SUCCESS) {

      user = user.data;

      const { userSettingSportsWise, partnerships } = user;

      let { sports_settings } = userSettingSportsWise;

      let { sports_share } = partnerships;

      Object.assign(user, sports_settings[0]);

      if (user.check_event_limit) {

        if (market.market_min_stack > data.stack)
          return resultResponse(VALIDATION_ERROR, `Market min stack is ${market.market_min_stack}`);

        if (market.market_max_stack < data.stack)
          return resultResponse(VALIDATION_ERROR, `Market max stack is ${market.market_max_stack}`);

        if (market.market_min_odds_rate > data.odds)
          return resultResponse(VALIDATION_ERROR, `Market min odd limit is ${market.market_min_odds_rate}`);

        if (market.market_max_odds_rate < data.odds)
          return resultResponse(VALIDATION_ERROR, `Market max odd limit is ${market.market_max_odds_rate}`);

      } else {

        if (user.market_min_stack && user.market_min_stack > data.stack)
          return resultResponse(VALIDATION_ERROR, `Your min stack is ${user.market_min_stack}`);

        if (user.market_max_stack == 0 && VALIDATION.market_max_stack_max_limit < data.stack)
          return resultResponse(VALIDATION_ERROR, `Your max stack is ${VALIDATION.market_max_stack_max_limit}`);
        else if (user.market_max_stack != 0 && user.market_max_stack < data.stack)
          return resultResponse(VALIDATION_ERROR, `Your max stack is ${user.market_max_stack}`);

        if (user.market_min_odds_rate && user.market_min_odds_rate > data.odds)
          return resultResponse(VALIDATION_ERROR, `Your min odd limit is ${user.market_min_odds_rate}`);

        if (user.market_max_odds_rate && user.market_max_odds_rate < data.odds)
          return resultResponse(VALIDATION_ERROR, `Your max odd limit is ${user.market_max_odds_rate}`);

      }

      if (user.balance < 0)
        return resultResponse(VALIDATION_ERROR, `${user.balance} balance in your account!`);

      if (!sports_settings.length)
        return resultResponse(VALIDATION_ERROR, `User sport settings not found!`);

      if (!sports_share.length)
        return resultResponse(VALIDATION_ERROR, `User partnerships not found!`);

      if (Math.max(user.self_lock_betting, user.parent_lock_betting) == 1)
        return resultResponse(VALIDATION_ERROR, `Your betting is locked!`);

      if (Math.max(user.self_lock_user, user.parent_lock_user) == 1)
        return resultResponse(VALIDATION_ERROR, "Your account is locked!");

      if (Math.max(user.self_close_account, user.parent_close_account) == 1)
        return resultResponse(VALIDATION_ERROR, "Your account is closed!");

      // Max Profit

    } else
      return resultResponse(user.statusCode, user.data);

    return resultResponse(SUCCESS, { market, user });

  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }

}

/**
 * Exposure functionality end.
 */

/**
 * Result functionality start.
 */

async function settlements(req) {

  let errorResponse = { "statusCode": STATUS_422, "message": "There was an error during the settlements process!" }, path = req.path;

  let { result, betVoid, roundId } = req.body;

  try {

    // Capturing the initial requested logs.
    UniversalCasinoLogs.create(
      { roundId, "request": req.body, "request_ip": getRequesterIp(req), path, line_no: getCurrentLine.default().line }
    ).then().catch(console.error);

    // If requested ip did't match with the the ip's that provied by casino.
    if (allowedIps.toString().length && !allowedIps.includes(getRequesterIp(req))) {

      errorResponse.message = "You are not allow to perform action.";

      UniversalCasinoLogs.create({
        roundId, "request": req.body, "response": errorResponse, "request_ip": getRequesterIp(req),
        comment: "Ip not allowed!", path, line_no: getCurrentLine.default().line
      }).then().catch(console.error);

      return resultResponse(NOT_FOUND, errorResponse);

    }

    // Here we need to stop the request in case of result already declared.
    let getResultStatus = await UniversalCasinoRoundsStatus.findOne({ roundId, isProcessed: 1 }).select("_id");

    if (getResultStatus) {

      errorResponse.message = "Result already processed!";

      UniversalCasinoLogs.create({
        roundId, "request": req.body, "response": errorResponse, "request_ip": getRequesterIp(req),
        error: errorResponse.message, path, line_no: getCurrentLine.default().line
      }).then().catch(console.error);

      return resultResponse(ALREADY_EXISTS, errorResponse);

    }

    // If no exposure data are found, The request will not process.
    let isExposuresExists = await UniversalCasinoCalculatedExposures.find({ roundId, isProcessed: 0 }).select("_id").lean();

    if (!isExposuresExists.length) {

      errorResponse.message = "No exposure data found!";

      UniversalCasinoLogs.create({
        roundId, "request": req.body, "response": errorResponse, "request_ip": getRequesterIp(req),
        error: errorResponse.message, path, line_no: getCurrentLine.default().line
      }).then().catch(console.error);

      return resultResponse(ALREADY_EXISTS, errorResponse);

    }

    // Fetching the user's ids from the result array.
    let usersIds = result.map(data => ObjectId(data.userId));

    let resultData = { data: "No action taken!" };

    // void the result.
    if (betVoid) {
      resultData = await voidResult(req);
    }

    // Declaring the result.
    if (!betVoid) {
      resultData = await declareResult(req);
    }

    return userService.getUsersDetails({ _id: { '$in': usersIds } }, ["_id", "balance", "liability"])
      .then(async getUsersById => {

        getUsersById = getUsersById.data.map(data => {
          return {
            "balance": data.balance,
            "exposure": data.liability,
            "userId": data._id
          }
        });

        let finalResultResponse = { "statusCode": STATUS_200 };
        finalResultResponse.message = "ok, " + resultData.data;
        finalResultResponse.result = getUsersById;

        UniversalCasinoLogs.create({
          roundId, "request": req.body, "response": finalResultResponse,
          "request_ip": getRequesterIp(req), comment: resultData.data,
          path, line_no: getCurrentLine.default().line
        }).then().catch(console.error);

        return resultResponse(SUCCESS, finalResultResponse);

      }).catch(error => {
        errorResponse.message = error.message;
        UniversalCasinoLogs.create({
          roundId, "request": req.body, "response": errorResponse, "request_ip": getRequesterIp(req),
          "error": error.message, comment: "Result declaration error!",
          path, line_no: getCurrentLine.default().line
        }).then().catch(console.error);
        return resultResponse(SERVER_ERROR, errorResponse);
      });

  } catch (error) {
    errorResponse.message = error.message;
    UniversalCasinoLogs.create({
      roundId, "request": req.body, "response": errorResponse, "request_ip": getRequesterIp(req),
      "error": error.message, path, line_no: getCurrentLine.default().line
    }).then().catch(console.error);
    return resultResponse(SERVER_ERROR, errorResponse);
  }
}

async function declareResult(req) {
  return await universalCasinoService.universeCasinoResultDeclare(req);
}

async function voidResult(req) {
  return await universalCasinoService.voidResult(req);
}

/**
 * Result functionality end.
 */

module.exports = {
  auth, getBalance, placeBet, settlements
}