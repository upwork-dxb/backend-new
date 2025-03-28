const FloxypayLog = require('../../../models/floxypayLog');
const Joi = require('joi')
const { ResError, ResSuccess } = require('../../../lib/expressResponder');
const { USER_TYPE_SUPER_ADMIN, USER_TYPE_USER } = require('../../../utils/constants');
const { encryptQuery, decryptData } = require('./generalFunctions');
const { AGENT_CODE, CHECK_DEPOSIT_STATUS, CHECK_WITHDRAWAL_STATUS } = require('./envirnomentConfig');
const axios = require('axios');
const headers = { 'Content-Type': 'application/json' };
const logger = require('../../../utils/loggers');
const getCurrentLine = require('get-current-line');

module.exports = {
  statements: async (req, res) => {
    try {
      let { page, limit, status, transactionType } = req.query;
      // Set default values for page and limit
      page = parseInt(page);
      limit = parseInt(limit);
      const query = {};
      // Add filters
      if (status) {
        query.status = status;
      }
      if (transactionType) {
        query.transactionType = transactionType;
      }
      if (req.User.user_type_id !== USER_TYPE_USER) {
        query['parent_level_ids.user_id'] = req.User._id;
      } else {
        query.user_id = req.User._id;
      }
      const totalCount = await FloxypayLog.countDocuments(query);
      const totalPages = Math.ceil(totalCount / limit);
      const skip = (page - 1) * limit;
      let statementsQuery = FloxypayLog.find(query)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }); // Sorting by createdAt in descending order

      if (req.User.user_type_id !== USER_TYPE_SUPER_ADMIN) {
        // If user_type_id is not 0, select specific fields
        statementsQuery = statementsQuery.select("orderId status amount transactionType"); // Add the fields you want to select
      }
      const data = await statementsQuery;
      if (data) {
        return ResSuccess(res, { data: data, totalPages, totalCount });
      } else {
        return ResError(res, { msg: "No statement found." });
      }
    } catch (error) {
      logger.FloxyPay(`
        ## ERROR LOG ##
        FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
        FUNCTION: statements
        EVENT_DETAILS: Due to system error get statements failed.
        ERROR_DETAILS: ${JSON.stringify(error, ["message", "arguments", "type", "name"])}`
      );
      return ResError(res, { msg: error.message });
    }
  },
  checkPaymentStatus: async (req, res) => {
    try {
      const { orderId, transactionType } = await Joi.object({
        orderId: Joi.string(),
        transactionType: Joi.string(),
      }).validateAsync(req.body, { abortEarly: false });

      const data = await FloxypayLog.findOne({ orderId, transactionType, user_id: req.User._id }).select("orderId status transactionType");

      if (data) {
        return ResSuccess(res, { data });
      } else {
        return ResError(res, { msg: "No data found." });
      }
    } catch (error) {
      logger.FloxyPay(`
        --ERR LOG--
        FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
        FUNCTION: checkPaymentStatus
        EVENT_DETAILS: Due to system error, check payment status.
        ERROR_DETAILS: ${JSON.stringify(error, ["message", "arguments", "type", "name"])}`
      );
      if (error.hasOwnProperty("details"))
        return ResError(res, { msg: error.details.map(data => data.message).toString() });
      return ResError(res, error);
    }
  },
  checkTransactionStatus: async (req, res) => {
    try {
      return Joi.object({
        orderId: Joi.string().trim().required(),
        transactionType: Joi.string().trim().required()
      }).validateAsync(req.body, { abortEarly: false })
        .then(async postData => {
          const query = { orderId: postData.orderId, transactionType: postData.transactionType };
          if (req.User.user_type_id == USER_TYPE_USER) {
            query['user_id'] = req.User._id;
          }
          const data = await FloxypayLog.findOne(query).select("orderId status transactionType");
          if (data) {
            // Encrypt the request data
            const encryptedReqData = encryptQuery({ "order_id": postData.orderId });
            // Prepare the request body
            const requestBody = {
              reqData: encryptedReqData,
              agentCode: AGENT_CODE,
            };
            // Make a POST request to the API endpoint
            let reqUrl;
            if (postData.transactionType == "deposit") {
              reqUrl = CHECK_DEPOSIT_STATUS;
            } else {
              reqUrl = CHECK_WITHDRAWAL_STATUS;
            }
            const response = await axios.post(reqUrl, requestBody, { headers });
            // Decrypt the response data
            const decryptedData = decryptData(response.data.data);
            // Parse the decrypted data as JSON
            const responseData = JSON.parse(decryptedData);
            return ResSuccess(res, { responseData });
          } else {
            return ResError(res, { msg: "No data found." });
          }
        }).catch(error => {
          logger.FloxyPay(`
            ## ERROR LOG ##
            FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
            FUNCTION: checkTransactionStatus
            EVENT_DETAILS: Check transaction status failed.
            ERROR_DETAILS: ${JSON.stringify(error, ["message", "arguments", "type", "name"])}`
          );
          if (error.hasOwnProperty("details"))
            return ResError(res, { msg: error.details.map(data => data.message).toString() });
          return ResError(res, error);
        });
    } catch (error) {
      logger.FloxyPay(`
        ## ERROR LOG ##
        FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
        FUNCTION: checkTransactionStatus
        EVENT_DETAILS: Due to system error, check transaction status failed.
        ERROR_DETAILS: Error checking order status: ${JSON.stringify(error, ["message", "arguments", "type", "name"])}`
      );
      return ResError(res, { msg: "Error checking order status: " + error.message });
    }
  }

}