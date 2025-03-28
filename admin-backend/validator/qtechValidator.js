const Joi = require("joi");
const JoiObjectId = require("joi-oid");
const qtechService = require("../service/qtechService");
const { SUCCESS } = require("../../utils/constants");
const { ResError } = require("../../lib/expressResponder");
const { getCurrencyCodeList } = require("../../utils");
const { validator } = require("./");
const launchUrl = {
  gameId: Joi.string().required(),
  providerCode: Joi.string().required(),
  tableId: Joi.string().optional(),
};
const QT = require("../../utils/qtechConstant");

module.exports = {
  validator,
  launchUrl: (req, res, next) => {
    return Joi.object(launchUrl)
      .validateAsync(req.body, { abortEarly: false })
      .then(() => {
        next();
      })
      .catch((error) => {
        if (error.hasOwnProperty("details"))
          return ResError(res, {
            msg: error.details.map((data) => data.message).toString(),
          });
        return ResError(res, error);
      });
  },
  gameList: function (req, res, next) {
    return Joi.object({
      size: Joi.number().optional(),
      operatorId: Joi.string().optional(),
      providers: Joi.string().optional(),
      currencies: Joi.string().optional(),
      languages: Joi.string().optional(),
      gameTypes: Joi.string().optional(),
      includeFields: Joi.string().optional(),
    })
      .validateAsync(req.query, { abortEarly: false })
      .then(() => {
        next();
      })
      .catch((error) => {
        if (error.hasOwnProperty("details"))
          return ResError(res, {
            msg: error.details.map((data) => data.message).toString(),
          });
        return ResError(res, error);
      });
  },
  verifyProvider: (req, res, next) => {
    return qtechService
      .verifyProvider(req)
      .then((provider) => {
        if (provider.statusCode != SUCCESS) {
          return ResError(res, { msg: provider.data });
        }
        Object.assign(req.body, provider.data);
        return next();
      })
      .catch((error) => ResError(res, error));
  },
  validateAccount: (req, res, next) => {
    return qtechService
      .validateAccount(req)
      .then((result) =>
        result.statusCode != SUCCESS
          ? ResError(res, { msg: result.data })
          : next(),
      )
      .catch((error) => ResError(res, error));
  },
  resultDeclare: function (req, res, next) {
    return Joi.object({
      roundId: Joi.string().required(),
      retry: Joi.number().default(0).optional(),
    })
      .validateAsync(req.body, { abortEarly: false })
      .then(() => {
        next();
      })
      .catch((error) => {
        if (error.hasOwnProperty("details"))
          return ResError(res, {
            msg: error.details.map((data) => data.message).toString(),
          });
        return ResError(res, error);
      });
  },
  playerHistory: function (req, res, next) {
    req.validationFields = {
      user_id: JoiObjectId.required(),
    };

    return module.exports.validator(req, res, next);
  },

  updateProviderCurrency: function (req, res, next) {
    req.validationFields = {
      sport_id: Joi.string().required(),
      currency: Joi.string().valid(...getCurrencyCodeList()).required(),
    };

    return module.exports.validator(req, res, next);
  },
  validateQTechUserFields: (req, res, next) => {
    if (req?.headers['wallet-session'] && req?.headers['wallet-session'].includes(QT.QT_USER_ID_DELIMITER)) {
      const [userId, currency] = req.headers['wallet-session'].split(QT.QT_USER_ID_DELIMITER);
      req.headers['wallet-session'] = userId;
      req.body.currency = currency;
    }
    if (req?.params?.playerId && req?.params?.playerId.includes(QT.QT_USER_ID_DELIMITER)) {
      const [userId, currency] = req.params.playerId.split(QT.QT_USER_ID_DELIMITER);
      req.params.playerId = userId;
      req.body.currency = currency;
    }
    if (req?.body?.playerId && req?.body?.playerId.includes(QT.QT_USER_ID_DELIMITER)) {
      const [userId, currency] = req.body.playerId.split(QT.QT_USER_ID_DELIMITER);
      req.body.playerId = userId;
      req.body.currency = currency;
    }
    next();
  }
};
