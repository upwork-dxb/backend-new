const moment = require("moment");
const { ObjectId } = require("bson")
  , mongoose = require('mongoose')
  , getCurrentLine = require('get-current-line')
  , globalFunction = require('../../utils/globalFunction')
  , User = require("../../models/user")
  , AccountStatement = require('../../models/accountStatement')
  , Sports = require("../../models/sports")
  , QTech = require('../../models/qtech')
  , QTechCrDrWinLoss = require('../../models/qtechCrDrWinLoss')
  , QTechRoundsStatus = require('../../models/qtechRoundsStatus')
  , userService = require('../service/userService')
  , qtechQuery = require('../../admin-backend/service/qtechQuery')
  , qtechService = require('../../admin-backend/service/qtechService')
  , logger = require('../../utils/loggers')
  , { sendMessageAlertToTelegram } = require('../../admin-backend/service/messages/telegramAlertService')
  , { SUCCESS, NOT_FOUND, VALIDATION_FAILED, SERVER_ERROR, DOMAIN, UNIQUE_IDENTIFIER_KEY, QTECH_CASINO_SPORT_ID } = require("../../utils/constants")
  , { getRequesterIp, generateReferCode, exponentialToFixed, delay } = require("../../utils")
  , { QTECH_PASSKEY, QTECH_WHITELISTING_IP } = require("../../utils/qTechConfig")
  , QT = require("../../utils/qtechConstant");
const websiteSetting = require("../../models/websiteSetting");
const publisher = require("../../connections/redisConnections");
let resultResponse = globalFunction.resultResponse;

async function verifyPassKey(request, response) {
  let isValidIP = validateIp(request);
  if (isValidIP.statusCode != SUCCESS)
    return resultResponse(isValidIP.statusCode, isValidIP.data);
  const { headers } = request;
  if (!headers['pass-key'])
    return resultResponse(VALIDATION_FAILED, { status: QT.STATUS_401, data: { "code": QT.LOGIN_FAILED, "message": "The given pass-key is not provided." } });
  if (QTECH_PASSKEY != headers['pass-key'])
    return resultResponse(VALIDATION_FAILED, { status: QT.STATUS_401, data: { "code": QT.LOGIN_FAILED, "message": "The given pass-key is incorrect." } });
  return resultResponse(SUCCESS, "Pass key is valid.");
}

async function verifyWalletSessionAndUser(request, response) {
  if (!request.headers['wallet-session'])
    return resultResponse(VALIDATION_FAILED, { status: QT.STATUS_403, data: { "code": QT.ACCOUNT_BLOCKED, "message": "The given wallet-session is not provided." } });
  let verifiedUser;
  try {
    verifiedUser = await verifyUser(request, response);
    if (verifiedUser.statusCode != SUCCESS)
      return resultResponse(verifiedUser.statusCode, verifiedUser.data);
  } catch (error) {
    return resultResponse(SERVER_ERROR, { status: QT.STATUS_500, data: { "code": QT.UNKNOWN_ERROR, "message": error.message } });
  }
  return resultResponse(SUCCESS, verifiedUser.data);
}

async function verifySession(request, response) {
  let qtHandShake = await verifyPassKey(request, response);
  if (qtHandShake.statusCode != SUCCESS)
    return resultResponse(qtHandShake.statusCode, qtHandShake.data);
  qtHandShake = await verifyWalletSessionAndUser(request, response);
  return resultResponse(qtHandShake.statusCode, qtHandShake.data);
}

function verifyUser(request, res) {
  if (!request.headers['wallet-session'])
    return resultResponse(VALIDATION_FAILED, { status: QT.STATUS_400, data: { "code": QT.INVALID_TOKEN, "message": "The given wallet session token has expired." } });
  return getUser(request)
    .then(result => resultResponse(result.statusCode, result.data))
    .catch(error => resultResponse(VALIDATION_FAILED, { status: QT.STATUS_400, data: { "code": QT.INVALID_TOKEN, "message": error.message } }));
}

