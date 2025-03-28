const getCurrentLine = require('get-current-line')
  , moment = require('moment')
  , { ObjectId } = require("bson")
  , _ = require("lodash")
  , mongoose = require('mongoose')
  , path = require('path')
  , fs = require('fs').promises
  , User = require("../../models/user")
  , Partnerships = require("../../models/partnerships")
  , UserProfitLoss = require("../../models/userProfitLoss")
  , BetResults = require("../../models/betResults")
  , Supernowa = require('../../models/supernowa')
  , SupernowaCrDrWinLoss = require('../../models/supernowaCrDrWinLoss')
  , SupernowaGameData = require('../../models/supernowaGameData')
  , betService = require('./betService')
  , supernowaQuery = require('./supernowaQuery')
  , { SUCCESS, NOT_FOUND, SERVER_ERROR, SUPERNOWA_GAME_SPORT_ID } = require("../../utils/constants")
  , { resultResponse } = require('../../utils/globalFunction')
  , writeFile = require('util').promisify(require('fs').writeFileSync)
  , SUPERNOWA_GAMES_PATH = path.normalize(path.resolve(__dirname, "../../utils/supernowa-games.json"))
  , WCO_LOGS_PATH = path.normalize(path.resolve(__dirname, "../../logs-3rd/WCO"));

