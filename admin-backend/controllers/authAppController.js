const { ResSuccess, ResError } = require("../../lib/expressResponder");
const CONSTANTS = require("../../utils/constants");
const AuthAppService = require("../service/authApp/authAppService");

module.exports = {
  getAppId: async function (req, res) {
    try {
      const result = await AuthAppService.getAppId(req);
      if (result.statusCode === CONSTANTS.SUCCESS) {
        return ResSuccess(res, result.data);
      } else {
        return ResError(res, result.data);
      }
    } catch (error) {
      return ResError(res, { msg: error.message });
    }
  },
  addAccount: async function (req, res) {
    try {
      const result = await AuthAppService.addAccount(req);
      if (result.statusCode === CONSTANTS.SUCCESS) {
        return ResSuccess(res, result.data);
      } else {
        return ResError(res, result.data);
      }
    } catch (error) {
      return ResError(res, { msg: error.message });
    }
  },
  verifyOTP: async function (req, res) {
    try {
      const result = await AuthAppService.verifyOTP(req);
      if (result.statusCode === CONSTANTS.SUCCESS) {
        return ResSuccess(res, result.data);
      } else {
        return ResError(res, result.data);
      }
    } catch (error) {
      return ResError(res, { msg: error.message });
    }
  },
  getOTP: async function (req, res) {
    try {
      const result = await AuthAppService.getOTP(req);
      if (result.statusCode === CONSTANTS.SUCCESS) {
        return ResSuccess(res, result.data);
      } else {
        return ResError(res, result.data);
      }
    } catch (error) {
      return ResError(res, { msg: error.message });
    }
  },
  removeAccount: async function (req, res) {
    try {
      const result = await AuthAppService.removeAccount(req);
      if (result.statusCode === CONSTANTS.SUCCESS) {
        return ResSuccess(res, result.data);
      } else {
        return ResError(res, result.data);
      }
    } catch (error) {
      return ResError(res, { msg: error.message });
    }
  },
  getOtpToEnableApp: async function (req, res) {
    try {
      const result = await AuthAppService.getOtpToEnableApp(req);
      if (result.statusCode === CONSTANTS.SUCCESS) {
        return ResSuccess(res, result.data);
      } else {
        return ResError(res, result.data);
      }
    } catch (error) {
      return ResError(res, { msg: error.message });
    }
  },
  disableAuthApp: async function (req, res) {
    try {
      const result = await AuthAppService.disableAuthApp(req);
      if (result.statusCode === CONSTANTS.SUCCESS) {
        return ResSuccess(res, result.data);
      } else {
        return ResError(res, result.data);
      }
    } catch (error) {
      return ResError(res, { msg: error.message });
    }
  },
  adminRemoveAuthApp: async function (req, res) {
    try {
      const result = await AuthAppService.adminRemoveAuthApp(req);
      if (result.statusCode === CONSTANTS.SUCCESS) {
        return ResSuccess(res, result.data);
      } else {
        return ResError(res, result.data);
      }
    } catch (error) {
      return ResError(res, { msg: error.message });
    }
  },
  getSecureAuthStatus: async function (req, res) {
    try {
      const result = await AuthAppService.getSecureAuthStatus(req);
      if (result.statusCode === CONSTANTS.SUCCESS) {
        return ResSuccess(res, result.data);
      } else {
        return ResError(res, result.data);
      }
    } catch (error) {
      return ResError(res, { msg: error.message });
    }
  },
};