function getUser(request) {
  if (request.path.includes("/accounts/") && request.path.includes("/balance"))
    request.headers['wallet-session'] = request.params.playerId;
  const user_id = request.headers['wallet-session'];
  return userService.getUserDetails({ _id: ObjectId(user_id) },
    ["-_id", "balance", "qtech_pending_balance", "user_name", "parent_level_ids", "self_lock_user", "parent_lock_user", "self_close_account", "parent_close_account", "self_lock_betting", "parent_lock_betting", "domain_name"]
  ).then(async (user) => {
    if (user.statusCode == SUCCESS) {
      user = user.data;

      let chechPath = false;
      if ("/transactions/".includes(request.path))
        if (request.body.txnType == QT.DEBIT)
          chechPath = true;
      if (request.path.includes("/session"))
        chechPath = true;

      if (chechPath) {

        if (Math.max(user.self_lock_betting, user.parent_lock_betting) == 1)
          return resultResponse(VALIDATION_FAILED, { status: QT.STATUS_403, data: { "code": QT.ACCOUNT_BLOCKED, "message": "Your betting is locked!" } });

        if (Math.max(user.self_lock_user, user.parent_lock_user) == 1)
          return resultResponse(VALIDATION_FAILED, { status: QT.STATUS_403, data: { "code": QT.ACCOUNT_BLOCKED, "message": "Your account is locked!" } });

        if (Math.max(user.self_close_account, user.parent_close_account) == 1)
          return resultResponse(VALIDATION_FAILED, { status: QT.STATUS_403, data: { "code": QT.ACCOUNT_BLOCKED, "message": "Your account is closed, Contact your Upline!" } });

        let blockedUsers = user.parent_level_ids.map(data => (data.user_id).toString());
        blockedUsers.push(user_id.toString());
        let event = await Sports.findOne({ sport_id: QTECH_CASINO_SPORT_ID }).select("-_id self_blocked parent_blocked is_active is_visible").lean().exec();

        if (!event || event?.is_active == 0 || event?.is_visible == false) {
          return resultResponse(VALIDATION_FAILED, { status: QT.STATUS_403, data: { "code": QT.ACCOUNT_BLOCKED, "message": `Game is locked. Please Contact Upper Level. SA` } });
        }

        const self_blocked = blockedUsers.some(element => event.self_blocked.includes(element));
        const parent_blocked = blockedUsers.some(element => event.parent_blocked.includes(element));

        if ((event.self_blocked.length && self_blocked) || (event.parent_blocked.length && parent_blocked)) {
          return resultResponse(VALIDATION_FAILED, { status: QT.STATUS_403, data: { "code": QT.ACCOUNT_BLOCKED, "message": `Game is locked. Please Contact Upper Level.` } });
        }

      }

      if (request.path == '/transactions/' && request.body.txnType == QT.CREDIT) {
        const { roundId } = request.body;

        // const diffUnit = 'minute';
        const diffUnit = 'hour';
        const diffValue = 1;
        const currentTime = moment();

        const query = {
          roundId,
          isProcessed: 0,
          txnType: QT.DEBIT,
          createdAt: {
            $gte: currentTime.subtract(diffValue, diffUnit).toDate()
          }
        }

        const isEntryExistInCrDr = await QTechCrDrWinLoss
          .findOne(query, '_id')
          .sort({ createdAt: -1 })
          .lean().exec();

        if (!isEntryExistInCrDr) {
          return resultResponse(VALIDATION_FAILED, { status: QT.STATUS_400, data: { "code": QT.REQUEST_DECLINED, "message": "Entry not found for CR DR!" } });
        }
      }

      return getConvertedBalance((Math.round((user.balance + (user.qtech_pending_balance || 0) + Number.EPSILON) * 100) / 100), user.domain_name)
        .then(async balance => {
          let currency = QT.DEFAULT_CURRENCY;
          try {
            if (request.path.includes("/balance") || request.path.includes("/session")) {
              if (request?.body?.currency) {
                currency = request.body.currency;
              } else {
                const { gameId } = request?.query || {};
                if (gameId) {
                  let [providerCode] = gameId.replace(/-/g, " ").replace(/[^a-zA-Z0-9 ]/g, "").split(" ");
                  let getProviderCurrency = await Sports.findOne({ providerCode }).select("-_id currency").lean().exec();
                  if (getProviderCurrency) {
                    getProviderCurrency = getProviderCurrency?.currency;
                    if (getProviderCurrency) {
                      currency = getProviderCurrency;
                    }
                  }
                }
              }
            }
          } catch (error) { }
          return resultResponse(SUCCESS, { balance, user_name: user.user_name, currency });
        }).catch(error => {
          return resultResponse(VALIDATION_FAILED, { status: QT.STATUS_500, data: { "code": QT.UNKNOWN_ERROR, "message": error.message } })
        });

    } else if (user.statusCode == NOT_FOUND)
      return resultResponse(VALIDATION_FAILED, { status: QT.STATUS_400, data: { "code": QT.INVALID_TOKEN, "message": user.data } });
    else
      return resultResponse(VALIDATION_FAILED, { status: QT.STATUS_500, data: { "code": QT.UNKNOWN_ERROR, "message": user.data } });
  }).catch(error => resultResponse(VALIDATION_FAILED, { status: QT.STATUS_500, data: { "code": QT.UNKNOWN_ERROR, "message": error.message } }));
}

