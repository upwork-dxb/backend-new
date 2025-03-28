const Joi = require('joi')
  , JoiObjectId = require('joi-oid')
  , { validator } = require('./')

module.exports = {
  validator,
  updateSportsStatus: (req, res, next) => {
    req.validationFields = {
      userid: Joi.string().required(),
      sport_id: Joi.string().required(),
      is_active: Joi.number().required(),
      user_typeId: Joi.optional()
    }
    return module.exports.validator(req, res, next);
  },
  userlock: (req, res, next) => {
    req.validationFields = {
      pass_type: Joi.string().valid('TRXN_PASSWORD').required(),
      password: Joi.string().required(),
      user_id: JoiObjectId.objectId().required(),
      dashboard: Joi.boolean().optional(),
      include_count: Joi.boolean().default(false).optional(),
    }
    return module.exports.validator(req, res, next);
  }

};
