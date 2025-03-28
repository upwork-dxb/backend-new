const UserSettingSportWise = require('../../models/userSettingWiseSport');
const userSettingSportsWiseQuery = require('./userSettingSportsWiseQuery');
const CONSTANTS = require('../../utils/constants');
const globalFunction = require('../../utils/globalFunction');
let resultResponse = globalFunction.resultResponse;

async function userSettingSportWise(FilterQuery = {}, Projection = {}) {
  try {
    let sportSettingDetails = await UserSettingSportWise
      .findOne(FilterQuery, Projection)
      .lean();
    if (sportSettingDetails)
      return resultResponse(CONSTANTS.SUCCESS, sportSettingDetails);
    else
      return resultResponse(CONSTANTS.NOT_FOUND, "Settings not found");
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, error.message);
  }
}

async function usersSettingsSportsWise(FilterQuery = {}, Projection = {}) {
  try {
    let resultData = await UserSettingSportWise
      .findOne(FilterQuery, Projection)
      .lean();
    if (resultData)
      return resultResponse(CONSTANTS.SUCCESS, resultData.parent_commission);
    else
      return resultResponse(CONSTANTS.NOT_FOUND, CONSTANTS.DATA_NULL);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
}

function getUsersSportsSettings(FilterQuery = {}, Projection = {}, populates = [], findOne = false) {
  let sportSetting;
  if (findOne)
    sportSetting = UserSettingSportWise.findOne(FilterQuery);
  else
    sportSetting = UserSettingSportWise.find(FilterQuery);
  sportSetting.select(Array.isArray(Projection) ? Projection : Projection);
  if (populates.length)
    populates.map(populate => {
      sportSetting.populate(populate);
    });
  return sportSetting
    .lean()
    .then(sport_setting => {
      if (sport_setting != null)
        if (Object.keys(sport_setting).length || sport_setting.length)
          return resultResponse(CONSTANTS.SUCCESS, sport_setting);
      return resultResponse(CONSTANTS.NOT_FOUND, "Sport(s) or it's Setting(s) not found!");
    }).catch(error => resultResponse(CONSTANTS.SERVER_ERROR, error.message));
};

function getUserSportSettings(FilterQuery = {}, Projection = {}, populates = []) {
  return getUsersSportsSettings(FilterQuery, Projection, populates, true).then();
}

function getUserSelectiveSportSettings(user_id, sports_settings_id, columns) {
  let query = userSettingSportsWiseQuery.getUserSelectiveSportSettingsQuery(user_id, sports_settings_id, columns);
  return UserSettingSportWise
    .aggregate(query)
    .then(setting => {
      if (setting.length)
        return resultResponse(CONSTANTS.SUCCESS, setting[0]);
      return resultResponse(CONSTANTS.NOT_FOUND, "No settings found!");
    }).catch(error => resultResponse(CONSTANTS.SERVER_ERROR, error.message));
}

function getSportSettingsIndexQuery(sports_settings_id) {
  let query = userSettingSportsWiseQuery.getSportSettingsIndexQuery(sports_settings_id);
  return UserSettingSportWise
    .aggregate(query)
    .then(sports_settings_index => {
      if (sports_settings_index.length)
        return resultResponse(CONSTANTS.SUCCESS, sports_settings_index[0].sports_settings_index);
      return resultResponse(CONSTANTS.NOT_FOUND, "No setting found to getting index number!");
    }).catch(error => resultResponse(CONSTANTS.SERVER_ERROR, error.message));
}

module.exports = {
  getUsersSportsSettings, userSettingSportWise, getUserSportSettings,
  getUserSelectiveSportSettings, getSportSettingsIndexQuery
}