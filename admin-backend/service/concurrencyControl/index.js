// Models
const ConcurrencyControlModel = require("../../../models/concurrencyControl");

const { resultResponse } = require("../../../utils/globalFunction");
const { SUCCESS, SERVER_ERROR, NOT_FOUND } = require("../../../utils/constants");

module.exports = {
  concurrencyCheck: async function (key, expireAfterMins = undefined) {
    try {
      console.info("concurrencyCheck: ", key);
      let expire_at;
      if (expireAfterMins != undefined && expireAfterMins != null) {
        expire_at = new Date(); // Current date
        expire_at.setMinutes(expire_at.getMinutes() + (Number(expireAfterMins) || 1)); // Add 7 day
      }
      const newCC = new ConcurrencyControlModel({
        key,
        ...(expire_at ? { expire_at } : {}),
      });
      await newCC.save();

      return resultResponse(SUCCESS, { msg: "SUCCESS", cc: newCC });
    } catch (error) {
      return resultResponse(SERVER_ERROR, { msg: "SERVER_ERROR" });
    }
  },

  checkIfConcurrencyExists: async function (key) {
    try {
      console.info("checkIfConcurrencyExists: ", key);
      const cc = await ConcurrencyControlModel.findOne({ key }).exec();
      if (cc) {
        return resultResponse(SUCCESS, { msg: "SUCCESS", cc });
      } else {
        return resultResponse(NOT_FOUND, { msg: "NOT_FOUND" });
      }
    } catch (error) {
      return resultResponse(SERVER_ERROR, { msg: "SERVER_ERROR" });
    }
  },

  getConcurrencyById: async function (key) {
    try {
      console.info("getConcurrencyById: ", key);
      return await module.exports.checkIfConcurrencyExists(key);
    } catch (error) {
      return resultResponse(SERVER_ERROR, { msg: "SERVER_ERROR" });
    }
  },

  deleteConcurrencyById: async function (ccId, sleepTime = 0) {
    try {
      console.info("deleteConcurrencyById: ", ccId);
      if (ccId) {
        setTimeout(async () => {
          ConcurrencyControlModel.deleteOne({ _id: ccId }).exec();
        }, sleepTime)
      }
      return resultResponse(SUCCESS, { msg: "SUCCESS" });
    } catch (error) {
      return resultResponse(SERVER_ERROR, { msg: "SERVER_ERROR" });
    }
  },

  deleteConcurrencyByKey: async function (key) {
    try {
      console.info("deleteConcurrencyByKey: ", key);
      ConcurrencyControlModel.deleteOne({ key }).exec();
      return resultResponse(SUCCESS, { msg: "SUCCESS" });
    } catch (error) {
      return resultResponse(SERVER_ERROR, { msg: "SERVER_ERROR" });
    }
  },
};