async function supernowaResult(params) {
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
      let gameData = await SupernowaGameData.findOne(params)
        .select("_id providerCode gameCode providerRoundId")
        .session(session);
      if (gameData) {
        let { providerCode, gameCode, providerRoundId } = gameData;
        let usersGameData = await SupernowaCrDrWinLoss.find({
          "gameData.providerCode": providerCode,
          "gameData.gameCode": gameCode,
          "gameData.providerRoundId": providerRoundId,
          "gameData.description": { "$in": ["win", "lose"] }
        }).select("_id user.id gameData transactionData.amount transactionData.id")
          .session(session);
        if (!usersGameData.length) {
          let error = "No win/loss data generated!"
          await SupernowaGameData.updateOne({ _id: gameData._id }, { error });
          throw new Error(error);
        }
        let generatedUserProfitLoss = await generateUserProfitLoss(session, gameData, usersGameData);
        if (generatedUserProfitLoss.statusCode != SUCCESS) {
          await SupernowaGameData.updateOne({ _id: gameData._id }, { error: generatedUserProfitLoss.data });
          throw new Error(generatedUserProfitLoss.data);
        }
        const { user_profit_loss, bet_result_id, event_id } = generatedUserProfitLoss.data;
        await UserProfitLoss.insertMany(user_profit_loss, { session });
        let status = await betService.fn_update_balance_on_resultV1(session, bet_result_id, event_id, 0, "Result declared successfully", {}, 0);
        if (status.statusCode == SUCCESS)
          await SupernowaGameData.deleteOne({ _id: gameData._id });
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

async function generateUserProfitLoss(session, gameData, usersGameData) {
  try {
    let { providerCode, gameCode, providerRoundId } = gameData
      , user_profit_loss = [];
    const users_id = usersGameData.map(data => ObjectId(data.user.id));
    const user = await User.find({ _id: { "$in": users_id } }).select("user_name domain_name").lean();
    if (!user.length)
      return resultResponse(NOT_FOUND, "User(s) not found!");
    let worldCasino = SUPERNOWA_GAME_SPORT_ID;
    if (!["SN", "PG", "FTZ"].includes(providerCode))
      worldCasino = "WCO";
    const partnerships = await Partnerships.find({
      user_id: { "$in": users_id },
      "sports_share.sport_id": worldCasino
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
    let SUPERNOWA_GAMES;
    try {
      SUPERNOWA_GAMES = await fs.readFile(SUPERNOWA_GAMES_PATH, 'utf8');
      SUPERNOWA_GAMES = JSON.parse(SUPERNOWA_GAMES);
    } catch (error) {
      return resultResponse(NOT_FOUND, "Error while process supernowa-game file!");
    }
    if (!SUPERNOWA_GAMES[providerCode][gameCode])
      return resultResponse(NOT_FOUND, "Game data not found!");
    let { sport_id, sport_name } = SUPERNOWA_GAMES[providerCode][gameCode]
      , event = `${sport_id}.${providerCode}.${gameCode}`
      , winner_name = "";
    SUPERNOWA_GAMES = SUPERNOWA_GAMES[providerCode][gameCode];
    let event_name = SUPERNOWA_GAMES.name
      , betResultId = mongoose.Types.ObjectId();
    for (const userGameData of usersGameData) {
      let userData = distribution.find(o => o.user_id.toString() == userGameData.user.id);
      if (userData) {
        let agents_pl_distribution = userData.agents_pl_distribution
          , chips = userGameData.transactionData.amount;
        for (const [index, distribution] of agents_pl_distribution.entries()) {
          distribution.commission = 0;
          distribution.index = index;
          let p_l = 0;
          if (chips < 0)
            p_l = (Math.abs(chips * distribution.share) / 100);
          else
            p_l = -(Math.abs(chips * distribution.share) / 100);
          distribution.p_l = p_l;
        }
        winner_name = userGameData.gameData.winner;
        user_profit_loss.push({
          user_id: userData.user_id,
          user_name: userData.user_name,
          domain_name: userData.domain_name,
          providerTransactionId: userGameData.gameData.providerTransactionId,
          transactionDataId: userGameData.transactionData.id,
          sport_id,
          sport_name,
          series_id: event,
          series_name: event_name,
          match_id: event,
          match_name: event_name,
          event_id: `${event}.${providerRoundId}`,
          event_name: `${event_name} ${providerCode} ${gameCode}`,
          winner_name,
          bet_result_id: betResultId,
          stack: userGameData.gameData.stacks,
          user_pl: chips,
          user_commission_pl: 0,
          description: `${sport_name} - (${event_name}-${providerCode}-${gameCode}-${providerRoundId}) - ${userGameData.gameData.description == "win" ? "Profit" : "Loss"} [ Winner : ${userGameData.gameData.winner} ]`,
          reffered_name: `${sport_name} -> ${event_name} - ${providerCode} - ${gameCode} - ${providerRoundId}`,
          agents_pl_distribution
        });
      }
    }
    if (user_profit_loss.length) {
      let isResultAlreadyDeclared = await BetResults.findOne({ sport_id, series_id: event, match_id: event, market_id: `${event}.${providerRoundId}` });
      if (isResultAlreadyDeclared)
        return resultResponse(SERVER_ERROR, "Result already declared!");
      await BetResults.create([{
        _id: betResultId,
        sport_id,
        series_id: event,
        match_id: event,
        market_id: `${event}.${providerRoundId}`,
        selection_id: winner_name,
        winner_name,
        type: 1
      }], { session });
      for (const userGameData of usersGameData) {
        userGameData.isProcessed = 1;
        await userGameData.save();
      }
      return resultResponse(SUCCESS, { user_profit_loss, bet_result_id: betResultId, event_id: `${event}.${providerRoundId}` });
    }
    return resultResponse(NOT_FOUND, "No profit loss found!");
  } catch (error) {
    await session.abortTransaction();
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function downloadLogs(data) {
  const { from_date, to_date, password } = data;
  if (password != "Power@Plus")
    return resultResponse(NOT_FOUND, "Password not match!");
  return Supernowa.aggregate(supernowaQuery.downloadLogs(data))
    .then(logs => {
      if (!logs.length)
        return resultResponse(NOT_FOUND, "No logs found!");
      let filename = `WCO-${moment(from_date).utcOffset("+05:30").format('YYYY-MM-DD-h-mm-ss-A')}←→${moment(to_date).utcOffset("+05:30").format('YYYY-MM-DD-h-mm-ss-A')}.json`,
        filepath = WCO_LOGS_PATH + "/" + filename;
      writeFile(filepath, JSON.stringify(logs, null, 2), 'utf8');
      return resultResponse(SUCCESS, { filename, filepath });
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

function wcoPath() { return WCO_LOGS_PATH; }

module.exports = {
  supernowaResult, downloadLogs, wcoPath
}