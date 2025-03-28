const Joi = require("joi");
const JoiObjectId = require("joi-oid");
const { validator } = require("./");

module.exports = {
  validator,

  betLock: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().required(),
      lockType: Joi.number().valid(0, 1).required(),
      betLockType: Joi.string().valid("market", "fancy").required(),
      pass_type: Joi.string().valid("TRXN_PASSWORD").required(),
      password: Joi.string().required(),
    };

    getBetLockList(req);

    return module.exports.validator(req, res, next);
  },

  getBetLockList: (req, res, next) => {
    req.validationFields = {
      limit: Joi.number().min(10).max(100).default(50).optional(),
      page: Joi.number().min(1).default(1).optional(),
      betLockType: Joi.string().valid("market", "fancy").required(),
    };
    getBetLockList(req);
    return module.exports.validator(req, res, next);
  },
};

function getBetLockList(req) {
  if (req.body.betLockType == "market") {
    req.validationFields["market_id"] = Joi.string().required();
  } else {
    req.validationFields["match_id"] = Joi.string().required();
    req.validationFields["category"] = Joi.number()
      .valid(0, 1, 2, 3)
      .required();
  }
}
