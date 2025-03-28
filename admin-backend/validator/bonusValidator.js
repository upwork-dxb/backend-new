// Libraries
const Joi = require('joi');
const JoiObjectId = require('joi-oid');

// Validators
const { validator } = require('./');
const { USER_TYPE_SUPER_ADMIN } = require('../../utils/constants');

module.exports = {
  validator,

  logs: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().optional(),
      domain_id: JoiObjectId.objectId().optional(),
      domain_name: Joi.string().optional(),
      from_date: Joi.string().optional(),
      to_date: Joi.string().optional(),
      limit: Joi.number().max(100).default(10).optional(),
      page: Joi.number().default(1).optional(),
    };

    if (req.User.user_type_id != USER_TYPE_SUPER_ADMIN) {
      delete req.validationFields["user_id"];
      delete req.validationFields["domain_id"];
      delete req.validationFields["domain_name"];
    }

    return module.exports.validator(req, res, next);
  },
};