async function transactions(request) {
  const { body, QTbody, object_reference_id } = request;
  let result = resultResponse(NOT_FOUND, { status: QT.STATUS_400, data: { "code": QT.REQUEST_DECLINED, "message": "request could not be processed!" } });
  if (body.txnType == QT.DEBIT) {
    let getUserBalance = await userService.getUserDetails(
      { _id: ObjectId(body.playerId), user_type_id: 1, },
      ["-_id", "balance"]
    );
    if (getUserBalance.statusCode == SUCCESS) {
      getUserBalance = getUserBalance.data.balance;
      if (getUserBalance < body.amount)
        return resultResponse(VALIDATION_FAILED, { status: QT.STATUS_400, data: { "code": QT.INSUFFICIENT_FUNDS, "message": "Amount is higher than the player's balance!" } });
      if (getUserBalance <= 0)
        return resultResponse(VALIDATION_FAILED, { status: QT.STATUS_403, data: { "code": QT.INSUFFICIENT_FUNDS, "message": "Insufficient funds in user wallet!" } });
    } else {
      return resultResponse(result.statusCode, { status: result.data.status, data: result.data.data });
    }

    // debit the amount from user balance.
    if (body.amount != 0 && body.completed != "true") {
      request.body.operationAmount = body.amount;
      result = await debit(request);
    }

  } else if (body.txnType == QT.CREDIT) {
    // credit the amount into user balance.
    if (body.amount != 0 && body.completed != "true") {
      request.body.operationAmount = 0;
      result = await credit(request);
    }
  }


  if (body.completed == "true") {

    await delay(10 * 1000); // 10 Sec Sleep;

    const [amount, liabilityAmount] = await Promise.all([
      getPreviousAmount(request),
      getPreviousAmount(request, false),
    ]);

    request.body.operationAmount = body.amount + amount;
    request.body.liabilityAmount = liabilityAmount;

    if (body.txnType == QT.DEBIT) {
      // debit the amount from user balance.
      result = await debit(request);
    } else if (body.txnType == QT.CREDIT) {
      // credit the amount into user balance.
      result = await credit(request);
    }

    await declareResultV1(request);

    let getUserBalance = await userService.getUserDetails(
      { _id: ObjectId(body.playerId) },
      ["-_id", "balance", 'domain_name', 'qtech_pending_balance']
    );

    if (getUserBalance.statusCode == SUCCESS) {
      getUserBalance = await getConvertedBalance(
        (Math.round((getUserBalance.data.balance + (getUserBalance.data.qtech_pending_balance || 0) + Number.EPSILON) * 100) / 100), getUserBalance.data.domain_name);
    }

    return resultResponse(SUCCESS, { "balance": (Math.round((getUserBalance + Number.EPSILON) * 100) / 100), "referenceId": object_reference_id });
  }

  if (body.amount == 0) {
    return resultResponse(SUCCESS, { "balance": QTbody.balance, "referenceId": object_reference_id });
  }

  if (result.statusCode == SUCCESS) {
    return resultResponse(SUCCESS, { "balance": result.data.balance, "referenceId": object_reference_id });
  } else
    return resultResponse(result.statusCode, { status: result.data.status, data: result.data.data });
}

