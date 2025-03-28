// Libraries
const Joi = require('joi');
const JoiObjectId = require('joi-oid');

// Validators
const { updateDomainNewToOld, getDomainWiseCounts, allowUnmatchedBet, updateTotalUnmatchedBetAllow, validator } = require('./');

module.exports = {

  updateDomainNewToOld, getDomainWiseCounts, allowUnmatchedBet, updateTotalUnmatchedBetAllow,

  validator,

  updateBonusAllowed: (req, res, next) => {

    req.validationFields = {};
    if (req.User.user_type_id == USER_TYPE_SUPER_ADMIN) {
      req.validationFields = {
        domain_id: JoiObjectId.objectId().required(),
      };
    }

    return module.exports.validator(req, res, next);
  },

  updateBonusData: (req, res, next) => {
    req.validationFields = {
      bonus_data: Joi.array().items(
        Joi.object({
          name: Joi.string().trim().max(30).required(),
          bonus_type: Joi.string().trim().max(30).required(),
          is_active: Joi.boolean().required(),
          display_text: Joi.string().trim().max(30).optional(),
          percentage: Joi.number().min(0).max(500).required(),
        })).min(1).required(),
    };

    if (req.User.user_type_id == USER_TYPE_SUPER_ADMIN) {
      req.validationFields["domain_id"] = JoiObjectId.objectId().required();
    }

    return module.exports.validator(req, res, next);
  },
  allowDiamondRateLimit: (req, res, next) => {
    req.validationFields = {
      domain_id: JoiObjectId.objectId().required(),
    };
    return module.exports.validator(req, res, next);
  },
};