const express = require('express')
	, UserController = require('../controllers/userController')
	, UserControllerAdmin = require('../../admin-backend/controllers/userController')
	, UserValidator = require('../validator/userValidator')
	, UserValidatorAdmin = require('../../admin-backend/validator/userValidator')
	, AdminUserController = require('../../admin-backend/controllers/userController');
const { limiter } = require('../../utils');

//Routes for all user 
module.exports = (io) => {
	const userRoutes = express.Router();
	UserController.init(io);
	userRoutes.post('/register', UserController.register);
	userRoutes.post('/userLogin', UserController.userLogin);
	userRoutes.post('/disableTelegramSentOTP', AdminUserController.disableTelegram2Fa);
	userRoutes.post('/disableTelegramVerifyOTP', AdminUserController.disableTelegramVerifyOTP);
	userRoutes.post('/telegramResendOTP', AdminUserController.telegramResendOTP);
	userRoutes.post('/verifyOTP', UserController.verifyOTP);
	userRoutes.post('/demoUserLogin', UserController.demoUserLogin);
	userRoutes.post('/autoDemoUserLogin', UserController.autoDemoUserLogin);
	userRoutes.post('/logout', AdminUserController.adminLogout);
	userRoutes.post('/updateForChangePassword/:id', UserValidatorAdmin.checkDemoUser, UserController.updateForChangePassword);
	userRoutes.post('/selfChangePassword', UserValidatorAdmin.checkDemoUser, UserValidatorAdmin.selfChangePassword, UserControllerAdmin.selfChangePassword);
	userRoutes.post('/getUserBalance', UserValidator.getUserBalance, UserController.getUserBalance);
	userRoutes.post('/getUserBalanceV1', UserValidator.getUserBalance, UserController.getUserBalanceV1);
	userRoutes.post('/getUserMatchStack', AdminUserController.getUserMatchStack);
	userRoutes.post('/updateMatchStack', UserValidator.updateMatchStack, AdminUserController.updateMatchStack);
	userRoutes.get('/validateToken', AdminUserController.validateToken);
	userRoutes.post('/checkUserNameOpen', limiter, AdminUserController.checkUserName);
	// Ukraine Concept
	userRoutes.post('/updatePassword', UserController.updatePassword);
	userRoutes.post('/getPasswordChangedHistory', AdminUserController.getPasswordChangedHistory);
	userRoutes.get('/myProfile', UserController.myProfile);
	userRoutes.post('/userActivityList', AdminUserController.agentActivityList);
	userRoutes.post('/getBalanceCRef', UserController.getBalanceCRef);
	userRoutes.post('/setTransactionPassword', UserController.setTransactionPassword);
	userRoutes.get('/getDailyBonusAmount', AdminUserController.getDailyBonusAmount);
	userRoutes.post(
		"/acceptRules",
		UserValidatorAdmin.acceptRules,
		AdminUserController.acceptRules
	);
	userRoutes.post(
		"/getActivityLogs",
		UserValidatorAdmin.getActivityLogs,
		AdminUserController.getActivityLogs
	);
	userRoutes.post(
		"/getUserStack",
		AdminUserController.getUserStack
	);
	userRoutes.post(
		"/updateUserStack",
		AdminUserController.updateUserStack
	);
	return userRoutes;
};