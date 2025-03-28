const { UI_ROUTE_PATH } = require('../common/constant');
const getCurrentLine = require('get-current-line');
const url = require('url');
const floxypayLog = require('../../../models/floxypayLog');
const logger = require('../../../utils/loggers');
module.exports = {
  paymentStatus: async (req, res) => {
    try {
      const floxypayLogData = await floxypayLog.findOne({ orderId: req.query.orderid }, { host: 1 }).sort({ _id: 1 }).limit(1);
      // Send a response to acknowledge receipt of the webhook
      res.redirect(url.format({
        pathname: floxypayLogData.host + UI_ROUTE_PATH
      }));
      // res.status(200).send('payment Success received successfully.');
    } catch (error) {
      logger.FloxyPay(`
        ## ERROR LOG ##
        FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
        FUNCTION: paymentStatus
        EVENT_DETAILS: Payment status update failed.
        ERROR_DETAILS: ${JSON.stringify(error, ["message", "arguments", "type", "name"])}`
      );
      res.status(400).json({ error: error.message });
    }
  }
}