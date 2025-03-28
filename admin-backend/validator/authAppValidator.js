const Joi = require("joi");
const JoiObjectId = require("joi-oid");
const { validator } = require("./");

module.exports = {
  validator,
  addAccount: (req, res, next) => {
    req.validationFields = {
      app_id: Joi.string().required(),
      user_name: Joi.string().required(),
      password: Joi.string().min(6).max(14).required(),
    };
    return module.exports.validator(req, res, next);
  },
  verifyOTP: (req, res, next) => {
    req.validationFields = {
      app_id: Joi.string().required(),
      user_name: Joi.string().required(),
      password: Joi.string().min(6).max(14).required(),
      otp: Joi.string().required(),
    };
    return module.exports.validator(req, res, next);
  },
  disableAuthApp: (req, res, next) => {
    req.validationFields = {
      otp: Joi.string().required(),
    };
    return module.exports.validator(req, res, next);
  },
  adminRemoveAuthApp: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().required(),
      password: Joi.string().min(6).max(14).required(),
      pass_type: Joi.string().valid("PASSWORD", "TRXN_PASSWORD").optional(),
    };
    return module.exports.validator(req, res, next);
  },
};
