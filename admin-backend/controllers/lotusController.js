const Joi = require('joi')
  , axios = require('axios')
  , CONSTANTS = require('../../utils/constants')
  , lotusService = require('../service/lotusService')
  , marketsService = require('../service/marketService')
  , Lotus = require('../../models/lotus')
  , { ResError, ResSuccess } = require('../../lib/expressResponder');
const { STATUS_500 } = require('../../utils/httpStatusCode');

module.exports.launchUrl = async (req, res) => {
  return lotusService.launchUrl(req, res)
    .then(result => (result.statusCode == CONSTANTS.SUCCESS) ? ResSuccess(res, { ...result.data }) : ResError(res, { msg: result.data }))
    .catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
}

module.exports.launchInstantUrl = async (req, res) => {
  return lotusService.launchInstantUrl(req, res)
    .then(result => (result.statusCode == CONSTANTS.SUCCESS) ? ResSuccess(res, result.data) : ResError(res, { msg: result.data }))
    .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
}

module.exports.abandoned = async function (req, res) {
  return Joi.object({
    match_id: Joi.required(),
    market_id: Joi.required(),
    full_market_id: Joi.required(),
  }).validateAsync(req.body, { abortEarly: false })
    .then(data => {
      let { match_id, market_id, full_market_id } = data;
      return marketsService.abandonedExchangeGame(match_id, market_id, full_market_id)
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

module.exports.getStatus = async function (req, res) {
  return Joi.object({
    full_market_id: Joi.required(),
  }).validateAsync(req.body, { abortEarly: false })
    .then(data => {
      let { full_market_id } = data;
      full_market_id = full_market_id.split(".")[3];
      roundId = full_market_id;
      return Lotus.find({ roundId }).sort({ createdAt: -1 }).then(result => {
        if (result.length == 2)
          return ResSuccess(res, { code: "delete", msg: "Delete Bet", resultLength: result.length });
        if (JSON.parse(JSON.stringify(result[0])).hasOwnProperty("exposure_res"), result[1].comment == "Result declared successfully...")
          return ResSuccess(res, { code: "delete", msg: "Delete Bet", resultLength: result.length });
        if (!result.filter(data => data.comment == "Result not declared!").length)
          return ResSuccess(res, { code: "abandoned", msg: "Abandoned", resultLength: result.length });
        if (result.filter(data => data.comment == "Result not declared!").length)
          return ResSuccess(res, { code: "result_declare", msg: "Declare Result", resultLength: result.length });
        return ResSuccess(res, { code: "0", msg: "Contact DB admin" });
      }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
    }).catch(error => {
      return ResError(res, error);
    });
}

module.exports.resultDeclare = async function (req, res) {
  return Joi.object({
    full_market_id: Joi.optional(),
  }).validateAsync(req.body, { abortEarly: false })
    .then(async data => {
      let { full_market_id } = data, filter = {};
      if (full_market_id) {
        full_market_id = full_market_id.split(".")[3];
        roundId = full_market_id;
        filter = { roundId };
      } else
        filter = { comment: "Result not declared!" };
      let rounds = await Lotus.find(filter, { results_req: 1, comment: 1 }).sort({ createdAt: -1 });
      if (!rounds.length)
        return ResError(res, { msg: "Nothing yet to declare!" });
      let lotusIds = [];
      for (const [i, roundData] of rounds.entries()) {
        setTimeout(async function timer() {
          var data = roundData.results_req;
          var config = {
            method: 'post',
            url: 'http://127.0.0.1:4050/api/poker/results',
            headers: {
              'Content-Type': 'application/json'
            },
            data: data
          };
          try {
            let response = await axios(config);
            response = JSON.parse(JSON.stringify(response.data));
            const { _id } = roundData;
            if (response.Error == "1") {
              lotusIds.push(_id);
              if (response.message == "Result already declared!")
                await Lotus.updateOne({ _id }, { comment: "Result declared successfully...", results_res: JSON.stringify(response) });
              console.info(response.message);
            }
            if (response.Error == "0") {
              await Lotus.updateOne({ _id }, { comment: "Result declared successfully...", results_res: JSON.stringify(response) });
              console.info(response.message);
            }
            if (rounds.length == i + 1) {
              console.info("done");
              if (lotusIds.length)
                console.info(lotusIds);
            }
            return ResSuccess(res, { msg: response.message });
          } catch (error) {
            return ResError(res, { error, statusCode: STATUS_500 });
          }
        }, i * 1000);
      }
      return ResSuccess(res, { msg: "Result declaration is under process..." });
    }).catch(error => {
      return ResError(res, error);
    });
}

module.exports.retryResultDeclare = async function (req, res) {
  return lotusService.clearPendingRoundsWithRetryLimitOver(req, res)
    .then(result => (result.statusCode == CONSTANTS.SUCCESS) ? ResSuccess(res, result.data) : ResError(res, { msg: result.data }))
    .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
}

module.exports.manualResultDeclare = async function (req, res) {
  return lotusService.declareResultForClosedRoundsLotus(req, res)
    .then(result => (result.statusCode == CONSTANTS.SUCCESS) ? ResSuccess(res, result.data) : ResError(res, { msg: result.data }))
    .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
}

module.exports.clearExposure = async function (req, res) {
  return lotusService.clearExposureforClosedRoundsLotus(req, res)
    .then(result => (result.statusCode == CONSTANTS.SUCCESS) ? ResSuccess(res, result.data) : ResError(res, { msg: result.data }))
    .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
}

module.exports.getExposures = async function (req, res) {
  return lotusService.getExposures(req, res)
    .then(result => (result.statusCode == CONSTANTS.SUCCESS) ? ResSuccess(res, { ...result.data }) : ResError(res, { msg: result.data }))
    .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
}

module.exports.bets = async function (req, res) {
  return lotusService.bets(req, res)
    .then(result => (result.statusCode == CONSTANTS.SUCCESS) ? ResSuccess(res, { ...result.data }) : ResError(res, { msg: result.data }))
    .catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
}

module.exports.logs = async (req, res) => {
  return lotusService.logs(req, res)
    .then(result => (result.statusCode == CONSTANTS.SUCCESS) ? ResSuccess(res, { ...result.data }) : ResError(res, { msg: result.data }))
    .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
}

module.exports.getRoundStatus = async (req, res) => {
  return lotusService.getRoundStatus(req, res)
    .then(result => (result.statusCode == CONSTANTS.SUCCESS) ? ResSuccess(res, result.data) : ResError(res, { msg: result.data }))
    .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
}

module.exports.casinoResults = async (req, res) => {
  return lotusService.casinoResults(req, res)
    .then(result => (result.statusCode == CONSTANTS.SUCCESS) ? ResSuccess(res, result.data) : ResError(res, { msg: result.data }))
    .catch(error => ResError(res, error));
}

module.exports.casinoResultsDocument = async function (req, res) {
  return lotusService
    .casinoResultsDocument(req, res)
    .then((result) => {
      if (result.statusCode != CONSTANTS.SUCCESS) {
        return ResError(res, { msg: result.data });
      } else if (!result?.data?.isDoc) {
        return ResSuccess(res, result.data);
      }
    }
    )
    .catch((error) => ResError(res, error));
}

module.exports.lotusBets = async function (req, res) {
  return lotusService.lotusBets(req, res)
    .then(result => (result.statusCode == CONSTANTS.SUCCESS) ? ResSuccess(res, { data: result.data }) : ResError(res, { msg: result.data }))
    .catch(error => ResError(res, error));
}

module.exports.lotusBetsDocument = async function (req, res) {
  return lotusService
    .lotusBetsDocument(req, res)
    .then((result) => {
      if (result.statusCode != CONSTANTS.SUCCESS) {
        return ResError(res, { msg: result.data });
      } else if (!result?.data?.isDoc) {
        return ResSuccess(res, result.data);
      }
    }
    )
    .catch((error) => ResError(res, error));
}

module.exports.lotusBetsCrDr = async function (req, res) {
  return lotusService.lotusBetsCrDr(req, res)
    .then(result => (result.statusCode == CONSTANTS.SUCCESS) ? ResSuccess(res, { data: result.data }) : ResError(res, { msg: result.data }))
    .catch(error => ResError(res, error));
}

module.exports.lotusBetsCrDrDocument = async function (req, res) {
  return lotusService
    .lotusBetsCrDrDocument(req, res)
    .then((result) => {
      if (result.statusCode != CONSTANTS.SUCCESS) {
        return ResError(res, { msg: result.data });
      } else if (!result?.data?.isDoc) {
        return ResSuccess(res, result.data);
      }
    }
    )
    .catch((error) => ResError(res, error));
}

module.exports.lotusCurrentBetsDocument = async function (req, res) {
  return lotusService
    .lotusCurrentBetsDocument(req, res)
    .then((result) => {
      if (result.statusCode != CONSTANTS.SUCCESS) {
        return ResError(res, { msg: result.data });
      } else if (!result?.data?.isDoc) {
        return ResSuccess(res, result.data);
      }
    }
    )
    .catch((error) => ResError(res, error));
}

module.exports.validateLobbyUrl = async function (req, res, next) {
  return lotusService.validateLobbyUrl(req, res, next)
    .then(result => (result.statusCode == CONSTANTS.SUCCESS) ? next() : ResError(res, { msg: result.data }))
    .catch(error => ResError(res, error));
}