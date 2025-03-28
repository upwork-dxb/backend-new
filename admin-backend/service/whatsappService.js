const { STATUS_422, STATUS_500 } = require('../../utils/httpStatusCode');

const axios = require('axios')
    , bcrypt = require('bcrypt')
    , CONSTANTS = require('../../utils/constants')
    , User = require('../../models/user')
    , PasswordHistory = require('../../models/passwordHistory')
    , OAuthToken = require('../../models/oAuthToken')
    , { resultResponse } = require("../../utils/globalFunction")
    , { OTPLESS_CLIENT_ID, OTPLESS_CLIENT_SECRET, OTPLESS_KEY_API, OTPLESS_USER_INFO_API, OTPLESS_MAGIC_LINK_API, OTPLESS_SEND_OTP_URL,
        OTPLESS_RESEND_OTP_URL, OTPLESS_VERIFY_OTP_URL, OTPLESS_CHANNEL, OTPLESS_EXPIRY, OTPLESS_OTP_LENGTH } = require('../../environmentConfig')
    , saltRounds = 8
    , logger = require('../../utils/logger')
    , { generateReferCode, getTimeTaken, getIpDetails } = require('../../utils');
/**
 * send OTP on whatsup
 * @body {*} req 
 * @body {*} res 
 * @returns 
 */

async function sendCode(postData) {
    try {
        const data = { channel: OTPLESS_CHANNEL, expiry: OTPLESS_EXPIRY, otpLength: OTPLESS_OTP_LENGTH };
        if (postData.mobile) {
            data.phoneNumber = `${postData.country_code}${postData.mobile}`;
        }
        const headers = {
            clientId: OTPLESS_CLIENT_ID,
            clientSecret: OTPLESS_CLIENT_SECRET,
            'Content-Type': 'application/json'
        };
        return await axios.post(OTPLESS_SEND_OTP_URL, data, { headers }).then((response) => {
            return response;
        })
    } catch (error) {
        return error;
    }
}
/**
 * resend OTP on whatsup
 * @body {*} req 
 * @body {*} res 
 * @returns 
 */
async function reSendCode(req) {
    try {
        const data = { orderId: req.body.orderId };
        const headers = {
            clientId: OTPLESS_CLIENT_ID,
            clientSecret: OTPLESS_CLIENT_SECRET,
            'Content-Type': 'application/json'
        };
        return await axios.post(OTPLESS_RESEND_OTP_URL, data, { headers }).then((response) => {
            return response;
        })
    } catch (error) {
        return error;
    }
}
/**
* verify OTP
* @body {*} req 
* @body {*} res 
* @returns 
*/
async function verifyCode(req) {
    try {
        const data = { orderId: req.body.orderId, otp: req.body.otp, phoneNumber: req.body.phoneNumber };
        const headers = {
            clientId: OTPLESS_CLIENT_ID,
            clientSecret: OTPLESS_CLIENT_SECRET,
            'Content-Type': 'application/json'
        };
        return await axios.post(OTPLESS_VERIFY_OTP_URL, data, { headers }).then((response) => {
            return response;
        })
    } catch (error) {
        return error;
    }
}

async function resetPassword(data) {
    try {
        data.joiData.belongs_to_b2c = true;
        const existingMobile = await User.findOne(data.joiData).select(`mobile country_code is_verified`).lean();
        if (existingMobile) {
            const response = await sendCode(data.joiData);
            if (response.status == 200) {
                await User.updateOne(data.joiData, { orderId: response.data.orderId, is_verified: 0 });
                return resultResponse(CONSTANTS.SUCCESS, {
                    data: response.data, msg: "Successfully send OTP on your Whatsapp number.",
                    otp_expiry_time: OTPLESS_EXPIRY, note: "Time in seconds."
                });
            } else {
                return resultResponse(CONSTANTS.VALIDATION_FAILED, { msg: response.response.data.message });
            }
        } else {
            return resultResponse(CONSTANTS.NOT_FOUND, { msg: "The specified user does not exist with the number you entered." });
        }
    } catch (error) {
        return resultResponse(CONSTANTS.SERVER_ERROR, { msg: error.message, statusCode: STATUS_500 });
    }
}


