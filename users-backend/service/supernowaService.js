const axios = require("axios")
  , mongoose = require('mongoose')
  , path = require('path')
  , fs = require('fs').promises
  , User = require("../../models/user")
  , Sports = require("../../models/sports")
  , Supernowa = require('../../models/supernowa')
  , supernowaQuery = require('./supernowaQuery')
  , userService = require("./userService")
  , SUPERNOWA_GAMES_PATH = path.normalize(path.resolve(__dirname, "../../utils/supernowa-games.json"))
  , {
    allowSNowaIp, SUPERNOWA_PARTNER_KEYS, SUPERNOWA_PARTNER_KEY, SUPERNOWA_POINT_PARTNER_KEY, GAMES_LIST_URL
  } = require("../../utils/supernowaConfig")
  , { SUCCESS, NOT_FOUND, SERVER_ERROR } = require("../../utils/constants")
  , {
    SSUCCESS, UNKNOWN_ERROR, getRequesterIp, LOGIN_FAILED, LOGIN_FAILED_STATUS,
    VALIDATION_ERROR_STATUS, VALIDATION_ERROR, INSUFFICIENT_FUNDS_STATUS, INSUFFICIENT_FUNDS
  } = require("../../utils")
  , { resultResponse } = require('../../utils/globalFunction');

