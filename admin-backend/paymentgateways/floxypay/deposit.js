const axios = require('axios');
const getCurrentLine = require('get-current-line');
const { AGENT_CODE, GENERATE_ORDER } = require('./envirnomentConfig');
const { encryptQuery, decryptData, generateOrderId, getDomainName } = require('./generalFunctions');
const floxypayLog = require('../../../models/floxypayLog');
const headers = { 'Content-Type': 'application/json' }
const HTTP_PROTOCOL = "http";
const HTTPS_PROTOCOL = "https";
const { ResError, ResSuccess } = require('../../../lib/expressResponder');
const Joi = require('joi');
const logger = require('../../../utils/loggers');
const { generateReferCode } = require('../../../utils');
module.exports = {
  generateOrder: async (req, res) => {
    const LOG_REF_CODE = generateReferCode();
    const startTime = Date.now();
    try {
      return Joi.object({
        amount: Joi.string().trim().required(),
      }).validateAsync(req.body, { abortEarly: false })
        .then(async data => {
          const amount = data.amount;
          const dataToEncrypt = { amount: amount, orderid: generateOrderId(6) };
          const encryptedData = encryptQuery(dataToEncrypt);
          if (encryptedData && encryptedData.status == false) {
            return ResError(res, encryptedData);
          }
          // Request body
          const requestBody = {
            reqData: encryptedData,
            agentCode: AGENT_CODE
          };
          // Make POST request
          const response = await axios.post(GENERATE_ORDER, requestBody, {
            headers
          });
          // Check if request was successful
          if (response.status === 200) {
            // Decrypt response data
            const decryptedResponse = decryptData(response.data.data);
            if (decryptedResponse && decryptedResponse.status == false) {
              return ResError(res, decryptedResponse);
            }
            // Return decrypted response
            /*{
              "success": true,
                 "url": "https://securedpayment.online/payment/IN11hnk9b3y4ltzm30c3qvAq",
                 "orderid": "IN1123423423erewh",
                 "merchantid": "804417"
             }
             */
            const responseData = JSON.parse(decryptedResponse);

            let protocol = getDomainName(req.protocol);

            if (protocol === HTTP_PROTOCOL) {
              protocol = HTTP_PROTOCOL;
            } else {
              protocol = HTTPS_PROTOCOL;
            }

            const host = `${protocol}://${req.get('host')}`;
            const parentUserIds = req.User.parent_level_ids.map(parent => ({ user_id: parent.user_id, user_name: parent.user_name }));

            // Create a new floxypay deposite log save it to the collection
            const paymentLogData = {
              user_id: req.User._id,
              orderId: responseData.orderid,
              status: "deposit_initiated",
              transactionType: "deposit",
              requestBody: dataToEncrypt,
              amount: amount,
              paymentGatewayResponse: responseData,
              parent_level_ids: parentUserIds, // Include parent_level_ids
              host: host,
              log_ref_code: LOG_REF_CODE
            };
            await saveFloxypayLog(paymentLogData);
            logger.FloxyPay(`
             ## INFO LOG ##
             LOG_REF_CODE : ${LOG_REF_CODE}
             FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
             FUNCTION: generateOrder
             EVENT_DETAILS: Deposit initiated successfully.
             USER_ID : ${req.User._id}
             Time Taken: ${Date.now() - startTime} ms
             RES : ${JSON.stringify(responseData)}`
            );
            res.status(200).json(responseData);
          } else {
            logger.FloxyPay(`
            ## ERROR LOG ##
            LOG_REF_CODE : ${LOG_REF_CODE}
            FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
            FUNCTION: generateOrder
            EVENT_DETAILS: Deposit initiation failed.
            USER_ID : ${req.User._id}
            Time Taken: ${Date.now() - startTime} ms
            ERROR_DETAILS: Failed to generate order. http_status ${response.status}`
            );
            res.status(400).json({ error: "Failed to generate order.", "http_status": response.status });
          }
        }).catch(error => {
          logger.FloxyPay(`
            ## ERROR LOG ##
            LOG_REF_CODE : ${LOG_REF_CODE}
            FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
            FUNCTION: generateOrder
            EVENT_DETAILS: Due to a system error, the deposit initiation failed.
            USER_ID : ${req.User._id}
            Time Taken: ${Date.now() - startTime} ms
            ERROR_DETAILS: ${JSON.stringify(error, ["message", "arguments", "type", "name"])}`
          );
          if (error.hasOwnProperty("details")) {
            return ResError(res, { msg: error.details.map(data => data.message).toString() });
          }
          return ResError(res, error);
        });
    } catch (error) {
      logger.FloxyPay(`
        ## ERROR LOG ##
        LOG_REF_CODE: ${LOG_REF_CODE}
        FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
        FUNCTION: generateOrder
        EVENT_DETAILS: Due to a system error, the deposit initiation failed.
        USER_ID: ${req.User._id}
        Time Taken: ${Date.now() - startTime} ms
        ERROR_DETAILS: ${JSON.stringify(error, ["message", "arguments", "type", "name"])}`
      );
      res.status(400).json({ error: error.message });
    }
  }
}

async function saveFloxypayLog(data) {
  floxypayLog.create(data)
    .then(paymentLog => {
      logger.FloxyPay("Floxypay deposit log response saved successfully.");
    })
    .catch(error => {
      logger.FloxyPay(`
        ## ERROR LOG ##
        FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
        FUNCTION: saveFloxypayLog
        EVENT_DETAILS: Save floxypaylog
        ERROR_DETAILS: ${JSON.stringify(error, ["message", "arguments", "type", "name"])}`
      );
    });
}