const Joi = require('joi')
  , JoiObjectId = require('joi-oid')
  , { ResError } = require('../../../lib/expressResponder');

module.exports = {

  launchUrl: (req, res, next) => {
    return Joi.object({
      game_id: Joi.optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(() => {
        next();
      }).catch(error => {
        return ResError(res, { msg: error.details.map(data => data.message).toString() });
      });
  },

  retryResultDeclare: (req, res, next) => {
    return Joi.object({
      objectId: JoiObjectId.objectId().required()
    }).validateAsync(req.body, { abortEarly: false })
      .then(() => {
        next();
      }).catch(error => {
        return ResError(res, { msg: error.details.map(data => data.message).toString() });
      });
  },

  getRoundStatus: (req, res, next) => {
    return Joi.object({
      roundId: Joi.string().required(),
      playerId: Joi.string().required()
    }).validateAsync(req.body, { abortEarly: false })
      .then(() => {
        next();
      }).catch(error => {
        return ResError(res, { msg: error.details.map(data => data.message).toString() });
      });
  },

  voidResult: (req, res, next) => {
    return Joi.object({
      roundId: Joi.string().required(),
      eventId: Joi.string().required()
    }).validateAsync(req.body, { abortEarly: false })
      .then(() => {
        next();
      }).catch(error => {
        return ResError(res, { msg: error.details.map(data => data.message).toString() });
      });
  },

  manualResultDeclare: (req, res, next) => {
    return Joi.object({
      roundId: Joi.string().required()
    }).validateAsync(req.body, { abortEarly: false })
      .then(() => {
        next();
      }).catch(error => {
        return ResError(res, { msg: error.details.map(data => data.message).toString() });
      });
  },

  logs: (req, res, next) => {
    return Joi.object({
      marketId: Joi.optional(),
      roundId: Joi.optional(),
      from_date: Joi.string().optional(),
      to_date: Joi.string().optional(),
      limit: Joi.number().max(100).default(10).optional(),
      page: Joi.number().default(1).optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(joiData => { req.joiData = joiData; next() }).catch(error => {
        return ResError(res, { msg: error.details.map(data => data.message).toString() });
      });
  }

}