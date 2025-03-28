const { ObjectId } = require("bson");
const moment = require("moment");
const User = require("../../../models/user");
const GameLock = require("../../../models/gameLock");
const utils = require("../../../utils");
const logger = require("../../../utils/loggers");
const { getLiabilityUserList } = require("./getLiabilityFullAndShare.js");
const { resultResponse } = require("../../../utils/globalFunction");
const {
  DIAMOND_USERS_LIST_EXPOSURE_SHOW,
} = require("../../../config/constant/user.js");
const {
  SUCCESS,
  NOT_FOUND,
  SERVER_ERROR,
  USER_TYPE_SUPER_ADMIN,
  USER_TYPE_USER,
  LABEL_DIAMOND,
} = require("../../../utils/constants");

const UserFinanceData = require("./userFinanceData.js");
const PdfDocService = require("../document/pdf");
const CsvDocService = require("../document/csv");

// Retrieves a paginated list of users with specific filtering and aggregation.
module.exports.getUsersListDiamond = async function getUsersListDiamond(
  request,
) {
  const startTime = moment();
  const LOG_REF_CODE = utils.generateUUID();

  try {
    // Destructure request for commonly used properties
    const { User: Self, user, body } = request;
    const isSearch = body.user_id;
    const agents = user.parent_level_ids;
    const breadcrumbs = agents;

    // Ensure user_id is an ObjectId; use the request's user_id or fall back to Self user_id
    body.user_id = ObjectId(isSearch || Self.user_id || Self._id);

    // Generate filtering and aggregation query based on request
    const filter = getUsersListDiamondFilter(request);
    const sort = getUsersListDiamondSort(request);
    const query = getUsersListDiamondQuery(filter, sort);

    // Set pagination defaults and calculate the skip value
    let { page, limit } = body;
    limit = parseInt(limit || 50, 10); // Default to 50 items per page
    page = parseInt(page || 1, 10); // Default to page 1 if not specified
    const skip = (page - 1) * limit; // Calculate the number of items to skip

    // Execute queries concurrently: user list with pagination and total count for metadata
    const [result, total] = await Promise.all([
      User.aggregate(query).skip(skip).limit(limit).allowDiskUse(true), // Fetch paginated results
      User.find(filter).countDocuments(), // Get total count for pagination metadata
    ]);

    // Check if there are no results.
    if (!result.length) {
      return resultResponse(NOT_FOUND, "Users list is empty, No users found!");
    }

    const executionTime = utils.getTimeTaken({ startTime });
    logger.info(
      `${LOG_REF_CODE} getUsersListDiamond Execution Time: ${executionTime}`,
    );

    if (DIAMOND_USERS_LIST_EXPOSURE_SHOW) {
      await getLiabilityUserList(result);
    }

    // Construct successful response with user data and pagination metadata
    return resultResponse(SUCCESS, {
      data: {
        metadata: {
          total, // Total users matching the filter
          limit, // Items per page
          page, // Current page number
          pages: Math.ceil(total / limit), // Calculate total pages based on total and limit
        },
        data: result, // Paginated user list
      },
      parent_id: isSearch ? user.parent_id : Self.parent_id,
      parent_name: isSearch ? user.parent_user_name : Self.parent_user_name,
      breadcrumbs: getUsersListDiamondBreadcrumbs({
        Self,
        user,
        agents,
        isSearch,
        breadcrumbs,
      }),
    });
  } catch (error) {
    logger.error(`${LOG_REF_CODE} Error getUsersListDiamond ${error.stack}`);
    // Handle any errors during the request and return a server error response
    return resultResponse(SERVER_ERROR, error.message);
  }
};

