const { SUCCESS } = require('../../utils/constants')
  , qtechService = require('../service/qtechService')
  , QT = require("../../utils/qtechConstant");

module.exports = {
  verifySession(req, res) {
    const object_reference_id = req.object_reference_id;
    qtechService.createLogs({ object_reference_id, response: req.QTbody }).then();
    return res.json(req.QTbody);
  },
  getBalance: (req, res, next) => module.exports.verifySession(req, res, next),
  async transactions(req, res) {
    const object_reference_id = req.object_reference_id;
    let service;
    if (req.path == "/transactions/")
      service = qtechService.transactions(req);
    else
      service = qtechService.rollback(req);
    try {
      let result = await service;
      if (result.statusCode == SUCCESS) {
        qtechService.createLogs({ object_reference_id, response: result.data }).then();
        return res.json(result.data);
      }
      qtechService.createLogs({ object_reference_id, response: result.data.data }).then();
      return res.status(result.data.status).json(result.data.data);
    } catch (error) {
      const response = { "code": QT.UNKNOWN_ERROR, "message": error.message };
      qtechService.createLogs({ object_reference_id, path: req.path, error: response.message, response }).then();
      return res.status(QT.STATUS_500).json(response);
    }
  },
  rollback: (req, res) => module.exports.transactions(req, res)
}