exports.resultResponse = (statusCode, data = null, message = null) => ({
  statusCode,
  message,
  data
});
