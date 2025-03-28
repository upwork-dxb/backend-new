const { ObjectId } = require("bson");
const User = require("../../../models/user");
const { resultResponse } = require("../../../utils/globalFunction");
const {
  SUCCESS,
  NOT_FOUND,
  SERVER_ERROR,
  USER_TYPE_SUPER_ADMIN,
} = require("../../../utils/constants");

module.exports.childUserList = async function childUserList(request) {
  try {
    // Destructure request for commonly used properties
    let { page = 1, limit = 10, search } = request.joiData; // Default values for page and limit
    const skip = (page - 1) * limit; // Calculate the number of items to skip

    // Create a search filter
    const filter = search
      ? { user_name: { $regex: `^${search}`, $options: "i" } } // Case-insensitive match from the start
      : {};

    filter["parent_level_ids.user_id"] = ObjectId(request.User._id);

    // Execute queries concurrently: user list with pagination and total count for metadata
    const query = childUserListQuery(filter);
    const [result, total] = await Promise.all([
      User.aggregate(query)
        .skip(skip)
        .limit(limit)
        .allowDiskUse(true), // Fetch paginated results
      User.countDocuments(filter), // Get total count for pagination metadata
    ]);

    // Check if there are no results.
    if (!result.length) {
      return resultResponse(
        NOT_FOUND,
        "Users name list is empty, No users found!"
      );
    }

    // Construct successful response with user data and pagination metadata
    return resultResponse(SUCCESS, {
      metadata: {
        total, // Total count of matching records
        limit, // Limit of records per page
        page, // Current page number
        pages: Math.ceil(total / limit), // Total number of pages
      },
      data: result, // Paginated list of activity logs
    });
  } catch (error) {
    // Handle any errors during the request and return a server error response
    return resultResponse(SERVER_ERROR, error.message);
  }
};


function childUserListQuery(matchConditions) {
  return [
    { $match: matchConditions }, // Correctly apply the $match stage
    {
      $project:
      {
        user_name: 1
      }
    },
    { $sort: { _id: -1 } },
  ];
}