module.exports.getUsersListDiamondDocument =
  async function getUsersListDiamondDocument(req, res) {
    const LOG_REF_CODE = utils.generateUUID();

    try {
      const { document_type } = req.joiData;
      const userListRes = await module.exports.getUsersListDiamond(req);

      if (userListRes.statusCode != SUCCESS) {
        return userListRes;
      }

      const filter = getUsersListDiamondBankDocumentFilter(req);
      const query = getUsersListDiamondBankDocumentQuery(filter);
      let totalStats = (await User.aggregate(query).allowDiskUse(true))[0];

      const list = userListRes?.data?.data?.data;
      const phead = [
        { title: "User Name" },
        { title: "Full Name" },
        { title: "CR" },
        { title: "Pts" },
        { title: "Client(P/L)" },
        { title: "Client(P/L)%" },
        { title: "Exposure" },
        { title: "Available Pts" },
        { title: "B st" },
        { title: "U st" },
        { title: "PName" },
        { title: "Account Type" },
      ];
      const ptextProperties = { title: "User List", x: 152, y: 9 };
      let columnCount = phead.length;
      const cellWidth = "auto",
        pbodyStyles = Object.fromEntries(
          phead.map((col, index) => [
            index,
            { cellWidth: col.width !== undefined ? col.width : cellWidth },
          ]),
        );

      const pbody = list.map((item, index) => [
        item.user_name,
        item.name,
        item.credit_reference,
        item.pts,
        item.client_pl,
        item.client_pl_share,
        item.exposure,
        item.available_pts,
        !(item.self_lock_betting || item.parent_lock_betting),
        !(item.self_lock_user || item.parent_lock_user),
        "PartnerShip with no Return",
        item.title,
      ]);

      pbody.unshift([
        "",
        "",
        totalStats.credit_reference,
        totalStats.pts,
        totalStats.client_pl,
        "",
        0,
        totalStats.available_pts,
      ]);
      if (document_type == "PDF") {
        const pdfRes = PdfDocService.createPaginatedPdf(res, {
          orientation: "l",
          ptextProperties,
          phead,
          pbody,
          pbodyStyles,
          fileName: "userlist",
        });

        return pdfRes;
      }
      if (document_type == "CSV") {
        let data = await CsvDocService.formatExcelData(phead, pbody);
        const csvbRes = await CsvDocService.createPaginatedCsv(res, {
          data,
          fileName: "userlist",
          columnCount: columnCount,
        });
        return csvbRes;
      }
      return resultResponse(SUCCESS, {
        msg: document_type + " Created Successfully",
      });
    } catch (error) {
      logger.error(
        `${LOG_REF_CODE} Error getUsersListDiamondDocument ${error.stack}`,
      );
      // Handle any errors during the request and return a server error response
      return resultResponse(SERVER_ERROR, error.message);
    }
  };

module.exports.getUsersListDiamondBankDocument =
  async function getUsersListDiamondBankDocument(req, res) {
    const LOG_REF_CODE = utils.generateUUID();

    try {
      const { document_type } = req.joiData;
      const userListRes = await module.exports.getUsersListDiamond(req);

      if (userListRes.statusCode != SUCCESS) {
        return userListRes;
      }

      const list = userListRes?.data?.data?.data;
      const phead = [
        { title: "User Name" },
        { title: "CR" },
        { title: "Pts" },
        { title: "Client(P/L)" },
        { title: "Exposure" },
        { title: "Available Pts" },
        { title: "Account Type" },
      ];

      const ptextProperties = { title: "Bank User List", x: 160, y: 9 };
      let columnCount = phead.length;
      const cellWidth = "auto",
        pbodyStyles = Object.fromEntries(
          phead.map((col, index) => [
            index,
            { cellWidth: col.width !== undefined ? col.width : cellWidth },
          ]),
        );

      const pbody = list.map((item, index) => [
        `${item.user_name} (${item.name})`,
        item.credit_reference,
        item.pts,
        item.client_pl,
        item.exposure,
        item.available_pts,
        item.title,
      ]);

      if (document_type == "PDF") {
        const pdfRes = PdfDocService.createPaginatedPdf(res, {
          orientation: "l",
          ptextProperties,
          phead,
          pbody,
          pbodyStyles,
          fileName: "bankuserlist",
        });

        return pdfRes;
      }
      if (document_type == "CSV") {
        let data = await CsvDocService.formatExcelData(phead, pbody);
        const csvbRes = await CsvDocService.createPaginatedCsv(res, {
          data,
          fileName: "bankuserlist",
          columnCount: columnCount,
        });
        return csvbRes;
      }
      return resultResponse(SUCCESS, {
        msg: document_type + " Created Successfully",
      });
    } catch (error) {
      logger.error(
        `${LOG_REF_CODE} Error getUsersListDiamondDocument ${error.stack}`,
      );
      // Handle any errors during the request and return a server error response
      return resultResponse(SERVER_ERROR, error.message);
    }
  };

