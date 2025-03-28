const Joi = require('joi')
  , axios = require('axios')
  , OAuth2Server = require("oauth2-server")
  , { ObjectId } = require("bson")
  , lotusConfig = require('../../utils/lotusConfig').getLotusOperator()
  , Lotus = require('../../models/lotus')
  , BetResults = require('../../models/betResults')
  , Market = require('../../models/market')
  , client = require('../../connections/redis')
  , CONSTANTS = require('../../utils/constants')
  , userService = require('../service/userService')
  , lotusService = require('../service/lotusService')
  , betService = require('../../admin-backend/service/betService')
  , marketsService = require('../../admin-backend/service/marketService');

const allowLotusIp = ["127.0.0.1", "52.66.120.45", "65.1.211.242", "3.108.94.176", "43.204.7.196"];

const Request = OAuth2Server.Request, Response = OAuth2Server.Response;
const oauth = new OAuth2Server({
  model: require('../../oauthmodel'),
  accessTokenLifetime: CONSTANTS.OAUTH_TOKEN_VAILIDITY,
  allowBearerTokensInQueryString: true
});

module.exports.auth = async function (req, res) {
  let errorResponse = { "ErrorCode": 1, "message": "Account Inactive, contact upline..." };
  return Joi.object({
    token: Joi.required(),
    operatorId: Joi.required()
  }).validateAsync(req.body, { abortEarly: false })
    .then(data => {
      const { token, operatorId } = data;
      if (!allowLotusIp.includes(getRequesterIp(req))) {
        errorResponse.message = "You are not allow to perform action.";
        Lotus.create(
          { "auth_req": JSON.stringify(req.body), "auth_res": JSON.stringify(errorResponse), "request_ip": getRequesterIp(req) }
        ).then().catch(console.error);
        return res.json(errorResponse);
      }
      Lotus.create(
        { "auth_req": JSON.stringify(req.body), "request_ip": getRequesterIp(req) }
      ).then().catch(console.error);
      if (!operatorId || ![lotusConfig.operatorId, lotusConfig.operatorIdHKD, lotusConfig.operatorIdDemo].includes(parseInt(operatorId)) ||
        !token || token == null || token == undefined)
        return res.json(errorResponse);
      var request = new Request(req);
      var response = new Response(res);
      request.query.access_token = token;
      return oauth.authenticate(request, response)
        .then(async function (reqToken) {
          return userService.getUserDetails({ _id: reqToken.user._id }, ["_id", "user_name", "balance", "liability", "point", "is_demo"])
            .then(getUserById => {
              if (getUserById.statusCode == CONSTANTS.SUCCESS) {
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
                // if (process.env.DEBUG == "true")
                //   console.info(authResponse);
                Lotus.create(
                  { "auth_req": JSON.stringify(req.body), "auth_res": JSON.stringify(authResponse), "request_ip": getRequesterIp(req) }
                ).then().catch(console.error);
                return res.json(authResponse);
              } else
                return res.json(errorResponse);
            }).catch(error => {
              Lotus.create(
                { "auth_res": JSON.stringify(errorResponse), "request_ip": getRequesterIp(req), "error": error.message }
              ).then().catch(console.error);
              return res.json(errorResponse);
            });
        }).catch(function (error) {
          Lotus.create(
            { "auth_res": JSON.stringify(errorResponse), "request_ip": getRequesterIp(req), "error": error.message }
          ).then().catch(console.error);
          return res.json(errorResponse);
        });
    }).catch(error => {
      if (error.hasOwnProperty("details")) {
        errorResponse.message = error.details.map(data => data.message).toString();
        Lotus.create(
          { "auth_res": JSON.stringify(errorResponse), "request_ip": getRequesterIp(req), "error": error.details.map(data => data.message).toString() }
        ).then().catch(console.error);
        return res.json(errorResponse);
      }
      Lotus.create(
        { "auth_res": JSON.stringify(errorResponse), "request_ip": getRequesterIp(req), "error": error.message }
      ).then().catch(console.error);
      return res.json(errorResponse);
    });
}

