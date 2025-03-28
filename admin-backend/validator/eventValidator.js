const { FANCY_CATEGORY_DIAMOND } = require('../../utils/constants');
const { validator } = require('./');
const Joi = require('joi')
  , JoiObjectId = require('joi-oid')
  , { ResError } = require('../../lib/expressResponder');

module.exports = {
  validator,
  block: (req, res, next) => {
    req.validationFields = {
      event: Joi.string().valid("Sport", "Series", "Match", "Market", "Fancy").required(),
      filter: Joi.object({
        sport_id: Joi.string().when('country_code', {
          is: Joi.exist(),
          then: Joi.string().required(),
          otherwise: Joi.string().optional(),
        }),
        series_id: Joi.string().optional(),
        country_code: Joi.string().optional(),
        match_id: Joi.string().when('category', {
          is: Joi.exist(),
          then: Joi.string().required(),
          otherwise: Joi.string().optional(),
        }),
        market_id: Joi.string().optional(),
        fancy_id: Joi.string().optional(),
        category: Joi.string().valid(...(Object.keys(FANCY_CATEGORY_DIAMOND))).optional(),
      }).or("sport_id", "series_id", "country_code", "match_id", "market_id", "fancy_id", "category").required(),
      user_id: JoiObjectId.objectId().optional(),
    };
    return module.exports.validator(req, res, next);
  },
}
