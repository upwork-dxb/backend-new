const bcrypt = require('bcrypt')
	, Joi = require('joi')
	, JoiObjectId = require('joi-oid')
	, OAuth2Server = require("oauth2-server")
	, saltRounds = 8
	, AdminUserController = require('../../admin-backend/controllers/userController')
	, User = require('../../models/user')
	, UserLoginLog = require('../../models/userLoginLogs')
	, OAuthToken = require('../../models/oAuthToken')
	, UserModel = require('../../models/user')
	, userService = require('../service/userService')
	, commonService = require('../service/commonService')
	, telegramService = require('../../admin-backend/service/telegramService')
	, Responder = require('../../lib/expressResponder')
	, { STATUS_400, STATUS_401, STATUS_403, STATUS_404, STATUS_422, STATUS_500, STATUS_200 } = require('../../utils/httpStatusCode')
	, { SUCCESS, OAUTH_TOKEN_VAILIDITY, USER_TYPE_USER, DEFAULT_COUNTRY_CODE, IS_VALIDATE_DOMAIN_LOGIN, LABEL_DIAMOND, OTP_PURPOSE } = require('../../utils/constants')
	, { ResError, ResSuccess } = require('../../lib/expressResponder')
	, { getDomainName, generateReferCode, userLoginLogs, checkDomain, generateRandomNumber, fixFloatingPoint } = require('../../utils')
	, oauth = new OAuth2Server({ model: require('../../oauthmodel'), accessTokenLifetime: OAUTH_TOKEN_VAILIDITY })
	, Request = OAuth2Server.Request
	, Response = OAuth2Server.Response
	, otpLength = 6;
const {
	DEFAULT_PASSWORD,
	MOBILE_NO_REQUIRED,
	NEW_BALANCE_API,
	// IS_DEFAULT_AUTH_TELEGRAM_ENABLE,
	DEMO_DEFAULT_AGENT_USER_NAME,
} = require("../../config/constant/user.js");
const {
	LABEL_UKRAINE
} = require('../../utils/constants');

