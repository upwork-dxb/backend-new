const { ObjectId } = require("bson");
const User = require("../../../models/user");
const { resultResponse } = require("../../../utils/globalFunction");
const {
  SUCCESS,
  NOT_FOUND,
  SERVER_ERROR,
} = require("../../../utils/constants");

/**
 * @param {Object} req - The request object containing the user information.
 * @param {Object} req.User - The requesting user (Self).
 * @param {Object} req.user - The child user (Child).
 * @returns {Promise<Object>} The result response containing the credit data or an error message.
 */
module.exports.getCreditDataDiamond = async (req) => {
  try {
    const { User: Self, user: Child } = req;

    if (Self._id.toString() === Child._id.toString()) {
      return resultResponse(
        NOT_FOUND,
        "A user cannot request their own credit data.",
      );
    }

    const parent = await User.findById(ObjectId(Child.parent_id))
      .select([
        "-_id",
        "user_name",
        "credit_reference",
        "children_credit_reference",
      ])
      .lean()
      .exec();

    return resultResponse(SUCCESS, {
      data: {
        parent_user_name: parent?.user_name || "Parent",
        parent_available_credit:
          (parent?.credit_reference || 0) -
          (parent?.children_credit_reference || 0),
        child_user_name: Child?.user_name,
        child_available_credit: Child?.credit_reference || 0,
      },
    });
  } catch (error) {
    // Handle any errors during the request and return a server error response
    // The catch block captures any errors that occur during the execution of the try block
    // and returns a server error response with the error message.
    return resultResponse(SERVER_ERROR, error.message);
  }
};
