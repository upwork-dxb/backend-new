// Libraries
const Joi = require("joi");
const CONSTANTS = require("../../utils/constants");
const { getCountryCodeOnly } = require("../../utils");

// Validators
const { validator } = require("./");
// List of known mobile country codes
const mobileCountryCodes = getCountryCodeOnly(); // Add more country codes as needed
module.exports = {
  validator,
  resetPassword: (req, res, next) => {
    req.validationFields = {
      mobile: Joi.string().trim().required(),
      country_code: Joi.string()
        .valid(...mobileCountryCodes)
        .valid(CONSTANTS.DEFAULT_COUNTRY_CODE)
        .error(new Error("Please enter a valid country code!"))
        .optional(),
    };
    return module.exports.validator(req, res, next);
  },
  verifyResetPasswordOtp: (req, res, next) => {
    req.validationFields = {
      orderId: Joi.string().required(),
      otp: Joi.number().required(),
    };
    return module.exports.validator(req, res, next);
  },
  resendResetPasswordOtp: (req, res, next) => {
    req.validationFields = {
      orderId: Joi.string().required(),
    };
    return module.exports.validator(req, res, next);
  },
  setPassword: (req, res, next) => {
    req.validationFields = {
      newPassword: Joi.string().min(6).max(12).required(),
      confirmPassword: Joi.string()
        .valid(Joi.ref("newPassword"))
        .required()
        .messages({
          "any.only": "Confirm password must match the new password",
        }),
      orderId: Joi.string().required(),
    };
    return module.exports.validator(req, res, next);
  },
};