module.exports.exposure = async function (req, res) {
  let errorResponse = { "status": 1, "message": "Unauthorised session" };
  return Joi.object({
    token: Joi.required(),
    gameId: Joi.required(),
    matchName: Joi.required(),
    marketName: Joi.required(),
    roundId: Joi.required(),
    marketId: Joi.required(),
    marketType: Joi.required(),
    userId: Joi.required(),
    calculateExposure: Joi.required(),
    betInfo: Joi.required(),
    runners: Joi.required(),
    betExposure: Joi.optional(),
    exposureTime: Joi.optional(),
  }).validateAsync(req.body, { abortEarly: false })
    .then(async data => {
      let { token, roundId, marketType, betInfo, runners } = data;
      const market_id = `${CONSTANTS.LIVE_GAME_SPORT_ID}.${betInfo.gameId}.${marketType}`
        , marketId = market_id, full_market_id = `${market_id}.${roundId}`;
      let checkResultAlreadyDeclared = await BetResults.findOne({ market_id: full_market_id }).select("_id").lean();
      if (checkResultAlreadyDeclared) {
        errorResponse.message = "Result already declared!";
        return res.json(errorResponse);
      }
      let checkMarketStatus = await client.get(`ODDS_${market_id}`);
      if (checkMarketStatus != null) {
        try {
          checkMarketStatus = JSON.parse(checkMarketStatus)[0];
          if (checkMarketStatus.runners.length == 0 && checkMarketStatus.status == "CLOSED") {
            errorResponse.message = "Bet not allowed, Market is CLOSED";
            return res.json(errorResponse);
          }
        } catch (error) {
          errorResponse.message = "Something went wrong!";
          return res.json(errorResponse);
        }
      }
      if (!allowLotusIp.includes(getRequesterIp(req))) {
        errorResponse.message = "You are not allow to perform action.";
        Lotus.create(
          { "exposure_req": JSON.stringify(req.body), "exposure_res": JSON.stringify(errorResponse), "request_ip": getRequesterIp(req) }
        ).then().catch(console.error);
        return res.json(errorResponse);
      }
      Lotus.create(
        { "roundId": roundId, "exposure_req": JSON.stringify(req.body), "request_ip": getRequesterIp(req) }
      ).then().catch(console.error);
      var request = new Request(req);
      var response = new Response(res);
      request.query.access_token = token;
      return oauth.authenticate(request, response)
        .then(async function (reqToken) {
          runners = runners.map(row => (row.selectionId = row.id, row));
          let writeData = [{
            marketId,
            sport_id: CONSTANTS.LIVE_GAME_SPORT_ID,
            roundId,
            runners,
            status: betInfo.status || "OPEN",
            type: marketType
          }]
          await client.set(`ODDS_${market_id}`, JSON.stringify(writeData));

          let betPlaceData = {
            market_id,
            selection_id: betInfo.runnerId,
            odds: betInfo.requestedOdds,
            stack: parseInt(betInfo.reqStake),
            is_back: betInfo.isBack ? 1 : 0,
            type: marketType,
            roundId
          }

          var config = {
            method: 'post',
            url: `https://${req.headers.host}/api/v1/bet/saveBet`,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token
            },
            data: betPlaceData
          };
          let betPlaceResponse;
          try {
            betPlaceResponse = await axios(config);
            betPlaceResponse = betPlaceResponse.data;
          } catch (error) {
            errorResponse.message = error.message;
            Lotus.create({
              "roundId": roundId, "exposure_req": JSON.stringify(req.body), "exposure_res": JSON.stringify(errorResponse),
              "request_ip": getRequesterIp(req), "error": error.message
            }).then().catch(console.error);
            return res.json(errorResponse);
          }
          if (betPlaceResponse.status == false) {
            errorResponse.message = betPlaceResponse.msg;
            Lotus.create({
              "roundId": roundId, "exposure_req": JSON.stringify(req.body), "exposure_res": JSON.stringify(errorResponse),
              "request_ip": getRequesterIp(req)
            }).then().catch(console.error);
            return res.json(errorResponse);
          }
          await client.del(`ODDS_${market_id}`);
          return userService.getUserDetails({ _id: reqToken.user._id }, ["balance", "liability"])
            .then(getUserById => {
              if (getUserById.statusCode == CONSTANTS.SUCCESS) {
                getUserById = getUserById.data;
                errorResponse = {
                  "status": 0,
                  "Message": betPlaceResponse.msg,
                  "wallet": getUserById.balance,
                  "exposure": getUserById.liability
                };
                Lotus.create({
                  "roundId": roundId, "exposure_req": JSON.stringify(req.body),
                  "exposure_res": JSON.stringify(errorResponse), "request_ip": getRequesterIp(req)
                }).then().catch(console.error);
                return res.json(errorResponse);
              } else {
                Lotus.create({
                  "roundId": roundId, "exposure_req": JSON.stringify(req.body),
                  "exposure_res": JSON.stringify(errorResponse), "request_ip": getRequesterIp(req)
                }).then().catch(console.error);
                return res.json(errorResponse);
              }
            }).catch(error => {
              Lotus.create(
                { "exposure_res": JSON.stringify(errorResponse), "request_ip": getRequesterIp(req), "error": error.message }
              ).then().catch(console.error);
              return res.json(errorResponse);
            });
        }).catch(error => {
          Lotus.create({
            "roundId": roundId, "exposure_req": JSON.stringify(req.body), "exposure_res": JSON.stringify(errorResponse),
            "request_ip": getRequesterIp(req), "error": error.message
          }).then().catch(console.error);
          return res.json(errorResponse);
        });
    }).catch(error => {
      if (error.hasOwnProperty("details")) {
        errorResponse.message = error.details.map(data => data.message).toString();
        Lotus.create(
          { "exposure_res": JSON.stringify(errorResponse), "request_ip": getRequesterIp(req), "error": error.details.map(data => data.message).toString() }
        ).then().catch(console.error);
        return res.json(errorResponse);
      }
      Lotus.create(
        { "exposure_res": JSON.stringify(errorResponse), "request_ip": getRequesterIp(req), "error": error.message }
      ).then().catch(console.error);
      return res.json(errorResponse);
    });
}

