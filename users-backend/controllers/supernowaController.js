const { STATUS_500, STATUS_422 } = require('../../utils/httpStatusCode');
const Joi = require('joi')
  , JoiObjectId = require('joi-oid')
  , axios = require('axios')
  , { ObjectId } = require("bson")
  , User = require("../../models/user")
  , Supernowa = require('../../models/supernowa')
  , SupernowaCrDrWinLoss = require('../../models/supernowaCrDrWinLoss')
  , SupernowaGameData = require('../../models/supernowaGameData')
  , supernowaService = require("../service/supernowaService")
  , { USER_AUTH, SUPERNOWA_URL, USER_BETS_URL, SUPERNOWA_PARTNER_KEY, SUPERNOWA_POINT_PARTNER_KEY } = require("../../utils/supernowaConfig")
  , { updateUser, ResponseJSON, ResponseSnowaJSON } = require("../service/supernowaService")
  , { ResError, ResSuccess } = require('../../lib/expressResponder')
  , utils = require('../../utils')
  , { SUCCESS } = require('../../utils/constants')
  , {
    getDomainName, SSUCCESS, INVALID_TOKEN, ACCOUNT_BLOCKED, UNKNOWN_ERROR, LOGIN_FAILED,
    VALIDATION_ERROR, INSUFFICIENT_FUNDS, GAME_NOT_AVAILABLE,
    INVALID_TOKEN_STATUS, ACCOUNT_BLOCKED_STATUS, UNKNOWN_ERROR_STATUS, LOGIN_FAILED_STATUS,
    VALIDATION_ERROR_STATUS, INSUFFICIENT_FUNDS_STATUS, GAME_NOT_AVAILABLE_STATUS, SSUCCESS_STATUS
  } = utils;

module.exports.auth = (req, res) => {
  return Joi.object({
    partnerKey: Joi.string().required(),
    gameData: Joi.object({
      providerCode: Joi.string().required(),
      gameCode: Joi.string().required(),
    }).required(),
  }).validateAsync(req.body, { abortEarly: false })
    .then(async ({ partnerKey, gameData }) => {
      const { providerCode, gameCode } = gameData;
      const id = (req.User.user_id || req.User._id)
        , currency = req.User.currency || "INR"
        , displayName = (req.User.user_name).replace(/[^a-zA-Z ]/g, "")
        , backUrl = getDomainName(req.get('host'));
      const config = {
        method: 'post',
        url: SUPERNOWA_URL + USER_AUTH,
        headers: {
          'Content-type': 'application/json',
        },
        data: {
          partnerKey,
          "game": {
            gameCode,
            providerCode
          },
          "timestamp": (Date.now()).toString(),
          "user": {
            id, currency, displayName, backUrl
          }
        }
      };
      try {
        let lobbyRequest = await axios(config);
        lobbyRequest = lobbyRequest.data;
        if (lobbyRequest.hasOwnProperty("status")) {
          if (lobbyRequest.status.code != SSUCCESS)
            return ResError(res, { msg: lobbyRequest.status.message });
          const { sessionId } = lobbyRequest;
          return User.updateOne({ _id: id }, { sessionid: sessionId }).then(user => {
            if (!user.acknowledged)
              return ResError(res, { msg: "User session id not update!", statusCode: STATUS_422 });
            return ResSuccess(res, { url: lobbyRequest.launchURL, sessionId: req.query.session ? sessionId : "", msg: lobbyRequest.status.message });
          }).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
        }
        return ResError(res, { msg: "Provider API Error : lobby details not found!" });
      } catch (error) {
        if (error.isAxiosError)
          console.error(error.response.data);
        return ResError(res, { msg: "Provider API Error : " + error.message, statusCode: STATUS_500 });
      }
    }).catch(error => {
      return ResError(res, error);
    });
}

