const { fmImportOrigin, getMarketsByCountryCode, validator } = require("./");
const Joi = require("joi");
const JoiObjectId = require("joi-oid");

module.exports = {
  validator,
  fmImportOrigin,
  getMarketsByCountryCode,

  updateMarketStatus: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().optional(),
      market_id: Joi.string().required(),
      is_active: Joi.number().valid(0, 1).optional(),
    };
    return module.exports.validator(req, res, next);
  },
  diamondUserBook: (req, res, next) => {
    req.validationFields = {
      market_id: Joi.string().required(),
    };
    return module.exports.validator(req, res, next);
  },
};
