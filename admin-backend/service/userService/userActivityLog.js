const { ObjectId } = require("bson");
const UserActivityLog = require("../../../models/userActivityLog");
const { resultResponse } = require("../../../utils/globalFunction");
const {
  SUCCESS,
  NOT_FOUND,
  SERVER_ERROR,
  USER_TYPE_SUPER_ADMIN,
} = require("../../../utils/constants");

module.exports.getUserActivityLogs = async function getUserActivityLogs(
  request
) {
  try {
    // Destructure request for commonly used properties
    request.joiData.user_id = request.User.user_id || request.User._id;
    request.joiData.user_type_id = request.User.user_type_id;

    const {
      page,
      limit,
      user_id,
      user_name,
      path,
      status,
      search,
      user_type_id,
      host,
      origin,
    } = request.joiData;
    // Set default page and limit if not provided
    const skip = (page - 1) * limit; // Calculate the number of items to skip

    // Build the aggregation pipeline
    let matchConditions = {};
    matchConditions.$or = [];
    if (user_name) matchConditions.$or.push({ user_name });
    if (path) matchConditions.$or.push({ path });
    if (status) matchConditions.$or.push({ status });
    if (host) matchConditions.$or.push({ "req.headers.host": host });
    if (origin) matchConditions.$or.push({ "req.headers.origin": origin });
    if (search) {
      if (search.ip_address)
        matchConditions.$or.push({ "ip_details.ip": search.ip_address });
      if (search.city)
        matchConditions.$or.push({ "ip_details.city": search.city });
      if (search.state)
        matchConditions.$or.push({ "ip_details.state": search.state });
      if (search.country)
        matchConditions.$or.push({ "ip_details.country": search.country });
      if (search.zipcode)
        matchConditions.$or.push({ "ip_details.zipcode": search.zipcode });
      if (search.district)
        matchConditions.$or.push({ "ip_details.district": search.district });
    }

    if (user_type_id != USER_TYPE_SUPER_ADMIN) {
      if (user_id) matchConditions.$or.push({ user_id });
    }
    if(!matchConditions.$or.length){
      matchConditions = {}
    }
    // Fetch the user activity logs with pagination, filtering, and sorting
    const query = getUserActivityLogsQuery(matchConditions);
    const [result, total] = await Promise.all([
      UserActivityLog.aggregate(query)
        .skip(skip)
        .limit(limit)
        .allowDiskUse(true), // Fetch paginated results
      UserActivityLog.countDocuments(matchConditions), // Get total count for pagination metadata
    ]);

    // Check if no data was returned
    if (!result.length) {
      return resultResponse(NOT_FOUND, "Users activity log is empty !");
    }

    // Construct the response with metadata and data
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
    // Handle any errors during execution
    return resultResponse(SERVER_ERROR, error.message);
  }
};

function getUserActivityLogsQuery(matchConditions) {
  return [
    { $match: matchConditions }, // Correctly apply the $match stage
    { $sort: { _id: -1 } },
  ];
}
