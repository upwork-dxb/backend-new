const axios = require('axios')
  , { v4: uuidv4, validate: uuidValidate } = require('uuid')
  , getCurrentLine = require('get-current-line')
  , { ObjectId } = require("bson")
  , _ = require("lodash")
  , mongoose = require('mongoose')
  , path = require('path')
  , fs = require('fs').promises
  , fsSync = require('fs')
  , DeviceDetector = require('node-device-detector')
  , writeFile = require('util').promisify(require('fs').writeFileSync)
  , User = require("../../models/user")
  , Sports = require("../../models/sports")
  , Partnerships = require("../../models/partnerships")
  , UserProfitLoss = require("../../models/userProfitLoss")
  , BetResults = require("../../models/betResults")
  , QTechCrDrWinLoss = require('../../models/qtechCrDrWinLoss')
  , QTechRoundsStatus = require('../../models/qtechRoundsStatus')
  , betService = require('./betService')
  , userService = require('./userService')
  , qtechQuery = require('./qtechQuery')
  , globalFunction = require('../../utils/globalFunction')
  , QTEvent = require('../../lib/node-event').event
  , QTECH_GAMES_FILE_PATH = path.normalize(path.resolve(__dirname, "../../utils/qtech-games.json"))
  , QTECH_ACCESS_TOKEN_PATH = path.normalize(path.resolve(__dirname, "../../utils/qtech_access.token"))
  , { SUCCESS, NOT_FOUND, SERVER_ERROR, VALIDATION_FAILED, QTECH_CASINO_SPORT_ID } = require("../../utils/constants")
  , { objectToQueryParams, fixFloatingPoint, generateReferCode } = require("../../utils")
  , {
    QTECH_USERNAME, QTECH_PASSWORD, QTECH_ACCESS_TOKEN_URL, QTECH_GAME_LIST_URL, QTECH_LOBBY_URL, QTECH_LAUNCH_URL,
    QTECH_GAME_HISTORY_URL,
  } = require("../../utils/qTechConfig")
  , QT = require("../../utils/qtechConstant");
const moment = require('moment');
const logger = require('../../utils/loggers');
const { sendMessageAlertToTelegram } = require('./messages/telegramAlertService');

let saveToken = (content) => writeFile(QTECH_ACCESS_TOKEN_PATH, content, 'utf8');

if (!fsSync.existsSync(QTECH_ACCESS_TOKEN_PATH))
  saveToken(uuidv4());

let resultResponse = globalFunction.resultResponse;

let readAccessToken = async () => await fs.readFile(QTECH_ACCESS_TOKEN_PATH, 'utf8');

let getAccessToken = async () => resultResponse(SUCCESS, await readAccessToken());

let generateNewAccessToken = async () => await generateAccessToken();

let uuidValidateQT = () => !uuidValidate(fsSync.readFileSync(QTECH_ACCESS_TOKEN_PATH).toString()) ? saveToken(uuidv4()) : "";

if (process.env.NODE_APP_INSTANCE == "0" || process.env.NODE_APP_INSTANCE == undefined)
  uuidValidateQT();