module.exports = {
	init: async function (io) {
		new AdminUserController(io);
	},

	register: async function (req, res) {
		let postData = {
			name: Joi.string().required(),
			user_name: Joi.string().required(),
			password: Joi.string().required(),
			mobile: Joi.number().required(),
			country_code: Joi.string().default(DEFAULT_COUNTRY_CODE).trim().optional(),
			email: Joi.string().optional(),
			refer_code: Joi.string().optional(),
			is_demo: Joi.boolean().optional(),
		}
		if (MOBILE_NO_REQUIRED == false) {
			postData.mobile = Joi.number().optional()
		}
		req.isUser = true;

		return Joi.object(postData).validateAsync(req.body, { abortEarly: false })
			.then(params => {
				let domain_name = getDomainName(req.get('host'))
					, userQuery = { self_lock_user: 0, parent_lock_user: 0, self_close_account: 0, parent_close_account: 0, is_dealer: true, domain_name };
				if (req.path == "/autoDemoUserLogin") {
					delete userQuery["domain_name"];
					req.body.refer_code = DEMO_DEFAULT_AGENT_USER_NAME;
				}
				if (req.body.refer_code)
					userQuery["$or"] = [{ refer_code: req.body.refer_code }, { user_name: req.body.refer_code }];
				else
					userQuery.is_default_dealer = true

				return User.findOne(userQuery).select("user_type_id belongs_to_b2c").sort({ createdAt: 1 }).limit(1).lean().then(user => {
					if (user) {
						req.body = {
							...params,
							user_id: user._id,
							user_type_id: user.user_type_id
						};
						req.User = {};
						req.User.user_type_id = user.user_type_id;
						req.User.user_id = user._id;
						req.User._id = user._id
						req.User.belongs_to_b2c = user.belongs_to_b2c;
						return AdminUserController.register(req, res);
					} else
						return ResError(res, { msg: "No upline master found yet!", statusCode: STATUS_200 });
				}).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
			}).catch(error => {
				return ResError(res, error);
			});
	},

	userLogin: async function (req, res) {
		return Joi.object({
			user_name: Joi.string().lowercase().min(3).max(20).required(),
			password: Joi.string().min(6).max(12).required().messages({
				"string.min": "Password is wrong",
				"string.max": "Password is wrong",
				"string.empty": "Password is wrong",
			}),
			grant_type: Joi.string().required(),
		}).validateAsync(req.body, { abortEarly: false })
			.then(({ user_name, password }) => {
				return User.findOne({ user_name })
					.select([
						"parent_id",
						"parent_user_name",
						"user_name",
						"name",
						"password",
						"user_type_id",
						"point",
						"is_change_password",
						"exposure_limit",
						"domain_name",
						"domain",
						"parent_level_ids",
						"is_demo",
						"is_auto_demo",
						"self_lock_user",
						"parent_lock_user",
						"self_close_account",
						"parent_close_account",
						"transaction_password",
						"telegram_chat_id",
						"is_telegram_enable",
						"belongs_to",
						"is_enable_telegram_default",
						"mobile",
						"rule_accept",
						"is_auth_app_enabled",
						"is_secure_auth_enabled",
					]) // raw_password
					.then(async user => {
						if (user) {
							if (user.user_type_id != USER_TYPE_USER)
								return ResError(res, { msg: "Please login into agent panel!", statusCode: STATUS_422 });
							req.domain_name = user.domain_name;
							let ip_data = req.query?.ip ? req.query.ip : req.ip_data;
							var todayDate = new Date();
							todayDate.setDate(todayDate.getDate() + 3);
							let loginUserLog = {
								...(JSON.parse(JSON.stringify(user))),
								browser_info: req.headers["user-agent"],
								ip_address: ip_data,
								domain: user.domain,
								mobile: user.mobile ? true : false,
								domain_name: req.get('origin') || "localhost",
								login_status: "login_failed",
								expireAt: todayDate
							};
							// Validate white label.
							req.loginUserLog = loginUserLog;
							// Check if domain validation is enabled
							if (IS_VALIDATE_DOMAIN_LOGIN != 'false') {
								// Auto demo users can loggedin from any domain because they exist in common agents hierarchy.
								if (!user?.is_auto_demo) {
									let isValidDomainLogin = await checkDomain(req);
									if (isValidDomainLogin) {
										return ResError(res, { msg: isValidDomainLogin });
									}
								}
							}
							var passwordCheck = bcrypt.compareSync(password, user.password);
							if (!passwordCheck) { // If password is not vailid.
								// Store log for un-successful password attempted.
								let loginMsg = "Password did not match!";
								if (user.belongs_to == LABEL_DIAMOND) {
									loginMsg = "Password is wrong";
								}
								loginUserLog.message = loginMsg;
								UserLoginLog.create(await userLoginLogs(loginUserLog)).then().catch(console.error);
								return ResError(res, { msg: loginUserLog.message, statusCode: STATUS_422 });
							}
							else if (user.self_lock_user == 1 || user.parent_lock_user == 1)
								return ResError(res, { msg: "Your account is locked!", statusCode: STATUS_422 });
							else if (user.self_close_account == 1 || user.parent_close_account == 1)
								return ResError(res, { msg: "Your account is closed, Contact your Upline!", statusCode: STATUS_422 });
							else {
								/** sent otp when telegram otp is enable */
								/*if (user.belongs_to != LABEL_DIAMOND) {*/

								if (
									!user.is_telegram_enable &&
									!user.is_auth_app_enabled &&
									!user.is_secure_auth_enabled && // Primary Remove Above Two in Future
									user.is_enable_telegram_default
								) {
									let data = {
										user_id: user._id,
										is_telegram_enable: user.is_telegram_enable,
										is_auth_app_enabled: user.is_auth_app_enabled,
										is_secure_auth_enabled: user.is_secure_auth_enabled,
									};
									return ResSuccess(res, {
										msg: "Please enable secure auth verification",
										data,
									});
								}

								if (user.is_telegram_enable) {
									if (!user.telegram_chat_id)
										return ResError(res, { msg: "On this account telegram not associated!", statusCode: STATUS_422 });
									let otp = generateRandomNumber(otpLength);
									let data = {
										user_id: user._id,
										is_telegram_enable: user.is_telegram_enable,
										is_auth_app_enabled: user.is_auth_app_enabled,
										is_secure_auth_enabled: user.is_secure_auth_enabled,
									}
									await telegramService.telegramOtpUpdate({ user_id: user._id, otp, telegram_chat_id: user.telegram_chat_id });
									return ResSuccess(res, { msg: "Successfully sent OTP on your telegram bot.", data });
								}

								if (user.is_auth_app_enabled) {
									let data = {
										user_id: user._id,
										is_telegram_enable: user.is_telegram_enable,
										is_auth_app_enabled: user.is_auth_app_enabled,
										is_secure_auth_enabled: user.is_secure_auth_enabled,
									}
									return ResSuccess(res, {
										msg: "Use OTP from Auth App for login.",
										data,
									});
								}

								/*}*/
								user.is_online = 1;
								user.sessionid = undefined;
								user.last_login_ip_address = ip_data;
								user.save();
								if (!user.is_demo)
									OAuthToken.deleteMany({ 'user.user_id': user._id.toString() })
										.then(() => { }).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
								req.body.username = user_name; // Required for OAuth2.
								var request = new Request(req);
								var response = new Response(res);
								// Save OAuth2 token if user credentials are vailid.
								return oauth.token(request, response).then(async token => {
									// Increment login count using $inc and last login time and ip address
									User.updateOne(
										{ _id: user._id },
										{ $inc: { login_count: 1 }, $set: { last_login_date_time: new Date(), ip_address: ip_data } }
									).then().catch(console.error);
									let userLoginResponse = {
										data: {
											_id: user._id,
											parent_id: user.parent_id,
											user_type_id: user.user_type_id,
											name: user.name,
											user_name: user.user_name,
											// password: user.raw_password,
											is_change_password: user.is_change_password,
											exposure_limit: user.exposure_limit,
											point: user.point,
											domain_id: user.domain,
											is_demo: user.is_demo,
											is_telegram_enable: user.is_telegram_enable,
											rule_accept: user.rule_accept,
											// Include transaction_password only if is_change_password is 1
											...(user.is_change_password === 1 && { transaction_password: user.transaction_password }),
										},
										token: {
											accessToken: token.accessToken,
											accessTokenExpiresAt: token.accessTokenExpiresAt,
											refreshToken: token.refreshToken,
											refreshTokenExpiresAt: token.refreshTokenExpiresAt,
											client: token.client,
										},
										msg: "User successfully logged in."
									};

									let lotusConfig = require("../../utils/lotusConfig").getLotusOperator();
									userLoginResponse['operatorId'] = (user.is_demo) ? lotusConfig.operatorIdDemo : ((userLoginResponse.data['point'] == 100) ? lotusConfig.operatorIdHKD : lotusConfig.operatorId);
									loginUserLog.is_online = 1; loginUserLog.login_status = "login_success";
									loginUserLog.message = "Login Success"; loginUserLog.accessToken = userLoginResponse.token.accessToken;
									userLoginLogs(loginUserLog).then(userLoginLog => UserLoginLog.create(userLoginLog).then().catch(console.error));

									// Updating the upper line user login count.
									User.updateMany(
										{ user_name: { $in: user.parent_level_ids.map(data => data.user_name) } },
										{ '$inc': { total_users_online_count: 1 } }
									).then().catch(console.error);

									return ResSuccess(res, userLoginResponse);
								}).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
							}
						} else
							return ResError(res, { msg: "Invalid credentials! Please try again.", statusCode: STATUS_422 });
					}).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
			}).catch(error => {
				return ResError(res, error);
			});
	},

	/** verify OTP */
	verifyOTP: async function (req, res) {
		return Joi.object({
			user_id: JoiObjectId.objectId().required(),
			password: Joi.string().min(6).max(12).required(),
			otp: Joi.string().required(),
			grant_type: Joi.string().required(),
		}).validateAsync(req.body, { abortEarly: false })
			.then(({ user_id, otp, password }) => {
				return User.findOne({ _id: user_id })
					.select(`parent_id parent_user_name user_name name password user_type_id point 
					is_change_password exposure_limit domain_name domain parent_level_ids is_demo 
					self_lock_user parent_lock_user self_close_account parent_close_account
					transaction_password telegram_chat_id is_telegram_enable expire_time otp otp_purpose
					rule_accept mobile is_auth_app_enabled auth_app_id`
					) // raw_password
					.then(async user => {
						if (user) {

							if (
								(user.is_telegram_enable &&
									user.otp_purpose != OTP_PURPOSE.TELEGRAM) ||
								(user.is_auth_app_enabled &&
									user.otp_purpose != OTP_PURPOSE.AUTH_APP_LOGIN_AND_DISABLE)
							) {
								return ResError(res, { msg: "Mismatch OTP Purpose." });
							}

							const isOtpValid = bcrypt.compareSync(otp, user?.otp ?? "");
							if (!isOtpValid) {
								return ResError(res, { msg: "Invalid OTP! Please try again." });
							}

							if (user.expire_time < Date.now())
								return ResError(res, { msg: "OTP has been expired!", statusCode: STATUS_422 });
							user.is_online = 1;
							user.sessionid = undefined;
							user.last_login_ip_address = req.query?.ip ? req.query.ip : req.ip_data;
							user.otp = undefined;
							user.save();
							if (!user.is_demo)
								OAuthToken.deleteMany({ 'user.user_id': user._id.toString() })
									.then(() => { }).catch(error => ResError(res, error));
							req.body.username = user.user_name; // Required for OAuth2.
							req.body.password = password; //user.raw_password;
							var request = new Request(req);
							var response = new Response(res);
							var todayDate = new Date();
							todayDate.setDate(todayDate.getDate() + 3);
							let loginUserLog = {
								...(JSON.parse(JSON.stringify(user))),
								browser_info: req.headers["user-agent"],
								ip_address: req.ip_data,
								domain_name: req.get('origin') || "localhost",
								login_status: "login_failed",
								expireAt: todayDate,
								mobile: user.mobile ? true : false,
							};
							// Validate white label.
							req.loginUserLog = loginUserLog;
							// Save OAuth2 token if user credentials are vailid.
							return oauth.token(request, response).then(async token => {
								// Increment login count using $inc and last login time and ip address
								await User.updateOne({ _id: user._id }, { $inc: { login_count: 1 }, $set: { last_login_date_time: new Date(), ip_address: req.ip_data } });
								let userLoginResponse = {
									data: {
										_id: user._id,
										parent_id: user.parent_id,
										user_type_id: user.user_type_id,
										name: user.name,
										user_name: user.user_name,
										// password: user.raw_password,
										is_change_password: user.is_change_password,
										exposure_limit: user.exposure_limit,
										point: user.point,
										domain_id: user.domain,
										is_demo: user.is_demo,
										is_telegram_enable: user.is_telegram_enable,
										rule_accept: user.rule_accept,
										// Include transaction_password only if is_change_password is 1
										...(user.is_change_password === 1 && { transaction_password: user.transaction_password }),
									},
									token: {
										accessToken: token.accessToken,
										accessTokenExpiresAt: token.accessTokenExpiresAt,
										refreshToken: token.refreshToken,
										refreshTokenExpiresAt: token.refreshTokenExpiresAt,
										client: token.client,
									},
									msg: "User successfully logged in."
								};
								let lotusConfig = require("../../utils/lotusConfig").getLotusOperator();
								userLoginResponse['operatorId'] = (user.is_demo) ? lotusConfig.operatorIdDemo : ((userLoginResponse.data['point'] == 100) ? lotusConfig.operatorIdHKD : lotusConfig.operatorId);
								loginUserLog.is_online = 1; loginUserLog.login_status = "login_success";
								loginUserLog.message = "Login Success"; loginUserLog.accessToken = userLoginResponse.token.accessToken;
								UserLoginLog.create(await userLoginLogs(loginUserLog)).then().catch(console.error);

								const room = `${user.auth_app_id}-${user.user_name}`;
								req.IO.to(room).emit("login-success", { success: true });
								req.IO.in(room).socketsLeave(room);

								return ResSuccess(res, userLoginResponse);
							}).catch(error => {
								ResError(res, { msg: error.message, statusCode: STATUS_500 })
							});
						} else
							return ResError(res, { msg: "Invalid otp! Please try again.", statusCode: STATUS_422 });
					}).catch(error => {
						return ResError(res, { msg: error.message, statusCode: STATUS_500 });
					});
			}).catch(error => {
				return ResError(res, error);
			});
	},

	// Demo User Login
	demoUserLogin: async function (req, res) {
		let domain_name = getDomainName(req.get('host'))
			, userQuery = { domain_name, user_type_id: USER_TYPE_USER, is_demo: true };
		return User.count(userQuery).then(userCount => {
			var random = Math.floor(Math.random() * userCount);
			return User.findOne(userQuery).select("user_name") // raw_password
				.lean().skip(random).then(user => {
					if (user)
						return ResSuccess(res, {
							data: {
								user_name: user.user_name,
								// password: user.raw_password,
								password: DEFAULT_PASSWORD,
							}
						});
					else
						return ResError(res, { msg: "No demo user found for login!" });
				}).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
		}).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
	},

	autoDemoUserLogin: async function (req, res) {
		const user_name = generateReferCode(10);
		const mobile = generateRandomNumber(10);
		req.body = {
			name: "Demo",
			user_name,
			password: DEFAULT_PASSWORD,
			mobile,
			is_demo: true
		}
		return module.exports.register(req, res);
	},

	/**
	 * Logout. Delete all tokens of logged in user
	 * @param {*} req 
	 * @param {*} res 
	 * @returns 
	 */
	logout: function (req, res) {

		// let uId = res.locals.oauth.token.user.user_id
		// let logId = res.locals.oauth.token.user.user_logid
		let user_id = req.User._id;

		if (user_id) {
			// Delete all token of the user
			OAuthToken.deleteMany({ 'user.user_id': user_id }).then(function () {

				// Updating user logout time
				//	UserLoginLog.updateOne({_id:logId},{$set:{logout_time:new Date()}}).catch(e=>console.error("error:",e))
				// Delete user all logs
				UserLoginLog.deleteMany({ user_id: user_id }).then((deleteLog) => {
					return Responder.success(res, { msg: "User logout successfully" })
				}).catch((err) => Responder.success(res, { msg: err }))

			}).catch(function (error) {
				return Responder.success(res, { msg: error })
			});
		} else {
			return Responder.success(res, { msg: 'User not found' })
		}
	},
	// To get users list
	getUsersList: function (req, res) {
		User.find()
			.then((userList) => {
				return Responder.success(res, { data: userList, msg: "users list." });
			}).catch((err) => Responder.error(res, err));
	},
	/**
	 * Get user details by id
	 * @param {*} req 
	 * @param {*} res 
	 */
	getUserDetails: function (req, res) {
		let userQuery = { id: req.params.id }
		UserModel.getUserDetails(userQuery, function (result, err) {
			if (err) {
				Responder.error(res, err.error)
			} else {
				return Responder.success(res, { data: result, msg: "User details." })
			}
		})
	},
	// To update user info
	updateUserDetails: function (req, res) {
		User.findOneAndUpdate({ _id: req.params.id }, { $set: req.body }, { new: true })
			.then((updatedDetails) => {
				return Responder.success(res, { data: updatedDetails, msg: "user details updated." })
			}).catch((err) => Responder.error(res, err));
	},
	//For Change Password After login
	updateForChangePassword: async function (req, res) {
		const changePasswordSchema = Joi.object({
			old_password: Joi.string().min(6).max(12).required(),
			new_password: Joi.string().min(6).max(12).required(),
			confirm_password: Joi.string().min(6).max(12).required()
		});
		try {
			const value = await changePasswordSchema.validateAsync(req.body, {
				abortEarly: true
			});
		} catch (error) {
			return Responder.success(res, { msg: error.details[0].message, statusCode: STATUS_422 })
		}

		if (!req.params.id)
			return Responder.success(res, { msg: "User id is required.", statusCode: STATUS_422 })

		User.findOne({ _id: req.params.id })
			.then((fnd) => {
				if (fnd) {

					if (!req.body.old_password) {
						return Responder.success(res, { msg: "Please enter old password", statusCode: STATUS_422 })
					}

					if (!req.body.new_password) {
						return Responder.success(res, { msg: "Please enter new password", statusCode: STATUS_422 })
					}

					if (!req.body.confirm_password) {
						return Responder.success(res, { msg: "Please enter confirm password", statusCode: STATUS_422 })
					}

					if (req.body.confirm_password != req.body.new_password) {
						return Responder.success(res, { msg: "Password and confirm password do not match", statusCode: STATUS_422 })
					}

					if (fnd.is_demo) {
						return Responder.success(res, { msg: "Demo User Can't change password !!" })
					}

					if (!bcrypt.compareSync(req.body.old_password, fnd.password)) {
						return Responder.success(res, { msg: "Old password is incorrect", statusCode: STATUS_422 });
					}

					// if (req.body.old_password != fnd.raw_password) {
					// 	return Responder.success(res, { msg: "Old password is incorrect" })
					// }

					// var raw_password = req.body.new_password;
					// encrypting user password 
					let salt = bcrypt.genSaltSync(saltRounds);
					let hash = bcrypt.hashSync(req.body.new_password, salt);
					req.body.new_password = hash;
					User.updateOne(
						{ _id: req.params.id },
						{
							$set: {
								password: req.body.new_password,
								// raw_password: raw_password, 
								is_change_password: 1
							}
						},
					)
						.then((val) => Responder.success(res, { msg: "You have successfully changed your password.", status: true }))
						.catch((err) => Responder.error(res, { msg: err.message, statusCode: STATUS_500 }));
				} else
					return Responder.success(res, { msg: "User is not found." });
			}).catch((err) => Responder.error(res, { msg: err.message, statusCode: STATUS_500 }))
	},
	// To get user balance
	getUserBalance: async function (req, res) {
		if (NEW_BALANCE_API) {
			return module.exports.getUserBalanceV1(req, res);
		}

		let user_id = req.body.userid;
		const profilechema = Joi.object({
			userid: Joi.number().required()
		});
		try {
			await profilechema.validate(req.body, {
				abortEarly: true
			});
		} catch (error) {
			return Responder.success(res, { msg: error.details[0].message, statusCode: STATUS_422 })
		}
		let getFieldsName = { parent_id: 1, user_name: 1, name: 1, balance: 1, liability: 1, profit_loss: 1, is_online: 1 }
		User.findOne({ _id: req.User._id }, getFieldsName).lean()
			.then((userDetails) => {
				return Responder.success(res, { data: userDetails, msg: "User balance details." })
			}).catch((err) => Responder.error(res, { msg: err.message, statusCode: STATUS_500 }));
	},

	getUserBalanceV1: function (req, res) {
		return userService.getUserBalanceV1(req, res)
			.then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, result.data) : ResError(res, result.data))
			.catch(error => ResError(res, error));
	},

	// Ukraine Concept
	updatePassword: async function (req, res) {
		return Joi.object({
			newPassword: Joi.string().min(6).max(12).required()
		}).validateAsync(req.body, { abortEarly: false })
			.then(() => AdminUserController.updatePassword(req, res)).catch(error => {
				return ResError(res, { msg: error.message, statusCode: STATUS_500 });
			});
	},
	// Ukraine Concept
	myProfile: async function (req, res) {
		return userService.getUserDetails(
			{ _id: req.User._id },
			["-_id", "user_name", "name", "match_commission", "session_commission", "exposure_limit", "mobile"]
		).then(user => {
			if (user.statusCode == SUCCESS)
				return ResSuccess(res, { data: user.data });
			return ResError(res, { msg: user.data, statusCode: STATUS_200 });
		}).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
	},
	// Ukraine Concept
	getBalanceCRef: function (req, res) {
		return User.findById(req.User._id).select("-_id balance liability").lean()
			.then(user => {
				user.liability = fixFloatingPoint(user.liability);
				user.balance = fixFloatingPoint(user.balance);
				return ResSuccess(res, { data: user });
			}).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
	},

	setTransactionPassword: function (req, res) {
		let transactionPassword = commonService.generateSixDigitNumber(6);
		return User.findOneAndUpdate(
			{ _id: req.User._id },
			{ transaction_password: transactionPassword },
			{ upsert: true, new: true, runValidators: true },
		).lean()
			.select("_id transaction_password")
			.then((userData) => ResSuccess(res, { data: userData, msg: "Transacton Password updated successfully." }))
			.catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
	}
}