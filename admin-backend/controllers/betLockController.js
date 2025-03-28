const { ResError, ResSuccess } = require("../../lib/expressResponder");
const { SUCCESS } = require("../../utils/constants");
const {
  betLock: marketBetLock,
  getBetLockList: marketBetLockList,
} = require("../service/betLockService/marketBetLock");
const {
  betLock: fancyBetLock,
  getBetLockList: fancyBetLockList,
} = require("../service/betLockService/fancyBetLock");

module.exports = {
  betLock: function (req, res) {
    let service;
    if (req.body.betLockType == "market") {
      service = marketBetLock;
    } else {
      service = fancyBetLock;
    }
    return service(req, res)
      .then((result) =>
        result.statusCode == SUCCESS
          ? ResSuccess(res, result.data)
          : ResError(res, { msg: result.data }),
      )
      .catch((error) => ResError(res, error));
  },
  getBetLockList: function (req, res) {
    let service;
    if (req.body.betLockType == "market") {
      service = marketBetLockList;
    } else {
      service = fancyBetLockList;
    }
    return service(req, res)
      .then((result) =>
        result.statusCode == SUCCESS
          ? ResSuccess(res, result.data)
          : ResError(res, { msg: result.data }),
      )
      .catch((error) => ResError(res, error));
  },
};