module.exports.balance = (req, res) => {
  return Joi.object({
    partnerKey: Joi.string().required(),
    userId: JoiObjectId.objectId().required(),
    timestamp: Joi.string().trim().required(),
    request_ip: Joi.string().trim().optional(),
    path: Joi.string().trim().optional(),
  }).validateAsync(req.body, { abortEarly: false })
    .then(async ({ partnerKey }) => {
      const { userNotValid, USER, sessionid } = req.headers;
      if (userNotValid || !USER) {
        let object_reference_id = await Supernowa.create(Object.assign(req.body, { sessionid })).then().catch(console.error);
        object_reference_id = object_reference_id._id;
        return ResponseJSON(res, INVALID_TOKEN_STATUS, Object.assign(userNotValid, { sessionid, code: INVALID_TOKEN, object_reference_id }));
      }
      if (USER.balance < 0) {
        let object_reference_id = await Supernowa.create(Object.assign(req.body, { sessionid })).then().catch(console.error);
        object_reference_id = object_reference_id._id;
        return ResponseJSON(res, INSUFFICIENT_FUNDS_STATUS, { sessionid, message: "Insufficient funds in user wallet!", code: INSUFFICIENT_FUNDS, object_reference_id });
      }
      return res.json({
        "partnerKey": partnerKey,
        "timestamp": (Date.now()).toString(),
        "userId": USER._id,
        "balance": USER.balance,
        "status": {
          "code": SSUCCESS,
          "message": ""
        }
      });
    }).catch(error => {
      if (error.hasOwnProperty("details"))
        return ResponseJSON(res, VALIDATION_ERROR_STATUS, {
          code: VALIDATION_ERROR,
          message: error.details.map(data => data.message).toString()
        });
      return ResponseJSON(res, UNKNOWN_ERROR_STATUS, { message: error.message });
    });
}

module.exports.debit = (req, res) => {
  return Joi.object({
    partnerKey: Joi.string().required(),
    user: Joi.object({
      id: JoiObjectId.objectId().required(),
      currency: Joi.string().required(),
    }).required(),
    gameData: Joi.object({
      providerCode: Joi.string().required(),
      providerTransactionId: Joi.string().required(),
      gameCode: Joi.string().required(),
      description: Joi.string().valid("bet", "cancel").required(),
      providerRoundId: Joi.string().required(),
    }).required(),
    transactionData: Joi.object({
      id: Joi.string().required(),
      amount: Joi.number().min(0).required(),
      referenceId: Joi.string().allow("").required(),
    }).required(),
    timestamp: Joi.string().trim().required(),
    request_ip: Joi.string().trim().optional(),
    path: Joi.string().trim().optional(),
  }).validateAsync(req.body, { abortEarly: false })
    .then(async ({ partnerKey, user, gameData, transactionData }) => {
      const { sessionid } = req.headers;
      let checkDuplicateEntry = await supernowaService.checkDuplicateEntry({ user, gameData, transactionData });
      if (checkDuplicateEntry.statusCode == SUCCESS)
        return ResponseJSON(res, VALIDATION_ERROR_STATUS, { sessionid, message: "Entry not valid or already processed!", code: VALIDATION_ERROR });
      const { description } = gameData;
      let object_reference_id = await Supernowa.create(Object.assign(req.body, { sessionid, request_type: description })).then().catch(console.error);
      let { _id } = object_reference_id;
      object_reference_id = _id;
      const { userNotValid, USER } = req.headers;
      if (userNotValid || !USER)
        return ResponseJSON(res, INVALID_TOKEN_STATUS, Object.assign(userNotValid, { sessionid, code: INVALID_TOKEN, object_reference_id }));
      let balance = 0, ifUserRefundIsPending;
      if (description == "bet")
        balance = -(transactionData.amount);
      else if (description == "cancel") {
        ifUserRefundIsPending = await Supernowa.findOne({ "transactionData.id": transactionData.referenceId, refund_status: { $ne: 1 } }).select("_id transactionData.amount");
        if (!ifUserRefundIsPending)
          return ResponseJSON(res, VALIDATION_ERROR_STATUS, { sessionid, message: "Refund not possible!", code: VALIDATION_ERROR, object_reference_id });
        balance = ifUserRefundIsPending.transactionData.amount;
      } else
        return ResponseJSON(res, UNKNOWN_ERROR_STATUS, { sessionid, object_reference_id });
      let updatedUser = await updateUser({ _id: ObjectId(user.id) }, { '$inc': { balance } });
      if (updatedUser.status) {
        if (description == "cancel" && ifUserRefundIsPending) {
          ifUserRefundIsPending.refund_status = 1;
          ifUserRefundIsPending.save();
        }
        return res.json(ResponseSnowaJSON({
          object_reference_id,
          sessionid,
          "partnerKey": partnerKey,
          "timestamp": (Date.now()).toString(),
          "userId": updatedUser.data._id,
          "balance": updatedUser.data.balance,
          "status": {
            "code": SSUCCESS,
            "message": ""
          }
        }));
      } else
        return ResponseJSON(res, UNKNOWN_ERROR_STATUS, { sessionid, message: updatedUser.data, object_reference_id });
    }).catch(error => {
      if (error.hasOwnProperty("details"))
        return ResponseJSON(res, VALIDATION_ERROR_STATUS, {
          code: VALIDATION_ERROR,
          message: error.details.map(data => data.message).toString()
        });
      return ResponseJSON(res, UNKNOWN_ERROR_STATUS, { message: error.message });
    });
}

