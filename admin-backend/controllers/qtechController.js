const { SUCCESS } = require('../../utils/constants')
  , { ResError, ResSuccess } = require('../../lib/expressResponder')
  , qtechService = require('../service/qtechService')
  , sportsController = require('../controllers/sportsController');
const { STATUS_500 } = require('../../utils/qtechConstant');

module.exports = {
  accessToken(req, res) {
    let service;
    if (req.path == "/generateAccessToken")
      service = qtechService.generateAccessToken();
    else if (req.path == "/getAccessToken")
      service = qtechService.getAccessToken();
    else if (req.path == "/checkAccessTokenStatus")
      service = qtechService.checkAccessTokenStatus();
    else if (req.path == "/revokeAccessToken")
      service = qtechService.revokeAccessToken();
    else if (req.path == "/resultsDeclare")
      service = qtechService.pendingResultDeclareQT({ body: { multiple: true } });
    else
      service = qtechService.qTechResultDeclare(req.body);
    return service
      .then(result => {
        if (result.statusCode == SUCCESS)
          return ResSuccess(res, { msg: result.data });
        return ResError(res, { msg: result.data });
      }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  },
  generateAccessToken: (req, res) => module.exports.accessToken(req, res),
  getAccessToken: (req, res) => module.exports.accessToken(req, res),
  checkAccessTokenStatus: (req, res) => module.exports.accessToken(req, res),
  revokeAccessToken: (req, res) => module.exports.accessToken(req, res),
  resultDeclare: (req, res) => module.exports.accessToken(req, res),
  resultsDeclare: (req, res) => module.exports.accessToken(req, res),
  gameList(req, res) {
    return qtechService.gameList(req.query)
      .then(result => {
        if (result.statusCode == SUCCESS)
          return ResSuccess(res, { ...result.data });
        return ResError(res, { msg: result.data });
      }).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
  },
  lobbyUrl(req, res) {
    const browser_info = req.headers['user-agent'];
    req.User.browser_info = browser_info;
    req.User.ip_data = req.ip_data;
    req.User.token = req.headers.authorization.replace("Bearer ", "");
    req.User.return_url = (req.protocol == "http" ? "http://" : "https://") + req.hostname + "/dashboard";
    let service;
    if (req.path == "/lobbyUrl")
      service = qtechService.lobbyUrl(req);
    else
      service = qtechService.launchUrl(req);
    return service
      .then(result => {
        return (result.statusCode == SUCCESS) ? ResSuccess(res, { data: result.data }) : ResError(res, { msg: result.data });
      }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  },
  launchUrl: (req, res) => module.exports.lobbyUrl(req, res),
  getSports: (req, res) => sportsController.getSports(req, res),
  providers: (req, res) => sportsController.sports(req, res),
  getPendingResults: (req, res) => qtechService.getPendingResults(req)
    .then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, { data: result.data }) : ResError(res, { msg: result.data }))
    .catch(error => ResError(res, { error, statusCode: STATUS_500 })),
  resettleBalance: (req, res) => {
    return qtechService.resettleBalance(req, res)
      .then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, result.data) : ResError(res, { msg: result.data }))
      .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  },
  playerHistory: (req, res) => {
    return qtechService.playerHistory(req, res)
      .then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, result.data) : ResError(res, { msg: result.data }))
      .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  },
  providersByCurrency: (req, res) => {
    return qtechService.providersByCurrency(req, res)
      .then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, result.data) : ResError(res, { msg: result.data }))
      .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  },
  updateProviderCurrency: (req, res) => {
    return qtechService.updateProviderCurrency(req, res)
      .then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, result.data) : ResError(res, { msg: result.data }))
      .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  },
}