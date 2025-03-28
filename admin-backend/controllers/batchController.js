const CONSTANTS = require("../../utils/constants");
const batchService = require("../service/batchService");
const { ResError, ResSuccess } = require("../../lib/expressResponder");

module.exports = {
  getBatchesList: async (req, res) => {
    return batchService
      .getBatchesList(req, res)
      .then((result) =>
        result.statusCode == CONSTANTS.SUCCESS
          ? ResSuccess(res, { ...result.data })
          : ResError(res, { ...result.data }),
      )
      .catch((error) => ResError(res, error));
  },
  
  processBatch: async (req, res) => {
    return batchService
      .processBatch(req, res)
      .then((result) =>
        result.statusCode == CONSTANTS.SUCCESS
          ? ResSuccess(res, { ...result.data })
          : ResError(res, { ...result.data }),
      )
      .catch((error) => ResError(res, error));
  },
};
