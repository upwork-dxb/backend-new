const { ObjectId } = require("bson");
const moment = require("moment");
const User = require("../../../models/user");
const utils = require("../../../utils");
const logger = require("../../../utils/loggers");
const { getLiabilityUserList } = require("./getLiabilityFullAndShare.js");
const { resultResponse } = require("../../../utils/globalFunction");
const {
  CREF_USERS_LIST_EXPOSURE_SHOW,
} = require("../../../config/constant/user.js");
const {
  SUCCESS,
  NOT_FOUND,
  SERVER_ERROR,
  USER_TYPE_SUPER_ADMIN,
  USER_TYPE_USER,
  LABEL_UKRAINE,
} = require("../../../utils/constants");

// Retrieves a paginated list of users with specific filtering and aggregation.
module.exports.getUsersListCRef = async (req) => {
  const startTime = moment(); // Start timer for execution time measurement
  const LOG_REF_CODE = utils.generateUUID(); // Unique log reference for this operation

  try {
    // Destructure commonly used properties from the request
    const { User: Self, user: Child, joiData: body } = req;

    const isSearch = body.user_id; // Determine if the request is a search query
    const agents = Child.parent_level_ids; // List of parent-level user IDs
    let breadcrumbs = agents; // Initialize breadcrumbs with agents

    // Resolve the `user_id` based on the search condition or self-user details
    body.user_id = ObjectId(isSearch ? isSearch : Self.user_id || Self._id);
    req.isSearch = isSearch; // Store the search state in the request

    // Build query filter and aggregate query
    const filter = Filter(req); // Generate the filter based on request data
    const query = Query(filter); // Generate the aggregation query

    // Set pagination defaults and compute the skip value
    let { page, limit } = body;
    limit = parseInt(limit || 50, 10); // Default items per page to 50
    page = parseInt(page || 1, 10); // Default to the first page
    const skip = (page - 1) * limit; // Calculate the number of items to skip

    // Execute both the main query and the total count query concurrently
    const [result, total] = await Promise.all([
      User.aggregate(query).skip(skip).limit(limit).allowDiskUse(true), // Fetch paginated user list
      User.find(filter).countDocuments(), // Get the total number of matching users
    ]);

    // Generate breadcrumbs for the response
    breadcrumbs = Breadcrumbs({
      Self,
      isSearch,
      agents,
      breadcrumbs,
    }).reverse(); // Reverse breadcrumbs for desired order

    // Return a response if no users are found
    if (!result.length) {
      return resultResponse(NOT_FOUND, {
        msg: "Users list is empty, No users found!", // Error message for empty results
        back: Self.user_id,
        breadcrumbs,
      });
    }

    const executionTime = utils.getTimeTaken({ startTime }); // Calculate the time taken
    logger.info(
      `${LOG_REF_CODE} getUsersListCRef Execution Time: ${executionTime}`, // Log execution time
    );

    if (CREF_USERS_LIST_EXPOSURE_SHOW) {
      await getLiabilityUserList(result);
    }

    // Construct and return a successful response with pagination metadata
    return resultResponse(SUCCESS, {
      metadata: {
        total, // Total number of matching users
        limit, // Items per page
        page, // Current page number
        pages: Math.ceil(total / limit), // Total number of pages
      },
      data: result, // User list for the current page
      user_name: isSearch ? Child.user_name : Self.user_name, // Current user name
      breadcrumbs, // Breadcrumbs for navigation
    });
  } catch (error) {
    // Log the error and return a server error response
    logger.error(`${LOG_REF_CODE} Error getUsersListCRef ${error.stack}`);
    return resultResponse(SERVER_ERROR, { msg: error.message });
  }
};

function Breadcrumbs({ Self, isSearch, agents, breadcrumbs }) {
  // Return breadcrumbs unchanged for super admin users
  if (Self.user_type_id === USER_TYPE_SUPER_ADMIN) {
    return breadcrumbs;
  }

  // Adjust breadcrumbs for search cases that differ from the current user
  if (isSearch && isSearch !== Self._id.toString()) {
    const agentIndex = agents.findIndex((x) => x.user_name == Self.user_name);
    breadcrumbs = agents.slice(agentIndex); // Trim breadcrumbs to start from the current user
    return breadcrumbs;
  }

  return []; // Return empty breadcrumbs for other cases
}

