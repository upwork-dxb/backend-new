const axios = require('axios');
const { AGENT_CODE, WITHDRAWAL } = require('../../paymentgateways/floxypay/envirnomentConfig');
const { encryptQuery, decryptData, generateOrderId, getDomainName } = require('./generalFunctions');
const headers = { 'Content-Type': 'application/json' };
const { DEBIT_TWO } = require('../../../utils/constants');
const User = require('../../../models/user');
const bankingDetails = require('../../../models/bankingType');
const { walletchipOut } = require('../../paymentgateways/common/paymentFunctions');
const HTTP_PROTOCOL = "http";
const HTTPS_PROTOCOL = "https";
const Joi = require('joi');
const { ResError, ResSuccess } = require('../../../lib/expressResponder');
const floxypayLog = require('../../../models/floxypayLog');
const { STATUS_500, STATUS_422 } = require('../../../utils/httpStatusCode');

module.exports = {
  withdrawToAccount: async (req, res) => {
    try {
      return Joi.object({
        amount: Joi.string().trim().required(),
        payment_method_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("method_id must be a valid ObjectId").trim().required()
      }).validateAsync(req.body, { abortEarly: false })
        .then(async data => {
          const amount = data.amount;
          const user_id = req.User._id;
          const bankDetails = await bankingDetails.findOne({ user_id: user_id, method_id: data.payment_method_id, status: true });
          const userData = await User.findOne({ _id: user_id }, { parent_id: 1, user_name: 1 });
          if (!bankDetails) {
            return ResError(res, { "msg": "Please select bank details." });
          }
          const dataToEncrypt = {
            "account": bankDetails.account_no,
            "ifsc": bankDetails.ifsc_code,
            "name": bankDetails.bank_holder_name,
            "mobile": bankDetails.mobile_no.toString(), // Ensure mobile number is converted to string,
            "amount": amount,
            "note": "Withdrawal request.",
            "orderid": generateOrderId(6),
          };
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
          const response = await axios.post(WITHDRAWAL, requestBody, { headers });
          // Check if request was successful
          if (response.status === 200) {
            // Decrypt response data
            // console.log("response...", response)
            const responseData = decryptData(response.data.data);
            if (responseData && responseData.status == false) {
              return ResError(res, responseData);
            }
            // Response data 
            // const responseData = { "success": true, "message": "Transaction Initiated with Ref 8ce978067a96e90711cf234fer34dfgde", "orderid": "py11hnk9zzzzzzzzzzzzzz", "merchantid": "ordc111rrr", "status": "PENDING" }

            let protocol = getDomainName(req.protocol);
            if (protocol === HTTP_PROTOCOL) {
              protocol = HTTP_PROTOCOL;
            } else {
              protocol = HTTPS_PROTOCOL;
            }
            const host = `${protocol}://${req.get('host')}`;

            const paymentLogData = {
              user_id: userData._id,
              orderId: responseData.orderid,
              status: responseData.status,
              transactionType: "withdrawal",
              paymentGatewayResponse: responseData,
              amount: amount,
              parent_level_ids: userData.parent_level_ids, // Include parent_level_ids
              host: host
            };
            await saveFloxypayWithDrawalLog(paymentLogData);
            if (responseData.status == "SUCCESS" || responseData.status == "PENDING") {
              let payment_deatails = []
              try {
                const paymentData = {
                  user_id: userData._id,
                  user_name: userData.user_name,
                  parent_id: userData.parent_id,
                  amount: req.body.amount,
                  crdr: DEBIT_TWO,
                  payment_deatails: payment_deatails.push(bankingDetails)
                };
                // Perform wallet transaction
                const walletchipOutRes = await walletchipOut(paymentData);
                if (walletchipOutRes.status) {
                  // console.log(walletchipOutRes, "walletchipOutRes")
                  return ResSuccess(res, walletchipOutRes);
                } else {
                  // console.log(walletchipOutRes, "walletchipOutResElse")
                  return ResError(res, walletchipOutRes);
                }
              } catch (error) {
                return ResError(res, error.message);
              }
            }
          }
        }).catch(async error => {
          if (error.response && error.response.status === 400) {
            const errdecryptedRes = await decryptData(error.response.data.data);
            console.log("errdecryptedRes..", errdecryptedRes);
            return ResError(res, { "msg": "Please contact to upline.", statusCode: STATUS_422 });
          }
          return ResError(res, error);
        });
    }
    catch (error) {
      return ResError(res, { msg: error.message, statusCode: STATUS_500 });
    }
  }

}
async function saveFloxypayWithDrawalLog(data) {
  floxypayLog.create(data)
    .then(paymentLog => {
      console.log("Floxypay webhook response saved successfully.");
    })
    .catch(error => {
      console.error("Error saving floxypay webhook data:", error);
    });
}