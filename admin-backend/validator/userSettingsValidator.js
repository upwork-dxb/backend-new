const Joi = require('joi')
  , JoiObjectId = require('joi-oid')
  , { validator } = require('./')
  , { USER_TYPE_SUPER_ADMIN } = require('../../utils/constants')

module.exports = {
  validator,
  update: (req, res, next) => {
    req.validationFields = {
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").optional(),
      sports_settings: Joi.array().min(1).required(),
      sport_id: Joi.string().required(),
    }
    return module.exports.validator(req, res, next);
  },
  updateCommission: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().optional(),
      user_type_id: Joi.number().default(USER_TYPE_SUPER_ADMIN).optional(),
      match_commission: Joi.number().min(0).max(99).optional(),
      session_commission: Joi.number().min(0).max(99).optional(),
    };
    req.validationSchema = Joi.object(req.validationFields)
      .or('match_commission', 'session_commission')
      .messages({
        'object.missing': 'Either match_commission or session_commission must be provided.',
      });
    return module.exports.validator(req, res, next);
  }
};
