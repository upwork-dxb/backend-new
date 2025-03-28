const Joi = require("joi");
const { getRequesterIp } = require("../../../utils");
const UniversalCasinoLogs = require("../../../models/casinos/universalCasinoLogs");
const { ResError } = require("../../../lib/expressResponder");
const {
  DEMO_USER_ALLOWED_BET_PLACE_ON_CASINOS,
} = require("../../../config/constant/user.js");

module.exports = {
  auth: (req, res, next) => {
    return Joi.object({
      userToken: Joi.string().required(),
      operatorId: Joi.string().required(),
    })
      .validateAsync(req.body, { abortEarly: false })
      .then(() => next())
      .catch((error) => {
        let errorResponse = { statusCode: 401 };
        errorResponse.message = error.details
          .map((data) => data.message)
          .toString();
        UniversalCasinoLogs.create({
          request: req.body,
          response: errorResponse,
          request_ip: getRequesterIp(req),
          error: errorResponse.message,
          path: "/auth",
          comment: "Joi Validation Error.",
        })
          .then()
          .catch(console.error);
        return res.json(errorResponse);
      });
  },

  placeBet: (req, res, next) => {
    return Joi.object({
      userToken: Joi.required(),
      userId: Joi.required(),
      eventId: Joi.required(),
      eventName: Joi.required(),
      roundId: Joi.required(),
      transactionId: Joi.required(),
      marketId: Joi.required(),
      marketName: Joi.required(),
      marketType: Joi.required(),
      calculateExposure: Joi.required(),
      runners: Joi.optional(),
      betInfo: Joi.required(),
    })
      .validateAsync(req.body, { abortEarly: false })
      .then(() => next())
      .catch((error) => {
        let errorResponse = { statusCode: 401 };
        errorResponse.message = error.details
          .map((data) => data.message)
          .toString();
        UniversalCasinoLogs.create({
          request: req.body,
          response: errorResponse,
          request_ip: getRequesterIp(req),
          error: errorResponse.message,
          path: "/placeBet",
          comment: "Joi Validation Error.",
        })
          .then()
          .catch(console.error);
        return res.json(errorResponse);
      });
  },
  validateDemoUser: (req, res, next) => {
    if (req.User.is_demo && !DEMO_USER_ALLOWED_BET_PLACE_ON_CASINOS) {
      return ResError(res, { msg: "Please use real user account!" });
    }
    next();
  },
};
