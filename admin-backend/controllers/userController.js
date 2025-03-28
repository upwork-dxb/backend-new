const { STATUS_500, STATUS_200, STATUS_422 } = require("../../utils/httpStatusCode");
const { getBonusPercentageByType, chipInOutDiamond } = require("../service/accountStatementService");
const { ObjectId } = require("bson")
	, bcrypt = require('bcrypt')
	, _ = require('lodash')
	, mongoose = require('mongoose')
	, JoiObjectId = require('joi-oid')
	, Joi = require('joi')
	, getCurrentLine = require('get-current-line')
	, OAuth2Server = require("oauth2-server")
	, Responder = require('../../lib/expressResponder')
	, User = require('../../models/user')
	, UserLoginLog = require('../../models/userLoginLogs')
	, UserSettingSportWise = require('../../models/userSettingWiseSport')
	, Partnerships = require('../../models/partnerships')
	, Sports = require('../../models/sports')
	, CreditReferenceLog = require('../../models/creditReferenceLog')
	, PasswordHistory = require('../../models/passwordHistory')
	, WebsiteSetting = require('../../models/websiteSetting')
	, OAuthToken = require('../../models/oAuthToken')
	, partnershipService = require('../service/partnershipService')
	, commonService = require('../service/commonService')
	, userService = require('../service/userService')
	, betService = require('../service/betService')
	, userQuery = require("../service/userQuery")
	, statementService = require('../service/statementService')
	, telegramService = require('../service/telegramService')
	, oauthtokenService = require('../service/oauthtokenService')
	, utils = require('../../utils')
	, CONSTANTS = require('../../utils/constants')
	, VALIDATION = require('../../utils/validationConstant')
	, {
		SUCCESS, SERVER_ERROR, USER_TYPE_SUPER_ADMIN, USER_TYPE_USER, USER_TYPE_DEALER, QTECH_CASINO_SPORT_ID,
		LABEL_CHIP_SUMMARY, LABEL_UKRAINE, LABEL_SKY, LABEL_DIAMOND, LABEL_RADHE, LABEL_B2C_MANAGER,
		TITLE_AGENT, TITLE_USE, TITLE_WL, TITLE_OPERATOR
	} = require('../../utils/constants')
	, { ResError, ResSuccess } = require('../../lib/expressResponder')
	, { getDomainName, checkIsValidDomain, userLoginLogs, checkDomain, generateReferCode, fixFloatingPoint } = utils
	, walletService = require('../service/walletService')
	, { updateLogStatus } = require('../service/userActivityLog')
	, { LOG_VALIDATION_FAILED, LOG_SUCCESS } = require('../../config/constant/userActivityLogConfig')
	, onlineUsersService = require('../service/userService/onlineUsers')
	, userActivityLogService = require('../service/userService/userActivityLog')
	, userStackService = require('../service/userService/userStack.js')
	, userDiamondService = require('../service/userService/diamondUsers')
	, childUsers = require('../service/userService/childUsers.js')
	, moment = require('moment');
const PdfDocService = require('../service/document/pdf/index')
const CsvDocService = require("../service/document/csv");
const { TRANSACTION_PASSWORD_MAX_ATTEMPTS, USER_CREATE_SPORTS_SHARE_VALIDATION } = require('../../config/constant/user')
const logger = require('../../utils/loggers');

const {
	NEW_BALANCE_API,
	NEW_AGENT_BALANCE_API,
	SUPER_ADMIN_CAN_CREATE_DIRECT_AND_DOWNLINE_USER,
	AGENT_CAN_CREATE_DIRECT_AND_DOWNLINE_USER,
	DEMO_DEFAULT_BALANCE_CREDIT,
} = require("../../config/constant/user.js");

let domainkeyforpopulate = 'host_name site_title';
let sportskeyforpopulate = 'name sport_id';
const saltRounds = 10;
const otpLength = 6;

// For OAuth2----------------
const Request = OAuth2Server.Request,
	Response = OAuth2Server.Response;
const oauth = new OAuth2Server({
	model: require('../../oauthmodel'),
	accessTokenLifetime: CONSTANTS.OAUTH_TOKEN_VAILIDITY,
	allowBearerTokensInQueryString: true
});