async function verifyResetPasswordOtp(data) {
    try {
        const user = await User.findOne({ "orderId": data.joiData.orderId }).select(`mobile country_code`).lean()
        if (!user) {
            return resultResponse(CONSTANTS.NOT_FOUND, { msg: "User not found!" });
        }
        data.body.phoneNumber = user.country_code + "" + user.mobile;
        let response = await verifyCode(data);
        if (response) {
            if (response.data !== undefined && response.data.isOTPVerified) {
                await User.updateOne({ orderId: data.joiData.orderId }, { is_verified: 1 });
                return resultResponse(CONSTANTS.SUCCESS, { msg: "Successfully verified" });
            } else {
                return resultResponse(CONSTANTS.VALIDATION_ERROR, { msg: "Incorrect OTP!", statusCode: STATUS_422 });
            }
        }
    } catch (error) {
        return resultResponse(CONSTANTS.SERVER_ERROR, { msg: error.message, statusCode: STATUS_500 });
    }
}

async function resendResetPasswordOtp(data) {
    try {
        const existingMobile = await User.findOne(data.joiData).select(`mobile country_code`).lean();
        if (existingMobile) {
            const response = await reSendCode(data);
            if (response.status == 200) {
                return resultResponse(CONSTANTS.SUCCESS, {
                    data: response.data, msg: "Successfully resend OTP on your Whatsapp number.",
                    otp_expiry_time: OTPLESS_EXPIRY, note: "Time in seconds."
                });
            } else {
                return resultResponse(CONSTANTS.NOT_FOUND, { msg: response.response.data.message });
            }
        } else {
            return resultResponse(CONSTANTS.NOT_FOUND, { msg: "Order ID not found, and OTP can't be resent." });
        }
    } catch (error) {
        return resultResponse(CONSTANTS.SERVER_ERROR, { msg: error.message, statusCode: STATUS_500 });
    }
}

async function setPassword(req) {
    try {
        let data = req.joiData;
        // encrypting user password.
        newPassword = bcrypt.hashSync(data.newPassword, bcrypt.genSaltSync(saltRounds));
        const user = await User.findOneAndUpdate(
            { orderId: data.orderId, is_verified: 1 },
            {
                $set: {
                    password: newPassword,
                    // raw_password 
                }, // Update password and raw_password
                $unset: { orderId: "", is_verified: "" } // Remove orderId and is_verified
            }
        ).select("user_name belongs_to_credit_reference mobile").lean();
        if (!user)
            return resultResponse(CONSTANTS.VALIDATION_ERROR, { msg: "User not found or otp not verified.", statusCode: STATUS_422 });
        if (user.belongs_to_credit_reference) {
            let comment = "Password successfully reset via WhatsApp.";
            let geolocation = await getIpDetails(data.ip_address);
            let mobile = user.mobile ? true : false;
            let ip_address = data.ip_address;
            let browser = req.headers['user-agent'];
            let device_info = browser || "Localhost";
            PasswordHistory.create({
                user_id: user._id, user_name: user.user_name, comment, changed_by_user_id: user._id, geolocation, mobile, ip_address, device_info
            }).then().catch(console.error);
        }
        // Logout user
        OAuthToken.deleteMany({ 'user.user_id': user._id.toString() }).then();
        return resultResponse(CONSTANTS.SUCCESS, { msg: "Your password updated successfully." });
    } catch (error) {
        return resultResponse(CONSTANTS.SERVER_ERROR, { msg: error.message, statusCode: STATUS_500 });
    }
}


module.exports = { sendCode, reSendCode, verifyCode, resetPassword, verifyResetPasswordOtp, resendResetPasswordOtp, setPassword }