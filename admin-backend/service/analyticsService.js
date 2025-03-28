const analyticsQuery = require('./analyticsQueryService')
  , { SUCCESS, NOT_FOUND, SERVER_ERROR } = require("../../utils/constants")
  , BankTypeRequest = require('../../models/bankingType')
  , UserLoginLog = require('../../models/userLoginLogs')
  , { resultResponse } = require('../../utils/globalFunction')

async function getUserbyBankAccount(data) {
  if (!data.account_no) {
    let query = analyticsQuery.getUserByBank(data);
    return BankTypeRequest.aggregate(query).then(getUserByBank => {
      if (getUserByBank) {
        return resultResponse(SUCCESS, getUserByBank);
      } else
        return resultResponse(NOT_FOUND, "Data not found!");
    })
  } else {
    let userQuery = analyticsQuery.getUserBankData(data);
    return BankTypeRequest.aggregate(userQuery).then(getUserBankData => {
      if (getUserBankData) {
        return resultResponse(SUCCESS, getUserBankData);
      } else
        return resultResponse(NOT_FOUND, "Data not found with this account number!");
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
  }
}

async function getUserbyIPaddress(data) {
  if (!data.ip_address) {
    let query = analyticsQuery.getUserByIP(data)
    return UserLoginLog.aggregate(query).then(getUserByIP => {
      if (getUserByIP) {
        return resultResponse(SUCCESS, getUserByIP);
      } else
        return resultResponse(NOT_FOUND, "Data not found!");
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
  } else {
    let query = analyticsQuery.getUserDataByIP(data)
    return UserLoginLog.aggregate(query).then(getUserDataByIP => {
      if (getUserDataByIP.length) {
        return resultResponse(SUCCESS, getUserDataByIP);
      } else
        return resultResponse(NOT_FOUND, "no found with this ip address found!");
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
  }
}

module.exports = {
  getUserbyBankAccount, getUserbyIPaddress,
}