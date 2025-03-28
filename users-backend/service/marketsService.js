const Market = require('../../models/market')
  , OddsProfitLoss = require('../../models/oddsProfitLoss')
  , marketService = require('../../admin-backend/service/marketService')
  , marketQueryService = require('../service/marketQueryService')
  , { resultResponse } = require('../../utils/globalFunction')
  , CONSTANTS = require('../../utils/constants')

let getMarketDetails = async (FilterQuery = {}, Projection = {}, findOne = false) => {
  try {
    let marketdetails;
    if (findOne)
      marketdetails = await Market.findOne(FilterQuery, Projection);
    else
      marketdetails = await Market.find(FilterQuery, Projection);
    if (marketdetails)
      return resultResponse(CONSTANTS.SUCCESS, marketdetails);
    else
      return resultResponse(CONSTANTS.NOT_FOUND, CONSTANTS.DATA_NULL);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, error.message);
  }
};

let getDataByMarketId = async (FilterQuery = {}, Projection = {}) => {
  return await getMarketDetails(FilterQuery, Projection, true);
}

let getMarketDetail = async (FilterQuery = {}, Projection = {}) => {
  return await marketService.getMarketDetail(FilterQuery, Projection, true);
}

let getTeamPosition = async (user_id, match_id, market_id, runners = []) => {
  try {
    let query = marketQueryService.getTeamPositionQuery(user_id, match_id, market_id, runners);
    let teamPosition = await OddsProfitLoss.aggregate(query);
    if (!teamPosition.length)
      return resultResponse(CONSTANTS.SUCCESS, runners);
    else {
      if (teamPosition.length > 0)
        return resultResponse(CONSTANTS.SUCCESS, teamPosition);
      else
        return resultResponse(CONSTANTS.SUCCESS, runners);
    }
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

let getSelectionByMarketId = async (FilterQuery, Projection) => {
  try {
    let selections = await Market.findOne(FilterQuery, Projection);
    if (selections)
      return resultResponse(CONSTANTS.SUCCESS, selections);
    else
      return resultResponse(CONSTANTS.NOT_FOUND, CONSTANTS.DATA_NULL);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

module.exports = {
  getMarketDetail, getDataByMarketId, getTeamPosition, getSelectionByMarketId
}