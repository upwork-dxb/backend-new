const { resultResponse } = require('../../utils/globalFunction')
  , CONSTANTS = require('../../utils/constants')
  , userService = require('../../admin-backend/service/userService')
  , User = require('../../models/user');
const { getUserBalance: getUserBalanceV1 } = require('../../admin-backend/service/userService/userFinanceData');

async function getUserByUserId(userCondition, projection = { _id: 1 }) {
  try {
    let userConditionFilter = {}, userConditionProjection = {};
    if (Object.keys(userCondition).length)
      userConditionFilter = userCondition;
    if (Object.keys(projection).length)
      userConditionProjection = projection;
    let userdetails = await User.findOne(userConditionFilter, userConditionProjection).lean();
    if (userdetails)
      return resultResponse(CONSTANTS.SUCCESS, JSON.parse(JSON.stringify(userdetails)));
    else
      return resultResponse(CONSTANTS.NOT_FOUND, CONSTANTS.DATA_NULL);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, error.message);
  }
};

function getUsersDetails(FilterQuery = {}, Projection = {}, populates = [], findOne = false) {
  return userService.getUsersDetails(FilterQuery, Projection, populates, findOne).then();
};

function getUserDetails(FilterQuery = {}, Projection = {}, populates = []) {
  return getUsersDetails(FilterQuery, Projection, populates, true).then();
}

module.exports = { getUserByUserId, getUserDetails, getUsersDetails, getUserBalanceV1 }