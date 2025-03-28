const { ObjectId } = require("bson");
const User = require("../../../models/user");
const logger = require("../../../utils/loggers");
const { resultResponse } = require("../../../utils/globalFunction");
const { fixFloatingPoint } = require("../../../utils");
const { getLiability } = require("./getLiabilityFullAndShare.js");
const {
  SUCCESS,
  NOT_FOUND,
  SERVER_ERROR,
  USER_TYPE_USER,
} = require("../../../utils/constants");

module.exports.getUserBalance = async (req) => {
  try {
    const {
      user_id: reqUserId,
      userid, // this should be remove in the future.
      calculated_liablity,
    } = req?.joiData || {};

    // Determine the user ID
    const user_id = ObjectId(
      reqUserId || userid || req.User.user_id || req.User._id,
    );

    // Determine user type ID
    const user_type_id = reqUserId
      ? req.user.user_type_id
      : req.User.user_type_id;

    let select =
      "parent_id user_name name user_type_id balance liability profit_loss is_online credit_reference share partnership";

    let result = await User.findOne({
      _id: user_id,
      // Removed it If old /getUserBalance is added to path.js with updated body (userid -> user_id) field
      ...(user_id != req.User._id
        ? { "parent_level_ids.user_id": req.User._id }
        : {})
    })
      .select(select)
      .lean()
      .exec();

    if (!result) {
      return resultResponse(SERVER_ERROR, { msg: "User not Found Or You Don't have Access this Resource !!" })
    }

    result.balance = fixFloatingPoint(result.balance);
    result.liability = fixFloatingPoint(result.liability);
    result.profit_loss = fixFloatingPoint(result.profit_loss);

    // this will only work if the user_id is passed by admin or agent for end user that user type is 1.
    if (req?.user?.user_type_id == USER_TYPE_USER) {
      req.isUser = true;
    }

    // this will calculate the end user liablity from the query.
    if (calculated_liablity && req.isUser) {
      delete result.share;
      delete result.partnership;
      req.isUser = false;
    }

    // return the end user details from here. When end user requested only.
    // This will also skip when calculated_liablity is passed in request.
    if (req.isUser) {
      delete result.share;
      delete result.partnership;
      return resultResponse(SUCCESS, { data: result });
    }

    let getLiabilityData = await getLiability({
      user_ids: [user_id],
      user_type_id,
    });

    result.liability_share = 0;

    if (getLiabilityData.statusCode == SUCCESS) {
      let { liability, liability_share } = getLiabilityData.data[0];
      result.liability = liability;
      result.liability_share = liability_share;
    }

    return resultResponse(SUCCESS, { data: result });
  } catch (error) {
    // Log the error and return a server error response
    logger.error(`Error getUserBalance ${error.stack}`);
    return resultResponse(SERVER_ERROR, { msg: error.message });
  }
};
