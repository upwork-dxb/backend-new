const service = require("../../service/casinos/universalCasino")
  , { SUCCESS } = require("../../../utils/constants")
  , { ResError, ResSuccess } = require('../../../lib/expressResponder')

module.exports.generateAccessToken = function (req, res) {
  return service.generateAccessToken()
    .then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, result.data) : ResError(res, { msg: result.data }))
    .catch(error => ResError(res, error));
}

module.exports.checkAccessTokenStatus = function (req, res) {
  return service.checkAccessTokenStatus()
    .then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, result.data) : ResError(res, { msg: result.data }))
    .catch(error => ResError(res, error));
}

module.exports.launchUrl = function (req, res) {
  return service.launchUrl(req)
    .then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, result.data) : ResError(res, { msg: result.data }))
    .catch(error => ResError(res, error));
}

module.exports.retryResultDeclare = function (req, res) {
  return service.retryResultDeclare(req)
    .then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, result.data) : ResError(res, { msg: result.data }))
    .catch(error => ResError(res, error));
}

module.exports.getRoundStatus = async (req, res) => {
  return service.getRoundStatus(req, res)
    .then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, result.data) : ResError(res, { msg: result.data }))
    .catch(error => ResError(res, error));
}

module.exports.voidResult = async (req, res) => {
  return service.voidResultAPI(req, res)
    .then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, result.data) : ResError(res, { msg: result.data }))
    .catch(error => ResError(res, error));
}

module.exports.manualResultDeclare = async (req, res) => {
  return service.manualResultDeclare(req, res)
    .then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, result.data) : ResError(res, { msg: result.data }))
    .catch(error => ResError(res, error));
}

module.exports.getRoundsList = async (req, res) => {
  return service.getRoundsList(req, res)
    .then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, result.data) : ResError(res, { msg: result.data }))
    .catch(error => ResError(res, error));
}

module.exports.logs = async (req, res) => {
  return service.logs(req, res)
    .then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, result.data) : ResError(res, { msg: result.data }))
    .catch(error => ResError(res, error));
}