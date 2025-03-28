const DeactiveSeries = require('../../models/deactiveSeries')
  , Sports = require('../../models/sports')
  , Series = require('../../models/series')
  , Market = require('../../models/market')
  , User = require('../../models/user')
  , seriesServiceQuery = require('./seriesServiceQuery')
  , CONSTANTS = require('../../utils/constants')
  , { SUCCESS, NOT_FOUND, SERVER_ERROR, ALREADY_EXISTS } = require("../../utils/constants")
  , globalFunction = require('../../utils/globalFunction');
let resultResponse = globalFunction.resultResponse;

let isSeriesDataExists = async (series_id) => {
  try {
    let seriesDetails = await Series.findOne({ series_id }).select("_id is_active is_visible").lean();
    if (seriesDetails)
      return resultResponse(CONSTANTS.SUCCESS, seriesDetails);
    else
      return resultResponse(CONSTANTS.NOT_FOUND, "Series data not found!");
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

let updateSeriesStatus = async (series_id, is_active) => {
  try {

    let resFromDB = await Series.updateOne({ series_id: series_id }, { $set: { is_active: is_active } }).lean();
    if (resFromDB)
      return resultResponse(CONSTANTS.SUCCESS, resFromDB);
    else
      return resultResponse(CONSTANTS.NOT_FOUND, CONSTANTS.DATA_NULL);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

async function createSeries(data) {
  try {
    let resFromDB = await Series.create(data);
    return resultResponse(CONSTANTS.SUCCESS, resFromDB);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, error.message);
  }
}

async function createSeriesV1(request) {

  let { body } = request;

  let getSportName = await Sports.findOne({ sport_id: body.sport_id }, { _id: 0, name: 1, is_active: 1, is_visible: 1 });

  if (!getSportName) {
    return resultResponse(NOT_FOUND, "Sport data not found!");
  }

  if (getSportName.is_active == 0 || getSportName.is_visible == false) {
    return resultResponse(NOT_FOUND, "Sport are not active or visible yet!");
  }

  let checkSeriesAlreadyExist = await isSeriesDataExists(body.series_id);

  if (checkSeriesAlreadyExist.statusCode == SUCCESS) {
    return resultResponse(ALREADY_EXISTS, "Series already exist!");
  }

  body.sport_name = getSportName.name;
  body.series_name = body.name;

  let result = await createSeries(body);

  if (result.statusCode == SUCCESS) {
    return resultResponse(SUCCESS, "Series Added Successfully...");
  } else {
    return resultResponse(SERVER_ERROR, result.data);
  }

}

let getDeactiveSeries = async (data) => {
  try {
    let resFromDB = await DeactiveSeries.findOne({ user_id: data.user_id, series_id: data.series_id }).lean();
    if (resFromDB)
      return resultResponse(CONSTANTS.SUCCESS, resFromDB);
    else
      return resultResponse(CONSTANTS.NOT_FOUND);

  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};


let createDeactiveSeries = async (data) => {
  try {
    let createDeactiveRes = await DeactiveSeries.create(data);
    return resultResponse(CONSTANTS.SUCCESS, createDeactiveRes);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};


let createDeactiveSeriesV1 = async (data, userDeactiveSeries) => {
  try {
    //  let createDeactiveRes = await DeactiveSeries.create(data);
    // let resFromDBParent = await DeactiveSeries.updateOne({ _id: addInUserDeactiveSeries.blocker_user_id } , { $push: { deactive_series: addInUserDeactiveSeries } })
    let resFromDBChilds = await User.updateMany({ $or: [{ _id: userDeactiveSeries.blocker_user_id }, { 'parent_level_ids.user_id': userDeactiveSeries.blocker_user_id }] }, { $push: { deactive_series: userDeactiveSeries } })

    return resultResponse(CONSTANTS.SUCCESS, resFromDBChilds);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

let deleteDeactiveSeries = async (data) => {
  try {
    let resFromDB = await DeactiveSeries.deleteOne({ user_id: data.user_id, series_id: data.series_id })
    return resultResponse(CONSTANTS.SUCCESS, resFromDB);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};


let deleteDeactiveSeriesV1 = async (data, userDeactiveSeries) => {
  try {
    // let resFromDB = await DeactiveSeries.deleteOne({ user_id: data.user_id, series_id: data.series_id })
    let resFromDBUpdate = await User.updateMany({ $or: [{ _id: userDeactiveSeries.blocker_user_id }, { 'parent_level_ids.user_id': userDeactiveSeries.blocker_user_id }] }, { $pull: { deactive_series: userDeactiveSeries } })

    return resultResponse(CONSTANTS.SUCCESS, resFromDBUpdate);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

let getAllSeries = async (FilterQuery = {}, Projection = {}, sort = {}) => {
  try {
    let seriesResult = await Series.find(FilterQuery, Projection).sort(sort);
    if (seriesResult)
      return resultResponse(CONSTANTS.SUCCESS, seriesResult);
    else
      return resultResponse(CONSTANTS.NOT_FOUND, CONSTANTS.DATA_NULL);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, error.message);
  }
};

let getUserAndParentAllDeactiveSeries = async (userAndParentIds) => {
  try {
    let resFromDB = await DeactiveSeries.find({ user_id: { $in: userAndParentIds } }).lean();
    if (resFromDB)
      return resultResponse(CONSTANTS.SUCCESS, resFromDB);
    else
      return resultResponse(CONSTANTS.NOT_FOUND);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};


let checkParentIdsDeactiveSeries = async (series_id, parentIds) => {
  try {
    let resFromDB = await DeactiveSeries.findOne({ series_id: series_id, user_id: { $in: parentIds } }).lean();
    if (resFromDB) {
      return resultResponse(CONSTANTS.SUCCESS, resFromDB);
    } else {
      return resultResponse(CONSTANTS.NOT_FOUND);
    }
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};


let getParentsAllDeactiveSeries = async (parentIds) => {
  try {
    let resFromDB = await DeactiveSeries.find({ user_id: { $in: parentIds } }).lean();
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

async function getAgentSeries(parentIds, user_id, sport_id) {
  try {
    let query = seriesServiceQuery.getAgentSeries(parentIds, user_id, sport_id);
    let result = await Series.aggregate(query);
    if (result)
      return resultResponse(CONSTANTS.SUCCESS, result);
    else
      return resultResponse(CONSTANTS.NOT_FOUND);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, error.message);
  }
}

let getAgentSeriesV1 = async (parentDeactiveSeriesIds, userSelfDeactiveSeriesIds, sport_id) => {
  try {
    let query = seriesServiceQuery.getAgentSeriesV1(parentDeactiveSeriesIds, userSelfDeactiveSeriesIds, sport_id);
    let result = await Series.aggregate(query);
    if (result)
      return resultResponse(CONSTANTS.SUCCESS, result);
    else
      return resultResponse(CONSTANTS.NOT_FOUND);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

async function getSeriesDetails(FilterQuery = {}, Projection = {}, findOne = false) {
  try {
    let matchDetails;
    if (findOne)
      matchDetails = await Series.findOne(FilterQuery, Projection);
    else
      matchDetails = await Series.find(FilterQuery, Projection);
    if (matchDetails)
      return resultResponse(CONSTANTS.SUCCESS, matchDetails);
    else
      return resultResponse(CONSTANTS.NOT_FOUND, CONSTANTS.DATA_NULL);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, error.message);
  }
};

async function getSeriesDetail(FilterQuery = {}, Projection = {}) {
  return await getSeriesDetails(FilterQuery, Projection, true);
}

let isSeriesIsActive = async (series_id) => {
  try {
    let resFromDB = await Series.findOne({ series_id: series_id }, { series_id: 1, is_active: 1 }).lean();
    if (resFromDB)
      return resultResponse(CONSTANTS.SUCCESS, resFromDB.is_active);
    else
      return resultResponse(CONSTANTS.NOT_FOUND);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

function seriesCreateUpdate(data, select = ['_id'], transaction = false, session) {
  let options = { upsert: true, new: true, runValidators: true };
  if (transaction)
    options["session"] = session;
  return Series.findOneAndUpdate(
    { series_id: data.series_id },
    data,
    options
  ).lean().select(select)
    .then(series => {
      if (series)
        return resultResponse(SUCCESS, series);
      return resultResponse(NOT_FOUND, "Series not found!");
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

async function getSeries(params) {
  return Market.aggregate(seriesServiceQuery.getSeries(params))
    .then(result => result.length ? resultResponse(SUCCESS, result) : resultResponse(NOT_FOUND, "No series found."))
    .catch(error => resultResponse(SERVER_ERROR, error.message));
}

module.exports = {
  isSeriesDataExists, updateSeriesStatus, createSeries, getDeactiveSeries, createDeactiveSeries,
  getJoinData, deleteDeactiveSeries, getAllSeries, getUserAndParentAllDeactiveSeries, isSeriesIsActive,
  checkParentIdsDeactiveSeries, getParentsAllDeactiveSeries, getAgentSeries, getAgentSeriesV1, createSeriesV1,
  createDeactiveSeriesV1, deleteDeactiveSeriesV1, getSeriesDetail, getSeriesDetails, seriesCreateUpdate, getSeries
}