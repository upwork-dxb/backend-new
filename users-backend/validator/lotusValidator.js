const Joi = require("joi");
const { getRequesterIp } = require("../service/lotusService");
const Lotus = require("../../models/lotus");
const { ResError } = require("../../lib/expressResponder");
const {
  DEMO_USER_ALLOWED_BET_PLACE_ON_CASINOS,
} = require("../../config/constant/user.js");

module.exports = {
  auth: (req, res, next) => {
    return Joi.object({
      token: Joi.string().required(),
      operatorId: Joi.string().required(),
    })
      .validateAsync(req.body, { abortEarly: false })
      .then(() => next())
      .catch((error) => {
        let errorResponse = { ErrorCode: 1 };
        errorResponse.message = error.details
          .map((data) => data.message)
          .toString();
        Lotus.create({
          auth_req: req.body,
          auth_res: errorResponse,
          request_ip: getRequesterIp(req),
          error: errorResponse.message,
          path: "/auth",
        })
          .then()
          .catch(console.error);
        return res.json(errorResponse);
      });
  },
  exposure: (req, res, next) => {
    return Joi.object({
      token: Joi.required(),
      gameId: Joi.required(),
      matchName: Joi.required(),
      marketName: Joi.required(),
      roundId: Joi.required(),
      marketId: Joi.required(),
      marketType: Joi.required(),
      userId: Joi.required(),
      betInfo: Joi.required(),
      runners: Joi.required(),
      calculateExposure: Joi.required(),
      exposureTime: Joi.required(),
    })
      .validateAsync(req.body, { abortEarly: false })
      .then(() => next())
      .catch((error) => {
        let errorResponse = { status: 1 },
          path = "/exposure";
        errorResponse.message = error.details
          .map((data) => data.message)
          .toString();
        Lotus.create({
          exposure_req: req.body,
          exposure_res: errorResponse,
          request_ip: getRequesterIp(req),
          error: errorResponse.message,
          path,
        })
          .then()
          .catch(console.error);
        return res.json(errorResponse);
      });
  },
  results: (req, res, next) => {
    return Joi.object({
      result: Joi.required(),
      runners: Joi.required(),
      betvoid: Joi.required(),
      roundId: Joi.required(),
      market: Joi.required(),
      operatorId: Joi.required(),
    })
      .validateAsync(req.body, { abortEarly: false })
      .then(() => next())
      .catch((error) => {
        let errorResponse = { Error: "1" },
          path = "/results";
        errorResponse.message = error.details
          .map((data) => data.message)
          .toString();
        Lotus.create({
          results_req: req.body,
          results_res: errorResponse,
          request_ip: getRequesterIp(req),
          error: errorResponse.message,
          path,
        })
          .then()
          .catch(console.error);
        return res.json(errorResponse);
      });
  },
  bets: (req, res, next) => {
    return Joi.object({
      is_void: Joi.boolean().optional(),
      roundId: Joi.string().optional(),
      bets_type: Joi.string()
        .valid("open", "settled", "cancelled")
        .default("open")
        .optional(),
      from_date: Joi.string().optional(),
      to_date: Joi.string().optional(),
      limit: Joi.number().max(100).default(10).optional(),
      page: Joi.number().default(1).optional(),
      isBack: Joi.boolean().optional(),
      marketId: Joi.string().optional(),
      gameId: Joi.string().optional(),
      roundId: Joi.string().optional(),
    })
      .validateAsync(req.body, { abortEarly: false })
      .then((joiData) => {
        req.joiData = joiData;
        next();
      })
      .catch((error) => {
        return ResError(res, error);
      });
  },
  validateDemoUser: (req, res, next) => {
    if (req.User.is_demo && !DEMO_USER_ALLOWED_BET_PLACE_ON_CASINOS) {
      return ResError(res, { msg: "Please use real user account!" });
    }
    next();
  },
};
