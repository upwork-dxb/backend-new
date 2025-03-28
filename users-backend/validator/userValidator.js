const Joi = require('joi');
const JoiObjectId = require('joi-oid');
const { ResError } = require('../../lib/expressResponder');
const { validator } = require("./");

module.exports = {
  updateMatchStack: (req, res, next) => {
    return Joi.object({ match_stack: Joi.array().min(2).max(15).required() })
      .validateAsync(req.body, { abortEarly: false })
      .then(() => next())
      .catch(error => {
        return ResError(res, error);
      });
  },
  getUserBalance: (req, res, next) => {
    req.validationFields = {
      userid: JoiObjectId.objectId().optional(),
      calculated_liablity: Joi.boolean().optional(),
    };
    req.isUser = true;
    return validator(req, res, next);
  },
}