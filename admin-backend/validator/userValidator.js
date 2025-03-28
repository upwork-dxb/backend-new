const Joi = require('joi')
  , JoiObjectId = require('joi-oid')
  , { updateLogStatus } = require('../service/userActivityLog')
  , { LOG_VALIDATION_FAILED } = require('../../config/constant/userActivityLogConfig')
  , VALIDATION = require('../../utils/validationConstant')
const {
  userCloseAccount: closeAccount, userLockAccount: lockAccount, getUserNameMobileNoAndName, getUserByUserName, setDailyBonusAmount,
  updateUserPartnership, updateChipSummary, showAgents, markDealerAsB2c
} = require('./');
const { ResError } = require('../../lib/expressResponder');
const { LABEL_DIAMOND, LABEL_UKRAINE, DOCUMENT_API_DEFAULT_LIMIT } = require('../../utils/constants');

module.exports = {
  validator: (req, res, next) => {
    req.validationWith = req.validationWith ? req.validationWith : req.body;
    return Joi.object(req.validationFields).validateAsync(req.validationWith, { abortEarly: false })
      .then(joiData => { req.joiData = joiData; next() }).catch(error => {
        // Update activity log status.
        updateLogStatus(req, { status: LOG_VALIDATION_FAILED, msg: error.details.map(data => data.message).toString() })
        if (error.hasOwnProperty("details"))
          return ResError(res, { msg: error.details.map(data => data.message).toString() });
        return ResError(res, error);
      });
  },
  adminLogin: (req, res, next) => {
    req.validationFields = {
      user_name: Joi.string().lowercase().min(3).max(20).required(),
      password: Joi.string().min(6).max(12).required().messages({
        "string.min": "Password Incorrect",
        "string.max": "Password Incorrect",
        "string.empty": "Password Incorrect",
      }),
      grant_type: Joi.string().required(),
    };
    return module.exports.validator(req, res, next);
  },
  verifyAdminOTP: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().required(),
      password: Joi.string().min(6).max(12).required(),
      otp: Joi.string().required(),
      grant_type: Joi.string().required(),
    };
    return module.exports.validator(req, res, next);
  },
  updateForChangePasswordAfterLogin: (req, res, next) => {
    req.validationFields = {
      old_password: Joi.string().min(6).max(12).required(),
      new_password: Joi.string().min(6).max(12).required(),
      confirm_password: Joi.string().min(6).max(12).required()
    };
    return module.exports.validator(req, res, next);
  },
  selfChangePassword: (req, res, next) => {
    req.validationFields = {
      old_password: Joi.string().min(6).max(12).required(),
      new_password: Joi.string().min(6).max(12).disallow(Joi.ref('old_password')).required().messages({
        'any.invalid': 'New password must not match the old password'
      }),
      confirm_password: Joi.string().min(6).max(12).valid(Joi.ref('new_password')).required().messages({
        'any.only': 'Confirm password must match the New password',
      })
    };
    return module.exports.validator(req, res, next);
  },
  changeChildPassword: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().required(),
      password: Joi.string().min(6).max(12).required(),
      pass_type: Joi.string().optional(),
      new_password: Joi.string().min(6).max(12).required(),
      confirm_password: Joi.string().min(6).max(12).valid(Joi.ref('new_password')).required().messages({
        'any.only': 'Confirm password must match the New password',
      }),
      pass_type: Joi.string().optional(),
    };
    if (req.User.belongs_to === LABEL_DIAMOND) {
      req.validationFields["pass_type"] = Joi.string().required();
    }
    return module.exports.validator(req, res, next);
  },
  allowSocialMediaDealer: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().required(),
      allow_social_media_dealer: Joi.boolean().required()
    };
    return module.exports.validator(req, res, next);
  },
  checkDemoUser: (req, res, next) => {
    if (req.User.is_demo) {
      return ResError(res, { msg: "You are not allowed to change your password!" });
    }
    next();
  },
  updateChildPassword: (req, res, next) => {
    req.validationFields = {
      childUserId: Joi.string().required(),
      newPassword: Joi.string().min(6).max(12).required()
    };
    return module.exports.validator(req, res, next);
  },
  eventSettingsCheck: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().optional(),
      check_event_limit: Joi.boolean().required(),
    };
    return module.exports.validator(req, res, next);
  },
  updateCreditReference: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().required(),
      new_credit_reference: Joi.number().min(VALIDATION.credit_reference_min)
        .max(VALIDATION.credit_reference_max)
        .default(VALIDATION.credit_reference_default).required(),
      pass_type: Joi.string().optional(),
    };
    const loginUserBelongsTo = req.User.belongs_to;
    if (loginUserBelongsTo == LABEL_DIAMOND
      || loginUserBelongsTo == LABEL_UKRAINE) {
      req.validationFields['master_password'] = Joi.string().min(6).max(12).required();
    } else {
      req.validationFields['master_password'] = Joi.string().min(6).max(12).optional();
    }
    return module.exports.validator(req, res, next);
  },
  updateUserStatusFancyBetLock: (req, res, next) => {
    req.validationFields = {
      user_id: Joi.string().required(),
      is_child_lock: Joi.number().valid(1).required(),
      pass_type: Joi.string().optional(),
    };
    const loginUserBelongsTo = req.User.belongs_to;
    if (loginUserBelongsTo == LABEL_DIAMOND
      || loginUserBelongsTo == LABEL_UKRAINE) {
      req.validationFields['master_password'] = Joi.string().min(6).max(12).required();
    } else {
      req.validationFields['master_password'] = Joi.string().min(6).max(12).optional();
    }
    return module.exports.validator(req, res, next);
  },
  updateUserStatusBettingLockUnlock: (req, res, next) => {
    req.validationFields = {
      user_id: Joi.string().required(),
      pass_type: Joi.string().optional(),
    };
    const loginUserBelongsTo = req.User.belongs_to;
    if (loginUserBelongsTo == LABEL_DIAMOND
      || loginUserBelongsTo == LABEL_UKRAINE) {
      req.validationFields['master_password'] = Joi.string().min(6).max(12).required();
    } else {
      req.validationFields['master_password'] = Joi.string().min(6).max(12).optional();
    }
    return module.exports.validator(req, res, next);
  },
  allowAndNotAllowAgentsMultiLogin: (req, res, next) => {
    req.validationFields = {
      user_id: Joi.string().required()
    };
    return module.exports.validator(req, res, next);
  },
  getUsersListCRef: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().optional(),
      user_name: Joi.string().min(1).max(20).lowercase().trim().optional(),
      only_end_users: Joi.boolean().default(false).optional(),
      enable_exposure: Joi.boolean().default(false).optional(),
      only_master: Joi.boolean().default(false).optional(),
      search: Joi.object({
        domain: Joi.alternatives().try(
          Joi.array().items(JoiObjectId.objectId()),
          JoiObjectId.objectId(),
        ),
        domain_name: Joi.alternatives().try(Joi.array(), Joi.string()),
        title: Joi.alternatives().try(Joi.array(), Joi.string()),
        user_type_id: Joi.number().optional(),
        mobile: Joi.number().optional(),
      }).optional(),
      limit: Joi.number().min(10).max(200).default(50).optional(),
      page: Joi.number().min(1).default(1).optional(),
    };
    return module.exports.validator(req, res, next);
  },
  getOlnieUserNames: (req, res, next) => {
    req.validationFields = {
      limit: Joi.number().min(10).max(100).default(10).optional(),
      page: Joi.number().min(1).default(1).optional(),
      search: Joi.string().min(3).optional(),
    };
    return module.exports.validator(req, res, next);
  },
  getActivityLogsValidationObject: {
    user_id: JoiObjectId.objectId().optional(),
    limit: Joi.number().min(10).max(100).default(10).optional(),
    page: Joi.number().min(1).default(1).optional(),
    search: Joi.object({
      ip_addresses: Joi.alternatives().try(Joi.array(), Joi.string()),
      user_names: Joi.alternatives().try(Joi.array(), Joi.string()),
      domain_names: Joi.alternatives().try(Joi.array(), Joi.string()),
      browser_info: Joi.string().optional(),
      login_status: Joi.string().optional()
    }).optional(),
    from_date: Joi.string().optional(),
    to_date: Joi.string().optional()
  },
  getActivityLogs: (req, res, next) => {
    req.validationFields = module.exports.getActivityLogsValidationObject;
    return module.exports.validator(req, res, next);
  },
  getActivityLogsDocument: (req, res, next) => {
    req.validationFields = {
      ...module.exports.getActivityLogsValidationObject,
      document_type: Joi.string().valid("PDF", "EXCEL", "CSV").required(),
      limit: Joi.number().default(DOCUMENT_API_DEFAULT_LIMIT).optional(),
    };
    return module.exports.validator(req, res, next);
  },
  updateUserBetLockStatus: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().required(),
    };
    return module.exports.validator(req, res, next);
  },
  getUserAactivityLogs: (req, res, next) => {
    req.validationFields = {
      limit: Joi.number().min(10).max(100).default(10).optional(),
      page: Joi.number().min(1).default(1).optional(),
      user_id: JoiObjectId.objectId().optional(),
      user_name: Joi.string().optional(),
      status: Joi.string().optional(),
      origin: Joi.string().optional(),
      host: Joi.string().optional(),
      path: Joi.string().optional(),
      search: Joi.object({
        ip_address: Joi.string().optional(),
        city: Joi.string().optional(),
        state: Joi.string().optional(),
        country: Joi.string().optional(),
        zipcode: Joi.string().optional(),
        district: Joi.string().optional(),
      }).optional(),
    };
    return module.exports.validator(req, res, next);
  },
  getUserBalance: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().optional(),
      userid: JoiObjectId.objectId().optional(),
      full_exposure: Joi.boolean().default(true).optional(),
      calculated_liablity: Joi.boolean().optional(),
    };
    return module.exports.validator(req, res, next);
  },
  getAgentBalance: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().required(),
    }
    return module.exports.validator(req, res, next);
  },
  acceptRules: (req, res, next) => {
    req.validationFields = {
      rule_accept: Joi.number().valid(1).required(),
    };
    return module.exports.validator(req, res, next);
  },
  editProfile: (req, res, next) => {
    req.validationFields = {
      name: Joi.string().required(),
      is_change_password: Joi.number().valid(0, 1).required(),
      favorite_master: Joi.number().valid(0, 1).required(),
      pass_type: Joi.string().valid('TRXN_PASSWORD').optional(),
      password: Joi.string().required(),
      user_id: JoiObjectId.objectId().required(),
    };
    return module.exports.validator(req, res, next);
  },
  getUserStack: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().optional(),
    }
    return module.exports.validator(req, res, next);
  },
  updateUserStack: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().optional(),
      gameButtons: Joi.array().items({
        value: Joi.number().min(25).required(),
        label: Joi.string().trim().required(),
      }).min(1).required(),
      casinoButtons: Joi.array().items({
        value: Joi.number().min(25).required(),
        label: Joi.string().trim().required(),
      }).min(1).required(),
    }
    return module.exports.validator(req, res, next);
  },
  userUplineLockStatus: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().required(),
    }
    return module.exports.validator(req, res, next);
  },
  diamondDashboard: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().optional(),
    }
    return module.exports.validator(req, res, next);
  },
  diamondGamesLockList: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().required(),
    }
    return module.exports.validator(req, res, next);
  },
  childUserList: (req, res, next) => module.exports.getOlnieUserNames(req, res, next),
  getUserListDiamondField: {
    user_id: JoiObjectId.objectId().optional(),
    only_end_users: Joi.boolean().default(false).optional(),
    limit: Joi.number().min(10).max(1000).default(50).optional(),
    page: Joi.number().min(1).default(1).optional(),
    status: Joi.string().optional(),
    belong_to: Joi.string().optional(),
    search: Joi.object({
      user_name: Joi.string().lowercase().trim().optional(),
      domain: Joi.alternatives().try(Joi.array().items(JoiObjectId.objectId()), JoiObjectId.objectId()),
      domain_name: Joi.alternatives().try(Joi.array(), Joi.string()),
      title: Joi.alternatives().try(Joi.array(), Joi.string()),
      user_type_id: Joi.number().optional(),
      mobile: Joi.number().optional(),
    }).optional(),
    sort: Joi.object({
      user_name: Joi.number().min(-1).max(1).optional(),
      user_type_id: Joi.number().min(-1).max(1).optional(),
      title: Joi.number().min(-1).max(1).optional(),
      credit_reference: Joi.number().min(-1).max(1).optional(),
      pts: Joi.number().min(-1).max(1).optional(),
      client_pl: Joi.number().min(-1).max(1).optional(),
      exposure: Joi.number().min(-1).max(1).optional(),
      available_pts: Joi.number().min(-1).max(1).optional(),
      share: Joi.number().min(-1).max(1).optional(),
      exposure_limit: Joi.number().min(-1).max(1).optional(),
      createdAt: Joi.number().min(-1).max(1).optional(),
      client_pl_share: Joi.number().min(-1).max(1).optional(),
      parent_lock_user: Joi.number().min(-1).max(1).optional(),
      self_lock_user: Joi.number().min(-1).max(1).optional(),
      self_lock_betting: Joi.number().min(-1).max(1).optional(),
      self_lock_fancy_bet: Joi.number().min(-1).max(1).optional(),
      parent_lock_betting: Joi.number().min(-1).max(1).optional(),
      parent_lock_fancy_bet: Joi.number().min(-1).max(1).optional(),
      self_close_account: Joi.number().min(-1).max(1).optional(),
      parent_close_account: Joi.number().min(-1).max(1).optional(),
    }).optional(),
  },
  getUsersListDiamond: (req, res, next) => {
    req.validationFields = {
      ...module.exports.getUserListDiamondField,
    };
    return module.exports.validator(req, res, next);
  },
  getUsersListDiamondDocument: (req, res, next) => {
    req.validationFields = {
      ...module.exports.getUserListDiamondField,
      document_type: Joi.string().valid("PDF", "EXCEL", "CSV").required(),
      limit: Joi.number().default(DOCUMENT_API_DEFAULT_LIMIT).optional(),
    };
    return module.exports.validator(req, res, next);
  },
  unlockAttemptedTRXN: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().required(),
    }
    return module.exports.validator(req, res, next);
  },
  getPasswordChangedHistoryValidationObject: {
    user_id: JoiObjectId.objectId().optional(),
    user_name: Joi.string().min(3).max(20).optional(),
    search: Joi.string().optional(),
    limit: Joi.number().min(10).max(200).default(50).optional(),
    page: Joi.number().min(1).max(30).default(1).optional(),
    from_date: Joi.string().optional(),
    to_date: Joi.string().optional(),
  },
  getPasswordChangedHistory: (req, res, next) => {
    req.validationFields = module.exports.getPasswordChangedHistoryValidationObject;
    return module.exports.validator(req, res, next);
  },
  getPasswordChangedHistoryDocument: (req, res, next) => {
    req.validationFields = {
      ...module.exports.getPasswordChangedHistoryValidationObject,
      document_type: Joi.string().valid("PDF", "EXCEL", "CSV").required(),
      limit: Joi.number().default(DOCUMENT_API_DEFAULT_LIMIT).optional(),
    };
    return module.exports.validator(req, res, next);
  },
  getCreditDataDiamond: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().required(),
    };
    return module.exports.validator(req, res, next);
  },
  markDealerAsDeafult: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().required(),
      password: Joi.string().required()
    };
    return module.exports.validator(req, res, next);
  },
  closeAccount,
  lockAccount,
  getUserNameMobileNoAndName,
  getUserByUserName,
  setDailyBonusAmount,
  updateUserPartnership,
  updateChipSummary,
  showAgents,
  markDealerAsB2c,
};
