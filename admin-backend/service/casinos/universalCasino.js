const axios = require('axios')
  , { ObjectId } = require("bson")
  , _ = require("lodash")
  , moment = require('moment')
  , path = require('path')
  , fs = require('fs').promises
  , fsSync = require('fs')
  , mongoose = require('mongoose')
  , getCurrentLine = require('get-current-line')
  , Sport = require('../../../models/sports')
  , Series = require('../../../models/series')
  , Match = require('../../../models/match')
  , Market = require('../../../models/market')
  , User = require("../../../models/user")
  , Partnerships = require("../../../models/partnerships")
  , UserProfitLoss = require("../../../models/userProfitLoss")
  , UniversalCasinoLogs = require('../../../models/casinos/universalCasinoLogs')
  , UniversalCasinoBets = require('../../../models/casinos/universalCasinoBets')
  , UniversalCasinoExposures = require('../../../models/casinos/universalCasinoExposures')
  , UniversalCasinoCalculatedExposures = require('../../../models/casinos/universalCasinoCalculatedExposures')
  , UniversalCasinoRoundsStatus = require('../../../models/casinos/universalCasinoRoundsStatus')
  , betService = require('../betService')
  , universalCasinoQuery = require('./universalCasinoQuery')
  , writeFile = require('util').promisify(require('fs').writeFileSync)
  , logger = require('../../../utils/loggers')
  , TOKEN_FILE_PATH = path.normalize(path.resolve(__dirname, "../../../utils/casinos/universalCasino.token"))
  , { delay, generateReferCode, exponentialToFixed, fixFloatingPoint } = require('../../../utils')
  , { sendMessageAlertToTelegram } = require('../messages/telegramAlertService')
  , { resultResponse } = require('../../../utils/globalFunction')
  , { SUCCESS, SERVER_ERROR, NOT_FOUND, ALREADY_EXISTS, UNIVERSE_CASINO_SPORT_ID, LIVE_GAME_SPORT_ID } = require("../../../utils/constants")
  , { UNIVERSE_CASINO, STATUS_200, STATUS_422 } = require("../../../utils/casinos/universalCasinoConstants")
  , {
    UNIVERSAL_CASINO_USERNAME, UNIVERSAL_CASINO_PASSWORD, UNIVERSAL_CASINO_APPKEY,
    UNIVERSAL_CASINO_AUTHENTICATE_URL, UNIVERSAL_CASINO_LAUNCH_URL, UNIVERSAL_CASINO_RESULT_API_URL
  } = require("../../../utils/casinos/universalCasinoConfig");

const MAX_RETRY_LIMIT = 15;

const RESULT_NOT_FOUND = "RESULT_NOT_FOUND";

const sport_id = UNIVERSE_CASINO_SPORT_ID, sport_name = UNIVERSE_CASINO;

let defaultLimites = {
  market_min_stack: 100, market_max_stack: 10000, market_min_odds_rate: 1, market_max_odds_rate: 20
};

let sportData = {
  name: sport_name, sport_id, is_live_sport: 1, order_by: 6, ...defaultLimites
};

let saveToken = (content) => writeFile(TOKEN_FILE_PATH, content, 'utf8');

let readAccessToken = async () => {

  try {

    if (!fsSync.existsSync(TOKEN_FILE_PATH)) {
      return resultResponse(NOT_FOUND, "universalCasino.token file not exists!");
    }

    if (!fsSync.statSync(TOKEN_FILE_PATH).size) {
      return resultResponse(NOT_FOUND, "universalCasino.token file content is empty!");
    }

    let tokenDetails = await fs.readFile(TOKEN_FILE_PATH, 'utf8');

    return resultResponse(SUCCESS, tokenDetails);

  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }

};

let getAccessToken = async () => { let tokenDetails = await readAccessToken(); return resultResponse(tokenDetails.statusCode, tokenDetails.data); };

