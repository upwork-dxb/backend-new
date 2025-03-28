require('dotenv').config();
const Joi = require('joi')
  , JoiObjectId = require('joi-oid')
  , { ResError } = require('../../lib/expressResponder')
  , { min_utr_value, max_utr_value } = require('../../utils/validationConstant')
  , { updateLogStatus } = require('../service/userActivityLog')
  , { LOG_VALIDATION_FAILED } = require('../../config/constant/userActivityLogConfig')
const { STATUS_422 } = require('../../utils/httpStatusCode');
const { LABEL_DIAMOND, LABEL_UKRAINE } = require('../../utils/constants');
const { DOCUMENT_API_DEFAULT_LIMIT } = require('../../utils/constants');

module.exports = {
  validator: (req, res, next) => {
    req.validationWith = req.validationWith ? req.validationWith : req.body;
    return Joi.object(req.validationFields).validateAsync(req.validationWith, { abortEarly: false })
      .then(joiData => { req.joiData = joiData; next() }).catch(error => {
        // Update activity log status.
        updateLogStatus(req, { status: LOG_VALIDATION_FAILED, msg: error.details.map(data => data.message).toString() })
        return ResError(res, error);
      });
  },
  lotuslaunchUrl: (req, res, next) => {
    req.validationFields = {
      game_id: Joi.optional(),
      device_type: Joi.string().valid("desktop", "mobile").optional(),
      game_type: Joi.string().valid("new", "old", "instant").default("new").optional()
    };
    return module.exports.validator(req, res, next);
  },
  launchInstantUrl: (req, res, next) => {
    req.validationFields = { game_id: Joi.required() };
    return module.exports.validator(req, res, next);
  },
  userCloseAccount: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().required(),
      action: Joi.number().valid(0, 1).required(),
      pass_type: Joi.string().optional(),
    };
    const loginUserBelongsTo = req.User.belongs_to;
    if (loginUserBelongsTo == LABEL_DIAMOND
      || loginUserBelongsTo == LABEL_UKRAINE) {
      req.validationFields['password'] = Joi.string().min(6).max(12).required();
    } else {
      req.validationFields['password'] = Joi.string().min(6).max(12).optional();
    }
    return module.exports.validator(req, res, next);
  },
  userLockAccount: (req, res, next) => module.exports.userCloseAccount(req, res, next),
  getMarketsByCountryCode: (req, res, next) => {
    req.validationFields = {
      sport_id: Joi.string().required(),
      country_code: Joi.string().required(),
    };
    return module.exports.validator(req, res, next);
  },
  oddsResult: (req, res, next) => {
    req.validationFields = {
      market_id: Joi.string().required(),
      selection_id: Joi.number().required(),
      is_tbp: Joi.boolean().default(false).optional(),
    };
    if (req.body.is_tbp) {
      req.validationFields.selection_id = Joi.string().required();
    }
    return module.exports.validator(req, res, next);
  },
  createQtechGame: (req, res, next) => {
    req.validationFields = {
      id: Joi.string().required(),
      name: Joi.string().required(),
      slug: Joi.string().required(),
      provider: Joi.object({
        id: Joi.string().required(),
        name: Joi.string().required(),
      }).required(),
      category: Joi.string().required(),
      images: Joi.array().items(
        Joi.object({
          type: Joi.string().required(),
          url: Joi.string().uri().required(),
        })
      ).required(),
    };
    return module.exports.validator(req, res, next);
  },
  updateQtechGame: (req, res, next) => {
    req.validationFields = {
      id: Joi.string().required(),
      games_order: Joi.number().optional(),
      is_active: Joi.number().optional(),
      image_url: Joi.string().optional(),
      slug: Joi.string().optional()
    };
    return module.exports.validator(req, res, next);
  },
  deleteQtechGame: (req, res, next) => {
    req.validationFields = {
      id: Joi.string().required(),
    };
    return module.exports.validator(req, res, next);
  },
  getQtechGame: (req, res, next) => {
    req.validationFields = {
      id: Joi.string().required(),
    };
    return module.exports.validator(req, res, next);
  },
  getUserNameMobileNoAndName: (req, res, next) => {
    req.validationFields = {
      domain_id: JoiObjectId.objectId().optional(),
      user_name: Joi.string().optional(),
      mobile: Joi.array().items(Joi.number()).optional(),
      limit: Joi.number().min(100).default(100).optional(),
      page: Joi.number().min(1).default(1).optional(),
    };
    return module.exports.validator(req, res, next);
  },
  getUserByUserName: (req, res, next) => {
    req.validationFields = {
      user_name: Joi.string().required()
    };
    return module.exports.validator(req, res, next);
  },
  getwalletTransactionListForParent: (req, res, next) => {
    req.validationFields = {
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      status: Joi.string().optional(),
      statement_type: Joi.string().optional(),
      limit: Joi.number().min(1).default(1).optional(),
      page: Joi.number().min(1).default(1).optional(),
      search: Joi.object().optional()
    };
    return module.exports.validator(req, res, next);
  },
  deleteBet: (req, res, next) => {
    req.validationFields = { ...deleteBet, password: Joi.string().min(6).max(12).required() };
    return module.exports.validator(req, res, next);
  },
  deleteBets: (req, res, next) => {
    req.validationFields = {
      password: Joi.string().min(6).max(12).required(),
      user_id: JoiObjectId.objectId().required(),
      data: Joi.array().items(deleteBet).min(1).required(),
    };
    return module.exports.validator(req, res, next);
  },
  fmImportOrigin: (req, res, next) => {
    if (req.headers.origin != process.env.FM_ORIGIN)
      return ResError(res, { msg: "You are not allowed!", statusCode: STATUS_422 });
    next();
  },
  createSeries: (req, res, next) => {
    req.validationFields = {
      sport_id: Joi.string().required(),
      series_id: Joi.string().required(),
      name: Joi.string().required(),
      is_manual: Joi.string().valid(0, 1).required()
    };
    return module.exports.validator(req, res, next);
  },
  getTvUrlScoreboardUrl: (req, res, next) => {
    req.validationFields = {
      match_id: Joi.string().required()
    };
    return module.exports.validator(req, res, next);
  },
  traderwithdrawlistV2: (req, res, next) => {
    req.validationFields = {
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      status: Joi.string().default("PROGRESS").optional(),
      statement_type: Joi.string().optional(),
      limit: Joi.number().min(1).default(1).optional(),
      page: Joi.number().min(1).default(1).optional(),
      search: Joi.object({
        user_name: Joi.string().optional(),
        parent_user_name: Joi.string().optional(),
        mobile: Joi.string().optional(),
        amount: Joi.string().optional()
      }).optional(),
      from_date: Joi.string().optional(),
      to_date: Joi.string().optional(),
      lowestAmount: Joi.number().optional(),
      highestAmount: Joi.number().optional(),
      sort: Joi.object().optional(),
    };
    return module.exports.validator(req, res, next);
  },
  retryResultDeclare: (req, res, next) => {
    req.validationFields = {
      gameId: Joi.string().required(),
      roundId: Joi.string().required(),
      marketId: Joi.string().required(),
    };
    return module.exports.validator(req, res, next);
  },
  manualResultDeclare: (req, res, next) => {
    req.validationFields = {
      marketId: Joi.string().required(),
    };
    return module.exports.validator(req, res, next);
  },
  lotusBetsValidationObject: {
    user_id: Joi.string().optional(),
    marketId: Joi.string().optional(),
    gameId: Joi.string().optional(),
    roundId: Joi.string().optional(),
    is_void: Joi.boolean().optional(),
    bets_type: Joi.string().valid("open", "settled", "cancelled").default("open").optional(),
    from_date: Joi.string().optional(),
    to_date: Joi.string().optional(),
    limit: Joi.number().max(100).default(10).optional(),
    page: Joi.number().default(1).optional(),
    isBack: Joi.boolean().optional(),
  },
  lotusBets: (req, res, next) => {
    req.validationFields = module.exports.lotusBetsValidationObject;
    return module.exports.validator(req, res, next);
  },
  lotusBetsDocument: (req, res, next) => {
    req.validationFields = {
      ...module.exports.lotusBetsValidationObject,
      document_type: Joi.string().valid("PDF", "EXCEL", "CSV").required(),
      limit: Joi.number().default(DOCUMENT_API_DEFAULT_LIMIT).optional(),
    };
    return module.exports.validator(req, res, next);
  },
  lotusBetsCrDrValidationObject: {
    user_id: Joi.string().optional(),
    provider: Joi.string().required(),
    bets_type: Joi.string().valid("open", "settled", "cancelled").default("open").required(),
    from_date: Joi.string().optional(),
    limit: Joi.number().max(100).default(10).optional(),
    page: Joi.number().default(1).optional(),
  },
  lotusBetsCrDr: (req, res, next) => {
    req.validationFields = module.exports.lotusBetsCrDrValidationObject;
    return module.exports.validator(req, res, next);
  },
  lotusBetsCrDrDocument: (req, res, next) => {
    req.validationFields = {
      ...module.exports.lotusBetsCrDrValidationObject,
      document_type: Joi.string().valid("PDF", "EXCEL", "CSV").required(),
      limit: Joi.number().default(DOCUMENT_API_DEFAULT_LIMIT).optional(),
    };
    return module.exports.validator(req, res, next);
  },
  getLotusLogs: (req, res, next) => {
    req.validationFields = {
      marketId: Joi.optional(),
      roundId: Joi.optional(),
      from_date: Joi.string().optional(),
      to_date: Joi.string().optional(),
    };
    return Joi.object(req.validationFields).min(1).validateAsync(req.body, { abortEarly: false })
      .then(() => next()).catch(error => ResError(res, { msg: error.details.map(data => data.message).toString() }));
  },
  getRoundStatus: (req, res, next) => {
    req.validationFields = {
      objectId: JoiObjectId.objectId().required()
    };
    return module.exports.validator(req, res, next);
  },
  clearExposure: (req, res, next) => {
    req.validationFields = {
      userId: JoiObjectId.objectId().required(),
      marketId: JoiObjectId.objectId().required(),
    };
    return module.exports.validator(req, res, next);
  },
  updateUserPartnership: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().required(),
      partnership: Joi.number().min(1).max(100).required(),
      password: Joi.string().min(6).max(12).required(),
    };
    return module.exports.validator(req, res, next);
  },
  updateChipSummary: (req, res, next) => {
    req.validationFields = {
      isChipSummary: Joi.boolean().required(),
    };
    return module.exports.validator(req, res, next);
  },
  setDailyBonusAmount: (req, res, next) => {
    req.validationFields = {
      daily_bonus_amount: Joi.number().required()
        .min(parseFloat(process.env.MIN_DAILY_BONUS_AMOUNT))
        .max(parseFloat(process.env.MAX_DAILY_BONUS_AMOUNT))
        .default(parseFloat(process.env.DEFAULT_DAILY_BONUS_AMOUNT))
    };
    return module.exports.validator(req, res, next);
  },
  updateDomainNewToOld: (req, res, next) => {
    req.validationFields = {
      old_domain: Joi.string().required(),
      new_domain: Joi.string().required(),
    };
    return module.exports.validator(req, res, next);
  },
  getDomainWiseCounts: (req, res, next) => {
    req.validationFields = {
      domain_name: Joi.string().required()
    };
    return module.exports.validator(req, res, next);
  },
  uploadPopupContent: (req, res, next) => {
    req.validationFields = {
      content: Joi.string().allow("").optional().trim(),
      website: Joi.string().optional().trim(),
      content_type: Joi.string().required().trim(),
      is_active: Joi.boolean().default(false).optional(),
      content_for: Joi.string().valid('mobile', 'desktop').default('desktop').optional().trim(),
    };
    return module.exports.validator(req, res, next);
  },
  allowUnmatchedBet: (req, res, next) => {
    req.validationFields = {
      domain_id: JoiObjectId.objectId().required()
    };
    return module.exports.validator(req, res, next);
  },
  updateTotalUnmatchedBetAllow: (req, res, next) => {
    req.validationFields = {
      domain_id: JoiObjectId.objectId().required(),
      no_of_unmatch_bet_allowed: Joi.number().min(0).max(12).default(0).optional(),
    };
    return module.exports.validator(req, res, next);
  },
  resetTVandScoreBoardURL: (req, res, next) => {
    req.validationFields = {
      password: Joi.string().min(6).max(12).required(),
      user_id: Joi.string().required()

    };
    return module.exports.validator(req, res, next);
  },
  deleteBankMethodOrBankDetails: (req, res, next) => {
    const path = req.path.includes('deleteBankDetail') ? 'deleteBankDetail' : 'deleteBankMethod';
    // Common validation fields
    const commonValidationFields = {
      password: Joi.string().min(6).max(12).required(),
      user_id: Joi.string().required(),
      is_restore: Joi.boolean().default(false).optional(),
    };
    // Validation specific to bank method or bank detail
    const specificValidationFields = path === 'deleteBankMethod'
      ? {
        method_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("method_id must be a valid ObjectId").trim().required(),
      }
      : {
        bank_detail_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("bank_detail_id must be a valid ObjectId").trim().required(),
        is_delete_permanently: Joi.boolean().default(false).optional(),
      };
    req.validationFields = { ...commonValidationFields, ...specificValidationFields };
    return module.exports.validator(req, res, next);
  },
  showAgents: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().required()
    };
    return module.exports.validator(req, res, next);
  },
  getExpiryDaysAndMsg: (req, res, next) => {
    req.validationFields = {
      is_bank_method: Joi.boolean().default(false).optional()
    };
    return module.exports.validator(req, res, next);
  },
  markDealerAsB2c: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().required(),
      is_b2c_dealer: Joi.boolean().required()
    };
    return module.exports.validator(req, res, next);
  },
  createBankType: (req, res, next) => {
    req.validationFields = {
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      method_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("method_id must be a valid ObjectId").trim().optional(),
      bank_name: Joi.string(),
      bank_holder_name: Joi.string(),
      ifsc_code: Joi.string(),
      account_no: Joi.string(),
      others: Joi.string(),
    };
    return module.exports.validator(req, res, next);
  },
  getParentPayementDetails: (req, res, next) => {
    req.validationFields = {
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      method_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("method_id must be a valid ObjectId").trim().optional(),
      domain_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("domain_id must be a valid ObjectId").trim().optional(),
    };
    return module.exports.validator(req, res, next);
  },
  getPayementMethod: (req, res, next) => {
    req.validationFields = {
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      domain_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("domain_id must be a valid ObjectId").trim().optional(),
      type: Joi.string().required(),
    };
    return module.exports.validator(req, res, next);
  },
  getwalletAllTransaction: (req, res, next) => {
    req.validationFields = {
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      limit: Joi.number().min(5).max(1000).default(50).optional(),
      page: Joi.number().min(1).max(250).default(1).optional(),
      fullSearch: Joi.object().optional(),
      partialSearch: Joi.object().optional(),
      sort: Joi.object().optional(),
      from_date: Joi.string().optional(),
      to_date: Joi.string().optional(),
      lowestAmount: Joi.number().optional(),
      highestAmount: Joi.number().optional(),
    };
    return module.exports.validator(req, res, next);
  },
  depositAcceptedByDeler: (req, res, next) => {
    req.validationFields = {
      statement_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("statement_id must be a valid ObjectId").trim().optional(),
      crdr: Joi.number().valid(1, 2).required(),
      remark: Joi.string().optional(),
      reference_no: Joi.string()
        .min(min_utr_value).message(`UTR must be ${min_utr_value} digits long.`)
        .max(max_utr_value).message(`UTR must be ${min_utr_value} digits long.`)
        .required(),
    };
    return module.exports.validator(req, res, next);
  },
  withDrawalAcceptedByDeler: (req, res, next) => {
    req.validationFields = {
      statement_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("statement_id must be a valid ObjectId").trim().optional(),
      crdr: Joi.number().valid(1, 2).required(),
      remark: Joi.string().optional()
    };
    return module.exports.validator(req, res, next);
  },
  casinoResultsValidationObject: {
    limit: Joi.number().max(100).default(10).optional(),
    page: Joi.number().default(1).optional(),
    match_id: Joi.string().required(),
    from_date: Joi.string().required(),
  },
  casinoResults: (req, res, next) => {
    req.validationFields = module.exports.casinoResultsValidationObject;
    return module.exports.validator(req, res, next);
  },
  casinoResultsDocument: (req, res, next) => {
    req.validationFields = {
      ...module.exports.casinoResultsValidationObject,
      document_type: Joi.string().valid("PDF", "EXCEL").required(),
      limit: Joi.number().default(DOCUMENT_API_DEFAULT_LIMIT).optional(),
    };
    return module.exports.validator(req, res, next);
  },
  eventAnalysis: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().optional(),
    };
    return module.exports.validator(req, res, next);
  },
  qtechExposures: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().optional(),
    };
    return module.exports.validator(req, res, next);
  },
}

let deleteBet = {
  bet_id: JoiObjectId.objectId().required(),
  user_id: JoiObjectId.objectId().required(),
  is_fancy: Joi.number().valid(0, 1).default(0).optional(),
  is_void: Joi.boolean().default(false).optional()
};