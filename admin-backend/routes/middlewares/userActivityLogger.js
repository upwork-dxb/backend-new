// middleware.js (or wherever your middleware is defined)

const { logUserActivity } = require('../../service/userActivityLog')
  , UserActivityLog = require('../../../models/userActivityLog')
  , { ACTIVITY_LOG_ENABLE } = require('../../../config/constant/userActivityLogConfig');

module.exports = async function (req, res, next) {

  // Log user activity if 
  if (ACTIVITY_LOG_ENABLE == 'true') {
    let userActivityLog = new UserActivityLog({});
    req.userActivityLog = userActivityLog;
    logUserActivity(req);
  }
  // Proceed to the next middleware or route handler
  next();
};
