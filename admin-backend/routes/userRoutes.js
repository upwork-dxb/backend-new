const express = require('express')
  , UserController = require('../controllers/userController')
  , UserValidator = require('../validator/userValidator')
  , UserControllerRoute = require('../../users-backend/controllers/userController')
  , userActivityLogger = require('./middlewares/userActivityLogger')
  , { cors } = require('../../utils');
//Routes for all user 
module.exports = (socket) => {
  const userRoutes = express.Router();

  new UserController(socket);
  userRoutes.post('/register', UserController.createV1);
  userRoutes.post('/b2cregister', UserController.createB2CV1);
  userRoutes.post('/adminLogin', UserValidator.adminLogin, UserController.adminLogin);
  userRoutes.post('/verifyOTP', UserValidator.verifyAdminOTP, UserController.verifyAdminOTP);
  userRoutes.post('/disableTelegramSentOTP', UserController.disableTelegram2Fa);
  userRoutes.post('/disableTelegramVerifyOTP', UserController.disableTelegramVerifyOTP);
  userRoutes.post('/telegramResendOTP', UserController.telegramResendOTP);
  userRoutes.post('/logout', UserController.adminLogout);
  userRoutes.post('/logoutAll', UserController.logoutAll);
  // userRoutes.get('/usersList', UserController.getUsersList);
  userRoutes.post('/getWalletUsers', UserController.getWalletUsers);
  userRoutes.post('/getUsersList', UserValidator.getUsersListCRef, UserController.getUsersListCRef);
  userRoutes.post('/getUsersListDiamond', UserValidator.getUsersListDiamond, UserController.getUsersListDiamond);
  userRoutes.post('/getUsersListDiamond/document', cors(), UserValidator.getUsersListDiamondDocument, UserController.getUsersListDiamondDocument);
  userRoutes.post('/getUsersListDiamond/bank/document', cors(), UserValidator.getUsersListDiamondDocument, UserController.getUsersListDiamondBankDocument);
  // userRoutes.post('/updateUserDetails/:id', UserController.updateUserDetails); // Can Be Removed
  userRoutes.post('/update', UserController.update);
  userRoutes.post('/detailsForAdd', UserController.detailsForAdd);
  // userRoutes.get('/userdetails/:id', UserController.getUserDetails); // 7 Dec 2024 Removed
  userRoutes.post('/userDetailsWithChildLevelDetails/:id', UserController.getUserDetailsWithChildLevelDetails);
  // userRoutes.post('/totalNumberOfChilds/:id', UserController.totalNumberOfChilds);  // 7 Dec 2024 Removed
  userRoutes.post('/updateForChangePasswordAfterLogin/:id', UserValidator.updateForChangePasswordAfterLogin, UserController.updateForChangePasswordAfterLogin);
  userRoutes.post('/selfChangePassword', UserValidator.selfChangePassword, UserController.selfChangePassword);
  userRoutes.post('/changeChildPassword', UserValidator.changeChildPassword, UserController.changeChildPassword);
  // userRoutes.post('/lockAccountOfUser/:id', UserController.lockAccountOfUser);  // Can Be Removed
  userRoutes.post('/lockAccount', userActivityLogger, UserValidator.lockAccount, UserController.lockAccount);
  // userRoutes.post('/updateTransactionPasswordOfUser/:id', UserController.updateTransactionPasswordOfUser); // Can Be Removed
  // userRoutes.post('/getRawPasswordOfUser', UserController.getRawPasswordOfUser);
  userRoutes.post('/closeAndReOpenAccountOfUserAndTheirChilds/:id', UserController.closeAndReOpenAccountOfUserAndTheirChilds);
  userRoutes.post('/closeAccount', userActivityLogger, UserValidator.closeAccount, UserController.closeAccount);
  userRoutes.post('/checkUserName', UserController.checkUserName);
  // userRoutes.post('/getClosedUsersList/:id', UserController.getClosedUsersList);
  // userRoutes.get('/totalNumberOfClosedUser/:id', UserController.totalNumberOfClosedUser);  // 7 Dec 2024 Removed
  userRoutes.get('/getUserDetailsWithParentDetails/:id', UserController.getUserDetailsWithParentDetails);
  userRoutes.post('/updateChildPassword', userActivityLogger, UserValidator.updateChildPassword, UserController.updateChildPassword);
  userRoutes.post('/updatePassword', UserController.updatePassword);
  userRoutes.post('/getPasswordChangedHistory', UserValidator.getPasswordChangedHistory, UserController.getPasswordChangedHistory);
  userRoutes.post('/getPasswordChangedHistory/document', cors(), UserValidator.getPasswordChangedHistoryDocument, UserController.getPasswordChangedHistoryDocument);
  userRoutes.post('/getUserMatchStack', UserController.getUserMatchStack);
  userRoutes.post('/updateMatchStack', UserController.updateMatchStack);
  userRoutes.post('/getPartnershipListByUserId', UserController.getPartnershipListByUserId);
  userRoutes.post('/updatePartnershipList', UserController.updatePartnershipList);
  userRoutes.post('/updateUserStatusBettingLockUnlock', userActivityLogger, UserValidator.updateUserStatusBettingLockUnlock, UserController.updateUserStatusBettingLockUnlock);
  userRoutes.post('/updateUserStatusFancyBetLock', userActivityLogger, UserValidator.updateUserStatusFancyBetLock, UserController.updateUserStatusFancyBetLock);
  userRoutes.post('/updateUserStatusFancyBetUnlock', UserController.updateUserStatusFancyBetUnlock);
  userRoutes.post('/updateUserBetLockStatus', UserValidator.updateUserBetLockStatus, UserController.updateUserBetLockStatus);
  userRoutes.post('/update/eventSettingsCheck', userActivityLogger, UserValidator.eventSettingsCheck, UserController.eventSettingsCheck);
  userRoutes.post('/updateCreditReference', userActivityLogger, UserValidator.updateCreditReference, UserController.updateCreditReference);
  userRoutes.post('/creditReferenceLogs', UserController.creditReferenceLogs);
  userRoutes.post('/agentActivityList', UserController.agentActivityList);
  userRoutes.post('/getUserBalance', UserValidator.getUserBalance, UserController.getUserBalance);
  userRoutes.post('/getUserBalanceV1', UserValidator.getUserBalance, UserController.getUserBalanceV1);
  // userRoutes.post('/searchUser', UserController.searchUser);
  // userRoutes.post('/totalNumberOfSearchUser', UserController.totalNumberOfSearchUser);   // 7 Dec 2024 Removed
  // userRoutes.post('/searchUserForAutoSuggest', UserController.searchUserForAutoSuggest);
  userRoutes.post('/allowAndNotAllowAgentsMultiLogin', userActivityLogger, UserValidator.allowAndNotAllowAgentsMultiLogin, UserController.allowAndNotAllowAgentsMultiLogin);
  userRoutes.post('/getActivityLogs', UserValidator.getActivityLogs, UserController.getActivityLogs);
  userRoutes.post('/getActivityLogs/document', cors(), UserValidator.getActivityLogsDocument, UserController.getActivityLogsDocument);
  userRoutes.post('/getCommission', UserController.getCommission);
  userRoutes.post('/showAgents', UserValidator.showAgents, UserController.showAgents);
  userRoutes.post('/getUsersByLiability', UserController.getUsersByLiability);
  userRoutes.post('/betProcessingList', UserController.getUsersByBetProcessing);
  userRoutes.post('/unlockBetProcessing', UserController.unlockBetProcessingUsers);
  userRoutes.post(
    "/getAgentBalance",
    UserValidator.getAgentBalance,
    UserController.getAgentBalance,
  );
  userRoutes.post(
    "/getAgentBalanceV1",
    UserValidator.getAgentBalance,
    UserController.getAgentBalanceV1,
  );
  userRoutes.post('/getBalanceCRef', UserController.getBalanceCRef);
  userRoutes.post('/closedUsersList', UserController.closedUsersList);
  userRoutes.post('/getDiamondUsersTotalCr', UserValidator.getUsersListDiamond, UserController.getDiamondUsersTotalCr);
  userRoutes.post('/getUserNameMobileNoAndName', UserValidator.getUserNameMobileNoAndName, UserController.getUserNameMobileNoAndName);
  userRoutes.post('/getUserByUserName', UserValidator.getUserByUserName, UserController.getUserByUserName);
  userRoutes.post('/setTransactionPassword', UserControllerRoute.setTransactionPassword);
  userRoutes.post('/showUserAgents', UserValidator.showAgents, UserController.verifyShowAgentViewer);
  userRoutes.post('/setDailyBonusAmount', UserValidator.setDailyBonusAmount, UserController.setDailyBonusAmount);
  userRoutes.get('/getDailyBonusAmount', UserController.getDailyBonusAmount);
  userRoutes.get('/validateToken', UserController.validateToken);
  userRoutes.post('/updateUserPartnership', UserValidator.updateUserPartnership, UserController.updateUserPartnership);
  userRoutes.post('/updateChipSummary', UserValidator.updateChipSummary, UserController.updateChipSummary);
  userRoutes.post('/getClientPL', UserController.getClientPL);
  userRoutes.post('/markDealerAsB2c', UserValidator.markDealerAsB2c, UserController.markDealerAsB2c);
  userRoutes.post(
    "/allowSocialMediaDealer",
    UserValidator.allowSocialMediaDealer,
    UserController.allowSocialMediaDealer
  );
  userRoutes.post('/getOlnieUserNames', UserValidator.getOlnieUserNames, UserController.getOlnieUserNames);
  userRoutes.post('/getOlnieUserIpAddress', UserValidator.getOlnieUserNames, UserController.getOlnieUserIpAddress);
  userRoutes.post(
    "/getUserAactivityLogs",
    UserValidator.getUserAactivityLogs,
    UserController.getUserAactivityLogs
  );
  userRoutes.post(
    "/getOlnieUserDomainNames",
    UserValidator.getOlnieUserNames,
    UserController.getOlnieUserDomainNames
  );
  userRoutes.post(
    "/acceptRules",
    UserValidator.acceptRules,
    UserController.acceptRules
  );
  userRoutes.post(
    "/editProfile",
    UserValidator.editProfile,
    UserController.editProfile
  );
  userRoutes.post(
    "/favMasterList",
    UserController.favMasterList
  );
  userRoutes.post(
    "/getUserStack",
    UserValidator.getUserStack,
    UserController.getUserStack
  );
  userRoutes.post(
    "/updateUserStack",
    UserValidator.updateUserStack,
    UserController.updateUserStack
  );
  userRoutes.post(
    "/setUserStack",
    UserValidator.getUserStack,
    UserController.setUserStack
  );
  userRoutes.post(
    "/userUplineLockStatus",
    UserValidator.userUplineLockStatus,
    UserController.userUplineLockStatus
  );
  userRoutes.post(
    "/diamondDashboard",
    UserValidator.diamondDashboard,
    UserController.diamondDashboard
  );
  userRoutes.post(
    "/diamondGamesLockList",
    UserValidator.diamondGamesLockList,
    UserController.diamondGamesLockList
  );
  userRoutes.post(
    "/childUserList",
    UserValidator.childUserList,
    UserController.childUserList
  );
  userRoutes.post(
    "/unlockAttemptedTRXN",
    UserValidator.unlockAttemptedTRXN,
    UserController.unlockAttemptedTRXN
  );
  userRoutes.post(
    "/getCreditDataDiamond",
    UserValidator.getCreditDataDiamond,
    UserController.getCreditDataDiamond
  );
  userRoutes.post(
    "/markDealerAsDeafult",
    UserValidator.markDealerAsDeafult,
    UserController.markDealerAsDeafult
  );
  return userRoutes;
};