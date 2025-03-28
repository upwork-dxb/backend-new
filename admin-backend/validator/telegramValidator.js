const Joi = require('joi');
const JoiObjectId = require('joi-oid');
const { validator } = require('./');

module.exports = {
  validator,
  createTelegramConnectionId: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().required(),
      password: Joi.string().required(),
    }
    return module.exports.validator(req, res, next);
  },
  enableTelegramByParent: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().required(),
      is_enable_telegram_default: Joi.number().default(0).required(),
      password: Joi.string().required(),
    }
    return module.exports.validator(req, res, next);
  },
}