function getUserFinalLoss(params) {
  let query = supernowaQuery.getAgentProfit(params);
  return Supernowa.aggregate(query).then(userLoss => {
    if (userLoss.length)
      return resultResponse(SUCCESS, { agent_pl: userLoss[0].agent_pl });
    return resultResponse(NOT_FOUND, "No profit value found!");
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

function getBetAmount(params) {
  return Supernowa.aggregate(supernowaQuery.getBetAmount(params)).then(getBetAmount => {
    if (getBetAmount.length)
      return resultResponse(SUCCESS, { getBetAmount: getBetAmount[0].bet_amount });
    return resultResponse(NOT_FOUND, "No profit value found!");
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

async function updateUser(user, update) {
  let updatedUser = { status: false, data: "Unknown error!" };
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async (session) => {
      updatedUser = {
        status: true,
        data: await User.findOneAndUpdate(
          user,
          update,
          { new: true }
        ).session(session).select("balance").lean()
      };
    });
  } catch (error) {
    updatedUser = {
      status: false,
      data: error.message
    };
  } finally {
    session.endSession();
  }
  return updatedUser;
}

function checkDuplicateEntry(params) {
  const { transactionData } = params;
  return Supernowa.findOne({
    "transactionData.id": transactionData.id,
  }).select("_id")
    .then(data => resultResponse(data ? SUCCESS : NOT_FOUND, data))
    .catch(error => resultResponse(SERVER_ERROR, error.message));
}

async function getBetsFromSupernowaAPI(params) {
  try {
    const { USER_BETS_URL, partnerKey, user, gameData } = params;
    let config = {
      method: 'post',
      url: USER_BETS_URL,
      headers: {
        'Content-type': 'application/json',
      },
      data: {
        "userId": user.id,
        "partnerKey": partnerKey,
        "providerRoundId": gameData.providerRoundId,
        "providerCode": gameData.providerCode
      }
    };
    let bets = (await axios(config)).data;
    if (bets.hasOwnProperty("status"))
      if (bets.status.code == SSUCCESS)
        if (bets.betCount && bets.betList.length)
          return resultResponse(SUCCESS, bets);
    return resultResponse(NOT_FOUND, "No records found!");
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function getGamesList(providerCode = "") {
  let GAMES = [];
  try {
    var config = {
      method: 'post',
      url: GAMES_LIST_URL,
      headers: {
        'Content-Type': 'application/json'
      },
      data: {
        "partnerKey": SUPERNOWA_PARTNER_KEY,
        providerCode
      }
    };
    GAMES = (await axios(config)).data;
    if (GAMES.hasOwnProperty("games"))
      if (GAMES.games.length)
        GAMES = GAMES.games;
    if (!GAMES.length)
      GAMES = [];
  } catch (error) { console.error(error); }
  return GAMES;
}

let ResponseJSON = (res, statusCode, data = {}) => res.status(statusCode).json(ResponseSnowaJSON(data));

function ResponseSnowaJSON(data) {
  let SNOWA_RESPONSE = {
    "partnerKey": null,
    "timestamp": null,
    "userId": null,
    "balance": 0,
    "status": {
      "code": UNKNOWN_ERROR,
      "message": "Internal server error!"
    }
  }
  if (data.partnerKey != null)
    SNOWA_RESPONSE = data;
  if (data.hasOwnProperty("code"))
    SNOWA_RESPONSE["status"]["code"] = data.code;
  if (data.hasOwnProperty("message"))
    SNOWA_RESPONSE["status"]["message"] = data.message;
  let log = { response: SNOWA_RESPONSE };
  if (data.hasOwnProperty("object_reference_id"))
    log["object_reference_id"] = data.object_reference_id;
  Supernowa.create(log).then().catch(console.error);
  delete SNOWA_RESPONSE["object_reference_id"];
  delete SNOWA_RESPONSE["sessionid"];
  return SNOWA_RESPONSE;
}

function validateIp(req, res, next) {
  let request_ip = getRequesterIp(req);
  if (!allowSNowaIp.includes(request_ip))
    return res.status(LOGIN_FAILED_STATUS).json({
      "status": {
        "code": LOGIN_FAILED,
        "message": "You are not allow to perform action."
      }
    });
  req.body.request_ip = request_ip;
  req.body.path = req.path;
  next();
}

async function validateUser(req, res, next) {
  try {
    const { sessionid } = req.headers;
    let userId = "";
    if ("/balance" == req.path)
      userId = req.body.userId;
    if (["/debit", "/credit"].includes(req.path))
      userId = req.body.user.id;
    let user = await userService.getUserDetails({ _id: userId, sessionid }, ["_id", "balance", "sessionid", "sports_permission", "parent_level_ids"]);
    if (user.statusCode != SUCCESS)
      req.headers["userNotValid"] = { message: user.data };
    req.headers["USER"] = user.data;
  } catch (error) {
    req.headers["userNotValid"] = { message: error.message };
  }
  next();
}

async function verifyPartnerKeyAndGames(req, res, next) {
  // Here we check game is implemented or not.
  const { gameData } = req.body;
  if (gameData) {
    const { providerCode, gameCode } = gameData;
    try {
      let SUPERNOWA_GAMES = await fs.readFile(SUPERNOWA_GAMES_PATH, 'utf8');
      SUPERNOWA_GAMES = JSON.parse(SUPERNOWA_GAMES);
      if (!SUPERNOWA_GAMES[providerCode][gameCode])
        return ResponseJSON(res, VALIDATION_ERROR_STATUS, { message: "Game not implemented yet!", code: VALIDATION_ERROR });
      if (req.path == "/auth")
        var { sports_permission, parent_level_ids, _id } = req.User;
      if (["/debit"].includes(req.path)) {
        var { sports_permission, parent_level_ids, _id, balance } = req.headers["USER"];
        const { transactionData } = req.body;
        const { amount } = transactionData;
        if (parseFloat(balance) <= parseFloat(amount))
          return ResponseJSON(res, INSUFFICIENT_FUNDS_STATUS, { message: "Insufficient Balance!", code: INSUFFICIENT_FUNDS });
      }
      if (sports_permission && parent_level_ids) {
        FilterQuery = {
          is_active: 1, is_visible: true, providerCode,
          sport_id: { '$in': sports_permission.map(data => data.sport_id) },
          parent_blocked: { '$nin': [...parent_level_ids.map(data => data.user_id), _id.toString()] },
          self_blocked: { '$nin': [...parent_level_ids.map(data => data.user_id), _id.toString()] }
        };
        let sportIsBlocked = await Sports.findOne(FilterQuery);
        if (sportIsBlocked == null)
          return ResponseJSON(res, VALIDATION_ERROR_STATUS, { message: SUPERNOWA_GAMES[providerCode][gameCode].sport_name + " is blocked by agent!", code: VALIDATION_ERROR });
      }
    } catch (error) {
      return ResponseJSON(res, VALIDATION_ERROR_STATUS, { message: "Game not implemented yet!", code: VALIDATION_ERROR });
    }
  }
  // Here we check partnerKey.
  if (!["/auth"].includes(req.path)) {
    const { partnerKey } = req.body;
    if (!partnerKey)
      return ResponseJSON(res, VALIDATION_ERROR_STATUS, { message: "Partner key not valid!", code: VALIDATION_ERROR });
    if (!SUPERNOWA_PARTNER_KEYS.includes(partnerKey))
      return ResponseJSON(res, VALIDATION_ERROR_STATUS, { message: "Partner key not valid!", code: VALIDATION_ERROR });
  }
  // Here we pass partnerKey according to the user pointing system.
  if (["/auth"].includes(req.path)) {
    const { point } = req.User;
    if (point == 1)
      req.body["partnerKey"] = SUPERNOWA_PARTNER_KEY;
    else
      req.body["partnerKey"] = SUPERNOWA_POINT_PARTNER_KEY;
  }
  next();
}

module.exports = {
  getUserFinalLoss, getBetsFromSupernowaAPI, ResponseJSON, ResponseSnowaJSON, updateUser,
  validateIp, validateUser, verifyPartnerKeyAndGames, getGamesList, checkDuplicateEntry,
  getBetAmount
}