const sports = require("../../models/sports")
  , DeactiveSeries = require('../../models/deactiveSeries')
  , { resultResponse } = require("../../utils/globalFunction")
  , CONSTANTS = require('../../utils/constants');

let isSportIsActive = async (sport_id) => {
  try {
    let resFromDB = await sports.findOne({ sport_id: sport_id }, { sport_id: 1, is_active: 1 }).lean();
    return resultResponse(CONSTANTS.SUCCESS, resFromDB.is_active);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

let getAllSports = async () => {
  try {
    let activeSports = await Sports.find().lean();
    return resultResponse(CONSTANTS.SUCCESS, activeSports);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};
let getAllSportsNotInDeactiveSports = async (deactiveSportsIds) => {
  try {
    let activeSports = await Sports.find({ sport_id: { $nin: deactiveSportsIds } }).lean();
    if (activeSports)
      return resultResponse(CONSTANTS.SUCCESS, activeSports);
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

let getJoinData = async (parentIds, userid) => {
  try {
    let result = await DeactiveSeries.aggregate([
      {
        $match: {
          user_id: {
            $in: parentIds
          }
        }
      },
      {
        $lookup:
        {
          from: "series",
          localField: "series_id",
          foreignField: "series_id",
          as: "aliasForSportCollection"
        }
      },
      {
        $project: {
          user_id: 1,
          series_id: 1,
          is_active:
          {
            $switch: {
              branches: [
                { case: { $eq: ["_id", userid] }, then: 1 }
              ],
              default: 0
            }
          },
          aliasForSportCollection: {
            $filter: {
              input: "$aliasForSportCollection",
              as: "child",
              cond: { $eq: ["$$child.sport_id", "4"] }
            }
          },
        }
      }
    ]);
    if (result)
      return resultResponse(CONSTANTS.SUCCESS, result);
    else
      return resultResponse(CONSTANTS.NOT_FOUND);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
}

module.exports = {
  isSportIsActive, getAllSports, getAllSportsNotInDeactiveSports, getUserAndParentAllDeactiveSport, getJoinData
}