async function generateAccessToken() {

  let getTokenStatus = await checkAccessTokenStatus();

  if (getTokenStatus.statusCode == SUCCESS) {
    return resultResponse(getTokenStatus.statusCode, getTokenStatus.data);
  }

  const data = {
    "userName": UNIVERSAL_CASINO_USERNAME,
    "password": UNIVERSAL_CASINO_PASSWORD,
    "appKey": UNIVERSAL_CASINO_APPKEY
  };

  let config = {
    method: 'post',
    maxBodyLength: Infinity,
    url: UNIVERSAL_CASINO_AUTHENTICATE_URL,
    data: data
  };

  try {

    let systemAuthToken = (await axios(config)).data;

    if (systemAuthToken?.data?.systemAuthToken) {

      systemAuthToken = systemAuthToken.data.systemAuthToken;

      let generatedTime = moment();
      let expiredTime = moment()
      expiredTime.add(24, 'hours');
      expiredTime.subtract(1, 'minutes');

      saveToken(`${systemAuthToken},${generatedTime},${expiredTime}`);

      return resultResponse(SUCCESS, { systemAuthToken, msg: "It will expire after 24 hours" });

    } else {

      return resultResponse(NOT_FOUND, "systemAuthToken not found!");

    }

  } catch (error) {

    if (error.response) {
      if ([STATUS_422].includes(error.response.status)) {
        return resultResponse(SERVER_ERROR, error.response.data.meta.message);
      }
    }

    return resultResponse(SERVER_ERROR, error.message);

  }
}