async function rollback(request) {
  const { body, QTbody, object_reference_id } = request;
  return QTechCrDrWinLoss.findOne({ txnId: body.betId }).select("_id amount")
    .then(async data => {
      if (data) {
        const { roundId, gameId, gameRoundId, gameName, playerId } = body;
        let { amount } = data;
        let liability = amount < 0 ? -amount : 0;
        let pendingBalance = amount >= 0 ? -amount : 0;

        amount = -(amount);

        let resultStatus = await CrDr(playerId, {
          balance: amount,
          liability,
          pendingBalance,
        });

        if (resultStatus.statusCode != SUCCESS) {
          createLogs({ path: request.path, roundId, gameId, gameRoundId, gameName, playerId, error: "REFUND_NOT_POSSIBLE: " + resultStatus.data.data.message }).then();
          return resultResponse(resultStatus.statusCode, resultStatus.data);
        }
        data.message = `Refund initiated of amount(${Math.abs(amount)})`;
        data.isProcessed = 2;
        data.save();
        return resultResponse(SUCCESS, { "balance": resultStatus.data.balance, "referenceId": object_reference_id });
      }
      return resultResponse(SUCCESS, { "balance": QTbody.balance });
    }).catch(error => resultResponse(VALIDATION_FAILED, { status: QT.STATUS_500, data: { "code": QT.UNKNOWN_ERROR, "message": error.message } }));
}

async function debit(request) {
  return await updateUserBalance(request);
}

async function credit(request) {
  return await updateUserBalance(request);
}

async function updateUserBalance(request) {
  const { body } = request;
  const { txnType, playerId, completed, roundId } = body;
  let { amount, operationAmount, liabilityAmount } = body;
  let isCredit = txnType == QT.CREDIT;
  let pendingBalance = 0;

  amount = isCredit ? amount : -amount;
  operationAmount = isCredit ? operationAmount : -operationAmount;

  if (!operationAmount && operationAmount != 0) {
    operationAmount = amount;
  }
  // roundId to prevent Unnecessary Update in Rewards
  if (roundId) {
    if (completed != 'true') {
      liabilityAmount = isCredit ? 0 : operationAmount;
      if (isCredit) {
        pendingBalance = amount;
      }
    } else {
      liabilityAmount = -liabilityAmount;
      if (isCredit) {
        pendingBalance = -(operationAmount - amount);
      }
    }
  }


  let result = await CrDr(playerId, {
    balance: operationAmount,
    liability: liabilityAmount,
    pendingBalance
  });

  if (result.statusCode == SUCCESS) {
    request.body.amount = amount;
    request.QTbody = result.data.user_name;
    let resultCrDr = await saveCrDr(request);
    if (request.path == "/bonus/rewards")
      await generateRewardStatement(request);
    return resultCrDr.statusCode == SUCCESS ? result : resultCrDr;
  } else
    return result;
}

async function getPreviousAmount(request, isCredit = true) {
  const { body } = request;
  const { playerId, roundId } = body;
  const query = [
    {
      $match: {
        userId: ObjectId(playerId),
        roundId,
        txnType: isCredit ? QT.CREDIT : QT.DEBIT,
        isProcessed: 0
      }
    },
    { $group: { _id: null, balance: { $sum: "$amount" } } }
  ];
  const response = await QTechCrDrWinLoss.aggregate(query);
  const balance = response[0]?.balance || 0;
  return balance;
}