module.exports.results = async function (req, res) {
  let errorResponse = { "Error": "1", "message": "something went wrong", "result": [] };
  return Joi.object({
    result: Joi.required(),
    runners: Joi.required(),
    betvoid: Joi.required(),
    roundId: Joi.required(),
    market: Joi.required(),
    operatorId: Joi.required(),
  }).validateAsync(req.body, { abortEarly: false })
    .then(async data => {
      let { result, runners, betvoid, roundId, market } = data;
      if (!allowLotusIp.includes(getRequesterIp(req))) {
        errorResponse.message = "Malformed IP";
        Lotus.create(
          { "results_req": JSON.stringify(req.body), "results_res": JSON.stringify(errorResponse), "request_ip": getRequesterIp(req) }
        ).then().catch(console.error);
        return res.json(errorResponse);
      }
      let market_id = `${CONSTANTS.LIVE_GAME_SPORT_ID}.${market.gameId}.${market.runnerType}`
        , marketId = market_id
        , full_market_id = `${market_id}.${roundId}`
        , finalResultResponse = { Error: "0", result: [], message: "" };
      let writeData = [{
        marketId,
        sport_id: CONSTANTS.LIVE_GAME_SPORT_ID,
        roundId,
        runners: [],
        status: market.status,
        type: market.runnerType
      }]
      await client.set(`ODDS_${market_id}`, JSON.stringify(writeData), 'EX', 8);
      let usersIds = result.map(data => ObjectId(data.userId));
      return userService.getUsersDetails({ _id: { '$in': usersIds } }, ["_id", "user_name", "balance", "liability"])
        .then(async getUsersById => {
          if (getUsersById.statusCode == CONSTANTS.NOT_FOUND || getUsersById.statusCode == CONSTANTS.SERVER_ERROR) {
            finalResultResponse.Error = "1";
            if (getUsersById.statusCode == CONSTANTS.NOT_FOUND)
              finalResultResponse.message = "Requested users not exists!"
            else
              finalResultResponse.message = "Something went wrong while getting users details!"
            Lotus.create({
              roundId, "results_req": JSON.stringify(req.body),
              "results_res": JSON.stringify(finalResultResponse), "request_ip": getRequesterIp(req)
            }).then().catch(console.error);
            return res.json(finalResultResponse);
          }
          getUsersById = getUsersById.data;
          if (betvoid) {
            return marketsService.abandonedExchangeGame(market.gameId, market_id, full_market_id)
              .then(async oddsResultData => {
                if (oddsResultData.statusCode == CONSTANTS.SUCCESS) {
                  return userService.getUsersDetails({ _id: { '$in': getUsersById.map(data => data._id) } }, ["_id", "user_name", "balance", "liability"])
                    .then(async getUsersById => {
                      getUsersById = getUsersById.data.map(data => {
                        return {
                          "wallet": data.balance,
                          "exposure": data.liability,
                          "userId": data._id
                        }
                      });
                      finalResultResponse.result = getUsersById;
                      finalResultResponse.message = "users profit/loss updated after, " + oddsResultData.data;
                      Lotus.create({
                        roundId, "results_req": JSON.stringify(req.body),
                        "results_res": JSON.stringify(finalResultResponse), "request_ip": getRequesterIp(req)
                      }).then().catch(console.error);
                      return res.json(finalResultResponse);
                    }).catch(error => {
                      errorResponse.message = error.message;
                      Lotus.create(
                        { "results_res": JSON.stringify(errorResponse), "request_ip": getRequesterIp(req), "error": error.message }
                      ).then().catch(console.error);
                      return res.json(errorResponse);
                    });
                }
                errorResponse.message = oddsResultData.data;
                Lotus.create(
                  { roundId, "results_req": JSON.stringify(req.body), "results_res": JSON.stringify(errorResponse), "request_ip": getRequesterIp(req) }
                ).then().catch(console.error);
                return res.json(errorResponse);
              }).catch(error => {
                errorResponse.message = error.message;
                Lotus.create(
                  { "results_res": JSON.stringify(errorResponse), "request_ip": getRequesterIp(req), "error": error.message }
                ).then().catch(console.error);
                return res.json(errorResponse);
              });
          }
          let winnerSelection;
          if (runners == undefined || runners.length == 0)
            winnerSelection = market.marketRunner;
          else
            winnerSelection = runners;
          let calculateRunners = winnerSelection;
          winnerSelection = winnerSelection.find(data => data.status == "WINNER");
          let winnerSelectionId, winnerSelectionName;
          if (winnerSelection != undefined) {
            // if (process.env.DEBUG == "true")
            //   console.info("result declare");
            winnerSelectionId = winnerSelection.id;
            winnerSelectionName = winnerSelection.name;
          } else {
            // if (process.env.DEBUG == "true")
            //   console.info("loser");
            let selectionId;
            for (let i = 0; i < calculateRunners.length; i++)
              selectionId = calculateRunners[i].id;
            winnerSelectionId = parseInt(`${selectionId}` + market.gameId);
            winnerSelectionName = "LOSER";
          }
          Lotus.create({
            roundId, "results_req": JSON.stringify(req.body), "request_ip": getRequesterIp(req),
            winnerSelectionId, winnerSelectionName, comment: "Result declaration..."
          }).then().catch(console.error);
          req.body["full_market_id"] = full_market_id;
          req.body["winnerSelectionId"] = winnerSelectionId;
          await lotusService.updateUserPL(req);
          delete req.body["full_market_id"];
          delete req.body["winnerSelectionId"];
          return declareResult(market_id, full_market_id, winnerSelectionId, winnerSelectionName)
            .then(async gameResult => {
              if (!gameResult.status) {
                errorResponse.message = gameResult.data;
                if (gameResult.hasOwnProperty("resultAlreadyDeclared")) {
                  // TODO:
                } else {
                  Lotus.create({
                    roundId, "results_req": JSON.stringify(req.body), "results_res": JSON.stringify(errorResponse),
                    "request_ip": getRequesterIp(req), winnerSelectionId, winnerSelectionName, comment: "Result not declared!"
                  }).then().catch(console.error);
                }
                return res.json(errorResponse);
              }
              return userService.getUsersDetails({ _id: { '$in': getUsersById.map(data => data._id) } }, ["_id", "user_name", "balance", "liability"])
                .then(async getUsersById => {
                  getUsersById = getUsersById.data.map(data => {
                    return {
                      "wallet": data.balance,
                      "exposure": data.liability,
                      "userId": data._id
                    }
                  });
                  finalResultResponse.message = result.length + " user pl updated, " + gameResult.data;
                  finalResultResponse.result = getUsersById;
                  // if (process.env.DEBUG == "true")
                  //   console.info(finalResultResponse);
                  Lotus.create({
                    roundId, "results_req": JSON.stringify(req.body), "results_res": JSON.stringify(finalResultResponse),
                    "request_ip": getRequesterIp(req), comment: "Result declared successfully...",
                    winnerSelectionId, winnerSelectionName,
                  }).then().catch(console.error);
                  return res.json(finalResultResponse);
                }).catch(error => {
                  errorResponse.message = error.message;
                  Lotus.create({
                    "results_res": JSON.stringify(errorResponse), "request_ip": getRequesterIp(req),
                    "error": error.message, comment: "Result declaration error!",
                    winnerSelectionId, winnerSelectionName,
                  }).then().catch(console.error);
                  return res.json(errorResponse);
                });
            }).catch(error => {
              finalResultResponse.Error = "1";
              finalResultResponse.message = error.message;
              // if (process.env.DEBUG == "true")
              //   console.info(finalResultResponse);
              Lotus.create(
                { roundId, "results_req": JSON.stringify(req.body), "results_res": JSON.stringify(finalResultResponse), "request_ip": getRequesterIp(req) }
              ).then().catch(console.error);
              return res.json(finalResultResponse);
            });
        }).catch(error => {
          errorResponse.message = error.message;
          Lotus.create(
            { "results_res": JSON.stringify(errorResponse), "request_ip": getRequesterIp(req), "error": error.message }
          ).then().catch(console.error);
          return res.json(errorResponse);
        });
    }).catch(error => {
      if (error.hasOwnProperty("details")) {
        errorResponse.message = error.details.map(data => data.message).toString();
        Lotus.create(
          { "results_res": JSON.stringify(errorResponse), "request_ip": getRequesterIp(req), "error": error.details.map(data => data.message).toString() }
        ).then().catch(console.error);
        return res.json(errorResponse);
      }
      Lotus.create(
        { "results_res": JSON.stringify(errorResponse), "request_ip": getRequesterIp(req), "error": error.message }
      ).then().catch(console.error);
      return res.json(errorResponse);
    });
}

