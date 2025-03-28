const GlobalSetting = require('../../models/globalSetting');
const CONSTANTS = require('../../utils/constants');
const globalFunction = require('../../utils/globalFunction');
let resultResponse = globalFunction.resultResponse;

let getGlobalSetting = async () => {
  try {
    let globalSettingDetails = await GlobalSetting.findOne({}).lean();
    if (globalSettingDetails)
      return resultResponse(CONSTANTS.SUCCESS, globalSettingDetails);
    else
      return resultResponse(CONSTANTS.NOT_FOUND, CONSTANTS.DATA_NULL);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

module.exports = { getGlobalSetting }