const { ObjectId } = require("bson");
const UserLoginLogs = require("../../../models/userLoginLogs");
const { resultResponse } = require("../../../utils/globalFunction");
const {
  SUCCESS,
  NOT_FOUND,
  SERVER_ERROR,
  USER_TYPE_SUPER_ADMIN,
} = require("../../../utils/constants");
const PdfDocService = require('../document/pdf/index');
const CsvDocService = require("../document/csv");
const moment = require('moment')

module.exports.getOlnieUserNames = async function getOlnieUserNames(request) {
  try {
    // Destructure request for commonly used properties
    let { page = 1, limit = 10, search } = request.joiData; // Default values for page and limit
    const skip = (page - 1) * limit; // Calculate the number of items to skip

    // Create a search filter
    const filter = search
      ? { user_name: { $regex: search, $options: "i" } } // Case-insensitive partial match
      : {};

    filter["parent_level_ids.user_id"] = request.User._id;

    // Execute queries concurrently: user list with pagination and total count for metadata
    const query = getUniqueFieldQuery(filter, "user_name");
    const [result, total] = await Promise.all([
      UserLoginLogs.aggregate(query).skip(skip).limit(limit).allowDiskUse(true), // Fetch paginated results
      UserLoginLogs.aggregate(getTotalCountQuery(filter, "user_name")), // Get total count for pagination metadata
    ]);

    // Check if there are no results.
    if (!result.length) {
      return resultResponse(
        NOT_FOUND,
        "Users name list is empty, No users found!"
      );
    }
    const totalCount = total.length > 0 ? total[0].total : 0;

    // Construct successful response with user data and pagination metadata
    return resultResponse(SUCCESS, {
      metadata: {
        total: totalCount, // Total users matching the filter
        limit, // Items per page
        page, // Current page number
        pages: Math.ceil(totalCount / limit), // Calculate total pages based on total and limit
      },
      data: result.map((user) => user.user_name), // Extract usernames from result
    });
  } catch (error) {
    // Handle any errors during the request and return a server error response
    return resultResponse(SERVER_ERROR, error.message);
  }
};