function getUsersListDiamondBankDocumentQuery(filter) {
  return [
    { $match: filter },
    {
      $project: {
        user_type_id: 1,
        credit_reference: 1,
        share: 1,
        pts: {
          $round: ["$balance_reference", 2],
        },
        client_pl: {
          $round: [
            {
              $subtract: ["$balance_reference", "$credit_reference"],
            },
            2,
          ],
        },
        available_pts: {
          $round: ["$balance", 2],
        },
      },
    },
    {
      $addFields: {
        client_pl_share: {
          $round: [
            {
              $divide: [
                {
                  $multiply: [
                    {
                      $subtract: [
                        {
                          $cond: [
                            {
                              $eq: ["$user_type_id", 1],
                            },
                            0,
                            100,
                          ],
                        },
                        "$share",
                      ],
                    },
                    "$client_pl",
                  ],
                },
                100,
              ],
            },
            2,
          ],
        },
      },
    },
    {
      $group: {
        _id: null,
        credit_reference: {
          $sum: "$credit_reference",
        },
        pts: {
          $sum: "$pts",
        },
        client_pl: {
          $sum: "$client_pl",
        },
        available_pts: {
          $sum: "$available_pts",
        },
        client_pl_share: {
          $sum: "$client_pl_share",
        },
      },
    },
    {
      $project: {
        _id: 0,
        credit_reference: {
          $round: ["$credit_reference", 2],
        },
        pts: {
          $round: ["$pts", 2],
        },
        client_pl: {
          $round: ["$client_pl", 2],
        },
        available_pts: {
          $round: ["$available_pts", 2],
        },
        client_pl_share: {
          $round: ["$client_pl_share", 2],
        },
      },
    },
  ];
}

function getUsersListDiamondBankDocumentFilter(request) {
  const { user_id } = request.body;

  // Base filter criteria
  let filter = {
    parent_id: ObjectId(user_id),
    belongs_to_credit_reference: 1,
    belongs_to: LABEL_DIAMOND,
    self_close_account: 0,
    parent_close_account: 0,
  };

  return filter;
}

function getUsersListDiamondSort(request) {
  let { sort } = request.body;
  if (!sort) {
    sort = { user_name: 1 };
  }
  return sort;
}

function getUsersListDiamondBreadcrumbs({
  Self,
  user,
  agents,
  isSearch,
  breadcrumbs,
}) {
  if (Self.user_type_id !== USER_TYPE_SUPER_ADMIN) {
    breadcrumbs = [];

    if (isSearch) {
      const agentIndex = agents.findIndex(
        (x) => x.user_name === Self.user_name,
      );
      breadcrumbs = agents.slice(agentIndex);
    }

    breadcrumbs.push({
      user_id: isSearch ? user._id : Self._id,
      user_name: isSearch ? user.user_name : Self.user_name,
      name: isSearch ? user.user_name : Self.user_name,
      user_type_id: isSearch ? user.user_type_id : Self.user_type_id,
    });
    return breadcrumbs;
  }
  return breadcrumbs;
}

