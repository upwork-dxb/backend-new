const eventImportService = require('../service/eventImportService')
  , { SUCCESS, CENTRAL_SECRETKEY } = require("../../utils/constants")
  , ALLOWED_IPS = ["127.0.0.1", "178.239.168.142", "185.134.22.167"];

module.exports = {
  getTokenValidate: function (req, res, next) {
    try {
      if (req.query.secretkey != CENTRAL_SECRETKEY)
        return module.exports.defaultResponse(req, res, "Secret handshake not completed!");
      next();
    } catch (error) {
      return module.exports.defaultResponse(req, res, error.message);
    }
  },
  getToken: (req, res) => res.json({
    "status": 200,
    "success": true,
    "messages": "Life time token.",
    "result": {
      "token": CENTRAL_SECRETKEY
    }
  }),
  IsValidToken: (req, res) => {
    let token;
    try {
      token = req.headers.authorization.split(' ')[1];
      if (!token || token != CENTRAL_SECRETKEY)
        return res.send("Token is not valid.");
    } catch (error) {
      return res.send("Token is not valid.");
    }
    return res.send("Token is valid.");
  },
  saveImportMarketData: (req, res) => {
    if (!Object.keys(req.body).length)
      return module.exports.ImportMarketDataResponse(req, res, "Parameters required!");
    return eventImportService.saveImportMarketData(req.body).then(eventImport => {
      if (eventImport.statusCode != SUCCESS)
        return module.exports.ImportMarketDataResponse(req, res, eventImport.data);
      return res.json({
        "StatusCode": 200,
        "Status": "Success",
        "Message": eventImport.data,
        "Data": null
      });
    }).catch(error => module.exports.ImportMarketDataResponse(req, res, error.message));
  },
  formostEventImport: (req, res) => {
    if (!Object.keys((req.body)).length)
      return module.exports.ImportMarketDataResponse(req, res, "Parameters required!");
    return eventImportService.formostEventImport(req.body).then(eventImport => {
      if (eventImport.statusCode != SUCCESS)
        return module.exports.ImportMarketDataResponse(req, res, eventImport.data);
      return res.json({
        "StatusCode": 200,
        "Status": "Success",
        "Message": eventImport.data,
        "Data": null
      });
    }).catch(error => module.exports.ImportMarketDataResponse(req, res, error.message));
  },
  validateIp: function (req, res, next) {
    if (!ALLOWED_IPS.includes(req.ip_data))
      return module.exports.defaultResponse(req, res, "IP not allowed!");
    next();
  },
  defaultResponse: (req, res, message) => res.json({
    "status": 200,
    "success": false,
    "messages": message,
    "result": {
      "token": ""
    }
  }),
  ImportMarketDataResponse: (req, res, message) => res.json({
    "StatusCode": 200,
    "Status": "Warning",
    "Message": message,
    "Data": null
  })
}