const _ = require('lodash');
function Responder() { }

/*
 * This method sends the response to the client.
 */
function sendResponse(res, status, body) {
  if (!res.headersSent)
    if (body)
      return res.status(status).json(body);
  return res.status(status).send();
}

/*
 * These methods are called to respond to the API user with the information on
 * what is the result of the incomming request
 */

Responder.success = (res, message) => {
  if (_.isString(message))
    message = { msg: message };
  message.status = true;
  return sendResponse(res, 200, message);
}

Responder.error = (res, reason) => {
  let status = reason.statusCode || 200;
  reason.status = reason.status || false;
  try {
    if (reason.msg)
      reason.msg = reason.msg;
    else
      reason.msg = "Something went wrong!";
    if (reason.hasOwnProperty("message"))
      reason.msg = reason.message;
    if (reason.hasOwnProperty("error"))
      reason.msg = reason.error.message;
    if (reason.hasOwnProperty("details"))
      return sendResponse(res, 422, { msg: reason.details.map(data => data.message).toString(), status: false });
    // Ensure that the error object is not empty before adding it to the response
    if (reason.error && Object.keys(reason.error).length === 0) {
      delete reason.error; // Remove the empty error object
    }
  } catch (error) {
    return sendResponse(res, status, { ...reason, msg: `Error in responding func. ${error.message}` });
  }
  return sendResponse(res, status, reason);
}

Responder.ResSuccess = Responder.success;

Responder.ResError = Responder.error;

module.exports = Responder;