function getRequesterIp(req) {
  let ip_data = req.headers['x-forwarded-for'] ||
    req.headers['x-real-ip'] ||
    (
      req.connection.remoteAddress ||
      req.client.remoteAddress ||
      req.socket.remoteAddress ||
      (req.connection.socket ? req.connection.socket.remoteAddress : null)
    ).slice(7);
  return ip_data;
}

function declareResult(market_id, full_market_id, winnerSelectionId, winner) {
  let original_market_id = market_id;
  return marketsService.getMarketDetail(
    { market_id }, [
    "sport_id", "sport_name", "series_id", "series_name", "match_id",
    "match_name", "market_name", "-_id"
  ]).then(market => {
    if (market.statusCode == CONSTANTS.SUCCESS) {
      data = market.data;
      data.original_market_id = original_market_id;
      data.market_id = full_market_id;
      data.selection_id = winnerSelectionId;
      data.selection_name = winner;
      let { sport_id, series_id, match_id, market_id } = market.data;
      return BetResults.findOne(
        { sport_id, series_id, match_id, market_id: full_market_id }
      ).then(betResultAlreadyDeclared => {
        if (betResultAlreadyDeclared != null)
          return { status: false, data: "Result already declared!", resultAlreadyDeclared: 1 };
        let betResult = new BetResults(Object.assign(data, { winner_name: data.selection_name }));
        return betService.oddsResultV2(Object.assign(data, { bet_result_id: betResult._id })).then(async oddsResult => {
          if (oddsResult.statusCode != CONSTANTS.SUCCESS) {
            Market.updateOne({ sport_id, series_id, match_id, market_id }, { result_status: oddsResult.data }).then().catch(console.error);
            return { status: false, data: oddsResult.data + (process.env.DEBUG == "true" ? " oddsResult have some issue!" : "") };
          }
          await betResult.save();
          return { status: true, data: oddsResult.data + (process.env.DEBUG == "true" ? " oddsResult save successfully..." : "") };
        }).catch(error => { return { status: false, data: error.message + (process.env.DEBUG == "true" ? " oddsResult throw exception!" : "") } });
      }).catch(error => { return { status: false, data: `Error while getting result: ${error.message}` + (process.env.DEBUG == "true" ? " oddsResult throw exception!" : "") } });
    }
    return { status: false, data: market.data + (process.env.DEBUG == "true" ? " market have some issue!" : "") };
  }).catch(error => { return { status: false, data: error.message + (process.env.DEBUG == "true" ? " market throw exception!" : "") } });
}