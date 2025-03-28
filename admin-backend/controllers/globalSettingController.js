const Responder = require('../../lib/expressResponder')
	, GlobalSetting = require('../../models/globalSetting')
	, ApiUrlSetting = require('../../models/apiUrlSetting')
	, CONSTANTS = require('../../utils/constants')
	, globalSettingService = require('../service/globalSettingService')
	, { ResSuccess, ResError } = require('../../lib/expressResponder')
	, { SocSuccess } = require('../../lib/socketResponder');
const { STATUS_500 } = require('../../utils/httpStatusCode');

module.exports = class GlobalSettingController {

	// To create global setting
	static createGlobalSetting(req, res) {
		let globalSettingDetails = req.body;
		GlobalSetting.create(globalSettingDetails)
			.then((globalSetting) => {
				return Responder.success(res, { data: globalSetting, msg: "Global setting created successfully.", status: true })
			}).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
	}

	// To create api url setting
	static createApiUrlSetting(req, res) {
		let apiUrlSettingDetails = req.body;
		ApiUrlSetting.create(apiUrlSettingDetails)
			.then((apiSetting) => {
				return Responder.success(res, { data: apiSetting, msg: "Api url setting created successfully.", status: true })
			}).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
	}

	// To update use socket status
	static async updateUseSocketStatus(req, res) {
		let is_socket = 0;
		let globalSetting = await globalSettingService.getGlobalSetting();
		globalSetting = globalSetting.data;
		if (globalSetting.is_socket == 0)
			is_socket = 1;
		GlobalSetting.updateOne({}, { $set: { is_socket: is_socket } })
			.then((globalSetting) => {
				return Responder.success(res, { data: globalSetting, msg: "Socket use status updated.", status: true })
			}).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
	}

	// To update global settings
	static async updateGlobalSettings(req, res) {
		if (Object.keys(req.body).length) {
			Object.assign(global, req.body);
			return ApiUrlSetting.updateOne({}, { $set: req.body })
				.then((globalSetting) => {
					return Responder.success(res, { data: globalSetting, msg: "Global setting updated successfully." })
				}).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }));
		}
		return Responder.error(res, { msg: "No parameters given" })
	}

	// To get global setting
	static async getGlobalSettingDetails(req, res) {
		let globalSetting = await globalSettingService.getGlobalSetting();
		if (globalSetting.statusCode === CONSTANTS.SUCCESS)
			return Responder.success(res, { data: globalSetting.data, msg: "Api url setting created successfully." })
		else
			return Responder.error(res, { msg: "Global setting not found" })
	}

	static async getSocketStatus(req, res) {
		return ApiUrlSetting.findOne({}).select("-_id is_socket").lean()
			.then(apiSetting => ResSuccess(res, { is_socket: apiSetting.is_socket }))
			.catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
	}

	static async updateSocketStatus(req, res) {
		return ApiUrlSetting.findOne({}).select("is_socket")
			.then(apiSetting => {
				apiSetting.is_socket = !apiSetting.is_socket;
				apiSetting.save();
				req.IO.emit("socket_state_changed", SocSuccess({
					msg: `Data received from ${apiSetting.is_socket ? 'socket' : 'API'}`,
					is_socket: apiSetting.is_socket
				}));
				return ResSuccess(res, { is_socket: apiSetting.is_socket });
			}).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
	}

	// To update api url setting
	static updateApiUrlSetting(req, res) {
		let apiUrlSettingDetails = req.body;
		ApiUrlSetting.updateOne({}, { $set: apiUrlSettingDetails })
			.then((apiSetting) => {
				return Responder.success(res, { data: apiSetting, msg: "Api url setting updated successfully.", status: true })
			}).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
	}
}