// Build a filter for user query based on request parameters
function getUsersListDiamondFilter(request) {
  const { user_id, only_end_users, is_self_view, search, status, belong_to } =
    request.body;
  const { user_id: Self } = request.User;

  // Base filter criteria
  let filter = {
    parent_id: ObjectId(user_id),
    belongs_to_credit_reference: 1,
    belongs_to: LABEL_DIAMOND,
    self_close_account: 0,
    parent_close_account: 0,
  };

  // Add search-based filtering
  if (search) {
    if (belong_to != LABEL_DIAMOND) {
      delete filter["parent_id"]; // Remove parent_id filter for search
      filter["parent_level_ids.user_id"] = ObjectId(Self);
    }

    if (search?.user_name)
      search["user_name"] = {
        $regex: new RegExp(search.user_name.toLowerCase(), "i"),
      };

    if (search?.domain) {
      search.domain = Array.isArray(search.domain)
        ? { $in: search.domain.map((domain) => ObjectId(domain)) }
        : ObjectId(search.domain);
    }
    if (Array.isArray(search?.domain_name))
      search.domain_name = { $in: search.domain_name };
    if (Array.isArray(search?.title)) search.title = { $in: search.title };

    // Merge additional search fields into filter
    Object.assign(filter, search);
  }

  // Add conditions based on viewing and user type
  if (is_self_view) filter["user_type_id"] = { $ne: 1 };
  if (only_end_users) filter["user_type_id"] = 1;

  // Status-based locking conditions
  if (status === "Active") {
    filter["self_lock_user"] = 0;
    filter["parent_lock_user"] = 0;
  } else if (status === "Inactive") {
    filter["self_lock_user"] = 1;
    filter["parent_lock_user"] = 1;
  }
  // Favorite Master list filter.
  if (request.path == "/favMasterList") {
    filter["favorite_master"] = 1;
  }
  return filter;
}

function getUsersListDiamondQuery(filter, sort) {
  return [
    { $match: filter },
    { $sort: sort }, // Adding the sort stage here
    {
      $project: {
        _id: 1,
        user_id: "$_id",
        user_name: 1,
        user_type_id: 1,
        domain_name: 1,
        domain: 1,
        mobile: 1,
        credit_reference: { $toInt: "$credit_reference" },
        pts: { $round: ["$balance_reference", 2] },
        client_pl: { $toInt: { $subtract: ["$balance_reference", "$credit_reference"] } }, // Decimal removed,,
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
        available_pts: { $round: ["$balance", 2] },
        parent_partnership_share: 1,
        share: 1,
        title: 1,
        parent_lock_user: 1,
        self_lock_user: 1,
        exposure_limit: 1,
        self_lock_betting: 1,
        self_lock_fancy_bet: 1,
        parent_lock_betting: 1,
        parent_lock_fancy_bet: 1,
        self_close_account: 1,
        parent_close_account: 1,
        check_event_limit: 1,
        is_b2c_dealer: 1,
        parent_id: 1,
        is_multi_login_allow: 1,
        createdAt: 1,
        is_enable_telegram_default: 1,
        name: 1,
        city: 1,
        is_change_password: 1,
        favorite_master: 1,
        is_auto_credit_reference: 1,
        remark: 1,
        allow_social_media_dealer: 1,
        is_default_dealer: 1
      },
    },
    {
      $addFields: {
        client_pl_share: {
          $round: [
            {
              $divide: [
                {
                  $multiply: [
                    {
                      $subtract: [
                        {
                          $cond: [
                            { $eq: ["$user_type_id", USER_TYPE_USER] },
                            0,
                            100,
                          ],
                        },
                        "$share",
                      ],
                    },
                    "$client_pl",
                  ],
                },
                100,
              ],
            },
            2,
          ],
        },
      },
    },
  ];
}

