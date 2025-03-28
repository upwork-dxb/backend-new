const Joi = require("joi");
const JoiObjectId = require("joi-oid");
const { ResError } = require("../../lib/expressResponder");
const { oddsResult, fmImportOrigin, deleteBet, deleteBets } = require("./");
const { validator } = require("./");
const { DOCUMENT_API_DEFAULT_LIMIT } = require('../../utils/constants');

module.exports = {
  validator,
  oddsResult,
  fmImportOrigin,
  deleteBet,
  deleteBets,
  sessionResult: (req, res, next) => {
    req.validationFields = {
      sport_id: Joi.string().optional(),
      sport_name: Joi.string().optional(),
      series_id: Joi.string().optional(),
      series_name: Joi.string().optional(),
      match_id: Joi.string().optional(),
      match_name: Joi.string().optional(),
      match_date: Joi.string().optional(),
      fancy_id: Joi.string().required(),
      fancy_name: Joi.string().optional(),
      result: Joi.number().required(),
    };

    return module.exports.validator(req, res, next);
  },

  sessionRollback: (req, res, next) => {
    req.validationFields = {
      fancy_id: Joi.string().required(),
    };

    return module.exports.validator(req, res, next);
  },
  sessionAbandoned: (req, res, next) => {
    req.validationFields = {
      fancy_id: Joi.string().required(),
      rollback: Joi.number().default(0).optional(),
    };
    return module.exports.validator(req, res, next);
  },
  oddsAbandoned: (req, res, next) => {
    req.validationFields = {
      market_id: Joi.string().required(),
      rollback: Joi.number().default(0).optional(),
    };
    return module.exports.validator(req, res, next);
  },
  getExposuresEventWise: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().optional(),
      event_id: Joi.string().optional(),
    };
    return module.exports.validator(req, res, next);
  },
  betResultDetails: (req, res, next) => {
    req.validationFields = {
      market_id: Joi.string().optional(),
    };
    return module.exports.validator(req, res, next);
  },

  getBetsEventTypesList: (req, res, next) => {
    req.validationFields = {
      match_id: Joi.string().required(),
    };
    return module.exports.validator(req, res, next);
  },

  betsValidationObject: {
    user_id: JoiObjectId.objectId().optional(),
    match_id: Joi.string().optional(),
    market_id: Joi.optional(),
    fancy_id: Joi.optional(),
    search: Joi.object({
      _id: JoiObjectId.objectId().optional(),
      user_id: JoiObjectId.objectId().optional(),
      user_name: Joi.string().min(3).max(20).optional(),
      domain_name: Joi.string().optional(),
      sport_id: Joi.string().optional(),
      series_id: Joi.string().optional(),
      match_id: Joi.string().optional(),
      market_id: Joi.string().optional(),
      fancy_id: Joi.string().optional(),
      market_name: Joi.string().optional(),
      fancy_name: Joi.string().optional(),
      selection_id: Joi.number().optional(),
      selection_name: Joi.string().optional(),
      sort_name: Joi.string().optional(),
      winner_name: Joi.string().optional(),
      type: Joi.number().optional(),
      is_fancy: Joi.number().optional(),
      odds: Joi.number().optional(),
      run: Joi.number().optional(),
      size: Joi.number().optional(),
      stack: Joi.number().optional(),
      is_back: Joi.number().valid(0, 1).optional(),
      p_l: Joi.number().optional(),
      liability: Joi.number().optional(),
      bet_result_id: Joi.optional(),
      device_type: Joi.string().optional(),
      ip_address: Joi.string().optional(),
      device_info: Joi.string().optional(),
      is_fraud_bet: Joi.number().valid(0, 1, 2).optional(),
      delete_status: Joi.optional(),
      deleted_reason: Joi.string().optional(),
      deleted_by: Joi.string().optional(),
      deleted_from_ip: Joi.string().optional(),
      createdAt: Joi.string().optional(),
      updatedAt: Joi.string().optional(),
      is_matched: Joi.number().valid(0, 1).optional(),
      category: Joi.number().valid(0, 1, 2, 3).optional(),
      category_name: Joi.string().optional(),
      market_type: Joi.string().optional(),
      amount_from: Joi.number().optional(),
      amount_to: Joi.number().optional(),
    }).optional(),
    from_date: Joi.string().optional(),
    to_date: Joi.string().optional(),
    limit: Joi.number().min(25).default(25).optional(),
    page: Joi.number().min(1).max(4000).default(1).optional(),
    round_id: Joi.optional(),
    type: Joi.optional(),
  },

  bets: (req, res, next) => {
    req.validationFields = module.exports.betsValidationObject;
    return module.exports.validator(req, res, next);
  },

  betsDocument: (req, res, next) => {
    req.validationFields = {
      ...module.exports.betsValidationObject,
      document_type: Joi.string().valid("PDF", "EXCEL", "CSV").required(),
      limit: Joi.number().default(DOCUMENT_API_DEFAULT_LIMIT).optional(),
    };
    return module.exports.validator(req, res, next);
  },
  
  getResultProgress: (req, res, next) => {
    req.validationFields = {
      isFancy: Joi.boolean().default(true).optional(),
      type: Joi.string().valid('RESULT', 'ROLLBACK').default('RESULT').optional(),
    };
    return module.exports.validator(req, res, next);
  },
  resetStruckResult: (req, res, next) => {
    req.validationFields = {
      isFancy: Joi.boolean().default(true).optional(),
      id: Joi.string().required(),
      type: Joi.string().valid('RESULT', 'ROLLBACK').default('RESULT').optional(),
      
    };
    return module.exports.validator(req, res, next);
  },
};
