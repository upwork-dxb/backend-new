const deactiveSeries = require("../../models/deactiveSeries")
  , series = require("../../models/series")
  , CONSTANTS = require('../../utils/constants')
  , { resultResponse } = require("../../utils/globalFunction");

let getAllSeries = async (idlist) => {
  try {
    let seriesDetails = await series.find().lean();
    if (seriesDetails)
      return resultResponse(CONSTANTS.SUCCESS, seriesDetails);
    else
      return resultResponse(CONSTANTS.NOT_FOUND, CONSTANTS.DATA_NULL);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

let getUserAndParentAllDeactiveSport = async (userAndAllParentIds) => {
  try {
    let resFromDB = await DeactiveSport.find({ user_id: { $in: userAndAllParentIds } }).lean();
    if (resFromDB)
      return resultResponse(CONSTANTS.SUCCESS, resFromDB);
    else
      return resultResponse(CONSTANTS.NOT_FOUND);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

let getUserAndParentAllDeactiveSeries = async (userAndParentIds) => {
  try {
    let resFromDB = await deactiveSeries.find({ user_id: { $in: userAndParentIds } }).lean();
    if (resFromDB)
      return resultResponse(CONSTANTS.SUCCESS, resFromDB);
    else
      return resultResponse(CONSTANTS.NOT_FOUND);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

module.exports = {
  getAllSeries, getUserAndParentAllDeactiveSeries, getUserAndParentAllDeactiveSport
}