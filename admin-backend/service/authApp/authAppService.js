const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");

const { resultResponse } = require("../../../utils/globalFunction");
const {
  SUCCESS,
  SERVER_ERROR,
  NOT_FOUND,
  VALIDATION_ERROR,
  OTP_PURPOSE,
} = require("../../../utils/constants");

// Models
const User = require("../../../models/user");
const { createJWT, verifyJWT } = require("../../../utils");
const utils = require("../../../utils");
const {
  AUTH_APP_OTP_EXPIRE_TIME_SECONDS,
  AUTH_APP_SHORTER_OTP_EXPIRE_TIME_SECONDS,
} = require("../../../config/constant/authApp");
const OAuthToken = require("../../../models/oAuthToken");

async function addAccount(req) {
  try {
    const { user_name, password } = req.joiData;

    const user = await User.findOne({ user_name })
      .select(["_id", "user_name", "password"])
      .exec();

    if (!user) {
      return resultResponse(NOT_FOUND, { msg: "Invalid UserName !!" });
    }

    if (!bcrypt.compareSync(password, user.password)) {
      return resultResponse(NOT_FOUND, {
        msg: "Invalid UserName or Password !!",
      });
    }

    return resultResponse(SUCCESS, {
      user_id: user._id,
      user_name,
      msg: "Enter the OTP shown on website!",
    });
  } catch (error) {
    return resultResponse(SERVER_ERROR, { msg: error.message });
  }
}

async function verifyOTP(req) {
  try {
    const { app_id, otp, password } = req.joiData;
    let { user_name } = req.joiData;
    user_name = user_name.toLowerCase();

    const user = await User.findOne({ user_name })
      .select([
        "_id",
        "user_name",
        "otp",
        "otp_purpose",
        "expire_time",
        "password",
        "is_telegram_enable"
      ])
      .exec();

    if (!user) {
      return resultResponse(NOT_FOUND, { msg: "Invalid User Credentials !!" });
    }

    if (user.is_telegram_enable) {
      return resultResponse(VALIDATION_ERROR, { msg: "Telegram Auth already Enabled !" });
    }

    if (!bcrypt.compareSync(password, user.password)) {
      return resultResponse(NOT_FOUND, {
        msg: "Invalid user_name or Password !!",
      });
    }

    if (user.otp_purpose != OTP_PURPOSE.AUTH_APP_ADD_ACCOUNT) {
      return resultResponse(NOT_FOUND, { msg: "Mismatch OTP Purpose." });
    }

    const isOtpValid = bcrypt.compareSync(otp, user?.otp ?? "");
    if (!isOtpValid)
      return resultResponse(NOT_FOUND, {
        msg: "Invalid OTP! Please try again.",
      });

    if (user.expire_time < Date.now())
      return resultResponse(VALIDATION_ERROR, { msg: "OTP has been expired!" });

    const token = createJWT({ userId: user._id, user_name: user.user_name });

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          auth_app_id: app_id,
          user_auth_app_token: token,
          is_auth_app_enabled: 1,
          is_secure_auth_enabled: 1,
        },
      }
    );
    await OAuthToken.deleteMany({ "user.user_id": (user._id).toString() });

    return resultResponse(SUCCESS, {
      msg: "OTP Verfied, Account Added Successfully !",
      token,
      data: {
        user_id: user._id,
        user_name: user.user_name,
      }
    });
  } catch (error) {
    return resultResponse(SERVER_ERROR, { msg: error.message });
  }
}

async function getAppId(req) {
  try {
    const app_id = uuidv4();
    return resultResponse(SUCCESS, {
      app_id,
      msg: "App Id Generated Successfully !",
    });
  } catch (error) {
    return resultResponse(SERVER_ERROR, { msg: error.message });
  }
}

