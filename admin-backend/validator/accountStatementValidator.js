const Joi = require('joi');
const JoiObjectId = require('joi-oid');
const { ResError } = require('../../lib/expressResponder');
const { DOCUMENT_API_DEFAULT_LIMIT } = require('../../utils/constants');

module.exports = {

  validator: (req, res, next) => {
    req.validationWith = req.validationWith ? req.validationWith : req.body;
    return Joi.object(req.validationFields).validateAsync(req.validationWith, { abortEarly: false })
      .then(joiData => { req.joiData = joiData; next() }).catch(error => {
        if (error.hasOwnProperty("details"))
          return ResError(res, { msg: error.details.map(data => data.message).toString() });
        return ResError(res, error);
      });
  },

  makeSettlement: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().required(),
      amount: Joi.number().greater(0).required(),
      type: Joi.number().valid(1, 2).required(),
      comment: Joi.string().default('').allow('').optional(),
      password: Joi.string().min(6).max(12).required(),
    };
    return module.exports.validator(req, res, next);
  },
  makeSettlementDiamond: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().required(),
      amount: Joi.number()
        .custom((value, helpers) => {
          if (value < 1) {
            return helpers.error('any.invalid');
          }
          return value;
        })
        .messages({
          'any.invalid': 'Enter a valid amount'
        }).required(),
      type: Joi.number().valid(1, 2).required(),
      comment: Joi.string().default('').allow('').optional(),
      password: Joi.string().min(6).max(12).required(),
      pass_type: Joi.string().valid('PASSWORD', 'TRXN_PASSWORD').required(),
    }
    return module.exports.validator(req, res, next);
  },
  makeSettlementDiamondMulti: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().required(),
      data: Joi.array().items({
        user_id: JoiObjectId.objectId().required(),
        amount: Joi.number()
          .custom((value, helpers) => {
            if (value < 1) {
              return helpers.error('any.invalid');
            }
            return value;
          })
          .messages({
            'any.invalid': 'Enter a valid amount'
          }).required(),
        type: Joi.number().valid(1, 2).required(),
        comment: Joi.string().default('').allow('').optional(),
      }).min(1).required(),
      password: Joi.string().min(6).max(12).required(),
      pass_type: Joi.string().valid('PASSWORD', 'TRXN_PASSWORD').required(),
    }
    return module.exports.validator(req, res, next);
  },
  chipInOutDiamond: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.required(),
      remark: Joi.string().allow('', null).trim(),
      amount: Joi.number().greater(0).required(),
      crdr: Joi.number().valid(1, 2).required(),
      password: Joi.string().min(6).max(12).required(),
      pass_type: Joi.string().valid('PASSWORD', 'TRXN_PASSWORD').required(),
    };

    return module.exports.validator(req, res, next);
  },
  statementValidationObject: {
    user_id: JoiObjectId.objectId().optional(),
    sport_id: Joi.string().optional(),
    from_date: Joi.string().optional(),
    to_date: Joi.string().optional(),
    limit: Joi.number().min(5).max(150).optional(),
    page: Joi.number().min(1).default(1).optional(),
    statement_type: Joi.number().optional().default(null),
    sub_statement_type: Joi.number().optional().default(null),
    search: Joi.object().optional(),
    sort: Joi.object({
      _id: Joi.number().min(-1).max(1).default(-1).optional(),
    }).optional(),
  },
  statements: (req, res, next) => {
    req.validationFields = module.exports.statementValidationObject;

    return module.exports.validator(req, res, next);
  },
  statementsDocument: (req, res, next) => {
    req.validationFields = {
      ...module.exports.statementValidationObject,
      document_type: Joi.string().valid("PDF", "EXCEL", "CSV").required(),
      limit: Joi.number().default(DOCUMENT_API_DEFAULT_LIMIT).optional(),
    };

    return module.exports.validator(req, res, next);
  },
};