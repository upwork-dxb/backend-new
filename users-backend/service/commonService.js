const User = require('../../models/user')
  , { resultResponse } = require('../../utils/globalFunction')
  , CONSTANTS = require('../../utils/constants')
  , ApiUrlSetting = require('../../models/apiUrlSetting');

let getUserByUserId = async (id, getUserFieldsName) => {
  try {
    let userdetails = await User.findOne({ _id: id }, getUserFieldsName).lean();

    if (userdetails) {
      return resultResponse(CONSTANTS.SUCCESS, userdetails);

    } else {
      return resultResponse(CONSTANTS.NOT_FOUND, CONSTANTS.DATA_NULL);
    }
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

let getApiUrlSettings = async () => {
  try {
    let apiUrlSettings = await ApiUrlSetting.findOne().lean();
    if (apiUrlSettings)
      return resultResponse(CONSTANTS.SUCCESS, apiUrlSettings);
    else
      return resultResponse(CONSTANTS.NOT_FOUND, CONSTANTS.DATA_NULL)
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};
let getLoggedInUserIsParentOfUser = async (userid, parentId) => {
  try {
    let checkLoggedInUserIsParentOfUser = await User.findOne({ 'parent_level_ids.user_id': parentId, _id: userid }, { user_name: 1, user_type_id: 1 }).lean();

    if (checkLoggedInUserIsParentOfUser) {
      return resultResponse(CONSTANTS.SUCCESS, checkLoggedInUserIsParentOfUser);

    } else {
      return resultResponse(CONSTANTS.NOT_FOUND, CONSTANTS.DATA_NULL);
    }
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};
let generateSixDigitNumber = (digits) => {
  try {
    const randomNumber = Math.floor(Math.random() * 900000) + 100000;
    const sixDigitNumber = randomNumber.toString().substring(0, digits);
    return sixDigitNumber;
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

module.exports = { getUserByUserId, getApiUrlSettings, getLoggedInUserIsParentOfUser, generateSixDigitNumber }