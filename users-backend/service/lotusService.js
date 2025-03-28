const { ObjectId } = require("bson")
  , getCurrentLine = require('get-current-line')
  , Lotus = require('../../models/lotus')
  , LotusBets = require('../../models/lotusBets')
  , LotusExposures = require('../../models/lotusExposures')
  , LotusCalculatedExposures = require('../../models/lotusCalculatedExposures')
  , LotusRoundStatus = require("../../models/lotusRoundStatus")
  , User = require('../../models/user')
  , OddsProfitLoss = require('../../models/oddsProfitLoss')
  , publisher = require("../../connections/redisConnections")
  , userService = require('../service/userService')
  , lotusService = require('../../admin-backend/service/lotusService')
  , marketsService = require('../service/marketsService')
  , lotusConfig = require('../../utils/lotusConfig').getLotusOperator()
  , logger = require('../../utils/loggers')
  , { sendMessageAlertToTelegram } = require('../../admin-backend/service/messages/telegramAlertService')
  , { SUCCESS, NOT_FOUND, SERVER_ERROR, VALIDATION_ERROR, ALREADY_EXISTS, LIVE_GAME_SPORT_ID, UNIQUE_IDENTIFIER_KEY } = require('../../utils/constants')
  , { delay, generateReferCode, exponentialToFixed } = require('../../utils')
  , { resultResponse } = require('../../utils/globalFunction');
const {
  DEMO_USER_ALLOWED_BET_PLACE_ON_CASINOS,
} = require("../../config/constant/user.js");
const { getAuraUID } = require("../../utils/getter-setter");
const { concurrencyCheck,
  deleteConcurrencyById, } = require("../../admin-backend/service/concurrencyControl");

const allowLotusIp = process.env.LOTUS_IPS.split(",");