function Filter(req) {
  const { user_id, only_end_users, user_name, search, only_master } = req.joiData;
  const { isSearch } = req;

  // Base filter criteria for user retrieval
  let filter = {
    parent_id: ObjectId(user_id), // Filter by parent user ID
    belongs_to_credit_reference: 1, // Only users with credit references
    belongs_to: LABEL_UKRAINE, // Filter by region or label
    self_close_account: 0, // Exclude users who closed their account
    parent_close_account: 0, // Exclude users whose parent closed the account
  };

  // Adjust filter for end-user only queries
  if (only_end_users) {
    filter["user_type_id"] = 1; // Only include users of type 1 (end-users)
  } else {
    if (!isSearch) {
      filter["user_type_id"] = { $ne: 1 }; // Exclude end-users if not searching
    }
  }
  if (only_master) filter["user_type_id"] = { $ne: 1 }; // Exclude end-users if not searching
  // Add name-based filtering if provided
  if (user_name) filter["user_name"] = { $regex: new RegExp(user_name, "i") };

  // Merge additional search parameters into the filter
  if (search) {
    if (search?.domain) {
      search.domain = Array.isArray(search.domain)
        ? { $in: search.domain.map((domain) => ObjectId(domain)) }
        : ObjectId(search.domain);
    }
    if (Array.isArray(search?.domain_name))
      search.domain_name = { $in: search.domain_name };
    if (Array.isArray(search?.title)) search.title = { $in: search.title };

    Object.assign(filter, search); // Merge search criteria into the main filter
  }

  return filter; // Return the final filter
}

function Query(filter) {
  return [
    { $match: filter },
    {
      $project: {
        _id: 1,
        user_id: "$_id",
        user_name: 1,
        user_type_id: 1,
        parent_id: 1,
        label: {
          $switch: {
            branches: [
              { case: { $eq: [9, "$user_type_id"] }, then: "Super Admin" },
              { case: { $eq: [8, "$user_type_id"] }, then: "White Label" },
              { case: { $eq: [7, "$user_type_id"] }, then: "Sub Admin" },
              { case: { $eq: [6, "$user_type_id"] }, then: "Hyper" },
              { case: { $eq: [5, "$user_type_id"] }, then: "Senior Super" },
              { case: { $eq: [4, "$user_type_id"] }, then: "Super" },
              { case: { $eq: [3, "$user_type_id"] }, then: "Master" },
              { case: { $eq: [2, "$user_type_id"] }, then: "Agent" },
              { case: { $eq: [1, "$user_type_id"] }, then: "User" },
              { case: { $eq: [0, "$user_type_id"] }, then: "Main" },
            ],
            default: "Label",
          },
        },
        credit_reference: { $round: ["$credit_reference", 2] },
        partnership: 1,
        balance: { $round: ["$balance", 2] },
        exposure: {
          $cond: [
            { $eq: ["$user_type_id", USER_TYPE_USER] },
            {
              $round: [
                { $cond: [{ $gt: ["$liability", 0] }, 0, "$liability"] },
                2,
              ],
            },
            { $toInt: "0" },
          ],
        },
        exposure_share: { $toInt: "0" },
        available_balance: { $round: ["$balance_reference", 2] },
        parent_lock_user: 1,
        parent_lock_betting: 1,
        parent_lock_fancy_bet: 1,
        self_close_account: 1,
        parent_close_account: 1,
        self_lock_user: 1,
        exposure_limit: 1,
        self_lock_betting: 1,
        self_lock_fancy_bet: 1,
        check_event_limit: 1,
        mobile: 1,
        createdAt: 1,
        login_count: 1,
        last_login_date_time: 1,
        ip_address: 1,
        reference_pl: {
          $round: [{ $subtract: ["$balance", "$credit_reference"] }, 2],
        },
        is_b2c_dealer: 1,
        status: {
          $cond: [
            { $eq: [1, { $max: ["$self_lock_user", "$parent_lock_user"] }] },
            "locked",
            "active",
          ],
        },
      },
    },
  ];
}
