const { decryptData } = require('../../paymentgateways/floxypay/generalFunctions');
const floxypayLog = require('../../../models/floxypayLog');
const bankingMethod = require('../../../models/bankingMethod');
const websiteSetting = require('../../../models/websiteSetting');
const User = require('../../../models/user');
const { CREDIT_ONE } = require('../../../utils/constants');
const { walletchipIn } = require('../common/paymentFunctions');
const logger = require('../../../utils/loggers');
const getCurrentLine = require('get-current-line');
const { ObjectId } = require("bson");

module.exports = {
  webhook: async (req, res) => {
    let LOG_REF_CODE = "";
    const startTime = Date.now();
    try {
      // Handle incoming webhook payload
      const payload = req.body;
      // Process the payload (this is where you handle the webhook data)
      logger.FloxyPay(`Received webhook payload: ${JSON.stringify(payload)}`);
      // Decrypt the response data
      let decryptedData;
      if (payload.data) {
        decryptedData = decryptData(payload.data);
        if (decryptedData && decryptedData.status == false) {
          logger.FloxyPay(`
            --ERR LOG--
            FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
            FUNCTION: webhook
            EVENT_DETAILS: credit auto call back
            ERROR_DETAILS: Error in decryptedData : ${decryptedData}`
          );
        }
        // Parse the decrypted data as JSON
        const responseData = JSON.parse(decryptedData);
        const floxypayLogData = await floxypayLog.findOne({ orderId: responseData.orderid }, { user_id: 1, parent_level_ids: 1, host: 1, log_ref_code: 1 }).sort({ _id: 1 }).limit(1);
        LOG_REF_CODE = floxypayLogData.log_ref_code
        const paymentLogData = {
          user_id: floxypayLogData.user_id,
          orderId: responseData.orderid,
          status: responseData.status,
          transactionType: "deposit",
          paymentGatewayResponse: responseData,
          amount: responseData.amount,
          parent_level_ids: floxypayLogData.parent_level_ids, // Include parent_level_ids
          host: floxypayLogData.host,
          log_ref_code: LOG_REF_CODE
        };

        await saveFloxypayWebhookLog(paymentLogData);

        if (responseData.status == "SUCCESS") {
          try {
            const domain = new URL(floxypayLogData.host).hostname;
            const websiteSettingData = await websiteSetting.findOne({ domain_name: domain }, { _id: 1 });
            const paymentMethod = await bankingMethod.findOne({
              category: "FLOXYPAY", type: "DEPOSIT", status: true,
              $or: [
                { deleted: { $exists: false } },
                { deleted: false }
              ],
              domain_method_assign_list: {
                '$in': [ObjectId(websiteSettingData._id)]
              }
            }, { _id: 1 }
            );
            const userData = await User.findOne({ _id: floxypayLogData.user_id }, { parent_id: 1, user_name: 1 });
            const paymentData = {
              user_id: floxypayLogData.user_id,
              user_name: userData.user_name,
              parent_id: userData.parent_id,
              amount: responseData.amount,
              crdr: CREDIT_ONE,
              payment_method_id: paymentMethod._id,
              remark: "Transaction done via floxy pay.",
              reference_no: responseData.utr
            };
            logger.FloxyPay(`
              ## INFO LOG ##
              LOG_REF_CODE: ${LOG_REF_CODE}
              FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
              FUNCTION: webhook
              EVENT_DETAILS: Floxypay has called the webhhook and success.
              Time Taken: ${Date.now() - startTime} ms
              REQ: Sending payment data to walletChipin ${JSON.stringify(paymentData)}`
            );
            // Perform wallet transaction
            await walletchipIn(paymentData, LOG_REF_CODE);
          } catch (error) {
            logger.FloxyPay(`
              ## ERROR LOG ##
              LOG_REF_CODE: ${LOG_REF_CODE}
              FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
              FUNCTION: webhook
              EVENT_DETAILS: Due to system error the webhook was failed.
              Time Taken: ${Date.now() - startTime} ms
              ERROR_DETAILS: Error : ${JSON.stringify(error, ["message", "arguments", "type", "name"])}`
            );
            res.status(400).json({ error: error.message });
          }
        }
      }
    } catch (error) {
      logger.FloxyPay(`
        ## ERROR LOG ##
        LOG_REF_CODE: ${LOG_REF_CODE}
        FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
        FUNCTION: webhook
        EVENT_DETAILS: Due to system error the webhook was failed.
        Time Taken: ${Date.now() - startTime} ms
        ERROR_DETAILS:${JSON.stringify(error, ["message", "arguments", "type", "name"])}`
      );
      res.status(400).json({ error: error.message });
    }
  }
}

async function saveFloxypayWebhookLog(data) {
  floxypayLog.create(data)
    .then(paymentLog => {
      logger.FloxyPay(`
        ## INFO LOG ##
        FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
        FUNCTION: saveFloxypayWebhookLog
        EVENT_DETAILS: Floxypay log saved. 
        INFO: Floxypay webhook response saved successfully.`
      );
    })
    .catch(error => {
      logger.FloxyPay(`
        ## ERROR LOG ##
        FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
        FUNCTION: saveFloxypayWebhookLog
        EVENT_DETAILS: Due to system error log not saved.
        ERROR_DETAILS: Error saving floxypay webhook data : ${JSON.stringify(error, ["message", "arguments", "type", "name"])}`
      );
    });
}

