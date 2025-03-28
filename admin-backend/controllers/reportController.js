const Joi = require('joi')
  , JoiObjectId = require('joi-oid')
  , { ObjectId } = require("bson")
  , { USER_TYPE_SUPER_ADMIN, USER_TYPE_USER, SUCCESS, QT, WCO } = require("../../utils/constants")
  , { ResError, ResSuccess } = require('../../lib/expressResponder')
  , reportService = require('../service/reportService')
  , userService = require('../service/userService')
  , { getAccountReports } = require('../service/accountStatementService');
const { STATUS_500, STATUS_200 } = require('../../utils/httpStatusCode');

module.exports = {
  settlementReport: async function (req, res) {
    return Joi.object({
      user_id: JoiObjectId.objectId().optional(),
      user_type_id: Joi.number().optional(),
      search: Joi.optional()
    }).validateAsync(req.body, { abortEarly: false })
      .then(async ({ user_id, user_type_id, search }) => {
        let user_name = "", name = ""
          , parents_id = [], parent_id = "", parent_user_name = "", parent_user_type_id = "";
        if (user_id) {
          user_id = ObjectId(user_id);
          let userData = await userService.getUserDetails(
            { _id: user_id },
            ["user_name", "name", "parent_id", "parent_user_name", "user_type_id", "parent_level_ids"]
          );
          if (userData.statusCode != SUCCESS)
            return ResError(res, { msg: userData.data });
          userData = userData.data;
          user_name = userData.user_name;
          name = userData.name;
          user_type_id = userData.user_type_id;
          parent_id = userData.parent_id;
          parents_id = filterParensIds(userData.parent_level_ids);
          parent_user_name = userData.parent_user_name;
          if (user_type_id == USER_TYPE_SUPER_ADMIN || user_type_id == USER_TYPE_USER)
            parent_user_type_id = "";
        } else {
          user_id = ObjectId(req.User.user_id || req.User._id);
          user_name = req.User.user_name;
          name = req.User.name;
          user_type_id = req.User.user_type_id;
          parent_id = req.User.parent_id;
          parents_id = filterParensIds(req.User.parent_level_ids);
          parent_user_name = req.User.parent_user_name;
        }
        parent_user_name = parent_user_name ? parent_user_name : "Own";
        let ownData = await reportService.ownDataInSettlementReport(user_id, parents_id, user_type_id);
        if (ownData.statusCode != SUCCESS) return ResError(res, { msg: ownData.data });
        let finalData = {
          "user_id": user_id, "user": `${name}(${user_name})`, "user_type_id": user_type_id,
          "parent_id": parent_id, "parent_user_name": parent_user_name, "parent_user_type_id": parent_user_type_id,
          "plusData": ownData.data.plusData, "minusData": ownData.data.minusData, "data_receiving_from": {}, "data_paid_to": {}
        };
        let totalPlus = ownData.data.totalPlus;
        let totalMinus = Math.abs(ownData.data.totalMinus);
        let returnData = await reportService.settlementReport(user_id, parents_id, user_type_id, search);
        if (returnData.statusCode != SUCCESS) return ResError(res, { msg: returnData.data });
        let data_receiving_from = [], data_paid_to = [];
        let data_receiving_from_total = 0, data_paid_to_total = 0;
        if (returnData.statusCode == SUCCESS) {
          for (let i in returnData.data) {
            let element = returnData.data[i];
            if (element.settlement_amount > 0) {
              totalMinus = totalMinus + element.settlement_amount;
              element.settlement_amount = element.settlement_amount.toFixed(2);
              data_receiving_from.push(element);
              data_receiving_from_total += 1;
            } else {
              element.settlement_amount = Math.abs(element.settlement_amount);
              totalPlus = totalPlus + element.settlement_amount;
              element.settlement_amount = element.settlement_amount.toFixed(2);
              data_paid_to.push(element);
              data_paid_to_total += 1;
            }
          }
        }
        finalData.data_paid_to = { list: data_paid_to, total: data_paid_to_total };
        finalData.data_receiving_from = { list: data_receiving_from, total: data_receiving_from_total };
        finalData.totalPlus = totalPlus.toFixed(2);
        finalData.totalMinus = totalMinus.toFixed(2);
        return ResSuccess(res, { data: finalData });
      }).catch(error => {
        return ResError(res, error);
      });
  },
  eventsProfitLoss: function (req, res) {
    return reportService.eventsProfitLoss(req).then(result => {
      if (result.statusCode != SUCCESS)
        return ResError(res, { msg: result.data, statusCode: STATUS_200 });
      return ResSuccess(res, { data: result.data[0] });
    }).catch(error => ResError(res, {error, statusCode: STATUS_500 }));
  },
  settlementReportV2: async function (req, res) {

    return reportService.settlementReportV2(req)
      .then(data => {
        return data.statusCode == SUCCESS ? ResSuccess(res, data) : ResError(res, { msg: data.data });
      })
      .catch(error => {
        return ResError(res, { msg: error.message, statusCode: STATUS_500 })
      });

  },
  settlementCollectionHistory: async function (req, res) {
    try {
      const { opening_balance } = req.joiData;
      const data = { opening_balance, path: req.path }
      const profitLoss = await reportService.settlementCollectionHistory(req.user, data);

      if (profitLoss.statusCode != SUCCESS)
        return ResError(res, { msg: profitLoss.data });

      return ResSuccess(res, { data: profitLoss.data });
    } catch (error) {
      return ResError(res, { error, statusCode: STATUS_500 });
    }
  },
  sportsWiseUsersPL: function (req, res) {
    let search = {
      sport_id: Joi.string().optional(),
      sport_name: Joi.string().optional(),
      series_id: Joi.string().optional(),
      series_name: Joi.string().optional(),
      match_id: Joi.string().optional(),
      match_name: Joi.string().optional(),
      event_id: Joi.string().optional(),
      event_name: Joi.string().optional(),
      type: Joi.number().valid(1, 2).optional(),
    };
    let fieldsValidate = {
      user_id: JoiObjectId.objectId().optional(),
      user_name: Joi.string().min(3).max(20).optional(),
      search: Joi.object(search).optional(),
      from_date: Joi.string().optional(),
      to_date: Joi.string().optional(),
      international_casinos: Joi.number().default(0).optional(),
    };
    if (req.body.hasOwnProperty("international_casinos")) {
      search["casinoProvider"] = Joi.string().valid(QT, WCO).required();
      fieldsValidate["search"] = Joi.object(search).required();
    }
    return Joi.object(fieldsValidate).validateAsync(req.body, { abortEarly: false })
      .then(params => {
        let { user_id, user_name } = params, parent_id, user_type_id;
        if (!user_id) {
          user_id = ObjectId(req.User.user_id || req.User._id);
          parent_id = req.User.parent_id;
          if (user_name)
            user_name = user_name;
          else
            user_name = req.User.user_name;
          user_type_id = req.User.user_type_id;
        } else {
          user_id = ObjectId(user_id);
          parent_id = req.user.parent_id;
          user_name = req.user.user_name;
          user_type_id = req.user.user_type_id;
        }
        params.user_id = user_id;
        params.user_type_id = user_type_id;
        params.user_name = user_name;
        return reportService.sportsWiseUsersPL(params).then(result => {
          let response = { user_name, parent_id, data: result.data };
          if (result.statusCode != SUCCESS)
            return ResError(res, { ...response, msg: result.data });
          return ResSuccess(res, { ...response });
        }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  },
  downlineP_L: function (req, res) {
    return Joi.object({
      user_id: JoiObjectId.objectId().optional(),
      from_date: Joi.string().optional(),
      to_date: Joi.string().optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(params => {
        let { user_id } = params, parent_id, user_type_id, user_name;
        if (!user_id) {
          user_id = ObjectId(req.User.user_id || req.User._id);
          parent_id = req.User.parent_id;
          if (user_name)
            user_name = user_name;
          else
            user_name = req.User.user_name;
          user_type_id = req.User.user_type_id;
        } else {
          user_id = ObjectId(user_id);
          parent_id = req.user.parent_id;
          user_name = req.user.user_name;
          user_type_id = req.user.user_type_id;
        }
        params.user_id = user_id;
        params.user_type_id = user_type_id;
        params.user_name = user_name;
        return reportService.downlineP_L(params).then(result => {
          let response = { user_name, parent_id, data: result.data };
          if (result.statusCode != SUCCESS)
            return ResError(res, { ...response, msg: result.data });
          return ResSuccess(res, { ...response });
        }).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  },
  // /sportsP_L /matchWiseP_L /usersPLByMarket
  P_L: function (req, res) {
    let validate = {
      user_id: JoiObjectId.objectId().optional(),
      is_user: Joi.boolean().optional(),
      from_date: Joi.string().optional(),
      to_date: Joi.string().optional(),
    }
    if (req.path == "/matchWiseP_L")
      validate = {
        sport_id: Joi.string().required(),
        type: Joi.number().optional(),
        search: Joi.string().optional(),
        limit: Joi.number().min(50).default(50).optional(),
        page: Joi.number().min(1).max(100).default(1).optional(),
        ...validate
      }
    if (req.path == "/usersPLByMarket")
      validate = {
        market_id: Joi.string().required(),
        search: Joi.string().optional(),
        limit: Joi.number().min(50).default(50).optional(),
        page: Joi.number().min(1).max(100).default(1).optional(),
      }
    if (req.path == "/eventsStackAndCommission")
      validate = {
        sport_id: Joi.string().required(),
        ...validate
      }
    return Joi.object(validate)
      .validateAsync(req.body, { abortEarly: false })
      .then(params => {
        if (!params.user_id)
          params.user_id = ObjectId(req.User.user_id || req.User._id);
        else
          params.user_id = ObjectId(params.user_id);
        params.path = req.path;
        if (!params.is_user)
          params.is_user = req.is_user;
        return reportService.P_L(params).then(result => {
          if (result.statusCode != SUCCESS)
            return ResError(res, { msg: result.data, statusCode: STATUS_200 });
          if (["/matchWiseP_L", "/usersPLByMarket"].includes(req.path))
            return ResSuccess(res, { ...result.data[0] });
          return ResSuccess(res, { data: result.data });
        }).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  },
  // To Do: Remove this method when P_L function is stable.
  sportsP_L: function (req, res) {
    return Joi.object({
      from_date: Joi.string().optional(),
      to_date: Joi.string().optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(params => {
        params.user_id = ObjectId(req.User.user_id || req.User._id);
        return reportService.sportsP_L(params).then(result => {
          if (result.statusCode != SUCCESS)
            return ResError(res, { msg: result.data });
          return ResSuccess(res, { data: result.data });
        }).catch(error => ResError(res, error));
      }).catch(error => {
        if (error.hasOwnProperty("details"))
          return ResError(res, { msg: error.details.map(data => data.message).toString() });
        return ResError(res, error);
      });
  },
  // To Do: Remove this method when P_L function is stable.
  matchWiseP_L: function (req, res) {
    return Joi.object({
      sport_id: Joi.string().required(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(params => {
        params.user_id = ObjectId(req.User.user_id || req.User._id);
        return reportService.matchWiseP_L(params).then(result => {
          if (result.statusCode != SUCCESS)
            return ResError(res, { msg: result.data });
          return ResSuccess(res, { data: result.data });
        }).catch(error => ResError(res, error));
      }).catch(error => {
        if (error.hasOwnProperty("details"))
          return ResError(res, { msg: error.details.map(data => data.message).toString() });
        return ResError(res, error);
      });
  },
  getReportStatements: async function (req, res) {
    const params = req.body;
    params.user_id = req.User.user_id;
    params.user_type_id = req.User.user_type_id;
    try {
      return getAccountReports(params).then(result => {
        if (result.statusCode != SUCCESS)
          return ResError(res, { msg: result.data });
        return ResSuccess(res, { data: result.data });
      }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
    } catch (error) {
      return ResError(res, { error, statusCode: STATUS_500 });
    }
  },
  sportsPL: function (req, res) {
    return reportService.sportsPL(req).then(result => {
      if (result.statusCode != SUCCESS)
        return ResError(res, { msg: result.data });
      return ResSuccess(res, { data: result.data });
    }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  },
  sportsWiseOnlyPL: function (req, res) {
    return reportService.sportsWiseOnlyPL(req).then(result => {
      if (result.statusCode != SUCCESS)
        return ResError(res, { msg: result.data });
      return ResSuccess(res, { data: result.data });
    }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  },
  userAuthList: function (req, res) {
    return reportService.userAuthList(req).then(result => {
      if (result.statusCode != SUCCESS)
        return ResError(res, { msg: result.data });
      return ResSuccess(res, { data: result.data });
    }).catch(error => ResError(res, error));
  },
  ptsReport: function (req, res) {
    return reportService
      .ptsReport(req, res)
      .then((result) =>
        result.statusCode == SUCCESS
          ? ResSuccess(res, result.data)
          : ResError(res, result.data),
      )
      .catch((error) => ResError(res, { error, statusCode: STATUS_500 }));
  },
  turnover: function (req, res) {
    return reportService
      .turnover(req, res)
      .then((result) =>
        result.statusCode == SUCCESS
          ? ResSuccess(res, result.data)
          : ResError(res, { msg: result.data }),
      )
      .catch((error) => ResError(res, { error, statusCode: STATUS_500 }));
  },
  turnoverDocument: function (req, res) {
    return reportService
      .turnoverDocument(req, res)
      .then((result) => {
        if (result.statusCode != SUCCESS) {
          return ResError(res, { msg: result.data });
        } else if (!result?.data?.isDoc) {
          return ResSuccess(res, result.data);
        }
      })
      .catch((error) => ResError(res, error));
  },
  partywinLossReport: function (req, res) {
    return reportService
      .partywinLossReport(req, res)
      .then((result) =>
        result.statusCode == SUCCESS
          ? ResSuccess(res, result.data)
          : ResError(res, result.data),
      )
      .catch((error) => ResError(res, { error, statusCode: STATUS_500 }));
  },
  partywinLossReportDocument: function (req, res) {
    return reportService
      .partywinLossReportDocument(req, res)
      .then((result) => {
        if (result.statusCode != SUCCESS) {
          return ResError(res, { msg: result.data });
        } else if (!result?.data?.isDoc) {
          return ResSuccess(res, result.data);
        }
      })
      .catch((error) => ResError(res, error));
  },
  userAuthListDocument: function (req, res) {
    return reportService
      .userAuthListDocument(req, res)
      .then((result) => {
        if (result.statusCode != SUCCESS) {
          return ResError(res, { msg: result.data });
        } else if (!result?.data?.isDoc) {
          return ResSuccess(res, result.data);
        }
      })
      .catch((error) => ResError(res, error));
  }
}

function filterParensIds(data) {
  return data.map(data => data.user_id != null ? ObjectId(data.user_id) : null).filter(data => data);
}