async function CrDr(user_id, { balance, liability, pendingBalance }) {

  balance = balance || 0;
  liability = liability || 0;
  pendingBalance = pendingBalance || 0;

  var user = await User.findOne({ _id: ObjectId(user_id) }, { user_name: 1, balance: 1, liability: 1, qtech_pending_balance: 1, }).lean();

  const LOG_REF_CODE = generateReferCode();

  logger.BalExp(`
    --PRE LOG--
    FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
    FUNCTION: CrDr qtech
    LOG_REF_CODE: ${LOG_REF_CODE}
    DETAILS: [${user.user_name}(${user._id})] old_balance: ${user.balance} - old_liability: ${user.liability} - old_qtech_pending_balance: ${user.qtech_pending_balance} - cal_amount: ${balance}
  `);

  let updatedUser = await updateUserV1({ _id: ObjectId(user_id) },
    {
      '$inc': {
        balance,
        liability,
        qtech_pending_balance: pendingBalance
      }
    });

  var user = await User.findOne({ _id: ObjectId(user_id) }, { user_name: 1, balance: 1, liability: 1, domain_name: 1, qtech_pending_balance: 1, }).lean();

  logger.BalExp(`
    --POST LOG--
    FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
    FUNCTION: CrDr qtech
    LOG_REF_CODE: ${LOG_REF_CODE}
    DETAILS: [${user.user_name}(${user._id})] new_balance: ${user.balance} - new_liability: ${user.liability} - new_qtech_pending_balance: ${user.qtech_pending_balance}
  `);

  if ((exponentialToFixed(user.liability) > 0) ? true : (exponentialToFixed(user.balance) < 0) ? true : false) {
    sendMessageAlertToTelegram({ message: `\nLOG_REF_CODE: ${LOG_REF_CODE}\nUSER: ${user.user_name}(${user._id}) : balance ${user.balance}, liability ${user.liability}, qtech_pending_balance: ${user.qtech_pending_balance}` });
  }

  if (updatedUser.status) {
    let updatedBalance = await getConvertedBalance(
      (Math.round((updatedUser.data.balance + (updatedUser.data.qtech_pending_balance || 0) + Number.EPSILON) * 100) / 100), user.domain_name);

    return resultResponse(SUCCESS, { "balance": updatedBalance, user_name: updatedUser.data.user_name, convertedAmount: balance });
  } else
    return resultResponse(VALIDATION_FAILED, { status: QT.STATUS_400, data: { "code": QT.REQUEST_DECLINED, "message": updatedUser.data } });
}