async function getOTP(req) {
  try {
    const verifyRes = tokenVerification(req);

    if (verifyRes.statusCode != SUCCESS) {
      return resultResponse(VALIDATION_ERROR, { msg: verifyRes.data });
    }

    const { userId, token } = verifyRes.data;

    const user = await User.findOne({ _id: userId })
      .select([
        "_id",
        "is_auth_app_enabled",
        "user_auth_app_token",
        "auth_app_id",
      ])
      .lean()
      .exec();

    if (!user) {
      return resultResponse(NOT_FOUND, { msg: "Invalid user_id !!" });
    }

    if (user.user_auth_app_token != token) {
      return resultResponse(NOT_FOUND, { msg: "Token is Not Valid !!" });
    }

    if (!user.is_auth_app_enabled) {
      return resultResponse(VALIDATION_ERROR, {
        msg: "Auth App not Enabled !",
      });
    }

    const otpText = utils.generateRandomNumber(6);

    let expire_time = new Date(
      new Date().getTime() + AUTH_APP_SHORTER_OTP_EXPIRE_TIME_SECONDS * 1000
    );

    let salt = bcrypt.genSaltSync(10);
    const otp = bcrypt.hashSync(otpText, salt);
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          otp,
          expire_time,
          otp_purpose: OTP_PURPOSE.AUTH_APP_LOGIN_AND_DISABLE,
        },
      }
    );

    return resultResponse(SUCCESS, {
      otp: otpText,
      msg: "OTP Generated Successfully !",
      expires_in_sec: AUTH_APP_SHORTER_OTP_EXPIRE_TIME_SECONDS,
    });
  } catch (error) {
    return resultResponse(SERVER_ERROR, { msg: error.message });
  }
}

function tokenVerification(req) {
  let token = req?.headers?.authorization;
  if (!token) {
    return resultResponse(VALIDATION_ERROR, {
      msg: "Auth Token is Required !",
    });
  }

  token = token.split("Bearer ")[1];
  const verifyRes = verifyJWT(token);

  return resultResponse(verifyRes.statusCode, { ...verifyRes.data, token });
}

async function removeAccount(req) {
  try {
    const verifyRes = tokenVerification(req);

    if (verifyRes.statusCode != SUCCESS) {
      return resultResponse(VALIDATION_ERROR, { msg: verifyRes.data });
    }

    const { userId, token } = verifyRes.data;

    const user = await User.findOne({ _id: userId })
      .select([
        "_id",
        "is_auth_app_enabled",
        "user_auth_app_token",
        "auth_app_id",
      ])
      .lean()
      .exec();

    if (!user) {
      return resultResponse(NOT_FOUND, { msg: "Invalid user_id !!" });
    }

    if (user.user_auth_app_token != token) {
      return resultResponse(NOT_FOUND, { msg: "Token is Not Valid !!" });
    }

    if (user.is_auth_app_enabled) {
      return resultResponse(VALIDATION_ERROR, {
        msg: "Please Remove User.",
      });
    }

    await User.updateOne(
      { _id: userId },
      {
        $unset: {
          auth_app_id: null,
          user_auth_app_token: null,
        },
      }
    );

    return resultResponse(SUCCESS, {
      msg: "User Remove.",
    });
  } catch (error) {
    return resultResponse(SERVER_ERROR, { msg: error.message });
  }
}

async function adminRemoveAuthApp(req) {
  try {
    const { user_id } = req.joiData;
    const selfUser = req.User;

    const user = await User.findOne({
      _id: user_id,
      "parent_level_ids.user_id": selfUser._id,
    })
      .select([
        "_id",
        "user_name",
        "is_auth_app_enabled",
        "user_auth_app_token",
        "auth_app_id",
      ])
      .lean()
      .exec();

    if (!user) {
      return resultResponse(NOT_FOUND, {
        msg: "Invalid user_id, User not Found !!",
      });
    }

    if (
      !user.is_auth_app_enabled &&
      !user.is_secure_auth_enabled &&
      !user.auth_app_id &&
      !user.user_auth_app_token
    ) {
      return resultResponse(VALIDATION_ERROR, {
        msg: "Auth App is already Removed!",
      });
    }

    await User.updateOne(
      { _id: user_id },
      {
        $unset: {
          is_auth_app_enabled: 0,
          is_secure_auth_enabled: 0,
          auth_app_id: null,
          user_auth_app_token: null,
        },
      }
    );
    await OAuthToken.deleteMany({ "user.user_id": user_id });

    return resultResponse(SUCCESS, {
      msg: `Account Removed Successfully for ${user.user_name}!`,
    });
  } catch (error) {
    return resultResponse(SERVER_ERROR, { msg: error.message });
  }
}