async function checkAccessTokenStatus() {

  try {

    let tokenDetails = await getAccessToken();

    if (tokenDetails.statusCode != SUCCESS) {

      return resultResponse(tokenDetails.statusCode, tokenDetails.data);

    }

    tokenDetails = tokenDetails.data;

    tokenDetails = checkAccessTokenIsValid(tokenDetails);

    return resultResponse(tokenDetails.statusCode, tokenDetails.data);

  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

function checkAccessTokenIsValid(tokenDetails) {

  try {

    tokenDetails = tokenDetails.split(",");
    let getTokenEndTime = new Date(tokenDetails[2]);
    let systemAuthToken = tokenDetails[0];

    if (moment().isAfter(moment(getTokenEndTime))) {
      return resultResponse(NOT_FOUND, "Token is expired please generate new one.");
    } else {

      let timeLeft = moment(moment(getTokenEndTime) - moment()).format('H[ hour(s)] m[ minute(s)] s[ second(s)]');

      return resultResponse(SUCCESS, { systemAuthToken, msg: "Token is valid, And it's valid up to: " + timeLeft });
    }

  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }

}

async function launchUrl(req) {

  const { game_id } = req.body;

  const { user_id } = req.User;

  let systemAuthToken = await generateAccessToken();

  if (systemAuthToken.statusCode != SUCCESS) {
    return resultResponse(systemAuthToken.statusCode, systemAuthToken.data);
  }

  systemAuthToken = systemAuthToken.data.systemAuthToken;

  let launchUrl = UNIVERSAL_CASINO_LAUNCH_URL
    .replace("USER_TOKEN", user_id)
    .replace("PROVIDER_AUTH_TOKEN", systemAuthToken);
  if (game_id) {
    launchUrl += "&eventId=" + game_id
  }

  return resultResponse(SUCCESS, { launchUrl });

}

async function createNewGame(req) {

  try {

    const { gameId, marketId, matchName } = req.internalData;

    let { runners } = req.body;

    const series_id = gameId, series_name = matchName;

    const match_id = gameId, match_name = matchName;

    const market_id = marketId, market_name = matchName, centralId = 0;

    runners = createRunners({ market_id, runners });

    const seriesData = {
      sport_id, sport_name, series_id, series_name, name: series_name, ...defaultLimites
    };

    const matchData = {
      sport_id, sport_name, series_id, series_name, match_id, match_name, name: match_name, runners, ...defaultLimites
    };

    const marketData = {
      sport_id, sport_name, series_id, series_name, match_id, match_name, market_id, marketId: market_id, market_name, name: market_name, centralId, runners, ...defaultLimites
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

        let isSportExists = await Sport.findOne({ sport_id }).select("_id").lean().session(session);

        if (!isSportExists) {

          await Sport.create([sportData], { session: session });

        }

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

    runners = Object.keys(runners).map((key, index) => {
      let runner = {};
      runner["market_id"] = market_id;
      runner["selectionId"] = key;
      runner["selection_id"] = runner["selectionId"];
      runner["name"] = runners[key];
      runner["selection_name"] = runner["name"];
      runner["sort_priority"] = (index + 1);
      return runner;
    });

    return runners;

  } catch (error) {
    return [];
  }

}

async function universeCasinoResultDeclare(req, retryCount = 0) {

  const session = await mongoose.startSession();
  const transactionOptions = {
    readPreference: 'primary',
    readConcern: { level: 'majority' },
    writeConcern: { w: 'majority' }
  };

  let { eventId, eventName, roundId, result } = req.body;
  let gameId = eventId;

  await UniversalCasinoRoundsStatus.deleteMany({ gameId, roundId });

  let gameData = await UniversalCasinoRoundsStatus.create({ eventId, eventName, gameId, roundId });

  let usersGameData = reducedUsersResult(result);

  const users_id = usersGameData.map(data => data.userId);

  let statusCode = SERVER_ERROR, statusMsg = "";

  try {

    await session.withTransaction(async () => {

      let generatedUserProfitLoss = await generateUserProfitLoss({ gameId, eventName, roundId }, usersGameData);

      if (generatedUserProfitLoss.statusCode != SUCCESS) {

        await UniversalCasinoRoundsStatus.updateOne({ _id: gameData._id }, { error: generatedUserProfitLoss.data });

        throw new Error(generatedUserProfitLoss.data);

      }

      const { user_profit_loss, bet_result_id, event_id } = generatedUserProfitLoss.data;

      let users_liability_balance = await UserProfitLoss.insertMany(user_profit_loss, { session, ordered: false });

      if (!users_liability_balance.length) {

        let error = "An error occurred while generating the UserProfitLoss data. Please try again!";

        await UniversalCasinoRoundsStatus.updateOne({ _id: gameData._id }, { error });

        throw new Error(error);

      }

      await betService.fn_update_balance_liability_of_users(session, users_liability_balance);

      let status = await betService.fn_update_balance_on_resultV2(session, bet_result_id, event_id, 0, "Result declared successfully...", {}, 0);

      if (status.statusCode == SUCCESS) {

        let finalRoundStatus = { "$set": { resultMessage: status.data, isProcessed: 1 } };
        if (retryCount) {
          finalRoundStatus["retryCount"] = retryCount;
        }
        await UniversalCasinoRoundsStatus.updateOne({ _id: gameData._id }, finalRoundStatus);

        UniversalCasinoBets.updateMany({ roundId, userId: { '$in': users_id } }, { "$set": { isProcessed: 1 } }).then().catch(console.error);
        UniversalCasinoExposures.updateMany({ roundId, userId: { '$in': users_id } }, { "$set": { isProcessed: 1 } }).then().catch(console.error);
        UniversalCasinoCalculatedExposures.updateMany({ roundId, userId: { '$in': users_id } }, { "$set": { isProcessed: 1 } }).then().catch(console.error);

      } else {

        await UniversalCasinoRoundsStatus.updateOne({ _id: gameData._id }, { error: status.data });

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
        await UniversalCasinoRoundsStatus.updateOne({ _id: gameData._id }, { error: errorMsg, users_id, retryCount, forCron: true });
        return resultResponse(SERVER_ERROR, errorMsg);
      }

      await delay(1000);

      let result = await universeCasinoResultDeclare(req, retryCount);
      return resultResponse(result.statusCode, result.data);

    }

    await UniversalCasinoRoundsStatus.updateOne({ _id: gameData._id }, { error: error.message });
    return resultResponse(SERVER_ERROR, "Error in result declare: " + error.message);

  } finally {
    session.endSession();
  }
}

function reducedUsersResult(result) {

  return result.reduce((prev, current) => {

    const found = prev.some(prev => prev.userId === current.userId);

    if (!found) {

      let tempObject = {
        userId: current.userId,
        pl: parseFloat(current.pl),
      };

      prev.push(tempObject);

    }

    if (found) {

      var foundIndex = prev.findIndex(x => x.userId == current.userId);

      prev[foundIndex].pl += current.pl;

    }

    return prev;

  }, []);

}

async function generateUserProfitLoss(gameData, usersGameData) {

  try {

    let { roundId, gameId, eventName } = gameData
      , user_profit_loss = [];

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

    let sport_name = UNIVERSE_CASINO
      , match_name = eventName
      , event_id = gameId
      , event_name = `${eventName} Market(s)`
      , betResultId = mongoose.Types.ObjectId();

    let getCalculatedExposureAndStack = await UniversalCasinoCalculatedExposures.aggregate(universalCasinoQuery.getCalculatedExposureAndStack({ roundId }));

    for (const userGameData of usersGameData) {

      let userData = distribution.find(o => o.user_id.toString() == userGameData.userId.toString());

      if (userData) {

        let liabilityAndStack = getCalculatedExposureAndStack.find(o => o.userId == userGameData.userId.toString());

        let agents_pl_distribution = userData.agents_pl_distribution
          , chips = userGameData.pl
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
          sport_id: UNIVERSE_CASINO_SPORT_ID,
          sport_name: sport_name,
          series_id: event_id,
          series_name: eventName,
          match_id: event_id,
          match_name,
          event_id,
          event_name,
          // winner_name: winnerSelectionName,
          bet_result_id: betResultId,
          stack: liabilityAndStack.stackSum,
          user_pl: chips,
          user_commission_pl: 0,
          max_liability: -(liabilityAndStack.calculateExposure),
          liability: -(liabilityAndStack.calculateExposure),
          description: `${sport_name} - ${match_name} - RoundId(${roundId}) ${user_winning_status == "Win" ? "Profit" : "Loss"} [ User : ${user_winning_status} ]`,
          reffered_name: `${sport_name} -> ${match_name} -> ${event_name}`,
          agents_pl_distribution
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

async function voidResult(req) {

  let { roundId, eventId: gameId } = req.body;

  let gameData = await UniversalCasinoRoundsStatus.create({ gameId, roundId });

  try {

    let getCalculatedExposures = await UniversalCasinoCalculatedExposures.aggregate(universalCasinoQuery.getCalculatedExposureAndStack({ roundId }));

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
          FUNCTION: voidResult universe casino
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
          FUNCTION: voidResult universe casino
          EVENT_DETAILS: roundId(${roundId})
          LOG_REF_CODE: ${LOG_REF_CODE}
          DETAILS: ${postUsersDetailsString}
        `);

      } catch (error) {

        error.message = `Error in users refund bulk write: ${error.message}`;
        await UniversalCasinoRoundsStatus.updateOne({ _id: gameData._id }, { error: error.message });
        return resultResponse(SERVER_ERROR, error.message);

      }

    } else {

      let error = "No user's in calculated exposure collection.";
      await UniversalCasinoRoundsStatus.updateOne({ _id: gameData._id }, { error });
      return resultResponse(NOT_FOUND, error);

    }

    let resultMessage = "Users balance and exposure are return successfully...";

    await UniversalCasinoRoundsStatus.updateOne({ _id: gameData._id }, { "$set": { resultMessage, isProcessed: 1 } });

    UniversalCasinoBets.updateMany({ roundId }, { "$set": { isProcessed: 1, betvoid: true } }).then().catch(console.error);
    UniversalCasinoExposures.updateMany({ roundId }, { "$set": { isProcessed: 1 } }).then().catch(console.error);
    UniversalCasinoCalculatedExposures.updateMany({ roundId }, { "$set": { isProcessed: 1 } }).then().catch(console.error);

    return resultResponse(SUCCESS, resultMessage);

  } catch (error) {

    await UniversalCasinoRoundsStatus.updateOne({ _id: gameData._id }, { error: error.message });
    return resultResponse(SERVER_ERROR, "Error in result void: " + error.message);

  }

}

async function retryResultDeclare(request) {

  try {

    let filter = { isProcessed: 0, error: { $exists: true }, retryCount: { $exists: true }, forCron: true };

    if (request) {

      const { objectId: _id } = request.body;

      filter = { _id: ObjectId(_id), ...filter };

    }

    let pendingRounds = await UniversalCasinoRoundsStatus
      .find(filter)
      .select("roundId eventId eventName users_id")
      .sort({ createdAt: 1 })
      .lean();


    if (!pendingRounds.length) {
      return resultResponse(NOT_FOUND, "No pending rounds yet!");
    }

    for (let item of pendingRounds) {

      await processResultDeclare(item);

    }

    return resultResponse(SUCCESS, "Pending rounds are clear");

  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }

}

async function processResultDeclare(item) {

  try {

    let data = JSON.stringify({
      roundId: item.roundId,
      playerId: item.users_id
    });

    let config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: UNIVERSAL_CASINO_RESULT_API_URL,
      headers: {
        'Content-Type': 'application/json'
      },
      data: data
    }

    let response = await axios(config);

    if (response.data) {

      response = response.data;

      if (response.meta.status_code == STATUS_200 && response.meta.status == true && response.data.length) {

        return await universeCasinoResultDeclare({
          body: {
            eventId: item.eventId, eventName: item.eventName, roundId: item.roundId, result: response.data
          }
        });

      }

      return resultResponse(RESULT_NOT_FOUND, "Result Not found!");

    }

    return resultResponse(NOT_FOUND, "Provider API not working!");

  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }

}

async function manualResultDeclare(req) {

  try {

    const { roundId } = req.body;

    let pendingSettlementUsers = await UniversalCasinoCalculatedExposures
      .find({ roundId, isProcessed: 0 })
      .select("gameId matchName userId")
      .lean();

    if (pendingSettlementUsers.length) {

      const eventId = pendingSettlementUsers[0].gameId;
      const users_id = pendingSettlementUsers.map(data => data.userId);
      const eventName = pendingSettlementUsers[0].matchName;

      return await processResultDeclare({ roundId, eventId, users_id, eventName });

    }

    return resultResponse(NOT_FOUND, "No pending user(s) for result set!");

  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }

}

async function voidResultAPI(request) {

  const { roundId } = request.body;

  let getResultStatus = await UniversalCasinoRoundsStatus.findOne({ roundId, isProcessed: 1 }).select("_id");

  if (getResultStatus) {
    return resultResponse(SUCCESS, "Result already void!");
  }

  return await voidResult(request);

}

async function clearExposureforClosedRoundsUniverseCasino(request) {

  try {

    let filter = {}, returnResult = false;

    if (request) {

      const { roundId } = request.body;

      filter["roundId"] = roundId;

      returnResult = true;

    }

    let endTime = moment().subtract(15, 'minutes');

    filter["updatedAt"] = { '$lte': new Date(endTime) };

    let getCalculatedExposures = await UniversalCasinoCalculatedExposures.aggregate(universalCasinoQuery.getCalculatedExposuresList(filter));

    if (returnResult) {
      if (!getCalculatedExposures.length) {
        return resultResponse(SUCCESS, "The user(s) exposure has already been cleared.");
      }
    }

    for await (let item of getCalculatedExposures) {

      // Here we will wait for a few seconds to prevent multiple result declarations.
      await delay(3000);

      let result = await manualResultDeclare({ body: { roundId: item.roundId } });

      // If the date is older than one day and the result is still not found, we will forcefully void the particular round.
      if (result.statusCode == RESULT_NOT_FOUND) {

        if ((moment().diff(moment(item.updatedAt), 'days') != 0)) {

          await voidResult({ body: { roundId: item.roundId } });

        }

      }

    }

    return resultResponse(SUCCESS, "No pending actions have been taken yet.");

  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }

}

async function getRoundStatus(request) {

  try {

    const { roundId, playerId } = request.body;

    let data = JSON.stringify({
      roundId: roundId,
      playerId: [playerId]
    });

    let config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: UNIVERSAL_CASINO_RESULT_API_URL,
      headers: {
        'Content-Type': 'application/json'
      },
      data: data
    }

    let response = await axios(config);

    if (response.data) {

      response = response.data;

      if (response.meta.status_code == STATUS_200 && response.meta.status == true && response.data.length) {
        return resultResponse(SUCCESS, {
          msg: "Result have been received, Please wait or try to declare the result.",
          data: response.data
        });
      } else {
        return resultResponse(NOT_FOUND, "Result not retrieved, Please try after sometime!");
      }

    }

  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }

}

async function getRoundsList(request) {

  return UniversalCasinoRoundsStatus
    .find({ isProcessed: 0 })
    .sort({ createdAt: -1 })
    .then(data => resultResponse(SUCCESS, { data }))
    .catch(error => resultResponse(SERVER_ERROR, error.message));

}

async function logs(request) {

  let { marketId, roundId, from_date, to_date, limit, page } = request.joiData, filter = {};

  let skip = (page - 1) * limit;

  if (marketId) {
    filter = { marketId };
  }

  if (roundId) {
    filter = { roundId };
  }

  if (from_date && to_date) {
    filter["createdAt"] = { '$gte': new Date(from_date), '$lte': new Date(to_date) };
  }

  return UniversalCasinoLogs
    .find(filter)
    .sort({ createdAt: -1 })
    .select("-_id")
    .limit(limit)
    .skip(skip)
    .then(data => {

      if (!data.length) {
        return resultResponse(NOT_FOUND, "No logs found!");
      }

      return UniversalCasinoLogs.countDocuments(filter).then(total => {
        return resultResponse(SUCCESS, { data: { metadata: { total, totalPages: Math.ceil(total / limit), currentPage: page }, data } });
      });

    }).catch(error => resultResponse(SERVER_ERROR, error.message));

}

async function importSport() {

  try {

    let isSportExists = await Sport.findOne({ sport_id }).select("_id").lean();

    if (!isSportExists) {

      const session = await mongoose.startSession();

      await session.withTransaction(async (session) => {

        await Sport.create(require("../../../utils/casinos/collections/universe-casino-sports.json"), { session });

        await Series.insertMany(require("../../../utils/casinos/collections/universe-casino-series.json"), { session });

        await Match.insertMany(require("../../../utils/casinos/collections/universe-casino-matches.json"), { session });

        await Market.insertMany(require("../../../utils/casinos/collections/universe-casino-markets.json"), { session });

      });

      return resultResponse(SUCCESS, sport_name + " All events are added successfully...");

    } else {
      return resultResponse(ALREADY_EXISTS, sport_name + " already Added!");
    }

  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }

}

module.exports = {
  generateAccessToken, checkAccessTokenStatus, launchUrl, createNewGame, universeCasinoResultDeclare, voidResult, voidResultAPI,
  retryResultDeclare, getRoundStatus, manualResultDeclare, clearExposureforClosedRoundsUniverseCasino, getRoundsList, logs, importSport
}