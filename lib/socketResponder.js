const _ = require('lodash');
function Responder() { }

// SocSuccess
Responder.SocSuccess = (data) => {
  if (_.isString(data))
    data = { msg: data };
  data.status = true;
  return data;
}

// SocError
Responder.SocError = (reason) => {
  try {
    reason.status = reason.status || false;
    if (reason.msg)
      reason.msg = reason.msg;
    else
      reason.msg = "Something went wrong!";
    if (reason.hasOwnProperty("message"))
      reason.msg = reason.message;
    if (reason.hasOwnProperty("error"))
      reason.msg = reason.error.message;
    if (reason.hasOwnProperty("details")) {
      reason.msg = reason.details.map(data => data.message).toString();
      const { status, msg } = reason;
      reason = { status, msg };
    }
  } catch (error) {
    return ({ ...reason, msg: `Error in responding func. ${error.message}` });
  }
  return reason;
}

module.exports = Responder;