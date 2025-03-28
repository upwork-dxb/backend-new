const Joi = require('joi');
const { getwalletTransactionListForParent, traderwithdrawlistV2, deleteBankMethodOrBankDetails, getExpiryDaysAndMsg, createBankType,
  getParentPayementDetails, getPayementMethod, getwalletAllTransaction, depositAcceptedByDeler, withDrawalAcceptedByDeler
} = require('./');
const { validator } = require('./');

module.exports = {
  validator, getwalletTransactionListForParent, traderwithdrawlistV2, deleteBankMethodOrBankDetails, getExpiryDaysAndMsg, createBankType,
  getParentPayementDetails, getPayementMethod, getwalletAllTransaction, depositAcceptedByDeler, withDrawalAcceptedByDeler,

  getAllTransactionsList: (req, res, next) => {
    req.validationFields = {
      status: Joi.string().default("ALL").optional(),
      statement_type: Joi.string().default("ALL").optional(),
      limit: Joi.number().min(1).default(1).optional(),
      page: Joi.number().min(1).default(1).optional(),
      from_date: Joi.string().optional(),
      to_date: Joi.string().optional(),
      search: Joi.object({
        user_name: Joi.string().optional(),
        parent_user_name: Joi.string().optional()
      }).optional(),
    };
    return module.exports.validator(req, res, next);
  },
  getwalletDWTransactionList: (req, res, next) => {
    req.validationFields = {
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      limit: Joi.number().min(1).max(1000).default(50).optional(),
      page: Joi.number().min(1).max(250).default(1).optional(),
      fullSearch: Joi.object({
        statement_type: Joi.string().optional(),
        user_name: Joi.string().optional(),
        parent_user_name: Joi.string().optional(),
        reference_no: Joi.string().optional(),
        amount: Joi.number().optional()
      }).optional(),
      partialSearch: Joi.object().optional(),
      sort: Joi.object().optional(),
      from_date: Joi.string().optional(),
      to_date: Joi.string().optional(),
      lowestAmount: Joi.number().optional(),
      highestAmount: Joi.number().optional(),
      status: Joi.string().default("ALL").optional(),
    };
    return module.exports.validator(req, res, next);
  }
};