module.exports.getOlnieUserIpAddress = async function getOlnieUserIpAddress(
  request
) {
  try {
    // Destructure request for commonly used properties
    let { page, limit, search } = request.joiData;
    const skip = (page - 1) * limit; // Calculate the number of items to skip
    // Create a search filter
    const filter = search
      ? { ip_address: { $regex: search, $options: "i" } } // Case-insensitive partial match
      : {};

    filter["parent_level_ids.user_id"] = request.User._id;

    const query = getUniqueFieldQuery(filter, "ip_address");
    // Fetch usernames with pagination and filtering
    const [result, total] = await Promise.all([
      UserLoginLogs.aggregate(query).skip(skip).limit(limit).allowDiskUse(true), // Fetch paginated results
      UserLoginLogs.aggregate(getTotalCountQuery(filter, "ip_address")), // Get total count for pagination metadata
    ]);

    // Check if there are no results.
    if (!result.length) {
      return resultResponse(NOT_FOUND, "Users ip list is empty, No ip found!");
    }
    const totalCount = total.length > 0 ? total[0].total : 0;
    // Construct successful response with user data and pagination metadata
    return resultResponse(SUCCESS, {
      metadata: {
        total: totalCount, // Total users matching the filter
        limit, // Items per page
        page, // Current page number
        pages: Math.ceil(totalCount / limit), // Calculate total pages based on total and limit
      },
      data: result.map((user) => user.ip_address), // Extract usernames from result
    });
  } catch (error) {
    // Handle any errors during the request and return a server error response
    return resultResponse(SERVER_ERROR, error.message);
  }
};
async function getActivityLogs(request) {
  try {
    // Destructure request for commonly used properties

    let { page, limit, search, user_id: reqUserId, from_date, to_date } = request.joiData;

    // Determine the user ID
    const user_id = ObjectId(
      reqUserId || request.User.user_id || request.User._id,
    );

    // Determine user type ID
    const user_type_id = reqUserId
      ? request.user.user_type_id
      : request.User.user_type_id;

    // Set default page and limit if not provided
    const skip = (page - 1) * limit; // Calculate the number of items to skip

    // Build the $match filter
    let matchConditions = {};

    if (user_type_id != USER_TYPE_SUPER_ADMIN) {
      matchConditions["user_id"] = ObjectId(user_id);
      // matchConditions["parent_level_ids.user_id"] = ObjectId(user_id);
    }
    // Apply search filters for user_name and ip_address
    if (search) {
      matchConditions.$or = [];
      if (search.user_names && search.user_names != undefined) {
        if (Array.isArray(search.user_names))
          matchConditions.$or.push({ user_name: { $in: search.user_names } });
        else
          matchConditions.$or.push({ user_name: search.user_names });
      }

      if (search.ip_addresses && search.ip_addresses != undefined) {
        if (Array.isArray(search.ip_addresses))
          matchConditions.$or.push({ ip_address: { $in: search.ip_addresses } });
        else
          matchConditions.$or.push({ ip_address: search.ip_addresses });
      }

      if (search.domain_names && search.domain_names != undefined) {
        if (Array.isArray(search.domain_names))
          matchConditions.$or.push({ domain_name: { $in: search.domain_names } });
        else
          matchConditions.$or.push({ domain_name: search.domain_names });
      }
      if (search.browser_info)
        matchConditions.$or.push({ browser_info: { $regex: search.browser_info, $options: "i" } });

      if (search.login_status) {
        matchConditions.$or.push({ login_status: search.login_status });
      }

      if (from_date && to_date)
        matchConditions["login_time"] = { '$gte': new Date(from_date), '$lte': new Date(to_date) };

    }

    // Define the fields to project based on user_type_id
    let fields = {};
    if (user_type_id !== USER_TYPE_SUPER_ADMIN) {
      fields = {
        _id: 0,
        user_name: 1,
        name: 1,
        login_time: 1,
        logout_time: 1,
        ip_address: 1,
        browser_info: 1,
        geolocation: 1,
        mobile: 1,
      };
    }

    // Ensure that fields are not empty before passing to $project
    fields = Object.keys(fields).length
      ? fields
      : {
        _id: 0,
        user_id: 1,
        user_name: 1,
        name: 1,
        user_type_id: 1,
        domain_name: 1,
        login_status: 1,
        is_online: 1,
        is_demo: 1,
        message: 1,
        geolocation: 1,
        ip_address: 1,
        browser_info: 1,
        login_time: 1,
        logout_time: 1,
        mobile: 1,
      }; // Default to basic fields if empty

    // Build the aggregation query
    const query = getActivityLogsQuery(matchConditions, fields);
    // Fetch the activity logs with pagination, filtering, and sorting
    const [result, total] = await Promise.all([
      UserLoginLogs.aggregate(query).skip(skip).limit(limit).allowDiskUse(true), // Fetch paginated results
      UserLoginLogs.find(matchConditions).countDocuments(), // Get total count for pagination metadata
    ]);
    // Check if no data was returned
    if (!result.length) {
      return resultResponse(NOT_FOUND, "Users list is empty, No users found!");
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

module.exports.getActivityLogs = getActivityLogs

module.exports.getOlnieUserDomainNames = async function getOlnieUserDomainNames(request) {
  try {
    // Destructure request for commonly used properties
    let { page = 1, limit = 10, search } = request.joiData; // Default values for page and limit
    const skip = (page - 1) * limit; // Calculate the number of items to skip

    // Create a search filter
    const filter = search
      ? { domain_name: { $regex: search, $options: "i" } } // Case-insensitive partial match
      : {};

    // Execute queries concurrently: domain list with pagination and total count for metadata
    const query = getUniqueFieldQuery(filter, "domain_name");
    const [result, total] = await Promise.all([
      UserLoginLogs.aggregate(query).skip(skip).limit(limit).allowDiskUse(true), // Fetch paginated results
      UserLoginLogs.aggregate(getTotalCountQuery(filter, "domain_name")), // Get total count for pagination metadata
    ]);

    // Check if there are no results.
    if (!result.length) {
      return resultResponse(
        NOT_FOUND,
        "Domain name list is empty, No Domain found!"
      );
    }
    const totalCount = total.length > 0 ? total[0].total : 0;

    // Construct successful response with domain data and pagination metadata
    return resultResponse(SUCCESS, {
      metadata: {
        total: totalCount, // Total demains matching the filter
        limit, // Items per page
        page, // Current page number
        pages: Math.ceil(totalCount / limit), // Calculate total pages based on total and limit
      },
      data: result.map((user) => user.domain_name), // Extract doamin name from result
    });
  } catch (error) {
    // Handle any errors during the request and return a server error response
    return resultResponse(SERVER_ERROR, error.message);
  }
};


function getTotalCountQuery(filter, groupByField) {
  return [
    { $match: filter }, // Apply the provided filter
    {
      $group: {
        _id: `$${groupByField}`, // Group by the specified field
      },
    },
    {
      $count: "total", // Count the number of unique values in the group
    },
  ];
}
function getUniqueFieldQuery(filter, groupByField) {
  return [
    { $match: filter }, // Apply the search filter
    {
      $group: {
        _id: `$${groupByField}`, // Group by the specified field
      },
    },
    {
      $project: {
        _id: 0,
        [groupByField]: "$_id", // Format output to include the desired field name
      },
    },
  ];
}

function getActivityLogsQuery(matchConditions, fields) {
  return [
    { $match: matchConditions }, // Correctly apply the $match stage
    { $sort: { _id: -1 } },
    { $project: fields },
  ];
}

module.exports.getActivityLogsDocument = async function getActivityLogsDocument(request, res) {
  try {
    const { document_type } = request.body;
    const getActivityLogsRes = await getActivityLogs(request);
    if (getActivityLogsRes.statusCode != SUCCESS) {
      return getActivityLogsRes;
    }
    const list =
      Array.isArray(getActivityLogsRes?.data?.data) &&
        getActivityLogsRes.data.data.length
        ? getActivityLogsRes.data.data
        : [];
    const phead = [
      { title: "User Name" },
      { title: "Date" },
      { title: "Ip" },
    ];
    const ptextProperties = { title: "User History Data", x: 100, y: 9 };
    let columnCount = phead.length;
    const cellWidth = "auto",
      pbodyStyles = Object.fromEntries(
        phead.map((col, index) => [
          index,
          { cellWidth: col.width !== undefined ? col.width : cellWidth },
        ]),
      );
    let pbody = list
      .map((item, index) => [
        item.user_name,
        moment(item.login_time).format('DD/MM/YYYY HH:mm:ss A'), // Formatted date
        item.ip_address,
      ]);
    if (document_type == "PDF") {
      const pdfRes = await PdfDocService.createPaginatedPdf(res, {
        orientation: "p",
        ptextProperties,
        phead,
        pbody,
        pbodyStyles,
        fileName: "userHistory",
      });

      return pdfRes;
    }
    if (document_type == "CSV") {
      let data = await CsvDocService.formatExcelData(phead, pbody);
      const csvbRes = await CsvDocService.createPaginatedCsv(res, {
        data,
        fileName: "userHistory",
        columnCount: columnCount,
      });
      return csvbRes;
    }
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}
