const Joi = require("joi"),
  moment = require("moment"),
  Responder = require("../../lib/expressResponder"),
  NotVerifiedMobileNo = require("../../models/notVerifiedMobileNo"),
  CONSTANTS = require("../../utils/constants"),
  {
    sendCode,
    reSendCode,
    verifyCode,
    resetPassword,
    verifyResetPasswordOtp,
    resendResetPasswordOtp,
    setPassword,
  } = require("../service/whatsappService"),
  {
    getRedisData,
    setRedisData,
  } = require("../service/redisService"),
  { ResError, ResSuccess } = require("../../lib/expressResponder"),
  { OTPLESS_OTP_LENGTH, OTPLESS_EXPIRY } = require("../../environmentConfig"),
  counrtyCode = require("../../utils/counrtyCode.json");
const logger = require("../../utils/loggers");
const { getTimeTaken, generateUUID } = require("../../utils");

module.exports = class WhatsappController {
  /**
   * send OTP on Whatsapp
   * @body {*} req
   * @body {*} res
   * @returns
   */
  static async sendCode(req, res) {
    return Joi.object({
      mobile: Joi.string().trim().required(),
      country_code: Joi.string()
        .default(CONSTANTS.DEFAULT_COUNTRY_CODE)
        .optional(),
    })
      .validateAsync(req.body, { abortEarly: false })
      .then(async (data) => {
        try {
          const existingMobile = await NotVerifiedMobileNo.findOne({
            mobile: data.mobile,
            country_code: data.country_code,
          }).select(`mobile is_verified country_code`);
          if (!existingMobile) {
            const response = await sendCode(data);
            if (response.status == 200) {
              const saveData = {
                mobile: data.mobile,
                country_code: data.country_code,
                orderId: response.data.orderId,
              };
              await NotVerifiedMobileNo.create(saveData);
              return Responder.success(res, {
                data: response.data,
                msg: "Successfully send OTP on your registered Whatsapp number.",
                otp_expiry_time: OTPLESS_EXPIRY,
                note: "Time in seconds.",
              });
            } else {
              return ResError(res, { msg: response.response.data.message, statusCode: STATUS_422 });
            }
          } else {
            const response = await sendCode(data);
            if (response.status == 200) {
              await NotVerifiedMobileNo.updateOne(
                { mobile: data.mobile, country_code: data.country_code },
                { orderId: response.data.orderId }
              );
              return Responder.success(res, {
                data: response.data,
                msg: "Successfully send OTP on your registered Whatsapp number.",
                otp_expiry_time: OTPLESS_EXPIRY,
                note: "Time in seconds.",
              });
            } else {
              return ResError(res, { msg: response.response.data.message, statusCode: STATUS_422 });
            }
          }
        } catch (err) {
          return ResError(res, { msg: err.message, statusCode: STATUS_500 });
        }
      })
      .catch((error) => {
        return ResError(res, error);
      });
  }

  /**
   * resend OTP on Whatsapp
   * @body {*} req
   * @body {*} res
   * @returns
   */
  static async reSendCode(req, res) {
    return Joi.object({
      orderId: Joi.string().required(),
    })
      .validateAsync(req.body, { abortEarly: false })
      .then(({ orderId }) => {
        return NotVerifiedMobileNo.findOne({ orderId: orderId })
          .select(`mobile is_verified country_code`)
          .then(async (user) => {
            if (!user) {
              return ResError(res, { msg: "Order ID not found, and OTP can't be resent.", statusCode: STATUS_422 });
            }
            if (user.is_verified != undefined && user.is_verified == 1) {
              return ResError(res, { msg: "Mobile Number already verified on the account!", statusCode: STATUS_422 });
            }
            if (!user.mobile && !user.country_code) {
              return ResError(res, { msg: "Mobile Number not found!", statusCode: STATUS_422 });
            }
            await reSendCode(req)
              .then((response) => {
                if (response.status == 200) {
                  return Responder.success(res, {
                    data: response.data,
                    msg: "Successfully resend OTP on your register Whatsapp number.",
                    otp_expiry_time: OTPLESS_EXPIRY,
                    note: "Time in seconds.",
                  });
                } else {
                  return ResError(res, { msg: response.response.data.message, statusCode: STATUS_422 });
                }
              })
              .catch((err) => {
                return ResError(res, { msg: err.message, statusCode: STATUS_500 });
              });
          });
      })
      .catch((error) => {
        return ResError(res, error);
      });
  }

  /**
   * verify OTP
   * @body {*} req
   * @body {*} res
   * @returns
   */
  static async verifyCode(req, res) {
    return Joi.object({
      orderId: Joi.string().required(),
      otp: Joi.number().required(),
    })
      .validateAsync(req.body, { abortEarly: false })
      .then(({ orderId, otp }) => {
        return NotVerifiedMobileNo.findOne({ orderId: orderId })
          .select(`mobile is_verified country_code`)
          .then(async (user) => {
            if (!user) {
              return ResError(res, { msg: "User not found!", statusCode: STATUS_422 });
            }
            if (user.is_verified != undefined && user.is_verified == 1) {
              return ResError(res, { msg: "Mobile Number already verified on the account!", statusCode: STATUS_422 });
            }
            if (!user.mobile && !user.country_code) {
              return ResError(res, { msg: "Mobile Number not found!", statusCode: STATUS_422 });
            }
            req.body.phoneNumber = user.country_code + "" + user.mobile;
            await verifyCode(req)
              .then(async (response) => {
                if (
                  response.data !== undefined &&
                  response.data.isOTPVerified
                ) {
                  await NotVerifiedMobileNo.updateOne(
                    { mobile: user.mobile },
                    { $set: { is_verified: 1 } }
                  )
                    .then(async (updateConnection) => {
                      await NotVerifiedMobileNo.deleteOne({
                        mobile: user.mobile,
                        country_code: user.country_code,
                      });
                      return Responder.success(res, {
                        data: {},
                        msg: "Successfully verified",
                      });
                    })
                    .catch((err) => Responder.error(res, { msg: err.message, statusCode: STATUS_500 }));
                } else {
                  return ResError(res, { msg: "Incorrect OTP!", statusCode: STATUS_422 });
                }
              })
              .catch((err) => {
                return ResError(res, { msg: err.message, statusCode: STATUS_500 });
              });
          });
      })
      .catch((error) => {
        return ResError(res, error);
      });
  }
  /* Get county code */
  static async getCountryCode(req, res) {
    return Responder.success(res, {
      data: counrtyCode,
      msg: "Country List.",
    });
  }

  static async resetPassword(req, res) {
    const startTime = moment();
    const LOG_REF_CODE = generateUUID();

    logger.info(`
            ## INFO LOG ##
            Log Ref : ${LOG_REF_CODE}
            Function: resetPassword
            Message:  Reset password process initiated vai what's app.
        `);

    const response = await resetPassword(req);
    if (response.statusCode == CONSTANTS.SUCCESS) {
      logger.info(`
                ## INFO LOG ##
                Log Ref : ${LOG_REF_CODE}
                Function: resetPassword
                Message:  ${response.data.msg}
                Res:      ${JSON.stringify(response.data)}
                Time Taken: ${getTimeTaken({ startTime })}
            `);
      let redisReq = {
        mobile: req.joiData.mobile,
        country_code: req.joiData.country_code,
        log_ref_code: LOG_REF_CODE,
      };
      await setRedisData(response.data.data.orderId, redisReq);
      return ResSuccess(res, response.data);
    } else {
      logger.info(`
                ## INFO LOG ##
                Log Ref : ${LOG_REF_CODE}
                Function: resetPassword
                Message:  ${response.data.msg}
                Res:      ${JSON.stringify(response.data)}
                Time Taken: ${getTimeTaken({ startTime })}
            `);
      return ResError(res, response.data);
    }
  }

  static async verifyResetPasswordOtp(req, res) {
    const startTime = moment();
    const redisData = await getRedisData(req.joiData.orderId);
    const LOG_REF_CODE = JSON.parse(redisData)?.log_ref_code;
    logger.info(`
            ## INFO LOG ##
            Log Ref : ${LOG_REF_CODE}
            Function: verifyResetPasswordOtp
            Message:  Verify otp initiated.
        `);
    const response = await verifyResetPasswordOtp(req);

    if (response.statusCode == CONSTANTS.SUCCESS) {
      logger.info(`
                ## INFO LOG ##
                Log Ref : ${LOG_REF_CODE}
                Function: verifyResetPasswordOtp
                Message:  ${response.data.msg}
                Res:      ${JSON.stringify(response.data)}
                Time Taken: ${getTimeTaken({ startTime })}
            `);
      return ResSuccess(res, response.data);
    } else {
      logger.info(`
                ## INFO LOG ##
                Log Ref : ${LOG_REF_CODE}
                Function: verifyResetPasswordOtp
                Message:  ${response.data.msg},
                Res:      ${JSON.stringify(response.data)}
                Time Taken: ${getTimeTaken({ startTime })}
            `);
      return ResError(res, response.data);
    }
  }

  static async resendResetPasswordOtp(req, res) {
    const startTime = moment();
    const redisData = await getRedisData(req.joiData.orderId);
    const LOG_REF_CODE = JSON.parse(redisData)?.log_ref_code;
    logger.info(`
            ## INFO LOG ##
            Log Ref : ${LOG_REF_CODE}
            Function: resendResetPasswordOtp
            Message:  Resend reset password otp initiated.
        `);
    const response = await resendResetPasswordOtp(req);
    if (response.statusCode == CONSTANTS.SUCCESS) {
      logger.info(`
                ## INFO LOG ##
                Log Ref : ${LOG_REF_CODE}
                Function: resendResetPasswordOtp
                Message:  ${response.data.msg}
                Res:      ${JSON.stringify(response.data)}
                Time Taken: ${getTimeTaken({ startTime })}
            `);
      return ResSuccess(res, response.data);
    } else {
      logger.info(`
                ## INFO LOG ##
                Log Ref : ${LOG_REF_CODE}
                Function: resendResetPasswordOtp
                Message:  ${response.data.msg}
                Res:      ${JSON.stringify(response.data)}
                Time Taken: ${getTimeTaken({ startTime })}
            `);
      return ResError(res, response.data);
    }
  }

  static async setPassword(req, res) {
    const startTime = moment();
    const redisData = await getRedisData(req.joiData.orderId);
    const LOG_REF_CODE = JSON.parse(redisData)?.log_ref_code;
    logger.info(`
            ## INFO LOG ##
            Log Ref : ${LOG_REF_CODE}
            Function: setPassword
            Message:  Set password initiated.
        `);
        let ip_address = req.query?.ip ? req.query.ip : req.ip_data;
        req.joiData.ip_address = ip_address;
        const response = await setPassword(req);
        if (response.statusCode == CONSTANTS.SUCCESS) {
            logger.info(`
                ## INFO LOG ##
                Log Ref : ${LOG_REF_CODE}
                Function: setPassword
                Message:  ${response.data.msg}
                Res:      ${JSON.stringify(response.data)}
                Time Taken: ${getTimeTaken({ startTime })}
            `);
      await setRedisData(req.joiData.orderId, {}, true);
      return ResSuccess(res, response.data);
    } else {
      logger.info(`
                ## INFO LOG ##
                Log Ref : ${LOG_REF_CODE}
                Function: setPassword
                Message:  ${response.data.msg}
                Res:      ${JSON.stringify(response.data)}
                Time Taken: ${getTimeTaken({ startTime })}
            `);
      return ResError(res, response.data);
    }
  }
};