const Joi = require('joi')
  , { SUCCESS } = require("../../utils/constants")
  , qtechService = require('../service/qtechService')
  , userService = require('../service/userService')
  , qtechValidator = require('../../admin-backend/validator/qtechValidator')
  , QT = require("../../utils/qtechConstant")
  , { ObjectId } = require("bson");
const websiteSetting = require('../../models/websiteSetting');

module.exports = {
  gameList: qtechValidator.gameList,
  launchUrl: qtechValidator.launchUrl,
  verifyProvider: qtechValidator.verifyProvider,
  validateAccount: qtechValidator.validateAccount,
  validateQTechUserFields: qtechValidator.validateQTechUserFields,
  validateRewardFields: (req, res, next) => {
    let rewardFields = {
      rewardType: Joi.string().required(), rewardTitle: Joi.string().required(), txnId: Joi.string().required(),
      playerId: Joi.string().required(), amount: Joi.number().required(), currency: Joi.string().required(),
      created: Joi.string().required(),
    };
    Object.keys(req.body).map(key => { if (!rewardFields.hasOwnProperty(key)) rewardFields[key] = Joi.string().required() });
    return Joi.object(rewardFields).validateAsync(req.body, { abortEarly: false })
      .then(() => next()).catch(error => {
        if (error.hasOwnProperty("details")) {
          const response = { "code": QT.REQUEST_DECLINED, "message": error.details.map(data => data.message).toString() };
          qtechService.createLogs({ path: req.path, error: response.message, response }).then();
          return res.status(QT.STATUS_400).json(response);
        }
        const response = { "code": QT.UNKNOWN_ERROR, "message": error.message };
        qtechService.createLogs({ path: req.path, error: response.message, response }).then();
        return res.status(QT.STATUS_500).json(response);
      });
  },
  // QTech realted call back url's.
  verifyPassKey: (req, res, next) => qtechService.verifyPassKey(req, res, next).then(result => {
    if (result.statusCode != SUCCESS) {
      qtechService.createLogs({ path: req.path, error: result.data.data.message, response: result.data.data }).then();
      return res.status(result.data.status).json(result.data.data);
    }
    return next();
  }),
  checkDuplicateEntry: (req, res, next) => {
    return qtechService.checkDuplicateEntry({ ...req.body })
      .then(result => {
        if (result.statusCode == SUCCESS) {
          return qtechService.createRequestObject(req).then(object_reference_id => {
            const response = { "code": QT.REQUEST_DECLINED, "message": result.data.message };
            qtechService.createLogs({ object_reference_id, path: req.path, error: response.message, response }).then();
            return res.json(result.data);
          }).catch(error => {
            const response = { "code": QT.UNKNOWN_ERROR, "message": error.message };
            qtechService.createLogs({ path: req.path, error: response.message, response }).then();
            return res.status(QT.STATUS_500).json(response);
          });
        }
        return next();
      }).catch(error => {
        const response = { "code": QT.UNKNOWN_ERROR, "message": error.message };
        qtechService.createLogs({ path: req.path, error: response.message, response }).then();
        return res.status(QT.STATUS_500).json(response);
      });
  },
  verifySession: (req, res, next) => {
    return qtechService.createRequestObject(req).then(object_reference_id => {
      let service;
      if (object_reference_id) {
        req.object_reference_id = object_reference_id;
        if (!req.headers['wallet-session']) {
          if (req.path.includes("/accounts/") && req.path.includes("/balance"))
            service = qtechService.getUser(req);
          else if (req.path.includes("/transactions/") || req.path.includes("/bonus/rewards")) {
            req.QTbody = {};
            return qtechService.resetUserAmount(req)
              .then(result => {
                if (result.statusCode == SUCCESS) {
                  let response = { "balance": result.data.balance, "referenceId": object_reference_id }
                  qtechService.createLogs({ object_reference_id, response }).then();
                  return res.json(response);
                }
                qtechService.createLogs({ object_reference_id, response: result.data.data }).then();
                return res.status(result.data.status).json(result.data.data);
              }).catch(error => {
                const response = { "code": QT.UNKNOWN_ERROR, "message": error.message };
                qtechService.createLogs({ path: req.path, error: response.message, response }).then();
                return res.status(QT.STATUS_500).json(response);
              });
          } else
            service = qtechService.verifySession(req, res);
        } else
          service = qtechService.verifySession(req, res);
        return service
          .then(result => {
            if (result.statusCode == SUCCESS) {
              qtechService.updateLogs(object_reference_id, { userName: result.data.user_name }).then().catch(console.error);
              req.QTbody = result.data;
              return next();
            }
            qtechService.createLogs({ object_reference_id, response: result.data.data }).then();
            return res.status(result.data.status).json(result.data.data);
          }).catch(error => {
            const response = { "code": QT.UNKNOWN_ERROR, "message": error.message };
            qtechService.createLogs({ path: req.path, error: response.message, response }).then();
            return res.status(QT.STATUS_500).json(response);
          });
      } else {
        const response = { "code": QT.UNKNOWN_ERROR, "message": "object_reference_id not retrieved!" };
        qtechService.createLogs({ path: req.path, error: response.message, response }).then();
        return res.status(QT.STATUS_500).json(response);
      }
    }).catch(error => {
      const response = { "code": QT.UNKNOWN_ERROR, "message": error.message };
      qtechService.createLogs({ path: req.path, error: response.message, response }).then();
      return res.status(QT.STATUS_500).json(response);
    });
  },
  getBalance: (req, res, next) => module.exports.verifySession(req, res, next),
  transactions: (req, res, next) => module.exports.verifySession(req, res, next),
  rollback: (req, res, next) => module.exports.verifySession(req, res, next),
  convertAmount: async (req, res, next) => {

    try {
      const { playerId } = req.body;
      const user = await userService.getUserDetails({ _id: ObjectId(playerId) }, ["domain_name", "parent_level_ids"]);

      if (user.statusCode == SUCCESS) {
        req.body.amount = await qtechService.getConvertedBalance(req.body.amount, user.data.domain_name, false);
        req.User = {
          ...req.User,
          parent_level_ids: user.data.parent_level_ids
        }
      }

      return next();
    } catch (error) {
      const response = { "code": QT.UNKNOWN_ERROR, "message": error.message };
      qtechService.createLogs({ path: req.path, error: response.message, response }).then();
      return res.status(QT.STATUS_500).json(response);
    }
  },
  playerHistory: (req, res, next) => {
    req.user = {};
    req.user._id = req.User._id;
    next();
  }
}