async function checkAccessTokenStatus() {
  try {
    let result = await checkQTAccessTokenIsValid();
    if (result.statusCode == NOT_FOUND)
      return await refreshAccessToken();
    return resultResponse(SUCCESS, result.data);
  } catch (error) {
    console.error(error);
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function refreshAccessToken() {
  let result = await generateNewAccessToken();
  if (result.statusCode != SUCCESS)
    return resultResponse(NOT_FOUND, result.statusCode);
  else {
    return resultResponse(SUCCESS, "New token generated. Token is: " + result.data.access_token);
  }
}

async function generateAccessToken() {
  const params = objectToQueryParams({
    "grant_type": "password",
    "response_type": "token",
    "username": QTECH_USERNAME,
    "password": QTECH_PASSWORD
  });
  var config = {
    method: 'post',
    url: QTECH_ACCESS_TOKEN_URL + "?" + params
  };

  try {
    let accessTokenData = (await axios(config)).data;
    if (accessTokenData.access_token) {
      await revokeAccessToken();
      saveToken(accessTokenData.access_token);
      return resultResponse(SUCCESS, accessTokenData);
    } else
      return resultResponse(NOT_FOUND, "access_token not found!");
  } catch (error) {
    if (error.response)
      if ([QT.STATUS_401, QT.STATUS_403, QT.STATUS_422, QT.STATUS_500, QT.STATUS_503].includes(error.response.status))
        return resultResponse(SERVER_ERROR, error.response.data.message);
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function revokeAccessToken() {
  var config = {
    method: 'delete',
    url: QTECH_ACCESS_TOKEN_URL,
    headers: {
      'Authorization': 'Bearer ' + await readAccessToken()
    }
  };

  try {
    let revokeAccessToken = (await axios(config)).data;
    return resultResponse(SUCCESS, revokeAccessToken);
  } catch (error) {
    if (error.response)
      if ([QT.STATUS_401, QT.STATUS_500, QT.STATUS_503].includes(error.response.status))
        return resultResponse(SERVER_ERROR, error.response.data.message);
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function checkQTAccessTokenIsValid() {
  var config = {
    method: 'get',
    url: QTECH_GAME_LIST_URL + "?size=1&providers=IDS&includeFields=id",
    headers: {
      'Authorization': 'Bearer ' + await readAccessToken(),
      'Time-Zone': 'Asia/Kolkata'
    }
  };

  try {
    let data = (await axios(config)).data;
    return resultResponse(SUCCESS, data.hasOwnProperty('items') ? "Token is valid..." : "Token not valid, Please check!");
  } catch (error) {
    if (error.response)
      if (QT.STATUS_401 == error.response.status)
        if (error.response.data.code == QT.INVALID_TOKEN)
          return resultResponse(NOT_FOUND, error.response.data.message);
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function gameList(data = {}) {
  await checkAccessTokenStatus();
  data["includeFields"] = "id,name,provider,category,demoSupport,images,currencies";
  const params = objectToQueryParams(data);
  var config = {
    method: 'get',
    url: QTECH_GAME_LIST_URL + "?" + params,
    headers: {
      'Authorization': 'Bearer ' + await readAccessToken(),
      'Time-Zone': 'Asia/Kolkata'
    }
  };

  try {
    let gameList = (await axios(config)).data;
    let gameTypes = QT.gameTypes;
    gameTypes = gameTypes.map(game => {
      let typeList = {};
      typeList[game] = data.gameTypes ? data.gameTypes.split(",").includes(game) : false;
      return typeList;
    });
    return resultResponse(SUCCESS, { gameTypes, data: gameList });
  } catch (error) {
    if (error.response)
      if ([QT.STATUS_401, QT.STATUS_404, QT.STATUS_422, QT.STATUS_500, QT.STATUS_503].includes(error.response.status))
        return resultResponse(SERVER_ERROR, error.response.data.message);
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function lobbyUrl(request) {
  await checkAccessTokenStatus();
  const { user_id, name, is_demo, browser_info, token, return_url } = request.User;
  const detector = new DeviceDetector;
  let device = detector.detect(browser_info).device.type;
  const defaultCurrency = QT.DEFAULT_CURRENCY;
  let data = {
    "playerId": `${user_id}${QT.QT_USER_ID_DELIMITER}${defaultCurrency}`,
    "displayName": name,
    "currency": defaultCurrency,
    "country": "IN",
    "lang": "en_IN",
    "mode": (is_demo ? "demo" : "real"),
    "device": (device == "desktop" ? "desktop" : "mobile"),
    // "walletSessionId": JSON.stringify({ token }),
    "walletSessionId": `${user_id}${QT.QT_USER_ID_DELIMITER}${defaultCurrency}`,
    // "gameLaunchTarget": "",
    // "gameTypes": "",
    "betLimitCode": "1",
    "walletCurrency": defaultCurrency,
    "config": {
      "displays": {
        "balance": true,
        "name": true,
        "language": true,
        "gameHistory": true,
        "exitButton": true,
        "search": true
      },
      "urls": {
        "exit": return_url
      }
    }
  };

  var config = {
    method: 'post',
    url: QTECH_LOBBY_URL,
    headers: {
      'Authorization': 'Bearer ' + await readAccessToken(),
      'Content-Type': 'application/json'
    },
    data
  };
  try {
    let lobbyUrl = (await axios(config)).data;
    return resultResponse(SUCCESS, lobbyUrl);
  } catch (error) {
    if (error.response)
      if ([QT.STATUS_400, QT.STATUS_401, QT.STATUS_422, QT.STATUS_500, QT.STATUS_503].includes(error.response.status))
        return resultResponse(SERVER_ERROR, error.response.data.message +
          (error.response.data.hasOwnProperty("details") ? Object.values(error.response.data.details).toString() : "")
        );
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function launchUrl(request) {
  await checkAccessTokenStatus();
  const { user_id, name, is_demo, browser_info, return_url, ip_data, token, tableId } = request.User;
  const { gameId, providerCode, currency } = request.body;
  const detector = new DeviceDetector;
  let device = detector.detect(browser_info).device.type;
  const defaultCurrency = currency ? currency : QT.DEFAULT_CURRENCY;
  let data = {
    "playerId": `${user_id}${QT.QT_USER_ID_DELIMITER}${defaultCurrency}`,
    "displayName": name,
    "currency": defaultCurrency,
    "country": "IN",
    "lang": "en_IN",
    "mode": (is_demo ? "demo" : "real"),
    "device": (device == "desktop" ? "desktop" : "mobile"),
    "returnUrl": return_url,
    // "walletSessionId": JSON.stringify({ token, providerCode }),
    "walletSessionId": `${user_id}${QT.QT_USER_ID_DELIMITER}${defaultCurrency}`,
    "betLimitCode": "1",
    "ipAddress": ip_data,
    "walletCurrency": defaultCurrency,
  };
  if (tableId)
    data["tableId"] = tableId; // will remove this.
  var config = {
    method: 'post',
    url: QTECH_LAUNCH_URL.replace("{gameId}", gameId),
    headers: {
      'Authorization': 'Bearer ' + await readAccessToken(),
      'Content-Type': 'application/json'
    },
    data
  };
  try {
    let launchUrl = (await axios(config)).data;
    let response = { url: launchUrl.url };
    if (request.query.dbg)
      response = { ...response, providerCode };
    return resultResponse(SUCCESS, response);
  } catch (error) {
    if (error.response)
      if ([QT.STATUS_400, QT.STATUS_401, QT.STATUS_404, QT.STATUS_422, QT.STATUS_500, QT.STATUS_503].includes(error.response.status))
        return resultResponse(SERVER_ERROR, error.response.data.message +
          (error.response.data.hasOwnProperty("details") ? Object.values(error.response.data.details).toString() : "")
        );
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function playerHistory(request) {

  await checkAccessTokenStatus();

  const { _id: user_id } = request.user;

  let data = {
    "currency": QT.DEFAULT_CURRENCY,
    "timeZone": 'Asia/Calcutta',
    "country": "IN",
    "lang": "en_IN",
  };
  let config = {
    method: 'post',
    url: QTECH_GAME_HISTORY_URL.replace("{userId}", user_id.toString()),
    headers: {
      'Authorization': 'Bearer ' + await readAccessToken(),
      'Content-Type': 'application/json'
    },
    data
  };
  try {
    let launchUrl = (await axios(config)).data;
    let response = { url: launchUrl.url };
    return resultResponse(SUCCESS, response);
  } catch (error) {
    if (error.response) {
      if ([QT.STATUS_400, QT.STATUS_401, QT.STATUS_404, QT.STATUS_422, QT.STATUS_500, QT.STATUS_503].includes(error.response.status)) {
        return resultResponse(SERVER_ERROR, `QTech Error: ${error?.response?.data?.errormessage}`);
      }
    }
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function qTechResultDeclare(params) {
  const session = await mongoose.startSession();
  const transactionOptions = {
    readPreference: 'primary',
    readConcern: { level: 'majority' },
    writeConcern: { w: 'majority' }
  };
  try {
    let statusCode = SERVER_ERROR, statusMsg = "";
    await session.withTransaction(async () => {
      if (!params.retry)
        params.error = { "$exists": false };
      if (params.retry)
        delete params.retry;
      let gameData = await QTechRoundsStatus.findOne(params).select("_id roundId providerCode gameId gameRoundId gameName").session(session);
      if (gameData) {
        const { roundId } = gameData;
        let usersGameData = await QTechCrDrWinLoss.aggregate(qtechQuery.userProfitLossRoundWise({ body: { roundId } })).session(session);
        if (!usersGameData.length) {
          let error = "No win/loss data generated!";
          await QTechRoundsStatus.updateOne({ _id: gameData._id }, { error, '$inc': { retryCount: 1 } }).session(session);
          throw new Error(error);
        }
        let generatedUserProfitLoss = await generateUserProfitLoss(session, gameData, usersGameData);
        if (generatedUserProfitLoss.statusCode != SUCCESS) {
          await QTechRoundsStatus.updateOne({ _id: gameData._id }, { error: generatedUserProfitLoss.data, '$inc': { retryCount: 1 } }).session(session);
          throw new Error(generatedUserProfitLoss.data);
        }
        const { user_profit_loss, bet_result_id, event_id } = generatedUserProfitLoss.data;
        await UserProfitLoss.insertMany(user_profit_loss, { session, ordered: false });
        let status = await betService.fn_update_balance_on_resultV2(session, bet_result_id, event_id, 0, "Result declared successfully...", {}, 0);
        if (status.statusCode == SUCCESS) {
          await QTechRoundsStatus.deleteOne({ _id: gameData._id }).session(session);
          await QTechCrDrWinLoss.updateMany({ roundId }, { '$set': { isProcessed: 1 } }).session(session);
        } else
          await QTechRoundsStatus.updateOne({ _id: gameData._id }, { error: status.data, '$inc': { retryCount: 1 } }).session(session);
        statusCode = status.statusCode;
        statusMsg = status.data;
      } else {
        statusCode = NOT_FOUND;
        statusMsg = "Game data not found or already processed!";
      }
    }, transactionOptions);
    return resultResponse(statusCode, statusMsg);
  } catch (error) {
    return resultResponse(SERVER_ERROR, "Error in result declare :" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
  } finally {
    session.endSession();
  }
}

async function qTechResultDeclareV1(params) {
  let statusCode = SERVER_ERROR, statusMsg = "";
  if (!params.retry)
    params.error = { "$exists": false };
  if (params.retry)
    delete params.retry;
  let gameData = await QTechRoundsStatus.findOne(params).select("_id roundId providerCode gameId gameRoundId gameName playerId");
  try {
    if (gameData) {
      const { roundId, playerId } = gameData;
      let usersGameData = await QTechCrDrWinLoss.aggregate(qtechQuery.userProfitLossRoundWiseV1({ body: { roundId, playerId } }));
      if (!usersGameData.length) {
        let error = "No win/loss data generated!";
        await QTechRoundsStatus.updateOne({ _id: gameData._id }, { error });
        throw new Error(error);
      }
      let generatedUserProfitLoss = await generateUserProfitLossV1(gameData, usersGameData);
      if (generatedUserProfitLoss.statusCode != SUCCESS) {
        await QTechRoundsStatus.updateOne({ _id: gameData._id }, { error: generatedUserProfitLoss.data });
        throw new Error(generatedUserProfitLoss.data);
      }
      const { user_profit_loss, bet_result_id, event_id } = generatedUserProfitLoss.data;
      await UserProfitLoss.insertMany(user_profit_loss);
      let status = await betService.fn_update_balance_on_resultV2_casino(bet_result_id, event_id, 0, "Game entry processed successfully...", {}, 0);
      if (status.statusCode == SUCCESS) {
        await QTechRoundsStatus.updateOne({ roundId, playerId }, { "$set": { resultMessage: status.data } });
        await QTechCrDrWinLoss.updateMany({ roundId, playerId }, { '$set': { isProcessed: 1 } });
      } else
        await QTechRoundsStatus.updateOne({ _id: gameData._id }, { error: status.data });
      statusCode = status.statusCode;
      statusMsg = status.data;
    } else {
      statusCode = NOT_FOUND;
      statusMsg = "Game data not found or already processed!";
    }
    return resultResponse(statusCode, statusMsg);
  } catch (error) {
    await QTechRoundsStatus.updateOne({ _id: gameData._id }, { error: error.message });
    return resultResponse(SERVER_ERROR, "Error in result declare :" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
  }
}

async function generateUserProfitLoss(session, gameData, usersGameData) {
  try {
    let { providerCode, roundId, gameId, gameRoundId, gameName } = gameData
      , user_profit_loss = [];
    const users_id = usersGameData.map(data => ObjectId(data.userId));
    const user = await User.find({ _id: { "$in": users_id } }).select("user_name domain_name").lean();
    if (!user.length)
      return resultResponse(NOT_FOUND, "User(s) not found!");
    const partnerships = await Partnerships.find({
      user_id: { "$in": users_id },
      "sports_share.sport_id": QTECH_CASINO_SPORT_ID
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

    let QTECH_GAMES = await getQTechGamesDetails({ body: { providerCode } });
    if (QTECH_GAMES.statusCode != SUCCESS)
      return resultResponse(SERVER_ERROR, QTECH_GAMES.data);
    QTECH_GAMES = QTECH_GAMES.data;

    let { sport_id, sport_name } = QTECH_GAMES
      , event = `${sport_id}.${gameId}`
      , event_id = `${event}.${roundId}.${gameRoundId}`
      , winner_name = "QT"
      , event_name = gameName
      , betResultId = mongoose.Types.ObjectId();
    for (const userGameData of usersGameData) {
      let userData = distribution.find(o => o.user_id.toString() == userGameData.userId.toString());
      if (userData) {
        let agents_pl_distribution = userData.agents_pl_distribution
          , chips = userGameData.balance
          , user_winning_status = chips > 0 ? "Win" : "Loss";

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
          qtRoundId: userGameData.roundId,
          qtClientRoundId: userGameData.clientRoundId,
          casinoProvider: QTECH_CASINO_SPORT_ID,
          sport_id,
          sport_name,
          series_id: event,
          series_name: event_name,
          match_id: event,
          match_name: event_name,
          event_id,
          // event_name: `${event_name} ${providerCode}`,
          event_name,
          winner_name,
          bet_result_id: betResultId,
          stack: 0,
          user_pl: chips,
          user_commission_pl: 0,
          max_liability: 0,
          description: `${sport_name} - (${event_name} - roundId[${roundId}] - ${gameRoundId}) - ${user_winning_status == "Win" ? "Profit" : "Loss"} [ User : ${user_winning_status} ]`,
          reffered_name: `${sport_name} -> ${event_name} - roundId[${roundId}] - ${gameRoundId}`,
          agents_pl_distribution
        });
      }
    }
    if (user_profit_loss.length) {
      let isResultAlreadyDeclared = await BetResults.findOne({ sport_id, series_id: event, match_id: event, market_id: event_id });
      if (isResultAlreadyDeclared)
        return resultResponse(SERVER_ERROR, "Result already declared!");
      await BetResults.create([{
        _id: betResultId,
        sport_id,
        series_id: event,
        match_id: event,
        market_id: event_id,
        selection_id: winner_name,
        winner_name,
        type: 1
      }], { session });
      return resultResponse(SUCCESS, { user_profit_loss, bet_result_id: betResultId, event_id });
    }
    return resultResponse(NOT_FOUND, "No profit loss found!");
  } catch (error) {
    await session.abortTransaction();
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function generateUserProfitLossV1(gameData, usersGameData) {
  try {
    let { providerCode, roundId, gameId, gameRoundId, gameName } = gameData
      , user_profit_loss = [];
    const users_id = usersGameData.map(data => ObjectId(data.userId));
    const user = await User.find({ _id: { "$in": users_id } }).select("user_name domain_name is_demo").lean();
    if (!user.length)
      return resultResponse(NOT_FOUND, "User(s) not found!");
    const partnerships = await Partnerships.find({
      user_id: { "$in": users_id },
      "sports_share.sport_id": QTECH_CASINO_SPORT_ID
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

    let QTECH_GAMES = await getQTechGamesDetails({ body: { providerCode } });
    if (QTECH_GAMES.statusCode != SUCCESS)
      return resultResponse(SERVER_ERROR, QTECH_GAMES.data);
    QTECH_GAMES = QTECH_GAMES.data;

    let { sport_id, sport_name } = QTECH_GAMES
      , event = `${sport_id}.${gameId}`
      , event_id = `${event}.${roundId}.${gameRoundId}`
      , winner_name = "QT"
      , event_name = gameName
      , betResultId = mongoose.Types.ObjectId();
    for (const userGameData of usersGameData) {
      let userData = distribution.find(o => o.user_id.toString() == userGameData.userId.toString());
      if (userData) {
        let agents_pl_distribution = userData.agents_pl_distribution
          , chips = userGameData.balance
          , user_winning_status = chips > 0 ? "Win" : "Loss";

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
          qtRoundId: userGameData.roundId,
          qtClientRoundId: userGameData.clientRoundId,
          casinoProvider: QTECH_CASINO_SPORT_ID,
          sport_id,
          sport_name,
          series_id: event,
          series_name: event_name,
          match_id: event,
          match_name: event_name,
          event_id,
          // event_name: `${event_name} ${providerCode}`,
          event_name,
          winner_name,
          bet_result_id: betResultId,
          stack: 0,
          user_pl: chips,
          user_commission_pl: 0,
          max_liability: 0,
          // description: `${sport_name} - (${event_name} - roundId[${roundId}] - ${gameRoundId}) - ${user_winning_status == "Win" ? "Profit" : "Loss"} [ User : ${user_winning_status} ]`,
          description: `${sport_name} - ${event_name} / R.No : ${roundId}`,
          reffered_name: `${sport_name} - (${event_name} - roundId[${roundId}] - ${gameRoundId}) - ${user_winning_status == "Win" ? "Profit" : "Loss"} [ User : ${user_winning_status} ]`,
          agents_pl_distribution
        });
      }
    }
    if (user_profit_loss.length)
      return resultResponse(SUCCESS, { user_profit_loss, bet_result_id: betResultId, event_id });
    return resultResponse(NOT_FOUND, "No profit loss found!");
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

function getPendingResults(request) {
  const { body } = request;
  let QTechFinds = QTechRoundsStatus, multiple = body ? body.hasOwnProperty("multiple") : false;
  QTechFinds = multiple ? QTechFinds.find({ retryCount: { $lte: 12 } }).limit(20) : QTechFinds.findOne({ retryCount: { $lte: 12 } });
  return QTechFinds
    .sort({ createdAt: 1 })
    .lean()
    .then(data => data ? resultResponse(SUCCESS, data) : resultResponse(NOT_FOUND, "No pending results found yet!"))
    .catch(error => resultResponse(SERVER_ERROR, error.message));
}

function pendingResultDeclareQT(request) {
  return getPendingResults(request)
    .then(async result => {
      if (result.statusCode == SUCCESS) {
        if (result.data.length) {
          for (const data of result.data)
            await qTechResultDeclare({ roundId: data.roundId, retry: 1 });
          return resultResponse(result.statusCode, "Pending results were successfully processed...");
        }
        return resultResponse(result.statusCode, "No pending results were found yet!");
      } else
        return resultResponse(result.statusCode, result.data);
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

async function getQTechGamesDetails(request) {
  try {
    const { providerCode } = request.body;
    let getQTechGamesDetails = await Sports.findOne({ providerCode }).select("-_id sport_id name currency").lean();
    if (!getQTechGamesDetails)
      return resultResponse(NOT_FOUND, "Game provider not found!");
    getQTechGamesDetails.sport_name = getQTechGamesDetails.name;
    return resultResponse(SUCCESS, getQTechGamesDetails);
  } catch (error) {
    return resultResponse(NOT_FOUND, "Error while processing qtech-game file!");
  }
}

async function providersByCurrency() {
  let getQTechGamesDetails = await Sports.find({ casinoProvider: QTECH_CASINO_SPORT_ID }).select("-_id sport_id name currency").sort("sport_id").exec();
  if (!getQTechGamesDetails)
    return resultResponse(NOT_FOUND, "Games not available!");
  return resultResponse(SUCCESS, { data: getQTechGamesDetails });
}

async function updateProviderCurrency(request) {
  const { sport_id, currency } = request.joiData;
  let getQTechGamesDetails = await Sports.updateOne({ sport_id }, { currency }).exec();
  if (!getQTechGamesDetails.modifiedCount)
    return resultResponse(NOT_FOUND, "Nothing to update");
  return resultResponse(SUCCESS, "currency updated successfully!");
}

async function validateAccount(request) {
  try {
    const { user_id } = request.User;
    return userService.getUserDetails({ _id: ObjectId(user_id) },
      ["-_id", "self_lock_user", "parent_lock_user", "self_close_account", "parent_close_account", "self_lock_betting", "parent_lock_betting", "parent_level_ids"]
    ).then(async user => {
      if (user.statusCode == SUCCESS) {
        user = user.data;

        if (Math.max(user.self_lock_betting, user.parent_lock_betting) == 1)
          return resultResponse(VALIDATION_FAILED, "Your betting is locked!");

        if (Math.max(user.self_lock_user, user.parent_lock_user) == 1)
          return resultResponse(VALIDATION_FAILED, "Your account is locked!");

        if (Math.max(user.self_close_account, user.parent_close_account) == 1)
          return resultResponse(VALIDATION_FAILED, "Your account is closed, Contact your Upline!");

        let blockedUsers = user.parent_level_ids.map(data => (data.user_id).toString());
        blockedUsers.push(user_id.toString());
        let event = await Sports.findOne({ sport_id: QTECH_CASINO_SPORT_ID }).select("-_id self_blocked parent_blocked is_active is_visible").lean().exec();

        if (!event || event?.is_active == 0 || event?.is_visible == false) {
          return resultResponse(VALIDATION_FAILED, `Game is locked. Please Contact Upper Level. SA`);
        }

        const self_blocked = blockedUsers.some(element => event.self_blocked.includes(element));
        const parent_blocked = blockedUsers.some(element => event.parent_blocked.includes(element));

        if ((event.self_blocked.length && self_blocked) || (event.parent_blocked.length && parent_blocked)) {
          return resultResponse(VALIDATION_FAILED, `Game is locked. Please Contact Upper Level.`);
        }

        return resultResponse(SUCCESS, getQTechGamesDetails);

      } else if (user.statusCode == NOT_FOUND)
        return resultResponse(VALIDATION_FAILED, user.data);
      else
        return resultResponse(NOT_FOUND, user.data);
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function resettleBalance(request) {
  return User.find({ user_type_id: 1, balance: { $lt: 0 } }).select("user_name")
    .then(async users => {
      if (users.length) {
        users = users.map(user => user.user_name);
        await User.updateMany({ user_name: { $in: users } }, { '$set': { balance: 0 } });
        return resultResponse(SUCCESS, "Balance resettlement completed...");
      }
      return resultResponse(NOT_FOUND, "No users are left for resetting the balance, please try after some time.");
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

async function autoClearLiability() {
  try {
    const sixtyFiveMinutesAgo = moment().subtract(65, 'minutes').toDate();
    const oneDateAgo = moment().subtract(1, 'days').toDate();
    const query = [
      {
        $match: {
          txnType: QT.DEBIT,
          isProcessed: 0,
          createdAt: { $lt: sixtyFiveMinutesAgo, $gt: oneDateAgo }
        }
      },
      {
        $group: {
          _id: "$roundId",
          roundId: { $first: "$roundId" },
          userId: { $first: "$userId" }, // ObjectId
        }
      },
      {
        $sort: { roundId: -1 }
      },
    ];

    const rounds = await QTechCrDrWinLoss.aggregate(query);
    if (!rounds.length) return;
    const roundIds = rounds.map(round => round.roundId);

    const batchSize = 20;
    for (let i = 0; i < roundIds.length; i += batchSize) {
      const batch = roundIds.slice(i, i + batchSize);
      await clearQTechLiabilityByRoundIds({ roundIds: batch });
    }

  } catch (error) {
    console.error("Error in AutoClearLiability: ", error.message);
    console.error(error);
  }
}

async function clearQTechLiabilityByRoundIds(params) {
  try {
    const dataRes = await getLiabilityDataByRoundIds(params);

    if (dataRes.statusCode != SUCCESS) {
      console.error("Error in clearQTechLiabilityByRoundIds: ", dataRes.data);
      return;
    }

    const output = dataRes.data.data;

    for (const userId in output) {
      const { roundIds, DEBIT, CREDIT } = output[userId];
      const debitAmount = fixFloatingPoint(Math.abs(DEBIT?.amount || 0));
      const creditAmount = fixFloatingPoint(Math.abs(CREDIT?.amount || 0));
      const roundIdsArr = Array.from(roundIds);

      const res = await CrDr(userId, {
        balance: debitAmount,
        liability: debitAmount,
        pendingBalance: -creditAmount,
        roundIds: roundIdsArr,
      });
    }

  } catch (error) {
    console.error("Error in clearQTechLiabilityByRoundIds: ", error.message);
    console.error(error);
  }
}

async function CrDr(user_id, { balance, liability, pendingBalance, roundIds }) {

  balance = balance || 0;
  liability = liability || 0;
  pendingBalance = pendingBalance || 0;
  roundIds = roundIds || [];

  var user = await User.findOne({ _id: ObjectId(user_id) }, { user_name: 1, balance: 1, liability: 1, qtech_pending_balance: 1, }).lean();

  const LOG_REF_CODE = generateReferCode();

  logger.BalExp(`
    --PRE LOG--
    FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
    FUNCTION: CrDr qtech
    LOG_REF_CODE: ${LOG_REF_CODE}
    DETAILS: [${user.user_name}(${user._id})] old_balance: ${user.balance} - old_liability: ${user.liability} - old_qtech_pending_balance: ${user.qtech_pending_balance} - cal_amount: ${balance}
  `);

  const updatedUser = await User.updateOne({ _id: ObjectId(user_id) },
    [{
      '$set': {
        balance: {
          $round: [
            {
              $add: [
                { $ifNull: ["$balance", 0] },
                balance,
              ],
            },
            2,
          ],
        },
        liability: {
          $round: [
            {
              $add: [
                { $ifNull: ["$liability", 0] },
                liability,
              ],
            },
            2,
          ],
        },
        qtech_pending_balance: {
          $round: [
            {
              $add: [
                { $ifNull: ["$qtech_pending_balance", 0] },
                pendingBalance,
              ],
            },
            2,
          ],
        },
      }
    }]);

  var user = await User.findOne({ _id: ObjectId(user_id) }, { user_name: 1, balance: 1, liability: 1, domain_name: 1, qtech_pending_balance: 1, }).lean();

  logger.BalExp(`
    --POST LOG--
    FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
    FUNCTION: CrDr qtech
    LOG_REF_CODE: ${LOG_REF_CODE}
    DETAILS: [${user.user_name}(${user._id})] new_balance: ${user.balance} - new_liability: ${user.liability} - new_qtech_pending_balance: ${user.qtech_pending_balance}
  `);

  if ((fixFloatingPoint(user.liability) > 0) ? true : (fixFloatingPoint(user.balance) < 0) ? true : false) {
    sendMessageAlertToTelegram({ message: `\nLOG_REF_CODE: ${LOG_REF_CODE}\nUSER: ${user.user_name}(${user._id}) : balance ${user.balance}, liability ${user.liability}, qtech_pending_balance: ${user.qtech_pending_balance}` });
  }

  if (updatedUser && updatedUser.modifiedCount) {
    await QTechCrDrWinLoss.updateMany({ roundId: { $in: roundIds } }, { '$set': { isProcessed: 3 } });
    return resultResponse(SUCCESS, { msg: "User balance updated successfully!" });
  } else {
    return resultResponse(SERVER_ERROR, { msg: "Some Error in User Balance Updated!" });
  }
}

async function getLiabilityDataByRoundIds(params) {
  try {
    const { roundIds } = params;
    const query = [
      {
        $match: {
          roundId: { $in: roundIds },
          isProcessed: 0,
        }
      },
      {
        $group: {
          _id: {
            roundId: "$roundId",
            userId: "$userId",
            txnType: "$txnType",
          },
          userId: { $first: "$userId" },
          roundId: { $first: "$roundId" },
          txnType: { $first: "$txnType" },
          amount: { $sum: "$amount" }
        }
      }
    ];

    const crDrData = await QTechCrDrWinLoss.aggregate(query);
    if (!crDrData.length) return;

    const output = crDrData.reduce((acc, item) => {
      const userId = item.userId.toString();
      if (!acc[userId]) {
        acc[userId] = {};
      }
      if (acc[userId][item.txnType]) {
        acc[userId][item.txnType].amount += item.amount;
      } else {
        acc[userId][item.txnType] = {
          amount: item.amount,
          txnType: item.txnType,
        };
      }

      acc[userId]['roundIds'] = acc[userId]['roundIds'] || new Set();
      acc[userId]['roundIds'].add(item.roundId);
      return acc;
    }, {});

    return resultResponse(SUCCESS, { data: output, msg: "Success" });

  } catch (error) {
    console.error("Error in getLiabilityDataByRoundIds: ", error.message);
    console.error(error);
    return resultResponse(SERVER_ERROR, { msg: error.message });
  }
}

if (process.env.NODE_APP_INSTANCE == "0" || process.env.NODE_APP_INSTANCE == undefined)
  QTEvent.on(QT.QT_RESULT_RETRY, async (data) => {
    const { _id, retryCount } = data;
    if (retryCount <= 7)
      try {
        await qTechResultDeclare({ _id: ObjectId(_id), retry: 1 });
      } catch (error) { console.error(error) }
  });

let verifyProvider = (request) => getQTechGamesDetails(request);

module.exports = {
  checkAccessTokenStatus,
  getAccessToken,
  revokeAccessToken,
  generateAccessToken,
  resettleBalance,
  validateAccount,
  gameList,
  lobbyUrl,
  launchUrl,
  verifyProvider,
  qTechResultDeclare,
  qTechResultDeclareV1,
  getPendingResults,
  pendingResultDeclareQT,
  playerHistory,
  providersByCurrency,
  updateProviderCurrency,
  autoClearLiability,
};