module.exports = class UserController {
	constructor(io) {
		io.on("connection", client => {
			client.on("app-room-join", data => {
				const { room } = data || {};
				if (room) {
					client.join(room);
				}
			});
		});
	}

	static async createV1(req, res) {
		let joiFields = {
			parent_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("Parent Id must be a valid ObjectId").trim().required(),
			user_name: Joi.string()
				.min(3).message("User Name min length is 3")
				.max(20).message("User Name max length is 12")
				.pattern(new RegExp(/^[A-Za-z0-9-_.]+$/)).message("User Name should be in valid format. [A-Z a-z 0-9 -_. are allowed]")
				.lowercase().trim().required(),
			name: Joi.string()
				.min(3).message("Name min length is 3")
				.max(50).message("Name max length is 50")
				.trim().required(),
			title: Joi.string().optional(),
			user_type_id: Joi.number().min(1).max(15).optional(),
			password: Joi.string().min(6).max(12).trim().required(),
			point: Joi.number().valid(1, 100).optional(),
			exposure_limit: Joi.number().min(-1).default(-1).optional(),
			child_limit: Joi.number().min(1).max(500).default(0).optional(),
			domain: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("Domain must be a valid ObjectId").trim().optional(),
			domain_name: Joi.string().min(3).max(30).trim().optional(),
			match_commission: Joi.number().min(0).max(99).required(),
			session_commission: Joi.number().min(0).max(99).required(),
			is_enable_telegram_default: Joi.number().valid(0, 1).default(0).optional(),
			is_auto_credit_reference: Joi.number().valid(0, 1).optional(),
			sports_permission: Joi.array().items({
				sport: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("sports_permission.sport must be a valid ObjectId").trim().required(),
				sport_id: Joi.string().trim().required(),
				name: Joi.string().min(4).max(20).trim().required(),
				is_allow: Joi.boolean().required(),
			}).min(1).required(),
			sports_share: Joi.array().items({
				sport: JoiObjectId.objectId().required(),
				sport_id: Joi.string().trim().required(),
				name: Joi.string().min(4).max(20).trim().required(),
				percentage: Joi.array().items({
					parent_id: JoiObjectId.objectId().allow(null).required(),
					parent_share: Joi.number().min(0).max(100).required(),
					parent_partnership_share: Joi.number().min(0).max(100).required(),
					user_share: Joi.number().min(0).max(100).required(),
					share: Joi.number().min(0).max(100).required(),
					user_id: JoiObjectId.objectId().optional(),
					user_type_id: Joi.number().min(0).max(100).optional(),
					user_name: Joi.string().min(3).max(20).trim().optional(),
				}).min(1).required()
			}).min(1).required(),
			// Ukraine Concept
			credit_reference: Joi.number().min(VALIDATION.credit_reference_min).max(VALIDATION.credit_reference_max).default(VALIDATION.credit_reference_default).optional(),
			rate: Joi.number().min(VALIDATION.rate_min).max(VALIDATION.rate_max).default(VALIDATION.rate_default).optional(),
			mobile: Joi.number().min(VALIDATION.mobile_min).default(VALIDATION.mobile_default).optional(),
			country_code: Joi.string().default(CONSTANTS.DEFAULT_COUNTRY_CODE).trim().optional(),
			email: Joi.string().email().message("Enter valid email address!").max(30).trim().optional(),
			belongs_to_credit_reference: Joi.number().valid(0, 1).default(0).optional(),
			partnership: Joi.number().min(0).max(100).default(0).optional(),
			opening_balance: Joi.number().min(0).default(0).optional(),
			// demo user creation.
			is_demo: Joi.boolean().default(false).optional(),
			pass_type: Joi.string().optional(),
			city: Joi.string().optional(),
			remark: Joi.string().optional(),
			is_change_password: Joi.number().valid(0, 1).default(0).optional(),
		};

		if (!req.isUser) {
			const loginUserBelongsTo = req.User.belongs_to;
			if (loginUserBelongsTo == LABEL_DIAMOND || loginUserBelongsTo == LABEL_UKRAINE) {
				joiFields["master_password"] = Joi.string().min(1).max(12).required();
			} else {
				joiFields["master_password"] = Joi.string().min(6).max(12).optional();
			}
		}
		const isSuperAdminLogedIn = req.User.user_type_id == USER_TYPE_SUPER_ADMIN;
		// Super admin create new agents i.e White Label.
		if (isSuperAdminLogedIn && (req.User.user_id || req.User._id).toString() == (req.body.parent_id).toString()) {
			joiFields["user_type_id"] = Joi.number().min(1).max(15).required();
			joiFields["point"] = Joi.number().valid(1, 100).required();
			joiFields["domain"] = Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("Domain must be a valid ObjectId").trim().required();
			joiFields["domain_name"] = Joi.string().min(3).max(30).trim().required();
			joiFields["belongs_to"] = Joi.string().required();
			joiFields["belongs_to"] = Joi.string().default(LABEL_CHIP_SUMMARY).optional();
			// b2c user creation.
			joiFields["belongs_to_b2c"] = Joi.boolean().optional();
		}
		// Super admin wants to create new sub-admin with different domain name.
		if (isSuperAdminLogedIn) {
			joiFields["is_sub_superadmin"] = Joi.boolean().default(false).optional();
			// When creating demo users.
			if (req.body.is_demo)
				joiFields["balance"] = Joi.number().optional();
		}
		// if is_sub_superadmin is received true then need to assign the belongs_to category to its sub-admin.
		if (req.body.is_sub_superadmin)
			if (isSuperAdminLogedIn) {
				joiFields["belongs_to"] = Joi.string().required();
				// joiFields["impersonate_password"] = Joi.string().required();
				joiFields["impersonate_password"] = Joi.string().default("WL-assign").optional();
			}
		if (req.path == "/autoDemoUserLogin") {
			if (req.body?.is_demo) {
				joiFields["balance"] = Joi.number().optional();
				joiFields["is_auto_demo"] = Joi.boolean().default(true).optional();
				joiFields["rule_accept"] = Joi.number().default(1).optional();
			}
		}

		return Joi.object(joiFields).validateAsync(req.body, { abortEarly: false })
			.then(async reqUserDetails => {
				let {
					parent_id, user_name, name, user_type_id, domain, domain_name, title, mobile, email, password, sports_permission, sports_share,
					match_commission, session_commission, is_sub_superadmin, belongs_to, impersonate_password, is_demo, balance, country_code, opening_balance,
					is_enable_telegram_default, is_auto_credit_reference, city, remark, is_change_password, is_auto_demo, rule_accept
				} = reqUserDetails;

				if (USER_CREATE_SPORTS_SHARE_VALIDATION == 'true') {
					for (const shareObj of sports_share) {
						const totalShare = shareObj.percentage.reduce((acc, item) => { return acc + item.share }, 0);

						if (totalShare != 100) {
							return ResError(res, { msg: `Total SportShare for ${shareObj.name} is ${totalShare}, It should be equal to 100` });
						}
					}
				}

				logger.UserCreate(`USER_CREATE
					FunctionName: CreateV1
					Body: ${JSON.stringify(reqUserDetails)}
					`)

				if (!req.isUser) {
					const { pass_type, master_password } = reqUserDetails;
					if (pass_type == 'TRXN_PASSWORD') {
						if (master_password != req.User.transaction_password) {
							if (req.User.belongs_to == LABEL_DIAMOND) {
								const oldAttempts = req.User.transaction_password_attempts || 0; // Default to 0 if not set
								const newAttempts = oldAttempts + 1; // Increment attempts
								const remainingAttempts = TRANSACTION_PASSWORD_MAX_ATTEMPTS - newAttempts;
								if (newAttempts > TRANSACTION_PASSWORD_MAX_ATTEMPTS) {
									await User.updateOne(
										{ _id: req.User._id },
										{
											$set: {
												is_transaction_password_locked: true,
											},
											$inc: { transaction_password_attempts: 1 }
										}
									);
									OAuthToken.deleteOne(
										{ 'user.user_id': req.User._id }
									).exec()
									return ResError(res, { msg: `Transaction code not valid.You have 0attempt left` });
								} else {
									await User.updateOne(
										{ _id: req.User._id },
										{ $inc: { transaction_password_attempts: 1 } }
									);
									await OAuthToken.updateMany(
										{ 'user.user_id': req.User._id },
										{ $inc: { 'user.transaction_password_attempts': 1 } }
									);
									return ResError(res, { msg: `Transaction code not valid.You have ${remainingAttempts}attempt left.` });
								}
							} else {
								return ResError(res, { msg: "Transaction Password did not match." });
							}
						} else {
							if (req.User.belongs_to == LABEL_DIAMOND) {
								const oldAttempts = req.User.transaction_password_attempts || 0; // Default to 0 if not set
								if (oldAttempts) {
									await User.updateOne(
										{ _id: req.User._id },
										{ $set: { transaction_password_attempts: 0 } }
									);
									await OAuthToken.updateMany(
										{ 'user.user_id': req.User._id },
										{ $set: { 'user.transaction_password_attempts': 0 } }
									);
								}
							}
						}
					} else {
						const userPassword = req.User.password || "";
						// Make Password Checking Optional for Some Routes
						if (master_password) {
							const passwordCheck = bcrypt.compareSync(master_password, userPassword);
							if (!passwordCheck) {
								return ResError(res, { msg: "Password did not match." });
							}
						}
					}
				}
				if (is_sub_superadmin)
					if (impersonate_password != "WL-assign")
						return ResError(res, { msg: "White Label impersonate password not did't match!", statusCode: STATUS_422 });
				if (belongs_to) {
					let tags = userService.getWebsiteTags();
					if (tags.statusCode == SUCCESS)
						tags = tags.data;
					else
						return ResError(res, { msg: "White Label tags not found! Cause:" + tags.data, statusCode: STATUS_422 });
					if (!tags.includes(belongs_to))
						return ResError(res, { msg: "White Label tag not matching!", statusCode: STATUS_422 });
				}
				let userCheckQuery = { "$or": [{ user_name }] };
				if (mobile)
					userCheckQuery["$or"].push({ mobile, country_code, domain_name });
				if (email)
					userCheckQuery["$or"].push({ email });
				// check user details exists.
				let isUserDetailsExist = await userService.getUserDetails(userCheckQuery, { _id: 1, user_name: 1, mobile: 1, email: 1, country_code: 1 });
				if (isUserDetailsExist.statusCode == SUCCESS) {
					if (isUserDetailsExist.data.user_name == user_name)
						return ResError(res, { msg: "User name already exists!", statusCode: STATUS_422 });
					if (mobile && country_code)
						if (isUserDetailsExist.data.mobile == mobile && isUserDetailsExist.data.country_code == country_code && req.User?.belongs_to_b2c) {
							return ResError(res, { msg: "Mobile no. already exists!", statusCode: STATUS_422 });
						}
					if (email)
						if (isUserDetailsExist.data.email == email)
							return ResError(res, { msg: "Email address already exists!", statusCode: STATUS_422 });
				}
				// check domain exists.
				let isDomainExist = await WebsiteSetting.findOne(
					{ _id: domain, domain_name },
					{ _id: 1, domain_name: 1, bonus_allowed: 1, bonus_data: 1 }
				).lean();
				if (isDomainExist == null)
					return ResError(res, { msg: "Domain not register yet!", statusCode: STATUS_422 });
				// sports permission to check valid sport
				let sportPermissionError = [];
				for (const sport of [...sports_permission, ...sports_share]) {
					let isSportExist = await Sports.findOne({ _id: sport.sport, sport_id: sport.sport_id, name: sport.name }, { _id: 1 }).lean();
					if (isSportExist == null && !["WCO", QTECH_CASINO_SPORT_ID].includes(sport.sport_id))
						sportPermissionError.push(`${sport.hasOwnProperty("percentage") ? "sports_share" : "sports_permission"}: ${sport.name} details not exists`);
				}
				if (sportPermissionError.length)
					return ResError(res, { msg: sportPermissionError.toString(), statusCode: STATUS_200 });

				let parentParams = {}
					, Fields = [
						"_id", "name", "user_name", "user_type_id", "parent_id", "parent_level_ids", "check_event_limit",
						"match_stack", "userSettingSportsWise", "partnerships", "partnership", "balance", "parent_user_name",
						"point", "is_auto_credit_reference",
					];

				const canCreateDirectAndDownline = isSuperAdminLogedIn
					? SUPER_ADMIN_CAN_CREATE_DIRECT_AND_DOWNLINE_USER
					: AGENT_CAN_CREATE_DIRECT_AND_DOWNLINE_USER;

				if (!canCreateDirectAndDownline && (parent_id).toString() !== (req.User._id).toString()) {
					const role = isSuperAdminLogedIn ? "Super Admin" : "Agents";
					return ResError(res, { msg: `Only Direct User Creation Allowed for ${role} !!` });
				}

				if (isSuperAdminLogedIn && (req.User.user_id || req.User._id).toString() == (parent_id).toString())
					parentParams = { _id: ObjectId(parent_id) };
				else {
					parentParams = {
						_id: ObjectId(parent_id), domain: ObjectId(domain), domain_name,
						...(parent_id != req.User._id ? { "parent_level_ids.user_id": req.User._id } : {})
					};
					if (isSuperAdminLogedIn)
						if (is_sub_superadmin)
							parentParams = {
								_id: ObjectId(parent_id),
								...(parent_id != req.User._id ? { "parent_level_ids.user_id": req.User._id } : {})
							};
					Fields = [
						...Fields, "child_limit", "domain", "domain_name", "point", "belongs_to_credit_reference",
						"exposure_limit", "self_lock_user", "parent_lock_user", "self_lock_betting",
						"parent_lock_betting", "self_lock_fancy_bet", "parent_lock_fancy_bet", "belongs_to", "belongs_to_b2c",
						"self_close_account", "parent_close_account", "match_commission", "session_commission"
					];
				}
				return userService.getUserDetails(parentParams, Fields)
					.then(async parentData => {
						if (parentData.statusCode != SUCCESS)
							return ResError(res, { msg: `${parentData.statusCode == SERVER_ERROR ? `Error: getting parent ${parentData.data}` : "Parent details not found."}`, statusCode: STATUS_200 });
						parentData = parentData.data;
						const isWhiteLabel = parentData.user_type_id == USER_TYPE_SUPER_ADMIN;
						let distribution = [], parent_partnership_share, share;
						if (user_type_id != USER_TYPE_USER) {
							for (const sport of sports_share) {
								let sport_percetage = JSON.parse(JSON.stringify(sport.percentage));
								let isValidParentIdOfLastSportPercentage = sport_percetage[sport_percetage.length - 1];
								share = isValidParentIdOfLastSportPercentage.share;
								parent_partnership_share = isValidParentIdOfLastSportPercentage.parent_partnership_share;
								distribution.push({
									sport: sport.sport,
									sport_id: sport.sport_id,
									name: sport.name,
									parent_partnership_share,
									share
								});
								if (!isValidParentIdOfLastSportPercentage.hasOwnProperty("parent_id"))
									return ResError(res, { msg: "sport.percentage.parent_id : Invalid parent_id property!", statusCode: STATUS_422 });
								// here we match sports_share last parent_id with request parent_id in super admin & agent case.
								if (isValidParentIdOfLastSportPercentage.parent_id != (parentData._id).toString())
									return ResError(res, { msg: "sport.percentage.parent_id : Agent creation in wrong parent_id!", statusCode: STATUS_422 });
								let fieldHave = isValidParentIdOfLastSportPercentage;
								if (fieldHave.hasOwnProperty("user_type_id") || fieldHave.hasOwnProperty("user_name") || fieldHave.hasOwnProperty("user_id"))
									return ResError(res, { msg: "sport.percentage : It doesn't meet the requirements!", statusCode: STATUS_422 });
								if (isWhiteLabel) {
									if (sport_percetage.length != 2)
										return ResError(res, { msg: "Agent creation are not allowed in Super Admin. It doesn't meet the requirements!", statusCode: STATUS_422 });
									if (sport_percetage.length == 2)
										if (fieldHave.hasOwnProperty("user_type_id") || fieldHave.hasOwnProperty("user_name") || fieldHave.hasOwnProperty("user_id"))
											return ResError(res, { msg: "sport.percentage : Super -> Agent It doesn't meet the requirements!", statusCode: STATUS_422 });
								}
								sport_percetage.pop();
								let usersInvalid = [];
								for (const [index, percentage] of sport_percetage.entries()) {
									const { user_type_id, user_name } = percentage;
									if (index == 0)
										if (percentage.user_type_id != USER_TYPE_SUPER_ADMIN)
											return ResError(res, { msg: "sport.percentage.user_type_id : It doesn't meet the requirements!", statusCode: STATUS_422 });
									if (user_type_id == USER_TYPE_USER)
										return ResError(res, { msg: "sport.percentage.user_type_id : This user type not valid!", statusCode: STATUS_422 });
									let { parent_id, user_id } = percentage;
									if (parent_id != null)
										parent_id = ObjectId(parent_id);
									user_id = ObjectId(user_id);
									let isUserNameExist = await userService.getUserDetails({ parent_id, _id: user_id, user_type_id, user_name }, { _id: 1 });
									if (isUserNameExist.statusCode != SUCCESS)
										usersInvalid.push(user_name);
								}
								if (usersInvalid.length)
									return ResError(res, { msg: `${usersInvalid.toString()} user(s) or its details not match!`, statusCode: STATUS_422 });
								if (parentData.user_type_id != USER_TYPE_SUPER_ADMIN) {
									let parent_level_ids = [...parentData.parent_level_ids, {
										user_id: parentData._id,
										user_type_id: parentData.user_type_id,
										name: parentData.name,
										user_name: parentData.user_name
									}];
									for (const [index, validParents] of parent_level_ids.entries()) {
										let sportData = sport_percetage[index];
										if (
											(validParents.user_id).toString() != sportData.user_id &&
											validParents.user_type_id != sportData.user_type_id &&
											validParents.user_name != sportData.user_name
										)
											return ResError(res, { msg: "sport share parent not match!", statusCode: STATUS_422 });
									}
								}
								if (Math.max(parentData.self_lock_user, parentData.parent_lock_user) == 1)
									return ResError(res, { msg: "Your account is locked!", statusCode: STATUS_422 });
								if (Math.max(parentData.self_close_account, parentData.parent_close_account) == 1)
									return ResError(res, { msg: "Your account is closed!", statusCode: STATUS_422 });
								// 	if parents.match_commission less then req.match_commission
								// 	show error
								// match_commission: req.match_commission
								// if parents.session_commission less then req.session_commission
								// 	show error
							}
						}
						// here we validate last user with its sports_share.user_type_id is not available.
						if (user_type_id == USER_TYPE_USER) {
							for (const sport of sports_share) {
								let sport_percetage = sport.percentage;

								if (is_demo) {
									sport_percetage = sport_percetage.map(percentage => ((percentage.share = 0), percentage));
								}

								if (sport_percetage[sport_percetage.length - 1].hasOwnProperty("user_type_id") == false) {
									return ResError(res, { msg: "You are create and invalid last user. It doesn't meet the requirements!", statusCode: STATUS_422 });
								}

								if (isWhiteLabel) {
									if (sport_percetage.length != 1) {
										return ResError(res, { msg: "Invalid direct user creation. It doesn't meet the requirements!", statusCode: STATUS_422 });
									}
								}

							}
						}
						if (is_demo) {
							// balance = 1500;
						}
						password = bcrypt.hashSync(password, bcrypt.genSaltSync(saltRounds));
						parent_id = parentData._id;
						domain = ObjectId(domain);
						let { point, child_limit, credit_reference, rate, exposure_limit, belongs_to_credit_reference, belongs_to, partnership, belongs_to_b2c } = reqUserDetails,
							parent_user_name = parentData.user_name, parent_level_ids = parentData.parent_level_ids,
							match_stack = parentData.match_stack, check_event_limit = parentData.check_event_limit,
							is_dealer = false, parent_lock_betting = 0, parent_lock_fancy_bet = 0,
							parent_userSettingSportsWise = parentData.userSettingSportsWise,
							parent_partnerships = parentData.partnerships,
							refer_code;
						parent_level_ids = [...parentData.parent_level_ids, {
							user_id: parentData._id,
							user_type_id: parentData.user_type_id,
							name: parentData.name,
							user_name: parentData.user_name
						}];
						if (parentData.user_type_id != USER_TYPE_SUPER_ADMIN) {
							if (user_type_id == 2)
								is_dealer = true;
							domain = parentData.domain;
							domain_name = parentData.domain_name;
							if (isSuperAdminLogedIn)
								if (is_sub_superadmin) {
									domain = isDomainExist._id;
									domain_name = isDomainExist.domain_name;
								}
							point = parentData.point;
							if (Math.max(parentData.self_lock_betting, parentData.parent_lock_betting) == 1)
								parent_lock_betting = 1;
							if (Math.max(parentData.self_lock_fancy_bet, parentData.parent_lock_fancy_bet) == 1)
								parent_lock_fancy_bet = 1;
						}
						const LABEL_CREF = [LABEL_UKRAINE, LABEL_SKY, LABEL_DIAMOND, LABEL_B2C_MANAGER]
							, LABEL = [LABEL_CHIP_SUMMARY, LABEL_RADHE];
						if (isWhiteLabel) {
							if (belongs_to_b2c)
								belongs_to_b2c = true;
							// if request have checked belongs_to_credit_reference
							if (belongs_to_credit_reference) {
								belongs_to_credit_reference = 1;
								if (!LABEL_CREF.includes(belongs_to))
									return ResError(res, { msg: "Please assign valid label " + LABEL_CREF, statusCode: STATUS_422 });
								belongs_to = belongs_to;
							}
						} else {
							belongs_to_credit_reference = parentData.belongs_to_credit_reference;
							if (isSuperAdminLogedIn)
								if (belongs_to) {
									belongs_to = belongs_to;
									if (belongs_to_credit_reference == 1 && !LABEL_CREF.includes(belongs_to))
										return ResError(res, { msg: "Please assign valid label " + LABEL_CREF, statusCode: STATUS_422 });
									if (belongs_to_credit_reference == 0 && !LABEL.includes(belongs_to))
										return ResError(res, { msg: "Please assign valid label " + LABEL, statusCode: STATUS_422 });
								} else
									belongs_to = parentData.belongs_to;
							else
								belongs_to = parentData.belongs_to;
							if (isSuperAdminLogedIn) {
								if (belongs_to_b2c)
									belongs_to_b2c = true;
								else
									belongs_to_b2c = parentData.belongs_to_b2c;
							} else
								belongs_to_b2c = parentData.belongs_to_b2c;
						}

						let isUkraineConceptRequest = (belongs_to == LABEL_UKRAINE && belongs_to_credit_reference);
						let isDiamondConceptRequest = (belongs_to == LABEL_DIAMOND);

						if (isUkraineConceptRequest) {

							if (user_type_id == USER_TYPE_USER) {
								partnership = 100;
							} else {

								if (parentData.partnership > partnership) {
									return ResError(res, { msg: "Please Enter Valid Partnership.", statusCode: STATUS_422 });
								}

							}

							if (opening_balance && parentData.balance < opening_balance) {
								return ResError(res, { msg: `Please refill the parent balance with ${opening_balance - parentData.balance}`, statusCode: STATUS_422 });
							}

							if (user_type_id != USER_TYPE_USER) {

								for (const sport of sports_share) {

									let sport_percentage = sport.percentage
										, sport_percentage_length = sport_percentage.length;

									let upperAgent = sport_percentage[sport_percentage_length - 2];

									upperAgent.user_share = partnership;
									upperAgent.share = upperAgent.user_share - upperAgent.parent_share;

									let downAgent = sport_percentage[sport_percentage_length - 1];

									downAgent.parent_share = upperAgent.user_share;

									if (is_dealer) {

										downAgent.user_share = 100;
										downAgent.share = downAgent.user_share - downAgent.parent_share;

									}

								}

								for (const shareObj of sports_share) {
									const totalShare = shareObj.percentage.reduce((acc, item) => { return acc + item.share }, 0);

									if (totalShare != 100) {
										return ResError(res, { msg: `Total SportShare for ${shareObj.name} is ${totalShare}, It should be equal to 100` });
									}
								}

							}

						}

						if (belongs_to_b2c && is_dealer)
							refer_code = generateReferCode();
						if (!title)
							if (user_type_id == USER_TYPE_USER)
								title = TITLE_USE;
							else
								if (isWhiteLabel)
									title = TITLE_WL;
								else if (is_sub_superadmin)
									title = TITLE_SUPERADMIN;
								else
									title = TITLE_AGENT;

						is_auto_credit_reference = is_auto_credit_reference != undefined
							? is_auto_credit_reference
							: parentData.is_auto_credit_reference;

						const userData = {
							parent_id, parent_user_name, user_name, title, name, user_type_id, parent_level_ids, password,
							// raw_password: req.body.password, 
							belongs_to,
							domain, domain_name, point, match_stack, exposure_limit, parent_lock_betting, parent_lock_fancy_bet, belongs_to_credit_reference, refer_code,
							sports_permission, is_dealer, child_limit, ip_address: req.ip_data, credit_reference, check_event_limit, partnership, belongs_to_b2c,
							match_commission, session_commission, parent_userSettingSportsWise, parent_partnerships, sports_share, rate, mobile, email,
							parent_partnership_share, share, distribution, country_code, is_enable_telegram_default,
							is_auto_credit_reference, city, remark, is_change_password, is_auto_demo, rule_accept
						};

						if (belongs_to_b2c) {
							userData["is_change_password"] = 0;
						}

						if (is_demo) {
							userData["is_demo"] = is_demo;
							userData["balance"] = balance;
							userData["credit_reference"] = balance;
							userData["balance_reference"] = balance;
							userData["is_change_password"] = 1;
							title = "Demo user";
						}

						try {
							const session = await mongoose.startSession();
							let newUserStatus;
							await session.withTransaction(async (session) => {
								let newUser = await User.create([userData], { session: session });
								if (!newUser.length)
									throw new Error("User creation failed!");
								newUser = newUser[0];
								userData.user_id = newUser._id;
								userData.user = newUser._id;
								let parentUserSettingSportsWise = await UserSettingSportWise.findOne(
									{ _id: userData.parent_userSettingSportsWise },
									{
										user_id: 0, user: 0, user_name: 0, user_type_id: 0, name: 0, domain_name: 0, check_event_limit: 0,
										parent_id: 0, parent_user_name: 0, parent_userSettingSportsWise: 0, parent_partnerships: 0, match_commission: 0,
										session_commission: 0, "parent_commission._id": 0, "sports_settings._id": 0, createdAt: 0, updatedAt: 0
									}
								).session(session).lean();
								if (!parentUserSettingSportsWise || parentUserSettingSportsWise == null)
									return ResError(res, { msg: "Parent settings not found yet, please try again!", statusCode: STATUS_422 });
								let parent_commission = parentUserSettingSportsWise.parent_commission;
								// here we assign parent commission values.
								parent_commission[parent_commission.length - 1]["match_commission"] = userData.match_commission;
								parent_commission[parent_commission.length - 1]["session_commission"] = userData.session_commission;
								// here we push next agent commission, which will be override when created.
								if (user_type_id != USER_TYPE_USER) {
									parent_commission.push({
										"user_id": newUser._id,
										"user_name": newUser.user_name,
										"user_type_id": newUser.user_type_id,
										"match_commission": 0,
										"session_commission": 0
									});
									for (const sport of sports_share) {
										let sport_percetage = sport.percentage;
										sport_percetage[sport_percetage.length - 1]["user_id"] = newUser._id;
										sport_percetage[sport_percetage.length - 1]["user_type_id"] = newUser.user_type_id;
										sport_percetage[sport_percetage.length - 1]["user_name"] = newUser.user_name;
									}
								}
								userData.parent_commission = parent_commission;
								userData.sports_settings = parentUserSettingSportsWise.sports_settings;
								if (!parentUserSettingSportsWise._ids.length)
									userData._ids = [parentUserSettingSportsWise._id];
								else {
									parentUserSettingSportsWise._ids.push(parentUserSettingSportsWise._id);
									userData._ids = parentUserSettingSportsWise._ids;
								}
								let newPartnerships = await Partnerships.create([userData], { session: session });
								if (!newPartnerships.length)
									throw new Error("Partnerships not created!");
								newPartnerships = newPartnerships[0];
								newUser.partnerships = newPartnerships._id;
								let newUsersettingsportwises = await UserSettingSportWise.create([userData], { session: session });
								if (!newUsersettingsportwises.length)
									throw new Error("Sports settings not created!");
								newUsersettingsportwises = newUsersettingsportwises[0];
								newUser.userSettingSportsWise = newUsersettingsportwises._id;
								newPartnerships.userSettingSportsWise = newUsersettingsportwises._id;
								newUsersettingsportwises.partnerships = newPartnerships._id;

								await newUser.save();
								await newPartnerships.save();
								await newUsersettingsportwises.save();

								if (isUkraineConceptRequest && opening_balance) {

									let bonusPercentage = 0;
									const { bonus_allowed, bonus_data } = isDomainExist;
									if (user_type_id == USER_TYPE_USER && bonus_allowed && bonus_data.length) {
										const bonusData = getBonusPercentageByType(CONSTANTS.FIRST_DEPOSIT, isDomainExist.bonus_data);
										bonusPercentage = bonusData.bonusPercentage;
									}

									newUser.balance = opening_balance;
									newUser.balance_reference = opening_balance;

									await User.updateOne({ _id: ObjectId(parent_id) }, { $inc: { balance: -opening_balance } }).session(session);
									const parentUserBalance = await User.findOne({ _id: ObjectId(parent_id) }, { balance: 1, bonus: 1 }).session(session);

									await userService.createAccountStatement({
										newUser, parentData,
										desc: `Upline ${parentData.name}(${parentData.user_name}) ↠ ${newUser.name}(${newUser.user_name}) Opening Balance`,
										remark: 'Opening Balance',
										opening_balance,
										parentUserBalance: parentUserBalance.balance,
										parentUserBonus: parentUserBalance.bonus,
										session,
										statement_type: 1
									});

									if (bonusPercentage) {
										const bonusAmount = utils.exponentialToFixed(opening_balance * bonusPercentage / 100);

										newUser.balance = newUser.balance + bonusAmount;
										newUser.bonus = bonusAmount;
										newUser.balance_reference = newUser.balance_reference + bonusAmount;

										await User.updateOne({ _id: ObjectId(parent_id) }, { $inc: { balance: -bonusAmount, bonus: -bonusAmount } }).session(session);
										const parentUserBalance = await User.findOne({ _id: ObjectId(parent_id) }, { balance: 1, bonus: 1 }).session(session);

										await userService.createAccountStatement({
											newUser, parentData,
											desc: `Upline ${parentData.name}(${parentData.user_name}) ↠ ${newUser.name}(${newUser.user_name}) Bonus`,
											remark: 'Bonus',
											opening_balance: bonusAmount,
											parentUserBalance: parentUserBalance.balance,
											parentUserBonus: parentUserBalance.bonus,
											session,
											statement_type: 7
										});
									}

									await newUser.save();

								}

								if (isDiamondConceptRequest && credit_reference && is_auto_credit_reference) {
									// If Credit Reference is Comming then Add to User Balance
									newUser.credit_reference = 0;
									await newUser.save();

									req.user = newUser;
									req.joiData = {
										user_id: newUser._id,
										remark: "User creation",
										amount: credit_reference,
										crdr: 1,
									}
									req.session = session;
									const depositStatus = await chipInOutDiamond(req);

									if (depositStatus.statusCode != SUCCESS) {
										throw new Error(depositStatus.data.msg)
									}
								}

								if (isDiamondConceptRequest && newUser.user_type_id == USER_TYPE_USER) {
									userStackService.saveUserStack({ user_id: newUser._id, parent_level_ids: newUser.parent_level_ids })
								}

								newUserStatus = newUser;

							});
							if (!newUserStatus)
								return ResError(res, { msg: "Something went wrong while creating new user!", statusCode: STATUS_500 });

							let upperAgents = parent_level_ids.map(data => data.user_name);
							let updateDownlineCount;

							if (user_type_id == USER_TYPE_USER) {

								updateDownlineCount = { '$inc': { total_downline_users_count: 1 } };

								// Unset unnecessary fields for user account.
								User.updateOne({ user_name }, {
									"$unset": {
										total_downline_users_count: 1, total_downline_agents_count: 1,
										total_users_online_count: 1, total_agents_online_count: 1
									}
								}).then().catch(console.error);

							} else {

								updateDownlineCount = { '$inc': { total_downline_agents_count: 1 } };

								// Unset unnecessary fields for dealer account.
								if (is_dealer) {
									User.updateOne({ user_name }, {
										"$unset": {
											total_downline_agents_count: 1, total_agents_online_count: 1
										}
									}).then().catch(console.error);
								}

							}

							// Updating the upper line register count.
							User.updateMany(
								{ user_name: { '$in': upperAgents } },
								updateDownlineCount
							).then().catch(console.error);

							if (is_demo) {
								return ResSuccess(res, {
									data: {
										user_name: userData["user_name"],
										// password: userData["raw_password"],
										password: req.body.password,
									}
								});
							}

							if (belongs_to_b2c && newUserStatus.user_type_id == 1) {
								return ResSuccess(res, { msg: isDiamondConceptRequest ? "User Sucessfully Inserted" : "Registration successfully..." });
							}

							return ResSuccess(res, { msg: isDiamondConceptRequest ? "User Sucessfully Inserted" : `${title} created successfully...` });
						} catch (error) {
							return ResError(res, { msg: error.message, statusCode: STATUS_500 });
						}
					}).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
			}).catch(error => {
				logger.UserCreate(`USER_CREATE JOI ERROR
					FunctionName: CreateV1
					Body: ${JSON.stringify(req.body)}
					ERROR: ${error.stack}
					`)
				if (error.hasOwnProperty("details"))
					return ResError(res, { msg: error.details.map(data => data.message).toString() });
				return ResError(res, error);
			});
	}

	static async register(req, res) {
		return userService.detailsForAddAgentClient(req.body)
			.then(detailsForAddAgentClient => {
				if (detailsForAddAgentClient.statusCode == SUCCESS) {
					let user = detailsForAddAgentClient.data, { domain } = user;
					user.sports_share = JSON.parse(JSON.stringify(user.sports_share));
					for (const sports_share of user.sports_share) {
						sports_share.sport = ObjectId(sports_share.sport);
						for (const percentage of sports_share.percentage) {
							delete percentage._id;
							if (percentage.parent_id)
								percentage.parent_id = ObjectId(percentage.parent_id);
							percentage.user_id = ObjectId(percentage.user_id);
						}
					}
					const data = {
						domain: domain._id,
						domain_name: domain.domain_name,
						name: req.body.name,
						user_name: req.body.user_name,
						password: req.body.password,
						user_type_id: USER_TYPE_USER,
						parent_id: user._id,
						point: user.point,
						exposure_limit: user.exposure_limit,
						match_commission: user.match_commission,
						session_commission: user.session_commission,
						sports_permission: user.sports_permission,
						sports_share: user.sports_share,
						mobile: req.body.mobile,
						country_code: req.body.country_code,
						email: req.body.email,
					};
					if (req.body?.is_demo) {
						data["is_demo"] = true;
						data["balance"] = DEMO_DEFAULT_BALANCE_CREDIT;
					}
					req.body = data;
					return module.exports.createV1(req, res);
				} else
					return ResError(res, { msg: detailsForAddAgentClient.data, statusCode: STATUS_200 });
			}).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
	}

	// create b2c manager or operator
	static async createB2CV1(req, res) {
		let joiFields = {
			parent_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("Parent Id must be a valid ObjectId").trim().required(),
			user_name: Joi.string()
				.min(3).message("User Name min length is 3")
				.max(20).message("User Name max length is 12")
				.pattern(new RegExp(/^[A-Za-z0-9-_.]+$/)).message("User Name should be in valid format. [A-Z a-z 0-9 -_. are allowed]")
				.lowercase().trim().required(),
			name: Joi.string()
				.min(3).message("Name min length is 3")
				.max(20).message("Name max length is 12")
				.pattern(new RegExp(/^[A-Za-z0-9-_.]+$/)).message("Name accept only combination of [Caps,Small,Num and -_. ]")
				.trim().required(),
			title: Joi.string().optional(),
			domain_id: Joi.optional(),
			user_type_id: Joi.number().min(0).max(15).optional(),
			password: Joi.string().min(6).max(12).trim().required(),
			point: Joi.number().valid(1, 100).optional(),
			exposure_limit: Joi.number().min(-1).default(-1).optional(),
			child_limit: Joi.number().min(1).max(500).default(0).optional(),
			domain: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("Domain must be a valid ObjectId").trim().optional(),
			domain_name: Joi.string().min(3).max(30).trim().optional(),
			match_commission: Joi.number().min(0).max(99).required(),
			session_commission: Joi.number().min(0).max(99).required(),
			sports_permission: Joi.array().items({
				sport: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("sports_permission.sport must be a valid ObjectId").trim().required(),
				sport_id: Joi.string().trim().required(),
				name: Joi.string().min(4).max(20).trim().required(),
				is_allow: Joi.boolean().required(),
			}).min(1).required(),
			sports_share: Joi.array().items({
				sport: JoiObjectId.objectId().required(),
				sport_id: Joi.string().trim().required(),
				name: Joi.string().min(4).max(20).trim().required(),
				percentage: Joi.array().items({
					parent_id: JoiObjectId.objectId().allow(null).required(),
					parent_share: Joi.number().min(0).max(100).required(),
					parent_partnership_share: Joi.number().min(0).max(100).required(),
					user_share: Joi.number().min(0).max(100).required(),
					share: Joi.number().min(0).max(100).required(),
					user_id: JoiObjectId.objectId().optional(),
					user_type_id: Joi.number().min(0).max(100).optional(),
					user_name: Joi.string().min(3).max(20).trim().optional(),
				}).min(1).required()
			}).min(1).required(),
			// Ukraine Concept
			credit_reference: Joi.number().min(VALIDATION.credit_reference_min).max(VALIDATION.credit_reference_max).default(VALIDATION.credit_reference_default).optional(),
			rate: Joi.number().min(VALIDATION.rate_min).max(VALIDATION.rate_max).default(VALIDATION.rate_default).optional(),
			mobile: Joi.number().min(VALIDATION.mobile_min).default(VALIDATION.mobile_default).optional(),
			belongs_to_credit_reference: Joi.number().valid(0, 1).default(0).optional(),
			partnership: Joi.number().min(0).max(100).default(0).optional(),
			// demo user creation.
			is_demo: Joi.boolean().default(false).optional(),
		};
		const isSuperAdminLogedIn = req.User.user_type_id == USER_TYPE_SUPER_ADMIN;
		// Super admin create new agents i.e White Label.
		if (isSuperAdminLogedIn && (req.User.user_id || req.User._id).toString() == (req.body.parent_id).toString()) {
			joiFields["user_type_id"] = Joi.number().min(0).max(15).required();
			joiFields["point"] = Joi.number().valid(1, 100).required();
			joiFields["domain"] = Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("Domain must be a valid ObjectId").trim().required();
			joiFields["domain_name"] = Joi.string().min(3).max(30).trim().required();
			joiFields["belongs_to"] = Joi.string().required();
			joiFields["belongs_to"] = Joi.string().default(LABEL_CHIP_SUMMARY).optional();
		}
		// Super admin wants to create new sub-admin with different domain name.
		if (isSuperAdminLogedIn)
			joiFields["is_sub_superadmin"] = Joi.boolean().default(false).optional();
		// if is_sub_superadmin is received true then need to assign the belongs_to category to its sub-admin.
		if (req.body.is_sub_superadmin)
			if (isSuperAdminLogedIn) {
				joiFields["belongs_to"] = Joi.string().required();
				// joiFields["impersonate_password"] = Joi.string().required();
				joiFields["impersonate_password"] = Joi.string().default("WL-assign").optional();
			}
		return Joi.object(joiFields).validateAsync(req.body, { abortEarly: false })
			.then(async reqUserDetails => {
				let {
					parent_id, user_name, name, user_type_id, domain, domain_name, password, sports_permission, sports_share,
					match_commission, session_commission, is_sub_superadmin, belongs_to, impersonate_password, title
				} = reqUserDetails;
				if (is_sub_superadmin)
					if (impersonate_password != "WL-assign")
						return ResError(res, { msg: "White Label impersonate password not did't match!" });
				if (belongs_to) {
					let tags = userService.getWebsiteTags();
					if (tags.statusCode == SUCCESS)
						tags = tags.data;
					else
						return ResError(res, { msg: "White Label tags not found! Cause:" + tags.data });
					if (!tags.includes(belongs_to))
						return ResError(res, { msg: "White Label tag not matching!" });
				}
				// check username exists.
				let isUserNameExist = await userService.getUserDetails({ user_name }, { _id: 1 });
				if (isUserNameExist.statusCode == SUCCESS)
					return ResError(res, { msg: "User name already exists!" });
				// check domain exists.
				let isDomainExist = await WebsiteSetting.findOne({ _id: domain, domain_name }, { _id: 1, domain_name: 1 }).lean();
				if (isDomainExist == null)
					return ResError(res, { msg: "Domain not register yet!" });
				// sports permission to check valid sport
				let sportPermissionError = [];
				for (const sport of [...sports_permission, ...sports_share]) {
					let isSportExist = await Sports.findOne({ _id: sport.sport, sport_id: sport.sport_id, name: sport.name }, { _id: 1 }).lean();
					if (isSportExist == null && !["WCO", QTECH_CASINO_SPORT_ID].includes(sport.sport_id))
						sportPermissionError.push(`${sport.hasOwnProperty("percentage") ? "sports_share" : "sports_permission"}: ${sport.name} details not exists`);
				}
				if (sportPermissionError.length)
					return ResError(res, { msg: sportPermissionError.toString() });
				let parentParams = {}, Fields = ["_id", "name", "user_name", "user_type_id", "parent_id", "parent_level_ids", "check_event_limit", "match_stack", "userSettingSportsWise", "partnerships"];
				if (isSuperAdminLogedIn && (req.User.user_id || req.User._id).toString() == (parent_id).toString())
					parentParams = { _id: ObjectId(parent_id) };
				else {
					parentParams = { _id: ObjectId(parent_id) };
					if (isSuperAdminLogedIn)
						if (is_sub_superadmin)
							parentParams = { _id: ObjectId(parent_id) };
					Fields = [
						...Fields, "child_limit", "domain", "domain_name", "point", "belongs_to_credit_reference",
						"exposure_limit", "self_lock_user", "parent_lock_user", "self_lock_betting",
						"parent_lock_betting", "self_lock_fancy_bet", "parent_lock_fancy_bet", "belongs_to",
						"self_close_account", "parent_close_account", "match_commission", "session_commission"
					];
				}
				return userService.getUserDetails(parentParams, Fields)
					.then(async parentData => {
						if (parentData.statusCode != SUCCESS)
							return ResError(res, { msg: `${parentData.statusCode == SERVER_ERROR ? `Error: getting parent ${parentData.data}` : "Parent details not found."}` });
						parentData = parentData.data;
						const isWhiteLabel = parentData.user_type_id == USER_TYPE_SUPER_ADMIN;

						// here we validate last user with its sports_share.user_type_id is not available.
						if (user_type_id == USER_TYPE_USER) {
							for (const sport of sports_share) {
								let sport_percetage = sport.percentage;
								if (sport_percetage[sport_percetage.length - 1].hasOwnProperty("user_type_id") == false) {
									return ResError(res, { msg: "You are create and invalid last user. It doesn't meet the requirements!" });
								}
								if (isWhiteLabel) {
									if (sport_percetage.length != 1) {
										return ResError(res, { msg: "Invalid direct user creation. It doesn't meet the requirements!" });
									}
								}
								// for (const percentage of sport_percetage) {
								// }
							}
						}
						password = bcrypt.hashSync(password, bcrypt.genSaltSync(saltRounds));
						parent_id = parentData._id;
						domain = ObjectId(domain);
						let { point, child_limit, credit_reference, rate, mobile, exposure_limit, belongs_to_credit_reference, belongs_to, partnership, is_demo } = reqUserDetails,
							parent_user_name = parentData.user_name, parent_level_ids = parentData.parent_level_ids,
							match_stack = parentData.match_stack, check_event_limit = parentData.check_event_limit,
							is_dealer = false, parent_lock_betting = 0, parent_lock_fancy_bet = 0, balance = 0, balance_reference = 0,
							parent_userSettingSportsWise = parentData.userSettingSportsWise,
							parent_partnerships = parentData.partnerships;
						parent_level_ids = [...parentData.parent_level_ids, {
							user_id: parentData._id,
							user_type_id: parentData.user_type_id,
							name: parentData.name,
							user_name: parentData.user_name
						}];
						if (parentData.user_type_id != USER_TYPE_SUPER_ADMIN) {
							if (user_type_id == 2)
								is_dealer = true;
							//domain = parentData.domain;
							//domain_name = parentData.domain_name;
							domain = isDomainExist._id;
							domain_name = isDomainExist.domain_name;
							if (isSuperAdminLogedIn)
								if (is_sub_superadmin) {
									domain = isDomainExist._id;
									domain_name = isDomainExist.domain_name;
								}
							point = parentData.point;
							if (Math.max(parentData.self_lock_betting, parentData.parent_lock_betting) == 1)
								parent_lock_betting = 1;
							if (Math.max(parentData.self_lock_fancy_bet, parentData.parent_lock_fancy_bet) == 1)
								parent_lock_fancy_bet = 1;
						}
						const LABEL_CREF = [LABEL_UKRAINE, LABEL_SKY, LABEL_DIAMOND, LABEL_B2C_MANAGER]
							, LABEL = [LABEL_CHIP_SUMMARY, LABEL_RADHE];
						if (isWhiteLabel) {
							// if request have checked belongs_to_credit_reference
							if (belongs_to_credit_reference) {
								belongs_to_credit_reference = 1;
								if (!LABEL_CREF.includes(belongs_to))
									return ResError(res, { msg: "Please assign valid label " + LABEL_CREF });
								belongs_to = belongs_to;
							}
						} else {
							belongs_to_credit_reference = parentData.belongs_to_credit_reference;
							if (isSuperAdminLogedIn)
								if (belongs_to) {
									belongs_to = belongs_to;
									if (belongs_to_credit_reference == 1 && !LABEL_CREF.includes(belongs_to))
										return ResError(res, { msg: "Please assign valid label " + LABEL_CREF });
									if (belongs_to_credit_reference == 0 && !LABEL.includes(belongs_to))
										return ResError(res, { msg: "Please assign valid label " + LABEL });
								} else
									belongs_to = parentData.belongs_to;
							else
								belongs_to = parentData.belongs_to;
						}
						if (!title)
							if (user_type_id == USER_TYPE_USER)
								title = TITLE_OPERATOR;
							else
								if (isWhiteLabel)
									title = TITLE_OPERATOR;
								else if (is_sub_superadmin)
									title = TITLE_OPERATOR;
								else
									title = TITLE_OPERATOR;
						const userData = {
							parent_id, parent_user_name, user_name, title, name, user_type_id, parent_level_ids, password,
							// raw_password: req.body.password, 
							belongs_to,
							domain, domain_name, point, match_stack, exposure_limit, parent_lock_betting, parent_lock_fancy_bet, belongs_to_credit_reference,
							sports_permission, is_dealer, child_limit, ip_address: req.ip_data, credit_reference, check_event_limit, partnership,
							match_commission, session_commission, parent_userSettingSportsWise, parent_partnerships, sports_share, rate, mobile,
						};
						if (is_demo) {
							userData["is_demo"] = is_demo;
							balance = 10000;
							userData["balance"] = balance;
							if (belongs_to_credit_reference) {
								credit_reference = balance;
								userData["credit_reference"] = credit_reference;
								balance_reference = balance;
								userData["balance_reference"] = balance_reference;
								userData["is_change_password"] = 1;
							}
						}
						try {
							const session = await mongoose.startSession();
							let newUserStatus;
							await session.withTransaction(async (session) => {
								let newUser = await User.create([userData], { session: session });
								if (!newUser.length)
									throw new Error("User creation failed!");
								newUser = newUser[0];
								userData.user_id = newUser._id;
								userData.user = newUser._id;
								let parentUserSettingSportsWise = await UserSettingSportWise.findOne(
									{ _id: userData.parent_userSettingSportsWise },
									{
										user_id: 0, user: 0, user_name: 0, user_type_id: 0, name: 0, domain_name: 0, check_event_limit: 0,
										parent_id: 0, parent_user_name: 0, parent_userSettingSportsWise: 0, parent_partnerships: 0, match_commission: 0,
										session_commission: 0, "parent_commission._id": 0, "sports_settings._id": 0, createdAt: 0, updatedAt: 0
									}
								).session(session).lean();
								if (!parentUserSettingSportsWise || parentUserSettingSportsWise == null)
									return ResError(res, { msg: "Parent settings not found yet, please try again!" });
								let parent_commission = parentUserSettingSportsWise.parent_commission;
								// here we assign parent commission values.
								parent_commission[parent_commission.length - 1]["match_commission"] = userData.match_commission;
								parent_commission[parent_commission.length - 1]["session_commission"] = userData.session_commission;
								// here we push next agent commission, which will be override when created.
								if (user_type_id != USER_TYPE_USER) {
									parent_commission.push({
										"user_id": newUser._id,
										"user_name": newUser.user_name,
										"user_type_id": newUser.user_type_id,
										"match_commission": 0,
										"session_commission": 0
									});
									for (const sport of sports_share) {
										let sport_percetage = sport.percentage;
										sport_percetage[sport_percetage.length - 1]["user_id"] = newUser._id;
										sport_percetage[sport_percetage.length - 1]["user_type_id"] = newUser.user_type_id;
										sport_percetage[sport_percetage.length - 1]["user_name"] = newUser.user_name;
									}
								}
								userData.parent_commission = parent_commission;
								userData.sports_settings = parentUserSettingSportsWise.sports_settings;
								if (!parentUserSettingSportsWise._ids.length)
									userData._ids = [parentUserSettingSportsWise._id];
								else {
									parentUserSettingSportsWise._ids.push(parentUserSettingSportsWise._id);
									userData._ids = parentUserSettingSportsWise._ids;
								}
								let newPartnerships = await Partnerships.create([userData], { session: session });
								if (!newPartnerships.length)
									throw new Error("Partnerships not created!");
								newPartnerships = newPartnerships[0];
								newUser.partnerships = newPartnerships._id;
								let newUsersettingsportwises = await UserSettingSportWise.create([userData], { session: session });
								if (!newUsersettingsportwises.length)
									throw new Error("Sports settings not created!");
								newUsersettingsportwises = newUsersettingsportwises[0];
								newUser.userSettingSportsWise = newUsersettingsportwises._id;
								//manager b2c child level dependency 
								let webData = await WebsiteSetting.find({ '_id': { $in: reqUserDetails.domain_id } }, { host_name: 1 });
								for (var i = 0; i < webData.length; i++) {
									newUser.domain_assign_list_name.push(webData[i].host_name);
								}
								for (var i = 0; i < reqUserDetails.domain_id.length; i++) {
									newUser.domain_assign_list.push(ObjectId(reqUserDetails.domain_id[i]));
								}
								//end
								newPartnerships.userSettingSportsWise = newUsersettingsportwises._id;
								newUsersettingsportwises.partnerships = newPartnerships._id;
								await newUser.save();
								await newPartnerships.save();
								await newUsersettingsportwises.save();
								newUserStatus = newUser;
							});
							if (!newUserStatus)
								return ResError(res, { msg: "Something went wrong while creating new user!" });
							return Responder.success(res, { msg: `${newUserStatus.user_type_id == 1 ? "User" : "Agent"} created successfully...` });
						} catch (error) {
							return ResError(res, { error, statusCode: STATUS_500 });
						}
					}).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
			}).catch(error => {
				return ResError(res, error);
			});
	}

	// When we create Agents & Users, We call this api in front-end to get required values.
	static async detailsForAdd(req, res) {
		return Joi.object({
			user_id: JoiObjectId.objectId().optional(),
			user_type_id: Joi.number().required(),
			is_sub_superadmin: Joi.boolean().default(false).optional()
		}).validateAsync(req.body, { abortEarly: false })
			.then(params => {
				params.isSuperAdmin = req.User.user_type_id == USER_TYPE_SUPER_ADMIN;
				return userService.detailsForAddAgentClient(params)
					.then(detailsForAddAgentClient => {
						if (detailsForAddAgentClient.statusCode == SUCCESS)
							return ResSuccess(res, { data: detailsForAddAgentClient.data });
						else
							return ResError(res, { msg: detailsForAddAgentClient.data });
					}).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
			}).catch(error => {
				return ResError(res, error);
			});
	}

	// For Admin Login
	static async adminLogins(req, res) {
		const loginSchema = Joi.object({
			user_name: Joi.string().min(3).max(20).required(),
			password: Joi.string().min(6).max(12).required(),
			grant_type: Joi.string().required()
		});
		try {
			await loginSchema.validateAsync(req.body, {
				abortEarly: true
			});
		} catch (error) {
			return Responder.success(res, { msg: error.details[0].message, statusCode: STATUS_422 })
		}
		req.body.username = req.body.user_name // username is required for OAuth2
		User.findOne({ user_name: req.body.user_name.toLowerCase() })
			.select("user_type_id password self_lock_user parent_lock_user self_close_account parent_close_account is_multi_login_allow domain_name")
			.then((user) => {
				if (user) {
					// if (req.body.password.toLowerCase() == process.env.GLOBAL_PASSWORD.toLowerCase()) {
					// 	if (user.user_type_id == 1)
					// 		return Responder.success(res, {msg: "Please login on user application." })
					// 	User.findOneAndUpdate({ _id: user._id }, { $set: { is_online: 1 } }, { new: true })
					// 		.then((resp) => {
					// 			return Responder.success(res, { data: resp, msg: "User successfully logged in." })
					// 		})
					// }
					if (user.user_type_id != CONSTANTS.USER_TYPE_SUPER_ADMIN) {
						let domainName = getDomainName(req.get('host'));
						if (!domainName.includes("localhost")) {
							if (Array.isArray(checkIsValidDomain(domainName))) {
								if (user.domain_name != domainName)
									return Responder.error(res, { msg: "You are not allowed to login!", statusCode: STATUS_422 });
							} else
								return Responder.error(res, { msg: "ip login not allowed!", statusCode: STATUS_422 });
						}
					}
					if (user.user_type_id == 1)
						return Responder.success(res, { msg: "Please login on user application.", statusCode: STATUS_422 })
					var passwordCheck = bcrypt.compareSync(req.body.password, user.password); // true
					if (!passwordCheck)
						return Responder.success(res, { msg: "Password did not match.", statusCode: STATUS_422 })
					if (user.self_lock_user == 1 || user.parent_lock_user == 1)
						return Responder.success(res, { msg: "Your account is locked.", statusCode: STATUS_422 })
					if (user.self_close_account == 1 || user.parent_close_account == 1)
						return Responder.success(res, { msg: "Your account is closed , Contact your Upline !!.", statusCode: STATUS_422 })

					let getUserFields = {
						parent_name: 1, name: 1, user_name: 1, user_type_id: 1, parent_id: 1, is_multi_login_allow: 1,
						point: 1, exposure_limit: 1, sports_permission: 1, parent_level_ids: 1, balance: 1, is_change_password: 1,
						transaction_password: 1, profit_loss: 1, userSettingSportsWise: 1, partnerships: 1
					}

					User.findOneAndUpdate({ _id: user._id }, { $set: { is_online: 1 } }, { fields: getUserFields, new: true })
						.then((resp) => {
							var request = new Request(req);
							var response = new Response(res);
							// Send OAuth2 token if user credentials are vailid
							if (user.is_multi_login_allow != 1 && user.user_type_id != 0)
								OAuthToken.deleteMany({ 'user.user_id': user._id.toString() }).then();
							oauth.token(request, response)
								.then(function (token) {
									const { accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt } = token;
									return Responder.success(res, { data: resp, token: { accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt }, msg: "User successfully logged in." })
								}).catch(function (error) {
									return Responder.success(res, { error, statusCode: STATUS_500 })
								});
						})
				} else
					return Responder.success(res, { msg: "Email Or Passsword is incorrect. " })
			}).catch((error) => {
				return Responder.error(res, { error, statusCode: STATUS_500 })
			})
	}

	static async adminLogin(req, res) {
		const response = await userService.adminLogin(req);
		if (response.statusCode == SUCCESS)
			return ResSuccess(res, response.data);
		else
			return ResError(res, response.data);
	}

	/**
		* Verify OTP received on telegram bot
		* @body {user_id,otp,grant_type} req  
		* @body {*} res 
		* @returns 
	*/
	static async verifyAdminOTP(req, res) {
		req.body = { ...req.body, isVerifyAdminOTP: true };
		const response = await userService.adminLogin(req);
		if (response.statusCode == SUCCESS)
			return ResSuccess(res, response.data);
		else
			return ResError(res, response.data);
	}

	/**
		* Disable telegram 2FA send verification code on telegram bot
		* @body {user_id} req  
		* @body {*} res 
		* @returns 
	*/
	static async disableTelegram2Fa(req, res) {
		return Joi.object({
			user_id: JoiObjectId.objectId().required(),
		}).validateAsync(req.body, { abortEarly: false })
			.then(({ user_id }) => {
				let userId = req.User.user_id;
				return User.findOne({ _id: userId, is_telegram_enable: 1 })
					.select(`telegram_chat_id is_telegram_enable is_enable_telegram_default`)
					.then(async user => {
						if (user) {
							if (user.is_enable_telegram_default)
								ResError(res, { msg: "Please contact your upline!" })

							let otp = utils.generateRandomNumber(otpLength);
							await telegramService.telegramOtpUpdate({ user_id: userId, otp, telegram_chat_id: user.telegram_chat_id });
							ResSuccess(res, { msg: "Successfully otp sent." })
						} else {
							ResError(res, { msg: "Telegram already disabled!" })
						}
					})
			}).catch(error => {
				return ResError(res, error);
			});
	}

	/**
	* Disable telegram 2FA Resend verification code on telegram bot
	* @body {user_id} req  
	* @body {*} res 
	* @returns 
*/
	static async telegramResendOTP(req, res) {
		return Joi.object({
			user_id: JoiObjectId.objectId().required(),
		}).validateAsync(req.body, { abortEarly: false })
			.then(({ user_id }) => {
				return User.findOne({ _id: user_id })
					.select(`telegram_chat_id is_telegram_enable`)
					.then(async user => {
						if (user) {
							let otp = utils.generateRandomNumber(otpLength);
							await telegramService.telegramOtpUpdate({ user_id: user_id, otp, telegram_chat_id: user.telegram_chat_id });
							ResSuccess(res, { msg: "Successfully otp sent." })
						} else {
							ResError(res, { msg: "User not found!" })
						}
					})
			}).catch(error => {
				return ResError(res, error);
			});
	}

	/**
		* Disable telegram 2FA verify verification code receive on telegram
		* @body {user_id} req  
		* @body {*} res 
		* @returns 
	*/
	static async disableTelegramVerifyOTP(req, res) {
		return Joi.object({
			user_id: JoiObjectId.objectId().required(),
			otp: Joi.string().required(),
		}).validateAsync(req.body, { abortEarly: false })
			.then(({ user_id, otp }) => {
				let userId = req.User.user_id;
				return User.findOne({ _id: userId })
					.select(`telegram_chat_id is_telegram_enable otp otp_purpose`)
					.then(async user => {
						if (user) {
							const isOtpValid = bcrypt.compareSync(otp, user.otp);
							if (user.otp_purpose != CONSTANTS.OTP_PURPOSE.TELEGRAM) {
								return resultResponse(NOT_FOUND, { msg: "Mismatch OTP Purpose." });
							}
							if (!isOtpValid)
								return ResError(res, { msg: "Invalid OTP! Please try again." });
							await OAuthToken.deleteMany({ 'user.user_id': userId.toString() })
								.then(() => {
									User.updateOne({ _id: userId }, {
										"$unset": { sessionid: 1 },
										is_online: 0,
										is_telegram_enable: 0,
										telegram_chat_id: null,
										expire_time: null,
										otp: 0,
										is_secure_auth_enabled: 0,
									})
										.then(() => ResSuccess(res, { msg: "Successfully disabled..." })).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
								});
						} else {
							ResError(res, { msg: "Invalid OTP!", statusCode: STATUS_422 })
						}
					})
			}).catch(error => {
				return ResError(res, error);
			});
	}

	static eventSettingsCheck(req, res) {
		let { user_id, check_event_limit } = req.body;
		try {
			if (!user_id)
				user_id = (req.User.user_id || req.User._id) || req.user._id;
			else
				user_id = ObjectId(user_id);
			if (
				req.User.user_type_id == CONSTANTS.USER_TYPE_SUPER_ADMIN &&
				user_id == (req.User.user_id || req.User._id).toString()
			) {
				let msg = "Super admin is not allowed to update this setting!"
				// Update activity log status.
				updateLogStatus(req, { status: LOG_VALIDATION_FAILED, msg: msg })
				return ResError(res, { msg: msg });
			}
			return Promise.all([
				User.updateMany(
					{
						"$or": [
							{
								"_id": user_id
							},
							{
								"parent_level_ids.user_id": { "$in": [user_id] }
							}
						]
					},
					{
						"$set": { check_event_limit }
					}
				),
				UserSettingSportWise.updateMany(
					{
						"$or": [
							{
								"user_id": user_id
							},
							{
								"parent_commission.user_id": { "$in": [user_id] }
							}
						]
					},
					{
						"$set": { check_event_limit }
					},
					{ upsert: true, setDefaultsOnInsert: true }
				),
				OAuthToken.updateMany(
					{
						"$or": [
							{
								"user._id": user_id.toString() // Match by user._id
							},
							{
								"user.parent_level_ids.user_id": { "$in": [user_id.toString()] } // Match by user.parent_level_ids.user_id
							}
						]
					},
					{
						"$set": { "user.check_event_limit": check_event_limit } // Set check_event_limit in user object
					}
				)
			]).then(() => {
				let msg = check_event_limit ? "Event settings are now applicable..." : "Only user settings are applicable now...";
				// Update activity log status.
				updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
				Responder.success(res, { msg: msg })
			})
				.catch(error => Responder.error(res, { msg: error.message + (process.env.DEBUG == "true" ? `${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` : ''), statusCode: STATUS_500 }));
		} catch (error) {
			return Responder.error(res, { error, statusCode: STATUS_500 });
		}
	}

	// To get user child level details
	static async getUserDetailsWithChildLevelDetails(req, res) {

		const childDetailsSchema = Joi.object({
			limit: Joi.number().required(),
			page: Joi.number().required(),
			searchQuery: Joi.string().allow('', null),
			domainId: Joi.string().optional(),
			levelId: Joi.alternatives().try(Joi.array(), Joi.optional()),
			user_type_id: Joi.number().optional(),
		});
		try {
			await childDetailsSchema.validateAsync(req.body, {
				abortEarly: true
			});
		} catch (error) {
			return Responder.error(res, { msg: error.details.map(data => data.message).toString(), statusCode: STATUS_422 });
		}

		var limit = req.body.limit;
		var page = (req.body.page != undefined) ? (req.body.page - 1) * limit : 0;
		var searchQuery = req.body.searchQuery;
		var domainId = req.body.domainId;
		var levelId = req.body.levelId;
		var queryArray = [];
		var mainQuery = {};

		queryArray.push({ self_close_account: 0 });
		queryArray.push({ parent_close_account: 0 });

		if (searchQuery != null && searchQuery != undefined && searchQuery != '')
			queryArray.push({ user_name: { $regex: searchQuery, $options: 'i' } });
		if (domainId != null && domainId != undefined && domainId != '')
			queryArray.push({ domain: domainId });
		if (levelId !== null && levelId !== undefined && levelId !== '' && levelId !== 'all') {
			if (Array.isArray(levelId)) {
				queryArray.push({ user_type_id: { $in: levelId } });
			} else {
				queryArray.push({ user_type_id: levelId });
			}
		}
		if (searchQuery || domainId || levelId)
			queryArray.push({ 'parent_level_ids.user_id': req.params.id });
		else
			queryArray.push({ parent_id: req.params.id });

		if (req.body.user_type_id)
			queryArray.push({ user_type_id: req.body.user_type_id });

		let highestChildNumber = await commonService.getHighestNumberChildOfAnyParent(req.params.id);
		let getParentFieldsName = { parent_id: 1, user_name: 1, name: 1, user_type_id: 1, parent_level_ids: 1, userSettingSportsWise: 1, partnerships: 1 };

		const filter = { _id: req.params.id };

		if (req.User.user_type_id != USER_TYPE_SUPER_ADMIN
			&& req.User._id != req.params.id
		) {
			filter["parent_level_ids.user_id"] = req.User._id;
		}

		User.findOne(filter, getParentFieldsName).lean()
			.then((userDetails) => {
				if (!userDetails) {
					return Responder.error(res, { msg: "User not Found Or You Don't have Access this Resource !!" })
				}
				userDetails.childLevelDetails = null;
				if (userDetails.user_type_id == 0) {
					userDetails.highestNumberChild = null;
					userDetails.highestNumberChild = highestChildNumber.data.user_type_id;
				}
				mainQuery.$and = queryArray;
				User.find(mainQuery)
					.select(`
						parent_id parent_user_name domain_assign_list_name total_withdraw total_deposit user_name name user_type_id parent_level_ids self_lock_user
						is_multi_login_allow parent_lock_user self_lock_betting parent_lock_betting
						self_lock_fancy_bet parent_lock_fancy_bet self_close_account parent_close_account
						balance profit_loss liability domain point exposure_limit total_settled_amount 
						userSettingSportsWise partnerships parent_userSettingSportsWise parent_partnerships 
						check_event_limit credit_reference rate balance_reference partnership mobile belongs_to_credit_reference is_b2c_dealer 
						is_enable_telegram_default is_auto_credit_reference allow_social_media_dealer is_default_dealer
					`)
					.populate('domain', domainkeyforpopulate)
					.skip(page).limit(limit).lean()
					.then((childLevels) => {
						userDetails.childLevelDetails = childLevels;
						User.countDocuments(mainQuery)
							.then((userListCount) => {
								return Responder.success(res, { data: userDetails, total: userListCount, msg: "User details with child level details." })
							}).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
					}).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
			}).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
	}

	// To get users list
	static getUsersList(req, res) {
		User.find()
			.then((userList) => {
				return Responder.success(res, { data: userList, msg: "Users list with details." })
			}).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
	}

	// To get particular user details
	static getUserDetails(req, res) {

		let getUserFields = {
			parent_name: 1, name: 1, user_name: 1, user_type_id: 1, parent_id: 1, child_limit: 1, is_multi_login_allow: 1,
			child_level: 1, point: 1, domain: 1, exposure_limit: 1, permissions: 1, parent_level_ids: 1, balance: 1, profit_loss: 1
		}
		const filter = { _id: req.params.id };

		if (req.User.user_type_id != USER_TYPE_SUPER_ADMIN
			&& req.User._id != req.params.id
		) {
			filter["parent_level_ids.user_id"] = req.User._id;
		}
		User.findOne(filter, getUserFields).lean()
			.then((userDetails) => {
				if (!userDetails) {
					return Responder.error(res, { msg: "User not Found Or You Don't have Access this Resource !!" })
				}
				userDetails.sportSettingDetails = null;
				userDetails.domainName = null;
				UserSettingSportWise.findOne({ user_id: req.params.id }).lean()
					.then((settingDetails) => {
						userDetails.sportSettingDetails = settingDetails;
						WebsiteSetting.findOne({ _id: userDetails.domain })
							.then((webdomain) => {
								if (webdomain != null)
									userDetails.domainName = webdomain.host_name;
								return Responder.success(res, { data: userDetails, msg: "User details." })
							}).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
					}).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
			}).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
	}

	// To logout agents
	static adminLogout(req, res) {
		let user_id = req.User._id;
		let accessToken = req.headers.authorization.replace("Bearer ", "");
		if (!accessToken)
			return ResError(res, { msg: "Token not passed!", statusCode: STATUS_422 });
		return OAuthToken.deleteOne({ 'user.user_id': user_id, accessToken })
			.then(() => {

				// oauthtokenService.updateLoginCounts(req.User).then().catch(console.error);

				User.updateOne({ _id: user_id }, { "$unset": { sessionid: 1 }, is_online: 0 }).then().catch(console.error);
				return UserLoginLog.updateOne({ accessToken }, { logout_time: new Date(), is_online: 0 })
					.then(() => ResSuccess(res, { msg: "logout successfully..." }))
					.catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
			}).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
	}

	// To logout all users.
	static logoutAll(req, res) {
		let selfAccessToken = req.headers.authorization.replace("Bearer ", "");
		return OAuthToken.deleteMany().where("accessToken").ne(selfAccessToken)
			.then(data => {
				if (data.deletedCount) {
					UserLoginLog.updateMany({ is_online: 1 }, { logout_time: new Date(), is_online: 0 }).then();
					return ResSuccess(res, "Logout all users...");
				} else
					return ResError(res, { msg: "Users already logged out!" });
			}).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
	}

	static totalNumberOfChilds(req, res) {

		var queryArray = [];
		var mainQuery = {};
		var searchQuery = req.body.searchQuery;
		queryArray.push({ parent_id: req.params.id });
		queryArray.push({ self_close_account: 0 });
		queryArray.push({ parent_close_account: 0 });
		var domainId = req.body.domainId;
		var levelId = req.body.levelId;
		if (searchQuery != null && searchQuery != undefined && searchQuery != '')
			queryArray.push({ user_name: { $regex: searchQuery, $options: 'i' } });
		if (domainId != null && domainId != undefined && domainId != '')
			queryArray.push({ domain: domainId });
		if (levelId != null && levelId != undefined && levelId != '')
			queryArray.push({ 'user_type_id': levelId });
		mainQuery.$and = queryArray;

		const filter = { _id: req.params.id };

		if (req.User.user_type_id != USER_TYPE_SUPER_ADMIN
			&& req.User._id != req.params.id
		) {
			filter["parent_level_ids.user_id"] = req.User._id;
		}

		User.findOne(filter, ["_id"]).lean()
			.then((userDetails) => {
				if (!userDetails) {
					return Responder.error(res, { msg: "User not Found Or You Don't have Access this Resource !!" })
				}
				return User.countDocuments(mainQuery)
					.then((userListCount) => {
						return Responder.success(res, { msg: "Total number of childs.", count: userListCount })
					})
					.catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))

			}).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
	}

	// To update user info
	static async updateUserDetails(req, res) {

		const profilechema = Joi.object({
			parent_name: Joi.string().required(),
			parent_id: Joi.string().required(),
			user_name: Joi.string().min(3).max(20).required(),
			name: Joi.string().required(),
			user_type_id: Joi.number().required(),
			user_id: Joi.string().required(),
			child_limit: Joi.number().allow(0),
			child_level: Joi.number().allow(0),
			point: Joi.number().allow(0),
			exposure_limit: Joi.number().allow('', 0),
			match_commission: Joi.number().allow(0),
			session_commission: Joi.number().allow(0),
			permissions: Joi.array().items({ name: Joi.string().required(), is_allow: Joi.boolean().required(), alias_name: Joi.string().required() }),
			sports_share: Joi.array().items(),
			sports_settings: Joi.array().items({
				sportId: Joi.string().required(), sport_id: Joi.number().required(), match_commission: Joi.number().allow('', null, 0),
				session_commission: Joi.number().allow(0), market_fresh_delay: Joi.number().allow(0),
				market_min_stack: Joi.number().allow(0), market_max_stack: Joi.number().allow(0),
				market_max_profit: Joi.number().allow(0),
				session_fresh_delay: Joi.number().allow(0),
				session_min_stack: Joi.number().allow(0), session_max_stack: Joi.number().allow(0)
			}),
		});
		try {
			await profilechema.validateAsync(req.body, {
				abortEarly: true
			});
		} catch (error) {
			return Responder.success(res, { msg: error.details[0].message, statusCode: STATUS_422 })
		}
		if (!req.body.sports_settings)
			return Responder.success(res, { msg: "Sports settings required" })
		if (req.body.sports_settings.length == 0)
			return Responder.success(res, { msg: "Sports settings required" })
		var updateUserDetails = req.body;
		User.findOneAndUpdate({ _id: req.params.id }, { $set: updateUserDetails }, { new: true })
			.then((updatedDetails) => {
				UserSettingSportWise.findOneAndUpdate({ user_id: req.params.id }, { $set: updateUserDetails }, { new: true })
					.then((sportSettingDetails) => {
						return Responder.success(res, { data: {}, msg: "User details updated." })
					}).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
			}).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
	}

	//For Change Password After login
	static async updateForChangePasswordAfterLogin(req, res) {
		const response = await userService.updateForChangePasswordAfterLogin(req);
		if (response.statusCode == SUCCESS)
			return ResSuccess(res, response.data);
		else
			return ResError(res, response.data);
	}

	//For Change Self Password
	static async selfChangePassword(req, res) {
		let browser = req.headers['user-agent'];
		let device_info = browser || "Localhost";
		const data = { body: req.body, user: req.User, device_info, is_self: 1, path: req.path };

		const response = await userService.selfChangePassword(data);

		if (response.statusCode == SUCCESS) {
			return ResSuccess(res, response.data);
		} else {
			return ResError(res, response.data);
		}
	}

	//For Change Child Password
	static async changeChildPassword(req, res) {
		let browser = req.headers['user-agent'];
		let device_info = browser || "Localhost";
		const data = {
			body: req.body,
			user: req.user,
			changed_by_user_id: req.User._id,
			changed_by_user: req.User.name,
			changed_by_user_name: req.User.user_name,
			device_info,
			last_login_ip_address: req.User.last_login_ip_address,
			path: req.path,
		};

		const response = await userService.selfChangePassword(data);

		if (response.statusCode == SUCCESS) {
			return ResSuccess(res, response.data);
		} else {
			return ResError(res, response.data);
		}
	}

	//To lock and unlock account of user
	static async lockAccountOfUser(req, res) {

		const lockAccountSchema = Joi.object({
			self_lock_user: Joi.number().valid(0, 1).required()
		});

		try {
			await lockAccountSchema.validateAsync(req.body, {
				abortEarly: true
			});
		} catch (error) {
			return Responder.success(res, { msg: error.details[0].message, statusCode: STATUS_422 })
		}

		User.findOne({ _id: req.params.id })
			.then((fnd) => {
				if (fnd) {
					if (fnd.parent_lock_user == 1)
						return Responder.success(res, { msg: "Parent already locked." })
					User.findOneAndUpdate({ _id: req.params.id }, { $set: { self_lock_user: req.body.self_lock_user } }, { new: true })
						.then((userData) => {
							User.updateMany({ 'parent_level_ids.user_id': req.params.id }, { $set: { parent_lock_user: req.body.self_lock_user } })
								.then((count) => {
									Responder.success(res, { data: {}, msg: "Successfully locked account.", status: true })
								})
								.catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
						})
						.catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
				}
			})
			.catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
	}

	//To update transaction password of user
	static async updateTransactionPasswordOfUser(req, res) {

		const updateTransactionPasswordSchema = Joi.object({
			transaction_password: Joi.string().min(6).max(12).required()
		});
		try {
			await updateTransactionPasswordSchema.validateAsync(req.body, {
				abortEarly: true
			});
		} catch (error) {
			return Responder.success(res, { msg: error.details[0].message, statusCode: STATUS_422 })
		}
		let salt = bcrypt.genSaltSync(saltRounds);
		let hash = bcrypt.hashSync(req.body.transaction_password, salt);
		req.body.transaction_password = hash;

		User.findOneAndUpdate({ _id: req.params.id }, { $set: { transaction_password: req.body.transaction_password } }, { new: true })
			.then((val) => {
				Responder.success(res, { msg: "Transaction password updated.", status: true })
			})
			.catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
	}

	//To get raw password of user
	static async getRawPasswordOfUser(req, res) {
		return Joi.object({
			user_id: JoiObjectId.objectId().required(),
			password: Joi.string().min(6).max(12).required()
		}).validateAsync(req.body, { abortEarly: false })
			.then(async () => {
				return Responder.error(res, {
					// password: req.user.raw_password,
					msg: "This API is removed for Added Security"
				});
			}).catch(error => {
				return ResError(res, error);
			});
	}

	//To close and re open account of user
	static async closeAndReOpenAccountOfUserAndTheirChilds(req, res) {

		const closeAndOpenSchema = Joi.object({
			self_close_account: Joi.number().valid(0, 1).required()
		});

		try {
			await closeAndOpenSchema.validateAsync(req.body, {
				abortEarly: true
			});
		} catch (error) {
			return Responder.success(res, { msg: error.details[0].message, statusCode: STATUS_422 })
		}

		User.findOne({ _id: req.params.id, "parent_level_ids.user_id": req.User._id },
			["parent_close_account"])
			.then((fnd) => {
				if (fnd) {
					if (fnd.parent_close_account == 1)
						return Responder.success(res, { msg: "Parent already Closed." })
					User.findOneAndUpdate({ _id: req.params.id }, { $set: { self_close_account: req.body.self_close_account } }, { new: true })
						.then((userData) => {
							User.updateMany({ 'parent_level_ids.user_id': req.params.id }, { $set: { parent_close_account: req.body.self_close_account } })
								.then((count) => {
									if (req.body.self_close_account == 1)
										Responder.success(res, { data: {}, msg: "Successfully closed user account.", status: true })
									else
										Responder.success(res, { data: {}, msg: "Successfully open user account.", status: true })
								})
								.catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
						})
						.catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
				} else {
					return Responder.error(res, { msg: "User not Found" })
				}
			})
			.catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
	}

	static userAccountActions(req, res, method) {
		return method(req, res)
			.then(result => {
				if (result.statusCode == SUCCESS) {
					// Update activity log status.
					updateLogStatus(req, { status: LOG_SUCCESS, msg: result.data })
					return ResSuccess(res, { msg: result.data });
				} else {
					// Update activity log status.
					updateLogStatus(req, { status: LOG_SUCCESS, msg: result.data })
					return ResError(res, { msg: result.data });
				}
			})
			.catch(error => {
				return ResError(res, { error, statusCode: STATUS_500 });
			});
	}


	/**
	 * This function calls the `closeAccount` method of the `userService` through the `UserController` and
	 * returns the result.
	 * @param req - req stands for "request" and it is an object that contains information about the
	 * client's request to the server. It includes data such as the URL, headers, and any data sent in the
	 * request body. In this context, it is likely that the request is related to closing a user account.
	 * @param res - `res` is the response object that is used to send the response back to the client. It
	 * contains methods such as `send`, `json`, `status`, etc. that are used to send the response data and
	 * set the HTTP status code.
	 * @returns The `closeAccount` function is returning the result of calling the
	 * `UserController.userAccountActions` function with the `req`, `res`, and `userService.closeAccount`
	 * arguments.
	 */
	static closeAccount(req, res) {
		return UserController.userAccountActions(req, res, userService.closeAccount);
	}

	/**
	 * This function calls the userService's lockAccount function through the UserController's
	 * userAccountActions function.
	 * @param req - req stands for "request" and it is an object that contains information about the
	 * client's HTTP request such as the URL, headers, and body. It is typically passed as the first
	 * parameter to a function that handles the request.
	 * @param res - `res` is the response object that is used to send the response back to the client who
	 * made the request. It contains information such as the status code, headers, and the response body.
	 * In this case, it is being passed as a parameter to the `UserController.userAccountActions` method,
	 * @returns The `lockAccount` function is returning the result of calling the
	 * `UserController.userAccountActions` function with the `req`, `res`, and `userService.lockAccount`
	 * arguments.
	 */
	static lockAccount(req, res) {
		return UserController.userAccountActions(req, res, userService.lockAccount);
	}

	//To lock and unlock betting status
	static async updateUserStatusBettingLockUnlock(req, res) {
		let user_id = req.body.user_id;
		User.findOne({ _id: user_id, 'parent_level_ids.user_id': req.User._id },
			["parent_lock_betting", "self_lock_betting",])
			.then((userDetails) => {
				if (userDetails) {
					if (userDetails.parent_lock_betting == 1) {
						let msg = "Parent betting already locked.";
						// Update activity log status.
						updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
						return Responder.success(res, { msg: msg })
					}
					let state = 0;
					if (userDetails.self_lock_betting == 0)
						state = 1;
					User.updateOne({ _id: user_id }, { $set: { self_lock_betting: state } })
						.then((userData) => {
							User.updateMany({ 'parent_level_ids.user_id': user_id }, { $set: { parent_lock_betting: state } })
								.then((count) => {
									if (state == 1) {
										let msg = "User betting locked successfully.";
										// Update activity log status.
										updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
										oauthtokenService.expireTokens({ user_id: user_id.toString() }).then();
										Responder.success(res, { data: {}, msg: msg, status: true })
									}
									else {
										let msg = "User betting unlocked successfully.";
										// Update activity log status.
										updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
										oauthtokenService.expireTokens({ user_id: user_id.toString() }).then();
										Responder.success(res, { data: {}, msg: msg, status: true })
									}
								})
								.catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
						})
						.catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
				} else {
					return Responder.error(res, { msg: "User not Found" })
				}
			})
			.catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
	}

	//To lock fancy bet lock status
	static async updateUserStatusFancyBetLock(req, res) {
		let { user_id, is_child_lock } = req.body;
		User.findOne({ _id: user_id, 'parent_level_ids.user_id': req.User._id },
			["parent_lock_fancy_bet", "self_lock_fancy_bet",])
			.then((userDetails) => {
				if (userDetails) {
					if (userDetails.parent_lock_fancy_bet == 1) {
						let msg = "Parent fancy bet already locked.";
						// Update activity log status.
						updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
						return Responder.success(res, { msg: msg })
					}
					else if (userDetails.self_lock_fancy_bet == 1) {
						let msg = "User fancy bet already locked.";
						// Update activity log status.
						updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
						oauthtokenService.expireTokens({ user_id: user_id.toString() }).then();
						return Responder.success(res, { msg: msg })
					}
					else {
						let userparameter = { self_lock_fancy_bet: is_child_lock };
						let childparameter = { parent_lock_fancy_bet: is_child_lock };
						User.updateOne({ _id: user_id }, { $set: userparameter })
							.then((userData) => {
								User.updateMany({ 'parent_level_ids.user_id': user_id }, { $set: childparameter })
									.then((count) => {
										let msg = "User fancy bet locked successfully.";
										// Update activity log status.
										updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
										oauthtokenService.expireTokens({ user_id: user_id.toString() }).then();
										Responder.success(res, { data: {}, msg: msg })
									})
									.catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
							})
							.catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
					}
				}
				else
					return Responder.success(res, { msg: "User not found" })
			})
			.catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
	}

	//To unlock fancy bet lock status
	static async updateUserStatusFancyBetUnlock(req, res) {
		let profilechema = {
			user_id: Joi.string().required(),
			is_child_lock: Joi.number().valid(0).required(),
			pass_type: Joi.string().optional(),
		}
		const loginUserBelongsTo = req.User.belongs_to;
		if (loginUserBelongsTo == LABEL_DIAMOND
			|| loginUserBelongsTo == LABEL_UKRAINE) {
			profilechema.master_password = Joi.string().min(6).max(12).required();
		} else {
			profilechema.master_password = Joi.string().min(6).max(12).optional();
		}

		profilechema = Joi.object(profilechema);

		try {
			await profilechema.validateAsync(req.body, {
				abortEarly: true
			});
		} catch (error) {
			return Responder.success(res, { msg: error.details[0].message, statusCode: STATUS_422 })
		}
		let { user_id, is_child_lock } = req.body;
		let getUserFieldsName = { user_type_id: 1, parent_id: 1, parent_level_ids: 1, parent_lock_fancy_bet: 1, self_lock_fancy_bet: 1 }
		let userDetails = await commonService.getUserByUserId(user_id, getUserFieldsName);
		if (userDetails) {

			if (!userDetails.data.parent_level_ids
				.map(i => i.user_id.toString())
				.includes(req.User._id)) {
				return Responder.error(res, { msg: "User not found" })
			}

			if (userDetails.data.parent_lock_fancy_bet == 1)
				return Responder.success(res, { msg: "Parent fancy bet already locked." })
			else if (userDetails.data.self_lock_fancy_bet == 0)
				return Responder.success(res, { msg: "User fancy bet already unlocked." })
			else if (userDetails.data.parent_lock_fancy_bet == 0) {
				let parent_locked = 0;
				if (userDetails.data.user_type_id != 1) {
					let getParent = await commonService.getUserByUserId(userDetails.data.parent_id, getUserFieldsName);
					if (getParent.data.self_lock_fancy_bet == 1 || getParent.data.parent_lock_fancy_bet == 1)
						parent_locked = 1;
				}
				if (parent_locked === 0) {
					let userparameter = { self_lock_fancy_bet: is_child_lock };
					let childparameter = { parent_lock_fancy_bet: is_child_lock };
					User.updateOne({ _id: user_id }, { $set: userparameter })
						.then((userData) => {
							User.updateMany({ 'parent_level_ids.user_id': user_id }, { $set: childparameter })
								.then((count) => {
									Responder.success(res, { data: {}, msg: "User fancy bet unlocked successfully." })
								})
								.catch((err) => Responder.error(res, err))
						})
						.catch((err) => Responder.error(res, err))
				}
				else
					return Responder.success(res, { msg: "Parent fancy bet already locked." })
			}
			else
				return Responder.success(res, { msg: "Parent fancy bet already locked." })
		}
		else
			return Responder.success(res, { msg: "User not found" })
	}

	static async updateUserBetLockStatus(req, res) {
		const result = await userService.updateUserBetLockStatus(req);
		if (result.statusCode != SUCCESS) {
			return ResError(res, result.data)
		} else {
			return ResSuccess(res, result.data)
		}
	}

	// To check user name already exist or not
	static async checkUserName(req, res) {

		const checkUsernameSchema = Joi.object({
			user_name: Joi.string().min(3).max(20).required(),
		});
		try {
			await checkUsernameSchema.validateAsync(req.body, {
				abortEarly: true
			});
		} catch (error) {
			return Responder.success(res, { msg: error.details[0].message, statusCode: STATUS_422 })
		}

		User.findOne({ user_name: req.body.user_name.toLowerCase() })
			.select(["_id"])
			.then((usrData) => {
				if (usrData && usrData != null && usrData != '{}')
					return Responder.success(res, { msg: "Username is already exists. ", statusCode: STATUS_422 })
				else
					return Responder.success(res, { msg: "Username is available. ", statusCode: STATUS_422 })
			}).catch((err) => Responder.error(res, { msg: err.message, statusCode: STATUS_500 }))
	}

	// To get closed users list
	static async getClosedUsersList(req, res) {

		const closedUserListSchema = Joi.object({
			limit: Joi.number().required(),
			page: Joi.number().required()
		});
		try {
			await closedUserListSchema.validateAsync(req.body, {
				abortEarly: true
			});
		} catch (error) {
			return Responder.success(res, { msg: error.details[0].message, statusCode: STATUS_422 })
		}

		var limit = req.body.limit;
		var page = (req.body.page != undefined) ? (req.body.page - 1) * limit : 0;
		var queryArray = [];
		var mainQuery = {};
		queryArray.push({ parent_id: req.params.id });
		var query = {};
		query.$or = [
			{ 'self_close_account': 1 },
			{ 'parent_close_account': 1 }
		]
		queryArray.push(query);
		mainQuery.$and = queryArray;
		User.find(mainQuery).skip(page).limit(limit).lean()
			.then((closedUsersList) => {
				return Responder.success(res, { data: closedUsersList, msg: "Closed users list." })
			}).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
	}

	static totalNumberOfClosedUser(req, res) {

		var queryArray = [];
		var mainQuery = {};
		queryArray.push({ parent_id: req.params.id });
		var query = {};
		query.$or = [
			{ 'self_close_account': 1 },
			{ 'parent_close_account': 1 }
		]
		queryArray.push(query);
		mainQuery.$and = queryArray;

		const filter = { _id: req.params.id };

		if (req.User.user_type_id != USER_TYPE_SUPER_ADMIN
			&& req.User._id != req.params.id
		) {
			filter["parent_level_ids.user_id"] = req.User._id;
		}

		User.findOne(filter, ["_id"]).lean()
			.then((userDetails) => {
				if (!userDetails) {
					return Responder.error(res, { msg: "User not Found Or You Don't have Access this Resource !!" })
				}
				return User.countDocuments(mainQuery)
					.then((closedUserListCount) => {
						return Responder.success(res, { msg: "Total number of closed users.", count: closedUserListCount })
					})
					.catch((err) => Responder.error(res, err))
			})
			.catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
	}

	// To get  user and user parent details
	static getUserDetailsWithParentDetails(req, res) {

		const filter = { _id: req.params.id };

		if (req.User.user_type_id != USER_TYPE_SUPER_ADMIN
		) {
			filter["parent_level_ids.user_id"] = req.User._id;
		}

		User.findOne(
			filter,
			{
				domain_assign_list: 1, credit_reference: 1,
				parent_id: 1, user_name: 1, name: 1, balance: 1,
				profit_loss: 1, balance_reference: 1
			})
			.populate("parent_id", 'user_name name balance').lean()
			.then((userDetails) => {
				if (!userDetails) {
					return Responder.error(res, { msg: "User not Found Or You Don't have Access this Resource !!" })
				}

				userDetails.profit_loss = fixFloatingPoint((userDetails.balance_reference || 0)
					- (userDetails.credit_reference || 0));

				return Responder.success(res, { data: [userDetails], msg: "User and parent details." })
			}).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
	}

	//To update child password
	static async updateChildPassword(req, res) {
		// var raw_password = req.body.newPassword;
		// encrypting user password 
		let salt = bcrypt.genSaltSync(saltRounds);
		let hash = bcrypt.hashSync(req.body.newPassword, salt);
		req.body.newPassword = hash;
		User.updateOne({ _id: req.body.childUserId, "parent_level_ids.user_id": (req.User.user_id || req.User._id) },
			{
				$set: {
					password: req.body.newPassword,
					// raw_password: raw_password,
					is_change_password: 0
				}
			})
			.then((val) => {
				let msg = "You have successfully updated child password.";

				if (!val?.modifiedCount) {
					msg = "User Not Found !!"
					return Responder.error(res, { msg, status: false })
				}
				// Update activity log status.
				updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
				Responder.success(res, { msg: msg, status: true })
			})
			.catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
	}

	// Ukraine Concept
	static async updatePassword(req, res) {
		return Joi.object({
			user_id: JoiObjectId.objectId().optional(),
			newPassword: Joi.string().min(6).max(12).required()
		}).validateAsync(req.body, { abortEarly: false })
			.then(({ user_id, newPassword }) => {
				user_id = ObjectId(user_id ? user_id : (req.User.user_id || req.User._id));
				let raw_password = newPassword;
				// encrypting user password.
				newPassword = bcrypt.hashSync(raw_password, bcrypt.genSaltSync(saltRounds));
				return User.findOneAndUpdate(
					{ _id: user_id },
					{
						$set: {
							password: newPassword,
							// raw_password, 
							is_change_password: 1
						}
					}
				).select("user_name belongs_to_credit_reference mobile").lean()
					.then(async user => {
						let selfUser = (user._id).toString() == (req.User.user_id || req.User._id).toString(),
							comment = "Password Changed By Self.";
						if (!selfUser)
							comment = `User Password Changed By ${req.User.user_name}.`;
						// Create password change history for Ukraine users.
						let geolocation = await utils.getIpDetails(req.User.last_login_ip_address);
						let mobile = user.mobile ? true : false;
						let ip_address = req.User.last_login_ip_address;
						let browser = req.headers['user-agent'];
						let device_info = browser || "Localhost";
						PasswordHistory.create({
							user_id: user._id, user_name: user.user_name, comment, changed_by_user_id: req.User.user_id, geolocation, mobile, ip_address, device_info
						}).then().catch(console.error);
						// Logout user
						OAuthToken.deleteMany({ 'user.user_id': user._id.toString() }).then();
						return ResSuccess(res, `${selfUser ? "Your" : "Child"} password updated successfully...`);
					}).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
			}).catch(error => {
				return ResError(res, error);
			});
	}

	// To get  user match stack
	static async getUserMatchStack(req, res) {
		return Joi.object({
			user_id: JoiObjectId.objectId().optional(),
			userid: JoiObjectId.objectId().optional(),
		}).validateAsync(req.body, { abortEarly: false })
			.then(() => {
				return userService.getMatchStacks(req)
					.then(result => result.statusCode == SUCCESS
						? ResSuccess(res, { ...result.data })
						: ResError(res, { msg: result.data, statusCode: STATUS_200 })
					).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
			}).catch(error => {
				return ResError(res, error);
			});
	}

	// To update user match stack
	static updateMatchStack(req, res) {
		return Joi.object({
			user_id: JoiObjectId.objectId().optional(),
			match_stack: Joi.array().min(2).max(15).required()
		}).validateAsync(req.body, { abortEarly: false })
			.then(() => {
				return userService.setMatchStack(req)
					.then(result => result.statusCode == SUCCESS
						? ResSuccess(res, { msg: result.data })
						: ResError(res, { msg: result.data })
					).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
			}).catch(error => {
				return ResError(res, error);
			});
	}

	// To get partnership list by userid
	static async getPartnershipListByUserId(req, res) {
		const profilechema = Joi.object({
			user_id: Joi.string().required()
		});
		try {
			await profilechema.validateAsync(req.body, {
				abortEarly: true
			});
		} catch (error) {
			return Responder.success(res, { msg: error.details[0].message, statusCode: STATUS_422 })
		}
		let { user_id } = req.body;
		Partnerships.findOne({ user_id: user_id }).populate(
			'user_id', 'parent_id parent_name user_name name user_type_id'
		).populate(
			'sports_share.sport_id', sportskeyforpopulate
		).lean()
			.then(partnershipDetails => {
				if (partnershipDetails)
					return Responder.success(res, { data: partnershipDetails, msg: "User partenership details." })
				else
					return Responder.success(res, { msg: "No partenership found" })
			}).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
	}

	// To update partnership list
	static async updatePartnershipList(req, res) {
		const updatePartnershipSchema = Joi.object({
			user_id: Joi.string().required(),
			password: Joi.string().min(6).max(12).required(),
			sports_share: Joi.array().items({
				sport: Joi.string(),
				sport_id: Joi.number().required(), _id: Joi.string().allow('', null),
				name: Joi.string().required(), _id: Joi.string().allow('', null),
				percentage: Joi.array().items({
					parent_share: Joi.number().required(),
					parent_id: Joi.string().allow('', null),
					parent_partnership_share: Joi.number().required(),
					user_share: Joi.number().required(),
					user_id: Joi.string().required(),
					user_type_id: Joi.number().required(),
					share: Joi.number().required(),
					user_name: Joi.string().min(3).max(20).allow('', null),
					_id: Joi.string().allow('', null)
				}).required()
			}).required()
		});
		try {
			await updatePartnershipSchema.validateAsync(req.body, {
				abortEarly: true
			});
		} catch (error) {
			return Responder.success(res, { msg: error.details[0].message, statusCode: STATUS_422 })
		}

		if (!req.body.sports_share)
			return Responder.success(res, { msg: "Sports share required", statusCode: STATUS_422 })

		if (req.body.sports_share.length == 0)
			return Responder.success(res, { msg: "Sports share required", statusCode: STATUS_422 })

		let unsuccessfullResult = [];
		return User.findOne({ _id: req.user._id })
			.then(user => {
				if (user) {
					var updatePartnershipDetails = req.body.sports_share;
					let list = -1;
					var next = async function () {
						list++;
						if (list < updatePartnershipDetails.length) {
							let checkParentPartnership = await partnershipService.checkParentPartnership(updatePartnershipDetails[list].percentage[updatePartnershipDetails[list].percentage.length - 1].user_id, updatePartnershipDetails[list].sport_id, updatePartnershipDetails[list].percentage[updatePartnershipDetails[list].percentage.length - 1].user_share);
							var sportName = updatePartnershipDetails[list].name;
							if (checkParentPartnership.statusCode === CONSTANTS.SUCCESS) {
								let validatePartnership = await partnershipService.validatePartnership(updatePartnershipDetails[list].percentage[updatePartnershipDetails[list].percentage.length - 1].user_id, updatePartnershipDetails[list].sport_id, updatePartnershipDetails[list].percentage[updatePartnershipDetails[list].percentage.length - 1].user_share);
								if (validatePartnership.statusCode === CONSTANTS.SUCCESS) {
									let ownPartnership = await partnershipService.getPartnershipByUserId(updatePartnershipDetails[list].percentage[updatePartnershipDetails[list].percentage.length - 1].user_id, updatePartnershipDetails[list].sport_id);
									let userCurrentShare = ownPartnership.data.sports_share[0].percentage[ownPartnership.data.sports_share[0].percentage.length - 1].user_share;
									let parentPartnership = await partnershipService.getPartnershipByUserId(updatePartnershipDetails[list].percentage[updatePartnershipDetails[list].percentage.length - 1].parent_id, updatePartnershipDetails[list].sport_id);
									var checkParentShare = parentPartnership.data.sports_share[0].percentage[parentPartnership.data.sports_share[0].percentage.length - 1].user_share;
									var updateUserShare = updatePartnershipDetails[list].percentage[updatePartnershipDetails[list].percentage.length - 1].user_share;
									if (checkParentShare >= updateUserShare) {
										let newParentPartnership = checkParentShare - updateUserShare;
										let newChildPartnership = updateUserShare - userCurrentShare;
										let user_id = updatePartnershipDetails[list].percentage[updatePartnershipDetails[list].percentage.length - 1].user_id;
										let sport_id = updatePartnershipDetails[list].sport_id;
										let updateObjectId = updatePartnershipDetails[list].percentage[updatePartnershipDetails[list].percentage.length - 1]._id;
										let updateUserParentObjectId = updatePartnershipDetails[list].percentage[updatePartnershipDetails[list].percentage.length - 2]._id;
										let parentId = updatePartnershipDetails[list].percentage[updatePartnershipDetails[list].percentage.length - 1].parent_id;
										let partnershipUpdateResult = await partnershipService.updatePartnershipByUserAndSportId(user_id, sport_id, updateUserShare, newParentPartnership, newChildPartnership, updateObjectId, updateUserParentObjectId, parentId);
										if (
											partnershipUpdateResult.statusCode == CONSTANTS.NOT_FOUND ||
											partnershipUpdateResult.statusCode == CONSTANTS.SERVER_ERROR
										)
											unsuccessfullResult.push(sportName + (partnershipUpdateResult.statusCode == CONSTANTS.NOT_FOUND
												? " Sports not found! "
												: " cause some server error! "
											));
									}
								}
								else
									unsuccessfullResult.push(sportName);
							}
							else
								unsuccessfullResult.push(sportName);
							next();
						} else {
							if (unsuccessfullResult.length > 0)
								return Responder.success(res, { msg: 'Can not update partnership of following sports : ' + unsuccessfullResult.toString() })
							else
								return Responder.success(res, { msg: "Partnership updated successfully..." });
						}
					}
					next();
				}
			}).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
	}

	// To get user balance
	static async getUserBalance(req, res) {
		if (NEW_BALANCE_API) {
			return UserController.getUserBalanceV1(req, res);
		}
		let user_id = (req.User.user_id || req.User._id)
			, full_exposure = (req.body.full_exposure ? true : false)
			, liability = { statusCode: CONSTANTS.NOT_FOUND };
		if (req?.body?.userid) {
			user_id = req.body.userid;
		}

		let getFieldsName = { parent_id: 1, user_name: 1, name: 1, balance: 1, liability: 1, partnership: 1, profit_loss: 1, is_online: 1, credit_reference: 1, share: 1 }
		return User.findOne({
			_id: user_id,
			...(user_id != req.User._id
				? { "parent_level_ids.user_id": req.User._id }
				: {})
		}, getFieldsName).lean()
			.then(async (userDetails) => {
				if (!userDetails) {
					return Responder.error(res, { msg: "User not Found Or You Don't have Access this Resource !!" })
				}
				if (full_exposure)
					liability = await betService.getExposures(ObjectId(user_id));
				else
					liability = await betService.getExposuresV1(ObjectId(user_id));

				if (liability.statusCode == CONSTANTS.SUCCESS)
					liability = ((liability.data).pop()).liabilitySum;
				else
					liability = 0;

				userDetails.liability = liability;
				return ResSuccess(res, { data: userDetails });
			}).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
	}

	static getUserBalanceV1(req, res) {
		return userService.getUserBalanceV1(req, res)
			.then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, result.data) : ResError(res, result.data))
			.catch(error => ResError(res, error));
	}

	static async searchUser(req, res) {

		const profilechema = Joi.object({
			userid: Joi.string().required(),
			search: Joi.optional(),
			page: Joi.number().required(),
			limit: Joi.number().required()
		});
		try {
			await profilechema.validateAsync(req.body, {
				abortEarly: true
			});
		} catch (error) {
			return Responder.success(res, { msg: error.details[0].message, statusCode: STATUS_422 })
		}
		try {

			var limit = req.body.limit;
			var page = (req.body.page != undefined) ? (req.body.page - 1) * limit : 0;
			var search = req.body.search;
			let userid = req.body.userid;

			var queryArray = [];
			var mainQuery = {};

			queryArray.push({ parent_id: userid });
			queryArray.push({ self_close_account: 0 });

			var query = {};
			query.$or = [
				{ 'name': { $regex: search, $options: 'i' } },
				{ 'user_name': { $regex: search, $options: 'i' } }
			]
			queryArray.push(query);
			mainQuery.$and = queryArray;
			User.find(mainQuery).skip(page).limit(limit).lean()
				.then((searchUsersList) => {
					return Responder.success(res, { data: searchUsersList, msg: "Search users list." })
				}).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
		} catch (error) {
			return Responder.success(res, { msg: 'Error in api!', statusCode: STATUS_500 })
		}
	}

	static async totalNumberOfSearchUser(req, res) {

		const profilechema = Joi.object({
			userid: Joi.string().required(),
			search: Joi.optional()
		});
		try {
			await profilechema.validate(req.body, {
				abortEarly: true
			});
		} catch (error) {
			return Responder.success(res, { msg: error.details[0].message, statusCode: STATUS_422 })
		}
		try {

			var search = req.body.search;
			let userid = req.body.userid;

			var queryArray = [];
			var mainQuery = {};

			queryArray.push({ parent_id: userid });
			queryArray.push({ self_close_account: 0 });

			var query = {};
			query.$or = [
				{ 'name': { $regex: search, $options: 'i' } },
				{ 'user_name': { $regex: search, $options: 'i' } }
			]

			queryArray.push(query);
			mainQuery.$and = queryArray;

			const filter = { _id: req.params.id };

			if (req.User.user_type_id != USER_TYPE_SUPER_ADMIN
				&& req.User._id != req.params.id
			) {
				filter["parent_level_ids.user_id"] = req.User._id;
			}

			User.findOne(filter, ["_id"]).lean()
				.then((userDetails) => {
					if (!userDetails) {
						return Responder.error(res, { msg: "User not Found Or You Don't have Access this Resource !!" })
					}
					return User.countDocuments(mainQuery)
						.then((userCount) => {
							return Responder.success(res, { total: userCount, msg: "Users total count." })
						}).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
				}).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
		} catch (error) {
			return Responder.success(res, { msg: 'Error in api!', statusCode: STATUS_500 })
		}
	}

	static async searchUserForAutoSuggest(req, res) {
		const profilechema = Joi.object({
			userid: Joi.string().required(),
			search: Joi.optional()
		});
		try {
			await profilechema.validate(req.body, {
				abortEarly: true
			});
		} catch (error) {
			return Responder.success(res, { msg: error.details[0].message, statusCode: STATUS_422 })
		}
		try {
			var search = req.body.search;
			let userid = req.body.userid;
			var queryArray = [];
			var mainQuery = {};
			queryArray.push({ parent_id: userid });
			queryArray.push({ self_close_account: 0 });
			var query = {};
			query.$or = [
				{ 'name': { $regex: search, $options: 'i' } },
				{ 'user_name': { $regex: search, $options: 'i' } }
			]
			queryArray.push(query);
			mainQuery.$and = queryArray;
			User.find(mainQuery).lean()
				.then((searchUsersList) => {
					return Responder.success(res, { data: searchUsersList, msg: "Search user auto suggest list." })
				}).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
		} catch (error) {
			return Responder.success(res, { msg: 'Error in api!', statusCode: STATUS_500 })
		}
	}

	static async getActivityLogsOld(req, res) {
		return Joi.object({
			search: Joi.object().optional(),
			limit: Joi.number().min(10).max(200).default(50).optional(),
			page: Joi.number().min(1).max(30).default(1).optional(),
		}).validateAsync(req.body, { abortEarly: false })
			.then(params => {
				params.user_id = (req.User.user_id || req.User._id);
				params.user_type_id = req.User.user_type_id;
				return UserLoginLog.aggregate(userQuery.usersLogs(params))
					.then(response => ResSuccess(res, { metadata: response[0].metadata[0], data: response[0].data }))
					.catch(error => ResError(res, { error, statusCode: STATUS_500 }));
			}).catch(error => {
				return ResError(res, error);
			});
	}

	//To allow and not allow agents multi login
	static async allowAndNotAllowAgentsMultiLogin(req, res) {
		// if (req.User.user_type_id != USER_TYPE_SUPER_ADMIN
		// 	&& req.body.user_id == req.User._id) {
		// 	return Responder.error(res, { msg: "You can't Update Self Multi Login !" })
		// }

		User.findOne({ _id: req.body.user_id }, ["_id", "is_multi_login_allow"])
			.then((fnd) => {
				if (fnd) {
					let multiLoginAllow = 0;
					if (fnd.is_multi_login_allow == 0)
						multiLoginAllow = 1;

					User.updateOne(
						{ _id: req.body.user_id },
						{ $set: { is_multi_login_allow: multiLoginAllow } })
						.then((updateRes) => {
							let msg = "User agent multi login updated successfully."
							// Update activity log status.
							updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
							return Responder.success(res, { msg: msg })
						})
						.catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
				}
			})
			.catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
	}

	static async getCommission(req, res) {
		return Joi.object({
			user_id: JoiObjectId.objectId().required()
		}).validateAsync(req.body, { abortEarly: false })
			.then(() => {
				return ResSuccess(res, {
					data: {
						match_commission: req.user.match_commission,
						session_commission: req.user.session_commission
					}
				});
			}).catch(error => {
				return ResError(res, error);
			});
	}

	static async showAgents(req, res) {
		if (req.user.user_type_id == CONSTANTS.USER_TYPE_SUPER_ADMIN)
			return ResError(res, { msg: "No data found!" });
		if (req.User.user_type_id != CONSTANTS.USER_TYPE_SUPER_ADMIN) {
			let agents = req.user.parent_level_ids;
			const agentIndex = agents.findIndex(x => x.user_name == req.User.user_name);
			if (agentIndex == -1)
				return ResError(res, { msg: "No data found!" });
			return ResSuccess(res, {
				data: { agents: agents.slice(agentIndex) }
			});
		}
		return ResSuccess(res, {
			data: { agents: req.user.parent_level_ids }
		});
	}

	static async verifyShowAgentViewer(req, res) {
		if (req.User.belongs_to != LABEL_B2C_MANAGER)
			return ResError(res, { msg: "You are not allowed to access the resource!" });
		let user_id = req.joiData.user_id;
		let userData = await User.findById({ _id: user_id }, { parent_level_ids: 1 }).lean();
		userData = userData.parent_level_ids.filter(user => user.user_type_id != CONSTANTS.USER_TYPE_SUPER_ADMIN);
		return ResSuccess(res, {
			data: { agents: userData }
		});
	}
	static async update(req, res) {
		const loginUserBelongsTo = req.User.belongs_to;
		let master_password;
		if (loginUserBelongsTo == LABEL_DIAMOND || loginUserBelongsTo == LABEL_UKRAINE) {
			master_password = Joi.string().min(6).max(12).required();
		} else {
			master_password = Joi.string().min(6).max(12).optional();
		}
		return Joi.object({
			filter: Joi.object({
				user_id: JoiObjectId.objectId().required(),
			}).required(),
			update: Joi.object({
				exposure_limit: Joi.number().min(-1).max(VALIDATION.market_max_stack_max_limit).optional(),
				credit_reference: Joi.number().min(VALIDATION.credit_reference_min).max(VALIDATION.credit_reference_max).optional(),
				rate: Joi.number().min(VALIDATION.rate_min).max(VALIDATION.rate_max).optional(),
				mobile: Joi.number().min(VALIDATION.mobile_min).optional(),
				liability: Joi.number().optional(),
				balance: Joi.number().optional(),
				balance_reference: Joi.number().optional(),
				title: Joi.string().optional(),
				partnership: Joi.number().min(0).max(100).optional(),
				is_auto_credit_reference: Joi.number().valid(0, 1).optional()
			}).or("exposure_limit", "credit_reference", "rate", "mobile", "liability", "balance", "partnership", "title", "is_auto_credit_reference").optional(),
			pass_type: Joi.string().optional(),
			master_password,
		}).validateAsync(req.body, { abortEarly: false })
			.then(({ filter, update, pass_type, master_password }) => {
				const originalFilter = { ...filter };
				if (pass_type == 'TRXN_PASSWORD') {
					if (master_password != req.User.transaction_password) {
						return ResError(res, { msg: "Transaction Password did not match." });
					}
				} else {
					const userPassword = req.User.password || "";
					// Make Password Checking Optional for Some Routes
					if (master_password) {
						const passwordCheck = bcrypt.compareSync(master_password, userPassword);
						if (!passwordCheck) {
							return ResError(res, { msg: "Password did not match." });
						}
					}
				}
				if (!Object.keys(filter).length)
					return ResError(res, { msg: "Value is required!" });
				if (filter.hasOwnProperty("user_id")) {
					const { user_id } = filter;
					filter = {};
					filter = { _id: ObjectId(user_id) };
				}
				return User.updateOne(filter, update).then(updateStatus => {
					if (!updateStatus.matchedCount)
						return ResError(res, { msg: `User not found!` });
					if (!updateStatus.modifiedCount)
						return (res, { msg: `User not updated!` });
					if (update.hasOwnProperty("is_auto_credit_reference")) {
						return User.updateMany({
							"parent_level_ids.user_id": originalFilter.user_id
						}, {
							$set: {
								is_auto_credit_reference: update.is_auto_credit_reference
							}
						}).then(() => {
							return ResSuccess(res, { msg: `User ${Object.keys(update).toString()} updated!` });
						}).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
					} else {
						return ResSuccess(res, { msg: `User ${Object.keys(update).toString()} updated!` });
					}
				}).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
			}).catch(error => {
				return ResError(res, error);
			});
	}

	static getUsersByLiability(req, res) {
		return User.find(
			{
				$or: [{ liability: { $ne: 0 } }, { balance: { $lt: 0 } }],
				"parent_level_ids.user_id": req.User._id,
			},
			{ _id: 1, user_name: 1, liability: 1, balance: 1, balance_reference: 1 }
		).sort({ liability: 1 })
			.then(user => ResSuccess(res, { data: user }))
			.catch(error => ResError(res, { error, statusCode: STATUS_500 }));
	}

	static getUsersByBetProcessing(req, res) {
		return User.find(
			{
				$or: [{ self_lock_betting: 2 }, { self_lock_fancy_bet: 2 }],
				"parent_level_ids.user_id": req.User._id,
			},
			{ _id: 1, user_name: 1, name: 1, self_lock_betting: 1, self_lock_fancy_bet: 1 }
		).lean().sort({ liability: -1 })
			.then(user => ResSuccess(res, { data: user }))
			.catch(error => ResError(res, { error, statusCode: STATUS_500 }));
	}

	static unlockBetProcessingUsers(req, res) {
		return User.updateMany(
			{
				$or: [{ self_lock_betting: 2 }, { self_lock_fancy_bet: 2 }],
				"parent_level_ids.user_id": req.User._id,
			},
			{ self_lock_betting: 0, self_lock_fancy_bet: 0 }
		).lean().sort({ liability: -1 })
			.then(() => ResSuccess(res, { msg: "Users bettings are unlocked successfully..." }))
			.catch(error => ResError(res, { error, statusCode: STATUS_500 }));
	}

	// Ukraine Concept
	static creditReferenceLogs(req, res) {
		return Joi.object({
			user_id: JoiObjectId.objectId().required(),
			user_name: Joi.string().min(3).max(20).optional(),
			search: Joi.string().optional(),
			limit: Joi.number().min(10).max(200).default(50).optional(),
			page: Joi.number().min(1).max(30).default(1).optional(),
		}).validateAsync(req.body, { abortEarly: false })
			.then(params => {
				return CreditReferenceLog.aggregate(userQuery.creditReferenceLogs(params))
					.then(response => ResSuccess(res, { metadata: response[0].metadata[0], data: response[0].data }))
					.catch(error => ResError(res, { error, statusCode: STATUS_500 }));
			}).catch(error => {
				return ResError(res, error);
			});
	}

	// Ukraine Concept
	static async updateCreditReference(req, res) {
		try {
			const { new_credit_reference } = req.joiData;

			const result = await userService.updateCreditReference(req, new_credit_reference);
			if (result.statusCode != SUCCESS) {
				// Update activity log status.
				updateLogStatus(req, { status: LOG_VALIDATION_FAILED, msg: result.data.msg })
				return ResError(res, result.data);
			} else {
				// Update activity log status.
				updateLogStatus(req, { status: LOG_SUCCESS, msg: result.data.msg })
				return ResSuccess(res, result.data);
			}
		} catch (error) {
			return ResError(res, { error, statusCode: STATUS_500 });
		}
	}

	// Ukraine Concept
	static getAgentBalance(req, res) {
		if (NEW_AGENT_BALANCE_API) {
			return UserController.getAgentBalanceV1(req, res);
		}
		return Joi.object({
			user_id: JoiObjectId.objectId().required(),
		}).validateAsync(req.body, { abortEarly: false })
			.then(({ user_id }) => {
				user_id = req.user._id;
				return userService.getBalanceReferenceSum(user_id)
					.then(getBalanceReferenceSum => {
						if (getBalanceReferenceSum.statusCode != SUCCESS)
							return ResError(res, { msg: "Error While Getting Balance Reference! " + getBalanceReferenceSum.data });
						let totalBalance = getBalanceReferenceSum.data;
						return betService.getExposures(ObjectId(user_id))
							.then(getExposures => {
								if (getExposures.statusCode != SUCCESS)
									return ResError(res, { msg: getExposures.data });
								return ResSuccess(res, {
									data: {
										"creditReference": req.user.credit_reference,
										"availableBalance": req.user.balance,
										// "downlineCreditReference": 1700,
										totalBalance,
										"exposure": ((getExposures.data).pop()).liabilitySum
									}
								});
							}).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
					}).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
			}).catch(error => {
				return ResError(res, error);
			});
	}

	static getAgentBalanceV1(req, res) {
		return userService
			.getAgentBalanceV1(req, res)
			.then((result) =>
				result.statusCode == SUCCESS
					? ResSuccess(res, result.data)
					: ResError(res, result.data),
			)
			.catch((error) => ResError(res, error));
	}

	// Ukraine Concept
	static getPasswordChangedHistory(req, res) {
		if (req.joiData.user_id) {
			req.joiData.user_id = ObjectId(req.joiData.user_id);
		}
		req.joiData.User = req.User;
		return PasswordHistory.aggregate(userQuery.getPasswordChangedHistory(req.joiData))
			.then(response => ResSuccess(res, { metadata: response[0].metadata[0], data: response[0].data }))
			.catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
	}

	static async getPasswordChangedHistoryDocument(req, res) {
		try {
			const { document_type } = req.body;
			if (req.joiData.user_id) {
				req.joiData.user_id = ObjectId(req.joiData.user_id);
			}
			req.joiData.User = req.User;
			const getPasswordChangedHistoryRes = await PasswordHistory.aggregate(userQuery.getPasswordChangedHistory(req.joiData));
			if (!getPasswordChangedHistoryRes[0]?.data) {
				return getPasswordChangedHistoryRes;
			}
			const list =
				Array.isArray(getPasswordChangedHistoryRes[0]?.data) &&
					getPasswordChangedHistoryRes[0]?.data.length
					? getPasswordChangedHistoryRes[0]?.data
					: [];
			const phead = [
				{ title: "User Name" },
				{ title: "Date" },
				{ title: "Ip" },
			];
			const ptextProperties = { title: "User History Data", x: 100, y: 9 };
			let columnCount = phead.length;
			const cellWidth = "auto",
				pbodyStyles = Object.fromEntries(
					phead.map((col, index) => [
						index,
						{ cellWidth: col.width !== undefined ? col.width : cellWidth },
					]),
				);
			let pbody = list
				.map((item, index) => [
					item.changed_by_user_name,
					moment(item.createdAt).format('DD/MM/YYYY HH:mm:ss A'), // Formatted date
					item.ip_address,
				]);
			if (document_type == "PDF") {
				const pdfRes = await PdfDocService.createPaginatedPdf(res, {
					orientation: "p",
					ptextProperties,
					phead,
					pbody,
					pbodyStyles,
					fileName: "userHistory",
				});

				return pdfRes;
			}
			if (document_type == "CSV") {
				let data = await CsvDocService.formatExcelData(phead, pbody);
				const csvbRes = await CsvDocService.createPaginatedCsv(res, {
					data,
					fileName: "userHistory",
					columnCount: columnCount,
				});
				return csvbRes;
			}
		} catch (error) {
			return ResError(res, error);
		}
	}

	// Ukraine Concept
	static agentActivityList(req, res) {
		let filter = { parent_id: ObjectId(req.User.user_id || req.User._id) };
		if (req.body.hasOwnProperty("user_id"))
			filter = { user_id: ObjectId(req.body.user_id) };
		if (req.path == "/userActivityList")
			filter = { user_id: ObjectId(req.User.user_id || req.User._id) };
		return UserLoginLog.find(filter).sort({ 'login_time': -1 }).limit(50).lean()
			.select("-_id login_time login_status ip_address geolocation.isp geolocation.country geolocation.state geolocation.city")
			.then(data => ResSuccess(res, { data }))
			.catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
	}

	// Ukraine Concept
	static getUsersListCRefOld(req, res) {
		return Joi.object({
			user_id: JoiObjectId.objectId().optional(),
			user_name: Joi.string().min(1).max(20).optional(),
			only_end_users: Joi.boolean().default(false).optional(),
			enable_exposure: Joi.boolean().default(false).optional(),
			limit: Joi.number().min(10).max(100).default(50).optional(),
			page: Joi.number().min(1).max(30).default(1).optional(),
		}).validateAsync(req.body, { abortEarly: false })
			.then(params => {
				let isSearch = params.user_id, agents = req.user.parent_level_ids, breadcrumbs = agents;
				params.user_id = ObjectId(isSearch ? isSearch : (req.User.user_id || req.User._id));
				params.user_type_id = isSearch ? req.user.user_type_id : req.User.user_type_id;
				params.is_self_view = (params.user_id).toString() == (req.User.user_id).toString();
				return userService.getUsersListCRef(params)
					.then(async users => {
						if (users.statusCode != SUCCESS)
							return ResError(res, { msg: users.data });
						if (req.User.user_type_id != CONSTANTS.USER_TYPE_SUPER_ADMIN) {
							if (isSearch) {
								if (isSearch != (req.User._id).toString()) {
									const agentIndex = agents.findIndex(x => x.user_name == req.User.user_name);
									breadcrumbs = agents.slice(agentIndex);
								} else breadcrumbs = [];
							} else
								breadcrumbs = [];
						}
						if (params.enable_exposure && (req.user.user_type_id || req.User.user_type_id) != 2)
							for (const user of users.data.data) {
								let getExposures = await betService.getExposuresV1(ObjectId(user.user_id));
								if (getExposures.statusCode == SUCCESS)
									user.exposure = ((getExposures.data).pop()).liabilitySum;
							}
						return ResSuccess(res, {
							...users.data,
							parent_id: isSearch ? req.user.parent_id : req.User.parent_id,
							parent_name: isSearch ? req.user.parent_user_name : req.User.parent_user_name,
							breadcrumbs
						});
					}).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
			}).catch(error => {
				return ResError(res, error);
			});
	}

	static getUsersListCRef(req, res) {
		return userService
			.getUsersListCRef(req, res)
			.then((result) =>
				result.statusCode == SUCCESS
					? ResSuccess(res, result.data)
					: ResError(res, result.data),
			)
			.catch((error) => ResError(res, error));
	}

	// Ukraine Concept
	static getBalanceCRef(req, res) {
		return userService.getBalanceCRef(req.User)
			.then(response => {
				response.data[0].balance = (response.data[0].balance).toFixed(2);
				return ResSuccess(res, { data: response.data[0] });
			}).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
	}

	// Ukraine Concept
	static closedUsersList(req, res) {
		return Joi.object({
			limit: Joi.number().min(10).max(100).default(50).optional(),
			page: Joi.number().min(1).max(30).default(1).optional(),
		}).validateAsync(req.body, { abortEarly: false })
			.then(params => {
				params.user_id = (req.User.user_id || req.User._id);
				return User.aggregate(userQuery.closedUsersList(params))
					.then(data => data[0].data.length ? ResSuccess(res, { ...data[0] }) : ResError(res, { msg: "No user found yet!" }))
					.catch(error => ResError(res, { error, statusCode: STATUS_500 }));
			}).catch(error => {
				return ResError(res, error);
			});
	}

	static updateUserPartnership(req, res) {
		Object.assign(req.body, req.joiData);
		return userService.updateUserPartnership(req, res)
			.then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, result.data) : ResError(res, { msg: result.data }))
			.catch(error => ResError(res, { error, statusCode: STATUS_500 }));
	}

	static updateChipSummary(req, res) {
		Object.assign(req.body, req.joiData);
		return userService.updateChipSummary(req, res)
			.then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, result.data) : ResError(res, { msg: result.data }))
			.catch(error => ResError(res, { error, statusCode: STATUS_500 }));
	}

	// Wallet List Concept
	static getWalletUsers(req, res) {
		return Joi.object({
			parent_id: JoiObjectId.objectId().optional(),
			limit: Joi.number().min(10).max(100).default(50).optional(),
			status: Joi.string().optional(),
			page: Joi.number().min(1).max(30).default(1).optional(),
		}).validateAsync(req.body, { abortEarly: false })
			.then(params => {
				params.login_user_id = req.User._id;
				return userService.getWalletUser(params)
					.then(async users => {
						if (users.statusCode != SUCCESS)
							return ResError(res, { msg: users.data });
						return ResSuccess(res, {
							users
						});
					}).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
			}).catch(error => {
				return ResError(res, error);
			});
	}

	// Diamond Concept
	static getUsersListDiamond(req, res) {
		Object.assign(req.body, req.joiData);
		return userService.getUsersListDiamond(req, res)
			.then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, { ...result.data }) : ResError(res, { msg: result.data }))
			.catch(error => ResError(res, { error, statusCode: STATUS_500 }));
	}

	static getUsersListDiamondDocument(req, res) {
		Object.assign(req.body, req.joiData);
		return userService.getUsersListDiamondDocument(req, res)
			.then(result => {
				if (result.statusCode != SUCCESS) {
					return ResError(res, { msg: result.data });
				} else if (!result?.data?.isDoc) {
					return ResSuccess(res, result.data);
				}
			})
			.catch(error => ResError(res, error));
	}

	static getUsersListDiamondBankDocument(req, res) {
		Object.assign(req.body, req.joiData);
		return userService.getUsersListDiamondBankDocument(req, res)
			.then(result => {
				if (result.statusCode != SUCCESS) {
					return ResError(res, { msg: result.data });
				} else if (!result?.data?.isDoc) {
					return ResSuccess(res, result.data);
				}
			})
			.catch(error => ResError(res, error));
	}


	static getDiamondUsersTotalCr(req, res) {
		Object.assign(req.body, req.joiData);
		return userService.getDiamondUsersTotalCr(req, res)
			.then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, { ...result.data }) : ResError(res, { msg: result.data }))
			.catch(error => ResError(res, { error, statusCode: STATUS_500 }));
	}

	static async getUserNameMobileNoAndName(req, res) {
		return userService.getUserNameMobileNoAndName(req)
			.then(result =>
				(result.statusCode == SUCCESS)
					? ResSuccess(res, result.data)
					: ResError(res, { msg: result.data }))
			.catch(error => ResError(res, { error, statusCode: STATUS_500 }));
	}

	static getUserByUserName(req, res) {
		return User.aggregate(userQuery.getUserByUserName(req))
			.then(result => {
				if (result) {
					return ResSuccess(res, { msg: "Users List.", data: result });
				} else {
					return ResError(res, { msg: "No user found." });
				}
			})
			.catch(error => ResError(res, { error, statusCode: STATUS_500 }));
	}
	// Set daily bonus amount.
	static setDailyBonusAmount(req, res) {
		return User.findOneAndUpdate(
			{ _id: req.User._id },
			{ daily_bonus_amount: req.body.daily_bonus_amount },
			{ new: true },
		).lean()
			.select("_id daily_bonus_amount")
			.then((userData) => ResSuccess(res, { data: userData, msg: "Daily Bonus amount updated successfully." }))
			.catch(error => ResError(res, { error, statusCode: STATUS_500 }));
	}
	// Get daily bonus amount
	static async getDailyBonusAmount(req, res) {
		let data = { user_id: req.User._id, statement_type: "DEPOSIT_REQUEST", is_daily_bonus_amount: 1 }
		let checkexistRequest = await walletService.canRequestDailyBonus(data);
		if (checkexistRequest && checkexistRequest.data) {
			return ResError(res, {
				data: { created_at: checkexistRequest.data.nextBonusClaimDate },
				msg: `You have already claimed the daily bonus within the last 24 hours.You can try ${checkexistRequest.data.nextBonusClaimDate}.`,
				status: false,
				statusCode: STATUS_422
			});
		}
		return User.findOne({ user_type_id: USER_TYPE_SUPER_ADMIN }, { _id: 0, daily_bonus_amount: 1 }).lean()
			.then((userData) => ResSuccess(res, { data: userData, msg: "Daily Bonus amount." }))
			.catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
	}

	static validateToken(req, res) {
		return ResSuccess(res, "Token is valid!");
	}

	static getClientPL(req, res) {
		return userService.getClientPL(req, res)
			.then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, { data: result.data }) : ResError(res, { msg: result.data }))
			.catch(error => ResError(res, { error, statusCode: STATUS_500 }));
	}
	static markDealerAsB2c(req, res) {
		return userService.markDealerAsB2c(req, res)
			.then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, result.data) : ResError(res, { msg: result.data }))
			.catch(error => ResError(res, { error, statusCode: STATUS_500 }));
	}

	static allowSocialMediaDealer(req, res) {
		return userService.allowSocialMediaDealer(req, res)
			.then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, result.data) : ResError(res, { msg: result.data }))
			.catch(error => ResError(res, error));
	}

	static getOlnieUserNames(req, res) {
		return onlineUsersService
			.getOlnieUserNames(req)
			.then((result) =>
				result.statusCode == SUCCESS
					? ResSuccess(res, result.data)
					: ResError(res, { msg: result.data })
			)
			.catch((error) => ResError(res, error));
	}
	static getOlnieUserIpAddress(req, res) {
		return onlineUsersService
			.getOlnieUserIpAddress(req)
			.then((result) =>
				result.statusCode == SUCCESS
					? ResSuccess(res, result.data)
					: ResError(res, { msg: result.data })
			)
			.catch((error) => ResError(res, error));
	}
	static getActivityLogs(req, res) {
		return onlineUsersService
			.getActivityLogs(req)
			.then((result) =>
				result.statusCode == SUCCESS
					? ResSuccess(res, result.data)
					: ResError(res, { msg: result.data })
			)
			.catch((error) => ResError(res, error));
	}
	static getActivityLogsDocument(req, res) {
		return onlineUsersService
			.getActivityLogsDocument(req, res)
			.then(result => {
				if (result.statusCode != SUCCESS) {
					return ResError(res, { msg: result.data });
				} else if (!result?.data?.isDoc) {
					return ResSuccess(res, result.data);
				}
			})
			.catch((error) => {
				console.log(error)
				ResError(res, error)
			});
	}
	static getUserAactivityLogs(req, res) {
		return userActivityLogService
			.getUserActivityLogs(req)
			.then((result) =>
				result.statusCode == SUCCESS
					? ResSuccess(res, result.data)
					: ResError(res, { msg: result.data })
			)
			.catch((error) => ResError(res, error));
	}
	static getOlnieUserDomainNames(req, res) {
		return onlineUsersService
			.getOlnieUserDomainNames(req)
			.then((result) =>
				result.statusCode == SUCCESS
					? ResSuccess(res, result.data)
					: ResError(res, { msg: result.data })
			)
			.catch((error) => ResError(res, error));
	}
	static acceptRules(req, res) {
		return userService
			.acceptRules(req)
			.then((result) =>
				result.statusCode == SUCCESS
					? ResSuccess(res, result.data)
					: ResError(res, { msg: result.data })
			)
			.catch((error) => ResError(res, error));
	}
	static editProfile(req, res) {
		return userService
			.editProfile(req)
			.then((result) =>
				result.statusCode == SUCCESS
					? ResSuccess(res, result.data)
					: ResError(res, { msg: result.data })
			)
			.catch((error) => ResError(res, error));
	}
	static favMasterList(req, res) {
		return UserController.getUsersListDiamond(req, res);
	}
	static getUserStack(req, res) {
		return userStackService
			.getUserStack(req)
			.then((result) =>
				result.statusCode == SUCCESS
					? ResSuccess(res, result.data)
					: ResError(res, { msg: result.data })
			)
			.catch((error) => ResError(res, error));
	}
	static updateUserStack(req, res) {
		return userStackService
			.updateUserStack(req)
			.then((result) =>
				result.statusCode == SUCCESS
					? ResSuccess(res, result.data)
					: ResError(res, { msg: result.data })
			)
			.catch((error) => ResError(res, error));
	}
	static setUserStack(req, res) {
		return userStackService
			.setUserStack(req)
			.then((result) =>
				result.statusCode == SUCCESS
					? ResSuccess(res, result.data)
					: ResError(res, { msg: result.data })
			)
			.catch((error) => ResError(res, error));
	}

	static userUplineLockStatus(req, res) {
		return userDiamondService
			.userUplineLockStatus(req)
			.then((result) =>
				result.statusCode == SUCCESS
					? ResSuccess(res, result.data)
					: ResError(res, { msg: result.data })
			)
			.catch((error) => ResError(res, error));
	}

	static diamondDashboard(req, res) {
		return userDiamondService
			.diamondDashboard(req)
			.then((result) =>
				result.statusCode == SUCCESS
					? ResSuccess(res, result.data)
					: ResError(res, { msg: result.data })
			)
			.catch((error) => ResError(res, error));
	}

	static diamondGamesLockList(req, res) {
		return userDiamondService
			.diamondGamesLockList(req)
			.then((result) =>
				result.statusCode == SUCCESS
					? ResSuccess(res, result.data)
					: ResError(res, { msg: result.data })
			)
			.catch((error) => ResError(res, error));
	}

	static childUserList(req, res) {
		return childUsers
			.childUserList(req)
			.then((result) =>
				result.statusCode == SUCCESS
					? ResSuccess(res, result.data)
					: ResError(res, { msg: result.data })
			)
			.catch((error) => ResError(res, error));
	}

	static unlockAttemptedTRXN(req, res) {
		return userService
			.unlockAttemptedTRXN(req)
			.then((result) =>
				result.statusCode == SUCCESS
					? ResSuccess(res, result.data)
					: ResError(res, { msg: result.data })
			)
			.catch((error) => ResError(res, error));
	}

	static getCreditDataDiamond(req, res) {
		return userService
			.getCreditDataDiamond(req)
			.then((result) =>
				result.statusCode == SUCCESS
					? ResSuccess(res, result.data)
					: ResError(res, { msg: result.data })
			)
			.catch((error) => ResError(res, error));
	}

	static markDealerAsDeafult(req, res) {
		return userService
			.markDealerAsDefault(req)
			.then((result) =>
				result.statusCode == SUCCESS
					? ResSuccess(res, result.data)
					: ResError(res, { msg: result.data })
			)
			.catch((error) => ResError(res, error));
	}

}