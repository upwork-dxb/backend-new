const { STATUS_500, STATUS_422 } = require('../../utils/httpStatusCode');
const { ObjectId } = require("bson")
	, Joi = require('joi')
	, axios = require('axios')
	, Responder = require('../../lib/expressResponder')
	, Sports = require('../../models/sports')
	, commonService = require('../service/commonService')
	, userService = require('../service/userService')
	, sportService = require('../service/sportService')
	, CONSTANTS = require('../../utils/constants')
	, adminSportsController = require('../../admin-backend/controllers/sportsController');

module.exports = class SportsController {

	// To get all sports list
	static getAllSportsList(req, res) {
		Sports.find()
			.then((sportsList) => {
				// Socket
				return Responder.success(res, { data: sportsList, msg: "sports list." })
			}).catch((err) => Responder.error(res, { msg: err.message, statusCode: STATUS_500 }))
	}

	static async getAllActiveSports(req, res) {
		const { userid } = req.body;
		const profilechema = Joi.object({
			userid: Joi.string().required(),
		});
		try {
			await profilechema.validateAsync(req.body, {
				abortEarly: true
			});
		} catch (error) {
			return Responder.success(res, { msg: error.details[0].message, statusCode: STATUS_422 })
		}

		let apiUrlSettings = await commonService.getApiUrlSettings();
		let loggedInUserId = req.User._id;
		let getUserFieldsName = { user_type_id: 1, parent_id: 1, parent_level_ids: 1 }
		let userDetails = await commonService.getUserByUserId(userid, getUserFieldsName);
		let user_type_id = userDetails.data.user_type_id;
		let loggedInUserDetails = await commonService.getUserByUserId(loggedInUserId, getUserFieldsName);
		let logged_in_user_type_id = loggedInUserDetails.data.user_type_id;

		if (logged_in_user_type_id == 0) {

			let onlineSportsRes = [];
			try {
				onlineSportsRes = await axios.get(apiUrlSettings.data.online_sports_url, { timeout: 3000 });
				onlineSportsRes = onlineSportsRes.data;
				if (!Array.isArray(onlineSportsRes))
					onlineSportsRes = [];
			} catch (error) { onlineSportsRes = []; }

			let onlineSportsList = onlineSportsRes;

			var mapsdata = onlineSportsList.map((element) => {
				return {
					sport_id: element.eventType.id,
					name: element.eventType.name,
					is_manual: 0,
					is_active: 1,
					is_created: 0,
					is_show_last_result: 0,
					is_show_tv: 0,
					is_live_sport: 0,
					is_super_admin_commission: 0,
					order_by: 0,
					min_odds_limit: 0,
					max_odss_limit: 0
				};
			});

			let allSports = await sportService.getAllSports();
			allSports = allSports.data;

			var sportIds = new Set(allSports.map(item => item.sport_id));
			let apiSportsAndDBSportsList = [...allSports, ...mapsdata.filter(item => !sportIds.has(item.sport_id))];

			let userAndAllParentIds = [];

			userAndAllParentIds.push(userid);
			let userAndParentAllDeactiveSports = await sportService.getUserAndParentAllDeactiveSport(userAndAllParentIds);
			if (userAndParentAllDeactiveSports.statusCode === CONSTANTS.SUCCESS) {
				userAndParentAllDeactiveSports = userAndParentAllDeactiveSports.data;
				let apiSportsAndDBSportsListForParent = apiSportsAndDBSportsList.map((item) => {
					let findStatus = userAndParentAllDeactiveSports.find(deactiveSport => item.sport_id === deactiveSport.sport_id);
					if (findStatus)
						item.is_active = 0;

					return item;
				});

				return Responder.success(res, { data: apiSportsAndDBSportsListForParent, msg: "Sports list." })
			}
			else
				return Responder.success(res, { data: apiSportsAndDBSportsList, msg: "Sports list." })


		}

		else {

			let userAndAllParentIds = [];
			let parentIdsObject = userDetails.data.parent_level_ids;
			await parentIdsObject.forEach(element => {
				userAndAllParentIds.push(element.user_id);
			});

			userAndAllParentIds.push(userid);
			let userAndParentAllDeactiveSports = await sportService.getUserAndParentAllDeactiveSport(userAndAllParentIds);
			let allDeactiveSportId = [];
			if (userAndParentAllDeactiveSports.statusCode === CONSTANTS.SUCCESS) {
				userAndParentAllDeactiveSports = userAndParentAllDeactiveSports.data;
				await userAndParentAllDeactiveSports.forEach(element => {
					allDeactiveSportId.push(element.sport_id);
				});
			}
			let checkLoggedInUserIsParentOfUser = await commonService.getLoggedInUserIsParentOfUser(userid, loggedInUserId);
			if (checkLoggedInUserIsParentOfUser.statusCode === CONSTANTS.SUCCESS) {
				let allSports = await sportService.getAllSports();
				allSports = allSports.data;
				if (userAndParentAllDeactiveSports.length > 0) {
					let userAllSportsList = allSports.map((item) => {
						let findStatus = userAndParentAllDeactiveSports.find(deactiveSport => item.sport_id === deactiveSport.sport_id);
						if (findStatus)
							item.is_active = 0;
						return item;
					});
					return Responder.success(res, { data: userAllSportsList, msg: " Sports list." })
				}
				else
					return Responder.success(res, { data: allSports, msg: "Sports list." })
			}
			else {
				let allActiveSportsOfUser = await sportService.getAllSportsNotInDeactiveSports(allDeactiveSportId);
				if (allActiveSportsOfUser.statusCode === CONSTANTS.SUCCESS)
					return Responder.success(res, { data: allActiveSportsOfUser.data, msg: "Sports list." })
				else
					return Responder.success(res, { data: [], msg: "No active Sports found." })

			}

		}

	}

	static async getJoinSportsList(req, res) {

		const profilechema = Joi.object({
			user_id: Joi.string().optional()
		});

		try {
			await profilechema.validateAsync(req.body, {
				abortEarly: false
			});

			let { user_id } = req.body;
			if (!user_id)
				user_id = req.User.user_id || req.User._id;

			let getUserTypeIsNotAdmin = (req.User.user_type_id == CONSTANTS.USER_TYPE_SUPER_ADMIN) ? false : true
				, Projection = { user_type_id: 1 };
			if (getUserTypeIsNotAdmin)
				Projection["parent_level_ids"] = 1;

			let loggedInUserDetails = await userService.getUserByUserId({ _id: user_id }, Projection);
			if (loggedInUserDetails.statusCode != CONSTANTS.SUCCESS)
				return Responder.success(res, { msg: `User not Found${loggedInUserDetails.statusCode == CONSTANTS.SERVER_ERROR ? ', ' + loggedInUserDetails.data : ''}` })
			loggedInUserDetails = loggedInUserDetails.data;

			let parentIds = loggedInUserDetails.parent_level_ids.map(data => data.user_id).filter(data => data);
			let Object = parentIds.map(d => ObjectId(d));
			var list = await sportService.getJoinData(Object, ObjectId(user_id));

			return Responder.success(res, { data: list, msg: "sports list." })
		} catch (error) {
			return Responder.error(res, error)
		}
	}

	// To get all sports list for super admin & agents with block data
	static async getSports(req, res) {
		return adminSportsController.getSports(req, res);
	}

}