module.exports.credit = (req, res) => {
  return Joi.object({
    partnerKey: Joi.string().required(),
    user: Joi.object({
      id: JoiObjectId.objectId().required(),
      currency: Joi.string().required(),
    }).required(),
    gameData: Joi.object({
      providerCode: Joi.string().required(),
      providerTransactionId: Joi.string().required(),
      gameCode: Joi.string().required(),
      description: Joi.string().valid("win", "lose", "cancel", "bet").required(),
      providerRoundId: Joi.string().required(),
    }).required(),
    transactionData: Joi.object({
      id: Joi.string().required(),
      amount: Joi.number().min(0).required(),
      referenceId: Joi.string().allow("").required(),
    }).required(),
    timestamp: Joi.string().trim().required(),
    request_ip: Joi.string().trim().optional(),
    path: Joi.string().trim().optional(),
  }).validateAsync(req.body, { abortEarly: false })
    .then(async ({ partnerKey, user, gameData, transactionData }) => {
      const { sessionid } = req.headers;
      let checkDuplicateEntry = await supernowaService.checkDuplicateEntry({ user, gameData, transactionData });
      if (checkDuplicateEntry.statusCode == SUCCESS)
        return ResponseJSON(res, VALIDATION_ERROR_STATUS, { sessionid, message: "Entry not valid or already processed!", code: VALIDATION_ERROR });
      const { description } = gameData;
      let object_reference_id = await Supernowa.create(Object.assign(req.body, { sessionid, request_type: description })).then().catch(console.error);
      let { _id } = object_reference_id;
      object_reference_id = _id;
      const { userNotValid, USER } = req.headers;
      if (userNotValid || !USER)
        return ResponseJSON(res, INVALID_TOKEN_STATUS, Object.assign(userNotValid, { sessionid, code: INVALID_TOKEN, object_reference_id }));
      let supernowaCrDrWinLoss;
      try {
        let winner, stacks = 0;
        if (["SN"].includes(gameData.providerCode)) {
          let betLists = await supernowaService.getBetsFromSupernowaAPI({ USER_BETS_URL, partnerKey, user, gameData });
          if (betLists.statusCode != SUCCESS)
            winner = description;
          else {
            stacks = betLists.data.betList.reduce((sum, bet) => {
              if (["Win", "Loss"].includes(bet.betResult))
                sum += bet.stake;
              return sum;
            }, 0);
            winner = betLists.data.winner;
          }
        } else
          winner = description;
        gameData.winner = winner;
        gameData.stacks = stacks;
        if (description == "bet") {
          await SupernowaCrDrWinLoss.findOneAndUpdate(
            {
              "user.id": user.id, "gameData.providerCode": gameData.providerCode, "gameData.gameCode": gameData.gameCode,
              "gameData.providerRoundId": gameData.providerRoundId, "gameData.description": gameData.description
            },
            {
              user, gameData, "$push": {
                transactionData: {
                  id: transactionData.id, amount: transactionData.amount, referenceId: transactionData.referenceId,
                  providerTransactionId: gameData.providerTransactionId
                }
              }, requestType: "credit", object_reference_id
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
        } else {
          if (["win", "lose"].includes(description)) {
            let getBetAmount = await supernowaService.getBetAmount({ partnerKey, user, gameData });
            if (getBetAmount.statusCode == SUCCESS)
              transactionData.amount = transactionData.amount - getBetAmount.data.getBetAmount;
            if (description == "win")
              await updateUser({ _id: ObjectId(user.id) }, { '$inc': { balance: getBetAmount.data.getBetAmount } });
          }
          supernowaCrDrWinLoss = await SupernowaCrDrWinLoss.create({ user, gameData, transactionData, requestType: "credit", object_reference_id });
        }
        if (["win", "lose"].includes(description))
          await SupernowaGameData.create(gameData);
      } catch (error) {
        if (error.message.includes("E11000 duplicate key error collection:"))
          Supernowa.create({ error: "Duplicate record insertion!", sessionid, object_reference_id }).then().catch(console.error);
      }
      if (description == "win")
        return res.json(ResponseSnowaJSON({
          object_reference_id,
          sessionid,
          "partnerKey": partnerKey,
          "timestamp": (Date.now()).toString(),
          "userId": USER._id,
          "balance": USER.balance + transactionData.amount,
          "status": {
            "code": SSUCCESS,
            "message": "User profit updated..."
          }
        }));
      else if (description == "lose") {
        let getBets = await supernowaService.getUserFinalLoss({ partnerKey, user, gameData });
        if (getBets.statusCode == SUCCESS)
          if (supernowaCrDrWinLoss)
            await SupernowaCrDrWinLoss.updateOne({ _id: supernowaCrDrWinLoss._id }, { "transactionData.amount": -(getBets.data.agent_pl) });
        let updatedUser = await updateUser({ _id: ObjectId(user.id) }, { '$inc': { balance: getBets.data.agent_pl } });
        if (updatedUser.status)
          return res.json(ResponseSnowaJSON({
            object_reference_id,
            sessionid,
            "partnerKey": partnerKey,
            "timestamp": (Date.now()).toString(),
            "userId": USER._id,
            "balance": USER.balance,
            "status": {
              "code": SSUCCESS,
              "message": "User loss updated..."
            }
          }));
        return ResponseJSON(res, UNKNOWN_ERROR_STATUS);
      } else if (["cancel", "bet"].includes(description)) {
        let balance = transactionData.amount, ifUserRefundIsPending;
        if (description == "cancel") {
          ifUserRefundIsPending = await Supernowa.findOne({ "transactionData.id": transactionData.referenceId, refund_status: { "$ne": 1 } }).select("_id");
          if (!ifUserRefundIsPending)
            return ResponseJSON(res, VALIDATION_ERROR_STATUS, { sessionid, message: "Refund not possible!", code: VALIDATION_ERROR, object_reference_id });
          balance = -(balance);
        }
        let updatedUser = await updateUser({ _id: ObjectId(user.id) }, { '$inc': { balance } });
        if (updatedUser.status) {
          if (description == "cancel" && ifUserRefundIsPending) {
            ifUserRefundIsPending.refund_status = 1;
            ifUserRefundIsPending.save();
          }
          return res.json(ResponseSnowaJSON({
            object_reference_id,
            sessionid,
            "partnerKey": partnerKey,
            "timestamp": (Date.now()).toString(),
            "userId": updatedUser.data._id,
            "balance": updatedUser.data.balance,
            "status": {
              "code": SSUCCESS,
              "message": ""
            }
          }));
        } else
          return ResponseJSON(res, UNKNOWN_ERROR_STATUS);
      } else
        return ResponseJSON(res, UNKNOWN_ERROR_STATUS);
    }).catch(error => {
      if (error.hasOwnProperty("details"))
        return ResponseJSON(res, VALIDATION_ERROR_STATUS, {
          code: VALIDATION_ERROR,
          message: error.details.map(data => data.message).toString()
        });
      return ResponseJSON(res, UNKNOWN_ERROR_STATUS, { message: error.message });
    });
}

module.exports.games = (req, res) => {
  return Joi.object({
    providerCode: Joi.string().required(),
  }).validateAsync(req.body, { abortEarly: false })
    .then(async ({ providerCode }) => {
      let GAMES = await supernowaService.getGamesList(providerCode);
      if (GAMES.length)
        return ResSuccess(res, { data: GAMES });
      return ResError(res, { msg: "No games found!" });
    }).catch(error => {
      return ResError(res, error);
    });
}

module.exports.betLists = async (req, res) => {
  return Joi.object({
    user_id: JoiObjectId.objectId().optional(),
    providerRoundId: Joi.string().required(),
    providerCode: Joi.string().default("SN").optional(),
  }).validateAsync(req.body, { abortEarly: false })
    .then(async ({ user_id, providerRoundId, providerCode }) => {
      let userId;
      if (user_id)
        userId = user_id;
      else {
        var { user_id } = req.User;
        userId = user_id;
      }
      let user = await User.findById(userId).select("point").lean();
      let partnerKey;
      if (user.point == 1)
        partnerKey = SUPERNOWA_PARTNER_KEY;
      else
        partnerKey = SUPERNOWA_POINT_PARTNER_KEY;
      let betLists = await supernowaService.getBetsFromSupernowaAPI({
        USER_BETS_URL,
        partnerKey,
        user: { id: user._id },
        gameData: { providerRoundId, providerCode }
      });
      if (betLists.statusCode == SUCCESS)
        return ResSuccess(res, { data: betLists.data.betList });
      return ResError(res, { msg: betLists.data });
    }).catch(error => {
      return ResError(res, error);
    });
}