async function updateUser(user, update) {
  let updatedUser = { status: false, data: "User balance not updated!" };
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async (session) => {
      updatedUser = {
        status: true,
        data: await User.findOneAndUpdate(
          user,
          update,
          { new: true }
        ).session(session).select("balance user_name").lean()
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

async function updateUserV1(user, update) {
  let updatedUser = { status: false, data: "User balance not updated!" };
  try {
    updatedUser = {
      status: true,
      data: await User.findOneAndUpdate(
        user,
        update,
        { new: true }
      ).select("balance qtech_pending_balance user_name").lean()
    };
  } catch (error) {
    updatedUser = {
      status: false,
      data: error.message
    };
  }
  return updatedUser;
}

async function declareResult(request) {
  try {
    let userCountByRound = await QTech.aggregate(qtechQuery.getTotalUsersCountByGameRound(request));
    userCountByRound = userCountByRound.length;
    if (userCountByRound) {
      const { roundId, gameId, gameRoundId, gameName, providerCode, playerId } = request.body;
      let roundObject = await QTechRoundsStatus.findOneAndUpdate({ roundId }, { roundId, gameId, gameRoundId, gameName, providerCode, "$push": { playerIds: playerId } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).select("_id");
      let userWinLoss = await QTechCrDrWinLoss.aggregate(qtechQuery.userProfitLossRoundWise(request));
      if (userWinLoss.length) {
        if (userCountByRound == userWinLoss.length) {
          let getUserUpdatedStatus = await updateUsersBalance(userWinLoss);
          if (!getUserUpdatedStatus.status) {
            await QTechCrDrWinLoss.updateMany({ roundId }, { '$set': { error: getUserUpdatedStatus.data, isProcessed: 0 } });
            await QTechRoundsStatus.updateOne({ _id: roundObject._id }, { error: getUserUpdatedStatus.data, '$inc': { retryCount: 1 } });
          } else {
            let resultStatus = await qtechService.qTechResultDeclare({ roundId });
            let log = { path: request.path, roundId, gameId, gameRoundId, gameName };
            if (resultStatus.statusCode == SUCCESS)
              log["message"] = resultStatus.data;
            else
              log["error"] = resultStatus.data;
            createLogs(log).then();
            return resultResponse(resultStatus.statusCode, resultStatus.data);
          }
        }
        return resultResponse(SUCCESS, "");
      }
    }
  } catch (error) {
    return resultResponse(VALIDATION_FAILED, { status: QT.STATUS_400, data: { "code": QT.REQUEST_DECLINED, "message": error.message } });
  }
}

async function declareResultV1(request) {
  let { roundId, gameId, gameRoundId, gameName, providerCode, playerId } = request.body;
  let log = { path: request.path, roundId, gameId, gameRoundId, gameName };
  try {
    providerCode = providerCode ? providerCode : "QT";
    gameId = gameId ? gameId : "QT";
    gameName = gameName ? gameName : QT.QTECH;
    gameRoundId = gameRoundId ? gameRoundId : "N/A";
    await QTechRoundsStatus.create({ roundId, gameId, gameRoundId, gameName, providerCode, playerId });
    let resultStatus = await qtechService.qTechResultDeclareV1({ roundId, playerId });
    if (resultStatus.statusCode == SUCCESS)
      log["message"] = resultStatus.data;
    else
      log["error"] = resultStatus.data;
    createLogs(log).then();
    return resultResponse(resultStatus.statusCode, resultStatus.data);
  } catch (error) {
    log["error"] = error.message;
    createLogs(log).then();
    return resultResponse(VALIDATION_FAILED, { status: QT.STATUS_400, data: { "code": QT.REQUEST_DECLINED, "message": error.message } });
  }
}

async function updateUsersBalance(users) {
  let updatedUser = { status: false, data: "User balance not updated!" };
  if (users.length) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async session => {
        users = users.map(item => ({
          'updateOne': {
            'filter': { '_id': item._id },
            'update': { '$inc': { balance: -(item.balance) } }
          }
        }));
        await User.bulkWrite(users, { session, ordered: false });
      });
      updatedUser = { status: true };
    } catch (error) {
      updatedUser = {
        status: false,
        data: error.message
      };
    } finally {
      session.endSession();
    }
    return updatedUser;
  } else
    return updatedUser;
}

async function generateRewardStatement(request) {
  const { body } = request;
  let getUserDetails = await userService.getUserDetails({ _id: ObjectId(body.playerId) }, ["-_id", "parent_id", "parent_user_name", "user_type_id", "user_name", "name", "point", "domain_name", "balance", "parent_level_ids"]);
  if (getUserDetails.statusCode == SUCCESS) {
    getUserDetails = getUserDetails.data;
    let rewardAccountStatement = {
      ...getUserDetails,
      user_id: ObjectId(body.playerId),
      agents: getUserDetails.parent_level_ids.map(data => {
        return {
          user_id: data.user_id,
          user_type_id: data.user_type_id
        }
      }),
      description: `Bonus Reward - (${body.rewardTitle} - [${body.rewardType} - id ${body.txnId}])`,
      remark: `Bonus Reward - (${body.rewardTitle} - [${body.rewardType} - id ${body.txnId}])`,
      statement_type: 1,
      amount: body.amount,
      available_balance: getUserDetails.balance,
      sport_name: QT.QTECH,
      type: 1,
    };
    try {
      await AccountStatement.create(rewardAccountStatement);
    } catch (error) { console.error(error); }
  }
}

async function resetUserAmount(request) {
  if (request.path.includes("/bonus/rewards"))
    request.body.txnType = QT.CREDIT;
  if (request.path == "/transactions/rollback")
    return await rollback(request);
  else if (request.path == "/transactions/" && request.body.txnType == QT.DEBIT)
    return await verifyUser(request);
  else
    return await credit(request);
}

function validateIp(req) {
  let request_ip = getRequesterIp(req);
  if (QTECH_WHITELISTING_IP.length)
    if (!QTECH_WHITELISTING_IP.includes(request_ip))
      return resultResponse(VALIDATION_FAILED, { status: QT.STATUS_500, data: { "code": QT.UNKNOWN_ERROR, "message": "Invalid requested IP address!" } });
  return resultResponse(SUCCESS, {});
}

async function checkDuplicateEntry(params) {
  const { txnId } = params;
  return QTech.findOne({ txnId }).select("_id")
    .then(data => QTech.findOne({ object_reference_id: data._id }).select("-_id response").lean()
      .then(result => resultResponse(
        (data && result) ? SUCCESS : NOT_FOUND,
        (data && result) ? result.response : "Entry not valid or already processed!"
      )).catch(error => resultResponse(SERVER_ERROR, error.message))
    ).catch(error => resultResponse(SERVER_ERROR, error.message));
}

let createLogs = (params) => QTech.create(params).then(data => data._id).catch(console.error);

let updateLogs = (_id, data) => QTech.updateOne({ _id }, data).then().catch(console.error);

let saveCrDr = (request) => QTechCrDrWinLoss
  .create({
    userId: request.body.playerId,
    userName: request.QTbody.user_name,
    ...request.body,
    parent_level_ids: request?.User?.parent_level_ids
  })
  .then(() => resultResponse(SUCCESS, ""))
  .catch(error => resultResponse(SERVER_ERROR, { status: QT.STATUS_500, data: { "code": QT.UNKNOWN_ERROR, "message": error.message } }));

function createRequestObject(req) {
  let request = {
    headers: {
      'host': req.headers['host'],
      'x-real-ip': req.headers['x-real-ip'],
      'pass-key': req.headers['pass-key'],
      'wallet-session': req.headers['wallet-session'],
      'user-agent': req.headers['user-agent'],
      'postman-token': req.headers['postman-token'],
      'origin': req.headers['origin'],
    }
  };
  if (Object.keys(req.body).length)
    request["body"] = req.body;
  if (Object.keys(req.params).length)
    request["params"] = req.params;
  if (Object.keys(req.query).length)
    request["query"] = req.query;
  const userId = req.params.playerId ? req.params.playerId : req.body.playerId ? req.body.playerId : undefined;
  let log = { userId, request_ip: req.ip_data, path: req.path, ...req.body, request };
  if (req.body.hasOwnProperty("clientRoundId")) {
    let gameRoundId = userId ? (req.body.clientRoundId).replace(`-${userId}`, "") : undefined;
    if (gameRoundId) {
      log["gameRoundId"] = gameRoundId;
      req.body.gameRoundId = gameRoundId;
    }
    try {
      if (req.headers['wallet-session']) {
        let gameId = (req.body.gameId).replace(/-/g, " ").replace(/[^a-zA-Z0-9 ]/g, "");
        log["gameName"] = gameId;
        log["providerCode"] = gameId.split(" ")[0];
        req.body.gameName = log["gameName"];
        req.body.providerCode = log["providerCode"];
      }
    } catch (error) { console.error(error) }
  }
  return createLogs(log).then().catch(console.error);
}

async function getConvertedBalance(balance, domain_name, isDevide = true) {
  const KEY = DOMAIN + domain_name + UNIQUE_IDENTIFIER_KEY;

  let website = await publisher.get(KEY);
  if (website) {
    website = JSON.parse(website);
  } else {
    website = await websiteSetting.findOne({ domain_name }).lean();
    if (!website) {
      return balance;
    }
    await publisher.set(KEY, JSON.stringify(website));
  }

  if (website) {
    const rate = website?.casino_conversion_rate || 1;
    balance =
      Math.round(
        ((isDevide ? balance / rate : balance * rate) + Number.EPSILON) * 100,
      ) / 100;
  }

  return balance;
}

module.exports = {
  createLogs, updateLogs, createRequestObject,
  getUser, resetUserAmount, verifyPassKey, verifyWalletSessionAndUser,
  verifySession, checkDuplicateEntry, transactions, rollback,
  getConvertedBalance,
}