const _ = require('lodash')
  , { SUCCESS, NOT_FOUND, SERVER_ERROR, USER_TYPE_USER, DATA_NULL } = require("../../utils/constants")
  , { resultResponse } = require('../../utils/globalFunction')
  , fancyService = require('../../admin-backend/service/fancyService')
  , BetsFancy = require('../../models/betsFancy')
  , fancyQueryService = require('./fancyQueryService')

let getFancyPosition = async (user_id, fancy_id) => {
  return fancyService.getFancyPosition(user_id, fancy_id).then(data => data).catch(error => error);
};

// This function is used inside another function i.e. createFancyPosition.
let getFancyBetForUserPosition = (user_id, fancy_id) => {
  return BetsFancy.aggregate(
    fancyQueryService.getFancyBetForUserPositionQuery(user_id, fancy_id)
  ).then(FancyUserPosition => {
    if (FancyUserPosition.length)
      return resultResponse(SUCCESS, FancyUserPosition);
    else
      return resultResponse(NOT_FOUND);
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
};

// This function is used when user place the bet.
let createFancyPosition = (user_id, fancy_id, dataObj) => {
  let DataOject = {
    "run": parseInt(dataObj.run),
    "is_back": dataObj.is_back,
    "size": dataObj.size,
    "stack": dataObj.stack,
    "per": 100,
    "is_last": true
  };

  return getFancyBetForUserPosition(user_id, fancy_id).then(fancyList => {
    if (fancyList.statusCode == SERVER_ERROR)
      return resultResponse(SERVER_ERROR, fancyList.data);

    let fancyListData = [], fancyListDataIndex;
    if (fancyList.statusCode == SUCCESS) {
      fancyListData = fancyList.data;
      fancyListData.push(DataOject);
    } else
      fancyListData.push(DataOject);

    let run = [], resultValues = [], orgRun = [];
    let lastPosition = 0, max_exposure = 0, max_profit = 0, stack_sum = 0;
    fancyListData = _.orderBy(fancyListData, ['run'], ['asc']);
    for (let i in fancyListData) {
      let fancy = fancyListData[i];
      if (fancyListData[i].hasOwnProperty("is_last")) {
        fancyListDataIndex = i;
        delete fancyListData[i].is_last;
      }
      stack_sum += fancy.stack;
      run.push(fancy.run - 1);
    }
    // run.sort();
    run.push(fancyListData[fancyListData.length - 1].run);
    orgRun = run;
    run = [...new Set(run)];
    run.map(function (r, ind) {
      let tempTotal = 0;
      fancyListData.map(function (f) {
        let stack = (f.stack * f.per) / 100;
        if (f.is_back == 1) {
          if (f.run <= r)
            tempTotal -= stack * (f.size / 100);
          else
            tempTotal += stack;
        } else {
          if (f.run > r)
            tempTotal -= stack;
          else
            tempTotal += stack * (f.size / 100);
        }
      });
      if (tempTotal != 0)
        tempTotal = -(tempTotal);
      if ((orgRun.length) - 1 == ind) {
        resultValues.push({ "key": lastPosition + '+', "value": tempTotal.toFixed(2) });
      } else {
        if (lastPosition == r) {
          resultValues.push({ "key": lastPosition, "value": tempTotal.toFixed(2) });
        } else {
          resultValues.push({ "key": lastPosition + '-' + r, "value": tempTotal.toFixed(2) });
        }
      }
      lastPosition = r + 1;
      if (max_exposure > tempTotal)
        max_exposure = tempTotal;
      if (max_profit < tempTotal)
        max_profit = tempTotal;
    });
    let data = { "fancy_position": resultValues, "liability": max_exposure, "profit": max_profit, stack_sum, bets_fancies: fancyListData, fancyListDataIndex };
    return resultResponse(SUCCESS, data);
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

// This function call when we need to see the book of fancy.
let getRunTimeFancyPosition = async (user_id, fancy_id, user_type_id) => {
  return fancyService.getRunTimeFancyPosition(user_id, fancy_id, user_type_id).then(data => data).catch(error => error);
}

let getFancyDetail = async (FilterQuery = {}, Projection = {}) => {
  return await fancyService.getFancyDetail(FilterQuery, Projection, true);
}

let getFancyByFancyId = async (fancy_id) => {
  return await fancyService.getFancyByFancyId(fancy_id);
}

module.exports = {
  getFancyDetail, getRunTimeFancyPosition, getFancyPosition, createFancyPosition,
  getFancyByFancyId
}