module.exports.userUplineLockStatus = async function userUplineLockStatus(
  request,
) {
  try {
    // Destructure request for commonly used properties
    const { User: Self, user, joiData: body } = request;
    // const { user_id } = body;

    const parentIndex = user.parent_level_ids.findIndex(
      (i) => i.user_id == Self._id,
    );
    const new_parent_level_ids = user.parent_level_ids.slice(parentIndex);

    const parentUserIds = new_parent_level_ids.map((i) => i.user_id);
    let response = await User.find({ _id: { $in: parentUserIds } })
      .select([
        "_id",
        "user_name",
        "name",
        "self_lock_user",
        "parent_lock_user",
        "self_lock_betting",
        "parent_lock_betting",
        "self_lock_fancy_bet",
        "parent_lock_fancy_bet",
        "self_close_account",
        "parent_close_account",
      ])
      .lean()
      .exec();

    response = response.map((user) => {
      const { _id: user_id, user_name, name } = user;

      return {
        user_id,
        user_name,
        name,
        lock_user: user.self_lock_user || user.parent_lock_user,
        lock_betting: user.self_lock_betting || user.parent_lock_betting,
        lock_fancy_bet: user.self_lock_fancy_bet || user.parent_lock_fancy_bet,
        close_account: user.self_close_account || user.parent_close_account,
      };
    });

    // Construct successful response
    return resultResponse(SUCCESS, {
      msg: "Data Fetched Successfully.",
      data: response,
    });
  } catch (error) {
    // Handle any errors during the request and return a server error response
    return resultResponse(SERVER_ERROR, error.message);
  }
};

module.exports.diamondDashboard = async function diamondDashboard(request) {
  try {
    // Destructure request for commonly used properties
    let { user_id } = request.joiData;
    const { User: Self } = request;
    user_id = ObjectId(user_id || Self._id)

    const financeData = await UserFinanceData.getUserBalance(request);
    if (financeData.statusCode != SUCCESS) {
      return resultResponse(financeData.statusCode, financeData.statusCode);
    }

    const userData = await User.findOne({ _id: user_id })
      .select([
        "_id",
        "balance_reference",
        "upline_settlement",
        "downline_settlement",
        "children_credit_reference",
      ])
      .lean()
      .exec();

    // Extract Data from Finance Service
    const {
      user_name,
      balance,
      liability,
      liability_share,
      credit_reference,
    } = financeData.data.data;

    const settlement_pts = utils.fixFloatingPoint(
      userData.balance_reference - credit_reference,
    );

    // Create the Response Obj
    let responseData = {
      user_id,
      user_name,
      balance,
      liability,
      liability_share,
      credit_pts: credit_reference,
      settlement_pts: utils.removeDecimal(settlement_pts),
      upper_pts: userData.upline_settlement || 0,
      down_pts: userData.downline_settlement || 0,
      all_pts: utils.removeDecimal(
        utils.fixFloatingPoint(credit_reference + settlement_pts),
      ),
      children_credit_reference: userData.children_credit_reference || 0,
    };

    // Construct successful response
    return resultResponse(SUCCESS, {
      msg: "Dashboard Data fetched Successfully",
      data: responseData,
    });
  } catch (error) {
    // Handle any errors during the request and return a server error response
    return resultResponse(SERVER_ERROR, error.message);
  }
};

module.exports.diamondGamesLockList = async function diamondGamesLockList(
  request,
) {
  try {
    // Destructure request for commonly used properties
    const { user } = request;

    const gameLocksList = await GameLock.find({
      user_id: user._id, $or: [
        { is_self_block: false },
        { is_self_block: { $exists: false } }
      ]
    }).select([
      "parent_user_name",
      "name",
      "market_name",
      "sport_name",
      "series_name",
      "match_name",
      "sport_id",
      "series_id",
      "match_id",
      "market_id",
      "category",
    ])
      .lean()
      .exec();

    const response = gameLocksList.map((item) => {
      const { name, market_name } = item;
      return {
        ...item,
        name: market_name || name,
      };
    });

    // Construct successful response
    return resultResponse(SUCCESS, {
      msg: "Game Lock fetched Successfully",
      data: response,
    });
  } catch (error) {
    // Handle any errors during the request and return a server error response
    return resultResponse(SERVER_ERROR, error.message);
  }
};
