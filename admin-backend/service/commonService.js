const User = require('../../models/user');
const UserSettingSportWise = require('../../models/userSettingWiseSport');
const ApiUrlSetting = require('../../models/apiUrlSetting');
const CONSTANTS = require('../../utils/constants');
const globalFunction = require('../../utils/globalFunction');
let resultResponse = globalFunction.resultResponse;

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


let getHighestNumberChildOfAnyParent = async (id) => {
	try {
		let userdetails = await User.findOne({ parent_id: id }).sort({ 'user_type_id': -1 }).limit(1).lean();

		if (userdetails) {
			return resultResponse(CONSTANTS.SUCCESS, userdetails);

		} else {
			return resultResponse(CONSTANTS.NOT_FOUND, CONSTANTS.DATA_NULL);
		}
	} catch (error) {
		return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
	}
};


let getUserSportWiseSettingByUserId = async (userid) => {
	try {
		let sportSettingsDetails = await UserSettingSportWise.findOne({ user_id: userid }, { user_id: 1, parent_commission: 1, sports_settings: 1, _ids: 1 }).lean();
		if (sportSettingsDetails)
			return resultResponse(CONSTANTS.SUCCESS, sportSettingsDetails);
		else
			return resultResponse(CONSTANTS.NOT_FOUND, CONSTANTS.DATA_NULL);
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
		return resultResponse(CONSTANTS.SERVER_ERROR, error.message);
	}
};


let getUserAllChildsUserIdByUserId = async (userid) => {
	try {
		let userChildIds = await User.find({ 'parent_level_ids.user_id': userid }, { user_name: 1, user_type_id: 1 }).lean();

		if (userChildIds) {
			return resultResponse(CONSTANTS.SUCCESS, userChildIds);

		} else {
			return resultResponse(CONSTANTS.NOT_FOUND, CONSTANTS.DATA_NULL);
		}
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


module.exports = {
	getUserByUserId, getHighestNumberChildOfAnyParent, getUserSportWiseSettingByUserId,
	getUserAllChildsUserIdByUserId, getApiUrlSettings, getLoggedInUserIsParentOfUser
}