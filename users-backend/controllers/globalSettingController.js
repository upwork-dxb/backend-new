const adminGlobalSettingController = require('../../admin-backend/controllers/globalSettingController');

module.exports = class GlobalSettingController {
	// To get global setting
	static async getGlobalSettingDetails(req, res) {
		return adminGlobalSettingController.getGlobalSettingDetails(req, res);
	}

	static async getSocketStatus(req, res) {
		return adminGlobalSettingController.getSocketStatus(req, res);
	}
}