const Joi = require('joi')
  , diamondService = require('../service/diamondService')
  , marketService = require('../service/marketService')
  , CONSTANTS = require('../../utils/constants')
  , { ResError, ResSuccess } = require('../../lib/expressResponder')
  , { STATUS_500 } = require('../../utils/httpStatusCode');

module.exports.abandoned = async function (req, res) {
  return Joi.object({
    match_id: Joi.required(),
    market_id: Joi.required(),
    full_market_id: Joi.required(),
  }).validateAsync(req.body, { abortEarly: false })
    .then(data => {
      let { match_id, market_id, full_market_id } = data;
      return marketService.abandonedExchangeGame(match_id, market_id, full_market_id)
        .then(async oddsResultData => {
          if (oddsResultData.statusCode == CONSTANTS.SUCCESS)
            return ResSuccess(res, { msg: oddsResultData.data });
          return ResError(res, { msg: oddsResultData.data });
        }).catch(error => {
          return ResError(res, { error, statusCode: STATUS_500 });
        });
    }).catch(error => {
      return ResError(res, error);
    });
}

module.exports.resultDeclare = async function (req, res) {
  return Joi.object({
    full_market_id: Joi.required(),
    selection_id: Joi.required(),
    selection_name: Joi.required(),
  }).validateAsync(req.body, { abortEarly: false })
    .then(async data => {
      let { full_market_id, selection_id } = data;
      full_market_id_arr = full_market_id.split(".");
      const marketId = `${full_market_id_arr[0]}.${full_market_id_arr[1]}.${full_market_id_arr[2]}`

      /* Get Market Details */
      let market = await marketService.getMarketDetails({ marketId }, ["-_id", "runners.name", "runners.selectionId", "marketId", "centralId"]);
      if (market.statusCode != CONSTANTS.SUCCESS)
        return resultResponse(CONSTANTS.NOT_FOUND, "Market data Not Found!");
      const runnersData = market.data[0].runners;
      let winnerSelectionIdLive = selection_id;
      let toalTeams = runnersData.length;
      let winnerSelectionId = undefined;
      let winnerName = undefined;
      for (let i = 0; i < toalTeams; i++) {
        if (winnerSelectionIdLive == runnersData[i].selectionId) {
          winnerSelectionId = runnersData[i].selectionId;
          winnerName = runnersData[i].name;
          break;
        }
      }

      if (winnerSelectionId === undefined) { // LOSER
        winnerSelectionId = runnersData[toalTeams - 1].selectionId; // Get Last Runner selection ID
        winnerName = "LOSER";
      }

      await diamondService.declareResult(marketId, full_market_id, winnerSelectionId, winnerName)
      return ResSuccess(res, { msg: "Result declaration is under process..." });
    }).catch(error => {
      return ResError(res, error);
    });
}