async function getOtpToEnableApp(req) {
  try {
    const user_id = req.User._id;
    const user = await User.findOne({ _id: user_id })
      .select([
        "_id",
        "is_telegram_enable",
        "is_auth_app_enabled",
        "user_auth_app_token",
        "auth_app_id",
      ])
      .lean()
      .exec();

    if (user.is_telegram_enable) {
      return resultResponse(VALIDATION_ERROR, { msg: "Telegram Auth already Enabled !" });
    }

    if (user.is_auth_app_enabled) {
      return resultResponse(VALIDATION_ERROR, { msg: "App already Enabled !" });
    }

    if (user.user_auth_app_token || user.auth_app_id) {
      return resultResponse(VALIDATION_ERROR, {
        msg: "Remove User Account from App or Contact Upline !",
      });
    }

    const otpText = utils.generateRandomNumber(6);

    let expire_time = new Date(
      new Date().getTime() + AUTH_APP_OTP_EXPIRE_TIME_SECONDS * 1000
    );

    let salt = bcrypt.genSaltSync(10);
    const otp = bcrypt.hashSync(otpText, salt);
    await User.updateOne(
      { _id: user_id },
      {
        $set: {
          otp,
          expire_time,
          otp_purpose: OTP_PURPOSE.AUTH_APP_ADD_ACCOUNT,
        },
      }
    );

    return resultResponse(SUCCESS, {
      otp: otpText,
      msg: "OTP Generated Successfully, Use it To Enable Auth App !",
      expires_in_sec: AUTH_APP_OTP_EXPIRE_TIME_SECONDS,
    });
  } catch (error) {
    return resultResponse(SERVER_ERROR, { msg: error.message });
  }
}

async function getSecureAuthStatus(req) {
  try {
    const user_id = req.User._id;
    const user = await User.findOne({ _id: user_id })
      .select([
        "_id",
        "is_auth_app_enabled",
        "is_telegram_enable",
        "is_secure_auth_enabled",
      ])
      .lean()
      .exec();

    return resultResponse(SUCCESS, {
      msg: "Status Fetched Successfully!",
      data: {
        user_id: user._id,
        is_telegram_enable: user.is_telegram_enable || 0,
        is_auth_app_enabled: user.is_auth_app_enabled || 0,
        is_secure_auth_enabled: user.is_secure_auth_enabled || 0,
      },
    });
  } catch (error) {
    return resultResponse(SERVER_ERROR, { msg: error.message });
  }
}

async function disableAuthApp(req) {
  try {
    const { otp } = req.joiData;
    const user_id = req.User._id;
    const user = await User.findOne({ _id: user_id })
      .select([
        "_id",
        "user_name",
        "is_auth_app_enabled",
        "user_auth_app_token",
        "auth_app_id",
        "otp",
        "otp_purpose",
        "expire_time",
      ])
      .lean()
      .exec();
    if (user.otp_purpose != OTP_PURPOSE.AUTH_APP_LOGIN_AND_DISABLE) {
      return resultResponse(NOT_FOUND, { msg: "Mismatch OTP Purpose." });
    }

    const isOtpValid = bcrypt.compareSync(otp, user?.otp ?? "");
    if (!isOtpValid)
      return resultResponse(NOT_FOUND, {
        msg: "Invalid OTP! Please try again.",
      });

    if (user.expire_time < Date.now())
      return resultResponse(VALIDATION_ERROR, { msg: "OTP has been expired!" });


    if (!user.is_auth_app_enabled) {
      return resultResponse(VALIDATION_ERROR, {
        msg: "App already Disabled !",
      });
    }

    await User.updateOne(
      { _id: user_id },
      {
        $set: {
          is_auth_app_enabled: 0,
          is_secure_auth_enabled: 0,
        },
      }
    );
    await OAuthToken.deleteMany({ "user.user_id": user_id });

    const room = `${user.auth_app_id}-${user.user_name}`;
    req.IO.to(room).emit("login-success", { success: true });
    req.IO.in(room).socketsLeave(room);
    return resultResponse(SUCCESS, {
      msg: "Token Valid",
    });
  } catch (error) {
    return resultResponse(SERVER_ERROR, { msg: error.message });
  }
}

module.exports = {
  addAccount,
  verifyOTP,
  getAppId,
  getOTP,
  getOtpToEnableApp,
  removeAccount,
  disableAuthApp,
  adminRemoveAuthApp,
  getSecureAuthStatus,
};