async function updateUserPL(request) {
  try {
    const { result, full_market_id: market_id, winnerSelectionId } = request.body;
    let updateUserPLQuery = [];
    for (const user of result) {
      const { userId, downpl } = user,
        selectionId = winnerSelectionId,
        filter = { user_id: ObjectId(userId), market_id, selectionId };
      let win_loss_distribution = await getUsersParentsPL(filter);
      if (win_loss_distribution.statusCode == SUCCESS) {
        win_loss_distribution = win_loss_distribution.data.win_loss_distribution;
        for (const agent of win_loss_distribution) {
          agent.win_loss = -(downpl * agent.share / 100);
          agent.p_l = agent.win_loss;
        }
        updateUserPLQuery.push({
          "updateMany": {
            filter,
            "update": [{
              "$set": {
                "user_pl": downpl,
                win_loss_distribution,
              }
            }]
          }
        });
      }
    }
    await OddsProfitLoss.bulkWrite(updateUserPLQuery);
    return resultResponse(SUCCESS, "User profit loss updated successfully...");
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function getUsersParentsPL(filter) {
  let parentsPL = await OddsProfitLoss.findOne(filter).select("win_loss_distribution");
  return resultResponse(parentsPL ? SUCCESS : NOT_FOUND, parentsPL);
}

function getRequesterIp(req) {

  let ip_data = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] ||
    (
      req.connection.remoteAddress ||
      req.client.remoteAddress ||
      req.socket.remoteAddress ||
      (req.connection.socket ? req.connection.socket.remoteAddress : null)
    ).slice(7);

  return ip_data || "127.0.0.1";

}

/**
 * Auth functionality start.
 */

async function auth(req) {

  let errorResponse = { "ErrorCode": 1 }, path = "/auth";

  try {

    // Capturing the initial requested logs.
    Lotus.create(
      { "auth_req": req.body, "request_ip": getRequesterIp(req), path, line_no: getCurrentLine.default().line }
    ).then().catch(console.error);

    // If requested ip did't match with the the ip's that provied by lotus casino.
    if (allowLotusIp.toString().length && !allowLotusIp.includes(getRequesterIp(req))) {
      errorResponse.message = "You are not allow to perform action.";
      Lotus.create({
        "auth_req": req.body, "auth_res": errorResponse, "request_ip": getRequesterIp(req), comment: "Ip not allowed!", path, line_no: getCurrentLine.default().line
      }).then().catch(console.error);
      return resultResponse(NOT_FOUND, errorResponse);
    }

    const { token, operatorId } = req.body;

    // validating the operator id is valid.
    if (!operatorId || ![lotusConfig.operatorId, lotusConfig.operatorIdHKD, lotusConfig.operatorIdDemo].includes(parseInt(operatorId))) {
      errorResponse.message = "It seems that the Operator Id does't match!";
      Lotus.create(
        { "auth_req": req.body, "auth_res": errorResponse, "request_ip": getRequesterIp(req), comment: errorResponse.message, path, line_no: getCurrentLine.default().line }
      ).then().catch(console.error);
      return resultResponse(NOT_FOUND, errorResponse);
    }

    // Getting user information based on provided token.
    return userService.getUserDetails({ _id: token }, ["_id", "user_name", "balance", "liability", "point", "is_demo"])
      .then(getUserById => {

        if (getUserById.statusCode == SUCCESS) {

          getUserById = getUserById.data;

          let authResponse = {
            "operatorId": (getUserById.is_demo) ? lotusConfig.operatorIdDemo : ((getUserById.point == 100) ? lotusConfig.operatorIdHKD : lotusConfig.operatorId),
            "userId": getUserById._id,
            "username": getUserById.user_name,
            "playerTokenAtLaunch": token,
            "token": token,
            "balance": getUserById.balance,
            "exposure": getUserById.liability,
            "currency": "INR",
            "language": "en",
            "timestamp": "",
            "clientIP": [
              req.ip_data
            ],
            "VIP": "3",
            "errorCode": 0,
            "errorDescription": "ok"
          };

          Lotus.create(
            { "auth_req": req.body, "auth_res": authResponse, "request_ip": getRequesterIp(req), path }
          ).then().catch(console.error);

          return resultResponse(SUCCESS, authResponse);

        } else {

          errorResponse.message = getUserById.data;
          Lotus.create({
            "auth_req": req.body, "auth_res": errorResponse, "request_ip": getRequesterIp(req), "error": errorResponse.message, path, line_no: getCurrentLine.default().line
          }).then().catch(console.error);

          return resultResponse(NOT_FOUND, errorResponse);

        }

      }).catch(error => {
        errorResponse.message = error.message;
        Lotus.create({
          "auth_req": req.body, "auth_res": errorResponse, "request_ip": getRequesterIp(req), "error": error.message, path, line_no: getCurrentLine.default().line
        }).then().catch(console.error);
        return resultResponse(SERVER_ERROR, errorResponse);
      });

  } catch (error) {
    errorResponse.message = error.message;
    Lotus.create({
      "auth_req": req.body, "auth_res": errorResponse, "request_ip": getRequesterIp(req), "error": error.message, path, line_no: getCurrentLine.default().line
    }).then().catch(console.error);
    return resultResponse(SERVER_ERROR, errorResponse);
  }
}

/**
 * Auth functionality end.
 */

/**
 * Exposure functionality start.
 */

async function exposure(req) {

  let errorResponse = { "status": 1, "message": "Unauthorised session" }, path = "/exposure";

  let ccId;
  let { token, roundId, marketId: lotusMarketId, userId, marketType, betInfo, calculateExposure, exposureTime } = req.body;

  try {

    // Capturing the initial requested logs.
    Lotus.create(
      { roundId, marketId: lotusMarketId, "exposure_req": req.body, "request_ip": getRequesterIp(req), path, line_no: getCurrentLine.default().line }
    ).then().catch(console.error);

    // If requested ip did't match with the the ip's that provied by lotus casino.
    if (allowLotusIp.toString().length && !allowLotusIp.includes(getRequesterIp(req))) {
      errorResponse.message = "You are not allow to perform action.";
      Lotus.create({
        roundId, "exposure_req": req.body, "exposure_res": errorResponse, "request_ip": getRequesterIp(req),
        marketId: lotusMarketId, userId, comment: "Ip not allowed!", path, line_no: getCurrentLine.default().line
      }).then().catch(console.error);
      return resultResponse(NOT_FOUND, errorResponse);
    }

    const market_id = `${LIVE_GAME_SPORT_ID}.${betInfo.gameId}.${marketType}`
      , marketId = market_id;

    // Check Concurrency 
    const betPlaceKey = getAuraUID('AURA_EXPOSURE:', roundId, lotusMarketId, userId);
    // Create a new Entry for result CC;
    // If Server Error that means Entry already Exists;
    const ccResponse = await concurrencyCheck(betPlaceKey, 1);
    if (ccResponse.statusCode == SERVER_ERROR) {
      errorResponse.message = 'Only one bet at a time is allowed!';

      Lotus.create({
        roundId, "exposure_req": req.body, "exposure_res": errorResponse,
        "request_ip": getRequesterIp(req),
        marketId: lotusMarketId, userId,
        comment: "Only one bet at a time is allowed!",
        path, line_no: getCurrentLine.default().line
      }).then().catch(console.error);

      return resultResponse(SERVER_ERROR, errorResponse);
    }
    ccId = ccResponse?.data?.cc?._id;

    if (!betInfo?.orderId) {
      errorResponse.message = "bet order id is missing!";
      Lotus.create({
        roundId, marketId: lotusMarketId, "exposure_req": req.body, "exposure_res": errorResponse, "request_ip": getRequesterIp(req),
        error: errorResponse.message, path, line_no: getCurrentLine.default().line
      }).then().catch(console.error);

      // Delete Concurrency Control Entry
      deleteConcurrencyById(ccId);
      return resultResponse(NOT_FOUND, errorResponse);
    }

    // Here we need to stop the request if orderId already processed.
    let checkOrderIdExists = await LotusBets.findOne({ orderId: betInfo.orderId }).select("_id");
    if (checkOrderIdExists) {
      errorResponse.message = "bet already processed!";
      Lotus.create({
        roundId, marketId: lotusMarketId, "exposure_req": req.body, "exposure_res": errorResponse, "request_ip": getRequesterIp(req),
        error: errorResponse.message, path, line_no: getCurrentLine.default().line
      }).then().catch(console.error);

      // Delete Concurrency Control Entry
      deleteConcurrencyById(ccId)
      return resultResponse(ALREADY_EXISTS, errorResponse);
    }

    // Here we need to valiate the request with markets and users settings.

    req.internalData = { marketId };

    let validationStatus = await valiateBetPlaceSettings(req);

    if (validationStatus.statusCode != SUCCESS) {
      errorResponse.message = validationStatus.data;
      Lotus.create({
        roundId, marketId: lotusMarketId, "exposure_req": req.body, "exposure_res": errorResponse, "request_ip": getRequesterIp(req),
        "error": `Validation Error: ${errorResponse.message}`, path, line_no: getCurrentLine.default().line
      }).then().catch(console.error);

      // Delete Concurrency Control Entry
      deleteConcurrencyById(ccId)
      return resultResponse(SERVER_ERROR, errorResponse);
    }

    let betDelay = validationStatus.data.user.market_bet_delay;

    if (betDelay)
      await delay(betDelay * 1000);

    // Here we need to stop the request in case of result already declared.
    let getResultStatus = await LotusRoundStatus.findOne({ gameId: betInfo.gameId, roundId, marketId: lotusMarketId }).select("_id");
    if (getResultStatus) {
      errorResponse.message = "Result already processed!";
      Lotus.create({
        roundId, marketId: lotusMarketId, "exposure_req": req.body, "exposure_res": errorResponse, "request_ip": getRequesterIp(req),
        error: errorResponse.message, path, line_no: getCurrentLine.default().line
      }).then().catch(console.error);

      // Delete Concurrency Control Entry
      deleteConcurrencyById(ccId)
      return resultResponse(ALREADY_EXISTS, errorResponse);
    }

    // Retrieving the last saved exposure time & balance.
    let getUserData = await User.findOne({ _id: token }).select("lotusExposureTime balance liability is_demo point user_name parent_level_ids domain_name");

    if (getUserData.is_demo && !DEMO_USER_ALLOWED_BET_PLACE_ON_CASINOS) {
      errorResponse.message = "Please use real user account!";

      // Delete Concurrency Control Entry
      deleteConcurrencyById(ccId)
      return resultResponse(NOT_FOUND, errorResponse);
    }

    // If token of user is not match.
    if (!getUserData) {

      errorResponse.message = "User token not match!";
      Lotus.create({
        roundId, marketId: lotusMarketId, "exposure_req": req.body, "exposure_res": errorResponse, "request_ip": getRequesterIp(req),
        error: errorResponse.message, path, line_no: getCurrentLine.default().line
      }).then().catch(console.error);

      // Delete Concurrency Control Entry
      deleteConcurrencyById(ccId)
      return resultResponse(NOT_FOUND, errorResponse);

    }

    // If in case liability goes to positive value.
    // https://trello.com/c/79gi9eSj/75-lotus-exposure-callback-url-validation-for-liability-become-a-positive-number
    if (0 < exponentialToFixed(getUserData.liability)) {

      errorResponse.message = "Please contact upline for liability correction.";
      Lotus.create({
        roundId, marketId: lotusMarketId, "exposure_req": req.body, "exposure_res": errorResponse, "request_ip": getRequesterIp(req),
        error: `Liability become a positive number(${getUserData.liability})`, path, line_no: getCurrentLine.default().line
      }).then().catch(console.error);

      // Delete Concurrency Control Entry
      deleteConcurrencyById(ccId)
      return resultResponse(NOT_FOUND, errorResponse);

    }

    // Active market calculateExposure is greater then available balance.
    if (-(calculateExposure) > getUserData.balance) {

      errorResponse.message = "Insufficient Balance!";
      Lotus.create({
        roundId, marketId: lotusMarketId, "exposure_req": req.body, "exposure_res": errorResponse, "request_ip": getRequesterIp(req),
        "error": errorResponse.message, path, line_no: getCurrentLine.default().line
      }).then().catch(console.error);

      // Delete Concurrency Control Entry
      deleteConcurrencyById(ccId)
      return resultResponse(VALIDATION_ERROR, errorResponse);

    }

    let updateUserData = false;

    if (!getUserData.lotusExposureTime) {

      // If it is first ever request for user, and the lotusExposureTime field are not exists.
      updateUserData = true;

    } else if (exposureTime > getUserData.lotusExposureTime) {

      // If exposureTime variable is greater than exposureTime stored in database then replace the calculateExposure variable.
      updateUserData = true;

    }

    if (updateUserData) {

      let getLastCalcuatedExposure = await LotusCalculatedExposures.findOne({ roundId, marketId: lotusMarketId, userId }).select("calculateExposure").lean();
      getLastCalcuatedExposure = -(getLastCalcuatedExposure ? getLastCalcuatedExposure.calculateExposure : 0);

      let runTimeExposure = (getLastCalcuatedExposure + calculateExposure);

      // If current market exposure value is greater then the available balance.
      if (-(runTimeExposure) > getUserData.balance) {

        Lotus.create({
          roundId, marketId: lotusMarketId, "exposure_req": req.body, "exposure_res": errorResponse, "request_ip": getRequesterIp(req),
          "error": `Debiting exposure(${runTimeExposure}) value is greater then the available balance(${getUserData.balance}).`, path, line_no: getCurrentLine.default().line
        }).then().catch(console.error);
        errorResponse.message = `There is not enough balance to debit the amount of(${runTimeExposure})`;

        // Delete Concurrency Control Entry
        deleteConcurrencyById(ccId)
        return resultResponse(VALIDATION_ERROR, errorResponse);

      }

      await updateUserExposure({ token, exposureTime, liability: runTimeExposure, roundId });

      let operatorId = (getUserData.is_demo) ? lotusConfig.operatorIdDemo : ((getUserData.point == 100) ? lotusConfig.operatorIdHKD : lotusConfig.operatorId)

      await saveExposureAndBetsData({
        // Lotus usage fields.
        ...req.body, ...betInfo, operatorId, stake: betInfo.reqStake, odds: betInfo.requestedOdds,
        // Internal usage fields.
        sportName: "Casino", userName: getUserData.user_name, parentLevels: getUserData.parent_level_ids,
        domainName: getUserData.domain_name
      });

    } else {

      Lotus.create({
        roundId, marketId: lotusMarketId, "exposure_req": req.body, "exposure_res": errorResponse, "request_ip": getRequesterIp(req),
        "error": "Exposure updation not possible due to 'exposureTime' is outdated!", path, line_no: getCurrentLine.default().line
      }).then().catch(console.error);
      errorResponse.message = "Unable to place bet!";

      // Delete Concurrency Control Entry
      deleteConcurrencyById(ccId)
      return resultResponse(VALIDATION_ERROR, errorResponse);

    }

    // Retrieving the final balance and exposure to send back a response to louts.
    return userService.getUserDetails({ _id: token }, ["balance", "liability"])
      .then(getUserById => {

        if (getUserById.statusCode == SUCCESS) {

          getUserById = getUserById.data;

          response = {
            "status": 0,
            "Message": "Bet placed successfully...",
            "wallet": getUserById.balance,
            "exposure": getUserById.liability
          };

          Lotus.create({
            roundId, "exposure_req": req.body, "exposure_res": response, "request_ip": getRequesterIp(req),
            marketId: lotusMarketId, userId, path, line_no: getCurrentLine.default().line
          }).then().catch(console.error);


          // Delete Concurrency Control Entry
          deleteConcurrencyById(ccId)
          return resultResponse(SUCCESS, response);

        } else {

          errorResponse.message = getUserById.data;
          Lotus.create({
            roundId, "exposure_req": req.body, "exposure_res": errorResponse, "request_ip": getRequesterIp(req),
            marketId: lotusMarketId, userId, path, line_no: getCurrentLine.default().line, "error": getUserById.data
          }).then().catch(console.error);

          // Delete Concurrency Control Entry
          deleteConcurrencyById(ccId)
          return resultResponse(NOT_FOUND, errorResponse);
        }

      }).catch(error => {
        errorResponse.message = error.message;
        Lotus.create({
          roundId, "exposure_req": req.body, "exposure_res": errorResponse, "request_ip": getRequesterIp(req),
          "error": error.message, marketId: lotusMarketId, userId, path, line_no: getCurrentLine.default().line
        }).then().catch(console.error);

        // Delete Concurrency Control Entry
        deleteConcurrencyById(ccId)
        return resultResponse(SERVER_ERROR, errorResponse);
      });

  } catch (error) {
    errorResponse.message = error.message;
    Lotus.create({
      roundId, marketId: lotusMarketId, "exposure_req": req.body, "exposure_res": errorResponse, "request_ip": getRequesterIp(req),
      "error": error.message, path, line_no: getCurrentLine.default().line
    }).then().catch(console.error);

    // Delete Concurrency Control Entry
    deleteConcurrencyById(ccId)
    return resultResponse(SERVER_ERROR, errorResponse);
  }
}

async function updateUserExposure(params) {

  const { token, exposureTime, liability, roundId } = params;

  var user = await User.findOne({ _id: token }, { user_name: 1, balance: 1, liability: 1 }).lean();

  const LOG_REF_CODE = generateReferCode();

  logger.BalExp(`
    --PRE LOG--
    FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
    FUNCTION: updateUserExposure
    EVENT_DETAILS: roundId(${roundId})
    LOG_REF_CODE: ${LOG_REF_CODE}
    DETAILS: [${user.user_name}(${token})] old_balance: ${user.balance} - old_liability: ${user.liability} - cal_liability: ${liability}
  `);

  await User.updateOne({ _id: token }, [
    {
      '$set': {
        balance: { '$add': ["$balance", liability] },
        liability: { '$add': ["$liability", liability] },
        lotusExposureTime: exposureTime,
      }
    }
  ]);

  var user = await User.findOne({ _id: token }, { user_name: 1, balance: 1, liability: 1 }).lean();

  logger.BalExp(`
    --POST LOG--
    FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
    FUNCTION: updateUserExposure
    EVENT_DETAILS: roundId(${roundId})
    LOG_REF_CODE: ${LOG_REF_CODE}
    DETAILS: [${user.user_name}(${token})] new_balance: ${user.balance} - new_liability: ${user.liability} - cal_liability: ${liability}
  `);

  if ((exponentialToFixed(user.liability) > 0) ? true : (exponentialToFixed(user.balance) < 0) ? true : false) {
    sendMessageAlertToTelegram({ message: `\nLOG_REF_CODE: ${LOG_REF_CODE}\nUSER: ${user.user_name}(${token}) : balance ${user.balance}, liability ${user.liability}` });
  }

}

async function saveExposureAndBetsData(params) {

  // Saving the bets data.
  LotusBets.create(params).then().catch(console.error);

  // Saving the exposure per bet wise.
  LotusExposures.create(params).then().catch(console.error);

  const {
    roundId, marketId, userId, calculateExposure, stake, operatorId, userName, parentLevels, sportName, marketType,
    matchName, marketName, domainName
  } = params;
  const data = { userName, parentLevels, sportName, marketType, matchName, marketName, domainName };

  // Saving calculateExposure and override if already exists.
  await LotusCalculatedExposures.findOneAndUpdate(
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

    const { betInfo, userId, marketType } = req.body;

    const { internalData } = req;

    if (marketType == "combo") {
      betInfo.requestedOdds = 1;
    }

    const data = { stack: betInfo.reqStake, odds: betInfo.requestedOdds, market_id: internalData.marketId };

    if (data.stack <= 0)
      return resultResponse(VALIDATION_ERROR, `${data.stack} stack not allowed.`);

    if (data.odds == 0)
      return resultResponse(VALIDATION_ERROR, `Odds(${data.odds}) can't be zero`);

    if (data.odds <= 0)
      return resultResponse(VALIDATION_ERROR, `${data.odds} odds rate not allowed.`);

    let market = await marketsService.getMarketDetail(
      { market_id: data.market_id },
      [
        "-_id", "sport_id", "is_active", "is_visible", "is_lock", "market_min_stack", "market_max_stack", "market_min_odds_rate", "market_max_odds_rate",
        "self_blocked", "parent_blocked"
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

      let result = await lotusService.createNewGame(req);

      return resultResponse(result.statusCode, result.data);

    }

    let user = await userService.getUserDetails(
      { _id: ObjectId(userId), user_type_id: 1 },
      [
        "userSettingSportsWise", "partnerships", "self_lock_betting", "parent_lock_betting", "self_lock_user", "parent_lock_user", "balance",
        "self_close_account", "parent_close_account", "check_event_limit", "parent_level_ids"
      ],
      [
        // here we need to remove extra sports_settings fields in future versions.
        { path: 'userSettingSportsWise', match: { "sports_settings.sport_id": market.sport_id }, select: "sports_settings.$" },
        { path: 'partnerships', match: { "sports_share.sport_id": market.sport_id }, select: "sports_share.percentage.share.$ sports_share.percentage.user_id" },
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

      let blockedUsers = user.parent_level_ids.map(data => (data.user_id).toString());
      blockedUsers.push(userId.toString());
      let event = market;
      const self_blocked = blockedUsers.some(element => event.self_blocked.includes(element));
      const parent_blocked = blockedUsers.some(element => event.parent_blocked.includes(element));

      if ((event.self_blocked.length && self_blocked) || (event.parent_blocked.length && parent_blocked)) {
        return resultResponse(VALIDATION_ERROR, "Game is locked. Please Contact Upper Level.");
      }

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

async function results(req) {

  let errorResponse = { "Error": "1", "message": "something went wrong", "result": [] }, path = "/results";

  let ccId;
  let { result, betvoid, roundId, market, operatorId } = req.body
    , lotusMarketId = market._id;

  try {

    // Capturing the initial requested logs.
    Lotus.create(
      { roundId, marketId: lotusMarketId, "results_req": req.body, "request_ip": getRequesterIp(req), path, line_no: getCurrentLine.default().line }
    ).then().catch(console.error);

    const roundStatusKey = `aura-round-id-${roundId}-${lotusMarketId}${UNIQUE_IDENTIFIER_KEY}`;
    const EXPIRE = 10 * 60; // 10 min.
    const getRoundStatus = await publisher.get(roundStatusKey);


    // Check Concurrency 
    const betPlaceKey = getAuraUID('AURA_RESULT:', roundStatusKey);
    // Create a new Entry for result CC;
    // If Server Error that means Entry already Exists;
    const ccResponse = await concurrencyCheck(betPlaceKey, 1);
    if (ccResponse.statusCode == SERVER_ERROR) {
      errorResponse.message = 'Result Opetation already in Progress...';

      Lotus.create({
        roundId, "exposure_req": req.body, "exposure_res": errorResponse,
        "request_ip": getRequesterIp(req),
        marketId: lotusMarketId, userId,
        comment: "Same Opetation already in Progress...",
        path, line_no: getCurrentLine.default().line
      }).then().catch(console.error);

      return resultResponse(SERVER_ERROR, errorResponse);
    }
    ccId = ccResponse?.data?.cc?._id;

    // If key data is found reject the result declare.
    if (getRoundStatus) {

      errorResponse.message = "Multiple result declare request!";

      Lotus.create({
        roundId, "results_req": req.body, "results_res": errorResponse, "request_ip": getRequesterIp(req),
        marketId: lotusMarketId, operatorId, comment: "Stop due to result already set!", path, line_no: getCurrentLine.default().line
      }).then().catch(console.error);

      // Delete Concurrency Control Entry
      deleteConcurrencyById(ccId)
      return resultResponse(NOT_FOUND, errorResponse);
    }

    await publisher.set(roundStatusKey, new Date(), 'EX', EXPIRE).then();

    // If requested ip did't match with the the ip's that provied by lotus casino.
    if (allowLotusIp.toString().length && !allowLotusIp.includes(getRequesterIp(req))) {
      errorResponse.message = "You are not allow to perform action.";
      Lotus.create({
        roundId, "results_req": req.body, "results_res": errorResponse, "request_ip": getRequesterIp(req),
        marketId: lotusMarketId, operatorId, comment: "Ip not allowed!", path, line_no: getCurrentLine.default().line
      }).then().catch(console.error);

      // Delete Concurrency Control Entry
      deleteConcurrencyById(ccId)
      return resultResponse(NOT_FOUND, errorResponse);
    }

    // validating the operator id is valid.
    if (!operatorId || ![lotusConfig.operatorId, lotusConfig.operatorIdHKD, lotusConfig.operatorIdDemo].includes(parseInt(operatorId))) {
      errorResponse.message = "It seems that the Operator Id does't match!";
      Lotus.create({
        roundId, marketId: lotusMarketId, "results_req": req.body, "results_res": errorResponse, "request_ip": getRequesterIp(req),
        comment: errorResponse.message, path, line_no: getCurrentLine.default().line
      }).then().catch(console.error);

      // Delete Concurrency Control Entry
      deleteConcurrencyById(ccId)
      return resultResponse(NOT_FOUND, errorResponse);
    }

    const gameId = market.gameId;

    // Here we need to stop the request in case of result already declared.
    let getResultStatus = await LotusRoundStatus.findOne({ gameId, roundId, marketId: lotusMarketId }).select("_id");
    if (getResultStatus) {
      errorResponse.message = "Result already processed!";
      Lotus.create({
        roundId, marketId: lotusMarketId, "results_req": req.body, "results_res": errorResponse, "request_ip": getRequesterIp(req),
        error: errorResponse.message, path, line_no: getCurrentLine.default().line
      }).then().catch(console.error);

      // Delete Concurrency Control Entry
      deleteConcurrencyById(ccId)
      return resultResponse(ALREADY_EXISTS, errorResponse);
    }

    // If no exposure data are found, The request will not process.
    let isExposuresExists = await LotusCalculatedExposures.find({ roundId, marketId: lotusMarketId, isProcessed: 0 }).select("_id").lean();
    if (!isExposuresExists.length) {
      errorResponse.message = "No exposure data found!";
      Lotus.create({
        roundId, marketId: lotusMarketId, "results_req": req.body, "results_res": errorResponse, "request_ip": getRequesterIp(req),
        error: errorResponse.message, path, line_no: getCurrentLine.default().line
      }).then().catch(console.error);

      // Delete Concurrency Control Entry
      deleteConcurrencyById(ccId)
      return resultResponse(ALREADY_EXISTS, errorResponse);
    }

    // Fetching the user's ids from the result array.
    let usersIds = result.map(data => ObjectId(data.userId));

    // Getting winners details
    let winnerData = lotusService.gettingWinnerDetails(req);
    let winnerSelectionId = winnerData.winnerSelectionId, winnerSelectionName = winnerData.winnerSelectionName;
    market.winnerSelectionId = winnerSelectionId;
    market.winnerSelectionName = winnerSelectionName;

    let resultData = { data: "No action taken!" };

    // void the result.
    if (betvoid) {
      resultData = await voidResult(req);
    }

    // Declaring the result.
    if (!betvoid) {
      resultData = await declareResult(req);
    }

    return userService.getUsersDetails({ _id: { '$in': usersIds } }, ["_id", "balance", "liability"])
      .then(async getUsersById => {

        getUsersById = getUsersById.data.map(data => {
          return {
            "wallet": data.balance,
            "exposure": data.liability,
            "userId": data._id
          }
        });

        let finalResultResponse = {};
        finalResultResponse.message = result.length + " user pl updated, " + resultData.data;
        finalResultResponse.result = getUsersById;

        Lotus.create({
          roundId, "results_req": req.body, "results_res": finalResultResponse,
          "request_ip": getRequesterIp(req), comment: resultData.data,
          winnerSelectionId, winnerSelectionName,
          marketId: lotusMarketId, operatorId, path, line_no: getCurrentLine.default().line
        }).then().catch(console.error);


        // Delete Concurrency Control Entry
        deleteConcurrencyById(ccId)
        return resultResponse(SUCCESS, finalResultResponse);

      }).catch(error => {
        errorResponse.message = error.message;
        Lotus.create({
          roundId, "results_req": req.body, "results_res": errorResponse, "request_ip": getRequesterIp(req),
          "error": error.message, comment: "Result declaration error!",
          winnerSelectionId, winnerSelectionName,
          marketId: lotusMarketId, operatorId, path, line_no: getCurrentLine.default().line
        }).then().catch(console.error);

        // Delete Concurrency Control Entry
        deleteConcurrencyById(ccId)
        return resultResponse(SERVER_ERROR, errorResponse);
      });

  } catch (error) {
    errorResponse.message = error.message;
    Lotus.create({
      roundId, marketId: lotusMarketId, "results_req": req.body, "results_res": errorResponse, "request_ip": getRequesterIp(req),
      "error": error.message, path, line_no: getCurrentLine.default().line
    }).then().catch(console.error);

    // Delete Concurrency Control Entry
    deleteConcurrencyById(ccId)
    return resultResponse(SERVER_ERROR, errorResponse);
  }
}

async function declareResult(req) {
  return await lotusService.lotusResultDeclare(req);
}

async function voidResult(req) {
  return await lotusService.voidResult(req);
}

/**
 * Result functionality end.
 */

/**
 * Refund functionality start.
 */

async function refund(req) {
  let errorResponse = { "status": 1, "message": "Unauthorised session" }, path = "/refund";

  let { token, roundId, marketId: lotusMarketId, userId, betInfo, calculateExposure, exposureTime } = req.body;

  try {

    // Capturing the initial requested logs.
    Lotus.create(
      { roundId, "refund_req": req.body, "request_ip": getRequesterIp(req), path, line_no: getCurrentLine.default().line }
    ).then().catch(console.error);

    // If requested ip did't match with the the ip's that provied by lotus casino.
    if (allowLotusIp.toString().length && !allowLotusIp.includes(getRequesterIp(req))) {
      errorResponse.message = "You are not allow to perform action.";
      Lotus.create({
        roundId, "refund_req": req.body, "refund_res": errorResponse, "request_ip": getRequesterIp(req),
        marketId: lotusMarketId, userId, comment: "Ip not allowed!", path, line_no: getCurrentLine.default().line
      }).then().catch(console.error);
      return resultResponse(NOT_FOUND, errorResponse);
    }

    // Here we need to stop the request if orderId already processed.
    let checkOrderIdExists = await LotusBets.findOne({ orderId: betInfo.orderId }).select("_id");
    if (!checkOrderIdExists) {
      errorResponse.message = "Bet not Exists!";
      Lotus.create({
        roundId, marketId: lotusMarketId, "exposure_req": req.body, "exposure_res": errorResponse, "request_ip": getRequesterIp(req),
        error: errorResponse.message, path, line_no: getCurrentLine.default().line
      }).then().catch(console.error);

      return resultResponse(ALREADY_EXISTS, errorResponse);
    }

    // Retrieving the last saved exposure time & balance.
    let getUserData = await User.findOne({ _id: token }).select("lotusExposureTime liability");

    if (exposureTime > getUserData.lotusExposureTime) {
      // If exposureTime variable is greater than exposureTime stored in database then replace the calculateExposure variable.
      let getLastCalcuatedExposure = await LotusCalculatedExposures.findOne({ roundId, marketId: lotusMarketId, userId }).select("calculateExposure").lean();
      getLastCalcuatedExposure = -(getLastCalcuatedExposure.calculateExposure);
      let runTimeExposure = (getLastCalcuatedExposure + calculateExposure);
      await updateUserExposure({ token, exposureTime, liability: runTimeExposure, roundId });
      await revertExposureAndBetData({ ...req.body, ...betInfo, stake: betInfo.reqStake, odds: betInfo.requestedOdds });
    }

    // Retrieving the final balance and exposure to send back a response to louts.
    return userService.getUserDetails({ _id: token }, ["balance", "liability"])
      .then(getUserById => {

        if (getUserById.statusCode == SUCCESS) {

          getUserById = getUserById.data;

          response = {
            "status": 0,
            "Message": "Bet amount refund successfully...",
            "wallet": getUserById.balance,
            "exposure": getUserById.liability
          };

          Lotus.create({
            roundId, "refund_req": req.body, "refund_res": response, "request_ip": getRequesterIp(req),
            marketId: lotusMarketId, userId, path, line_no: getCurrentLine.default().line
          }).then().catch(console.error);

          return resultResponse(SUCCESS, response);

        } else {

          errorResponse.message = getUserById.data;
          Lotus.create({
            roundId, "refund_req": req.body, "refund_res": errorResponse, "request_ip": getRequesterIp(req),
            marketId: lotusMarketId, userId, path, line_no: getCurrentLine.default().line, "error": getUserById.data
          }).then().catch(console.error);
          return resultResponse(NOT_FOUND, errorResponse);
        }

      }).catch(error => {
        errorResponse.message = error.message;
        Lotus.create({
          roundId, "refund_req": req.body, "refund_res": errorResponse, "request_ip": getRequesterIp(req),
          "error": error.message, marketId: lotusMarketId, userId, path, line_no: getCurrentLine.default().line
        }).then().catch(console.error);
        return resultResponse(SERVER_ERROR, errorResponse);
      });

  } catch (error) {
    errorResponse.message = error.message;
    Lotus.create({
      roundId, "refund_req": req.body, "refund_res": errorResponse, "request_ip": getRequesterIp(req),
      "error": error.message, path, line_no: getCurrentLine.default().line
    }).then().catch(console.error);
    return resultResponse(SERVER_ERROR, errorResponse);
  }

}

async function revertExposureAndBetData(params) {

  const { orderId } = params;

  // Update the bet record based on order id.
  LotusBets.updateOne({ orderId }, { isProcessed: 1 }).then().catch(console.error);

  // Update the exposure record based on order id.
  LotusExposures.updateOne({ orderId }, { isProcessed: 1 }).then().catch(console.error);

  const { roundId, marketId, userId, calculateExposure, stake } = params;

  // Saving calculateExposure and override if already exists.
  await LotusCalculatedExposures.findOneAndUpdate(
    { roundId, marketId, userId },
    [
      {
        $set: {
          calculateExposure,
          stackSum: { '$subtract': [{ '$ifNull': ['$stackSum', 0] }, parseInt(stake)] },
        }
      }
    ],
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

/**
 * Refund functionality end.
 */

module.exports = {
  updateUserPL, getRequesterIp,
  auth, exposure, results, refund
}