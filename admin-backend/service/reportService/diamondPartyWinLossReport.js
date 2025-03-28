const { ObjectId } = require("bson");
const moment = require("moment");
const User = require("../../../models/user");
const utils = require("../../../utils");
const logger = require("../../../utils/loggers");
const { resultResponse } = require("../../../utils/globalFunction");
const {
  SUCCESS,
  NOT_FOUND,
  SERVER_ERROR,
  VALIDATION_ERROR,
} = require("../../../utils/constants");
const PdfDocService = require("../document/pdf/index");
const XlsxDocService = require("../document/xlsx/index");
const CsvDocService = require("../document/csv");

// Retrieves party win loss report aggregation.
async function partywinLossReport(req) {
  const startTime = moment(); // Start timer for execution time measurement
  const LOG_REF_CODE = utils.generateUUID(); // Unique log reference for this operation

  try {
    const { page, limit } = req.joiData;

    const [data, totalCount] = await Promise.all([
      User.aggregate(userQuery(req)).allowDiskUse(true),
      User.aggregate(userQuery(req, true)),
    ]);

    if (!data.length) {
      return resultResponse(VALIDATION_ERROR, { msg: "No Data Found !!" });
    }

    const { usersData, totalData } = data[0];

    const total = totalCount[0]?.usersCount || 0;
    const executionTime = utils.getTimeTaken({ startTime }); // Calculate the time taken
    logger.info(
      `${LOG_REF_CODE} prtwinLossReport Execution Time: ${executionTime}`, // Log execution time
    );

    return resultResponse(SUCCESS, {
      msg: "Data Fetched Successfully",
      data: [...usersData, ...totalData],
      metadata: {
        total, // Total users matching the filter
        limit, // Items per page
        page, // Current page number
        pages: Math.ceil(total / limit), // Calculate total pages based on total and limit
      },
    });
  } catch (error) {
    // Log the error and return a server error response
    logger.error(`${LOG_REF_CODE} Error ptsReport ${error.stack}`);
    return resultResponse(SERVER_ERROR, { msg: error.message });
  }
}

module.exports.partywinLossReport = partywinLossReport;

function userQuery(req, isCount = false) {
  const { User } = req; // Extract the user object
  const user_id = ObjectId(User.user_id);
  const { filter_type, user_name, page, limit } = req.joiData;
  const skip = (page - 1) * limit;

  let filter = {
    $and: [
      {
        $or: [
          { _id: user_id }, // Match the user's unique ID
          { "parent_level_ids.user_id": user_id }, // Match users by parent ID
        ],
      },
    ],
  };
  if (filter_type) {
    filter.user_type_id = filter_type;
  }
  if (user_name) {
    filter.$and.push({
      $or: [
        { user_name: { $regex: user_name, $options: "i" } },
        { name: { $regex: user_name, $options: "i" } },
        { title: { $regex: user_name, $options: "i" } },
      ],
    });
  }

  if (isCount) {
    return [
      {
        $match: filter,
      },
      {
        $count: "usersCount",
      },
    ];
  }

  return [
    {
      $match: filter,
    },
    {
      $sort: {
        _id: 1,
      },
    },
    {
      $facet: {
        usersData: [
          {
            $project: {
              _id: 0,
              name: 1,
              user_name: 1,
              user_type_id: 1,
              title: 1,
              sport_pl: {
                $ifNull: [
                  {
                    $round: ["$sport_pl", 2],
                  },
                  0,
                ],
              },
              casino_pl: {
                $ifNull: [
                  {
                    $round: ["$casino_pl", 2],
                  },
                  0,
                ],
              },
              third_party_pl: {
                $ifNull: [
                  {
                    $round: ["$third_party_pl", 2],
                  },
                  0,
                ],
              },
              profit_loss_pl: {
                $ifNull: [
                  {
                    $round: [
                      { $sum: ["$sport_pl", "$casino_pl", "third_party_pl"] },
                      2,
                    ],
                  },
                  0,
                ],
              },
              ptype: "Partnership With No",
            },
          },
          {
            $skip: skip,
          },
          {
            $limit: limit,
          },
        ],
        totalData: [
          {
            $group: {
              _id: null,
              casino_pl: { $sum: "$casino_pl" },
              sport_pl: { $sum: "$sport_pl" },
              third_party_pl: { $sum: "$third_party_pl" },
              profit_loss_pl: {
                $sum: { $sum: ["$sport_pl", "$casino_pl", "$third_party_pl"] },
              },
            },
          },
          {
            $project: {
              _id: 0,
              sport_pl: { $round: ["$sport_pl", 2] },
              casino_pl: { $round: ["$casino_pl", 2] },
              third_party_pl: { $round: ["$third_party_pl", 2] },
              profit_loss_pl: { $round: ["$profit_loss_pl", 2] },
            },
          },
        ],
      },
    },
    {
      $project: {
        usersData: 1,
        totalData: 1,
      },
    },
  ];
}

// Retrieves party win loss report aggregation from user profit loss.
module.exports.prtwinLossReport = async (req) => {
  const startTime = moment(); // Start timer for execution time measurement
  const LOG_REF_CODE = utils.generateUUID(); // Unique log reference for this operation

  try {
    const query = Query(req); // Generate the aggregation query

    let result = await User.aggregate(query);

    if (!Object.keys(result).length) {
      return resultResponse(SUCCESS, {
        data: {
          casino: 0,
          sports: 0,
          third_party: 0,
        },
      });
    }

    const executionTime = utils.getTimeTaken({ startTime }); // Calculate the time taken
    logger.info(
      `${LOG_REF_CODE} prtwinLossReport Execution Time: ${executionTime}`, // Log execution time
    );

    result = {
      result,
    };
    return resultResponse(SUCCESS, { data: result });
  } catch (error) {
    // Log the error and return a server error response
    logger.error(`${LOG_REF_CODE} Error ptsReport ${error.stack}`);
    return resultResponse(SERVER_ERROR, { msg: error.message });
  }
};

function Query(req) {
  const { user } = req; // Extract the user object
  return [
    {
      $match: {
        $or: [
          { _id: ObjectId(user.user_id) }, // Match the user's unique ID
          { parent_id: ObjectId(user.user_id) }, // Match users by parent ID
        ],
      },
    },
    {
      $lookup: {
        from: "user_profit_loss", // The name of the profit/loss collection
        localField: "_id", // Field in the users collection
        foreignField: "user_id", // Field in the user_profit_loss collection
        as: "profit_loss_details", // The name of the resulting array
      },
    },
    {
      $unwind: {
        path: "$profit_loss_details",
        preserveNullAndEmptyArrays: true, // Keeps users even if they have no profit/loss records
      },
    },
    {
      $group: {
        _id: "$_id", // Group by user ID
        name: { $first: "$user_name" }, // Include user's user_name
        role: { $first: "$user_type_id" }, // Include user's user_type_id
        profit_loss_details: { $push: "$profit_loss_details" }, // Keep all profit/loss details
        total_pl: { $sum: "$profit_loss_details.user_pl" }, // Sum up all profits
        sport_pl: {
          $sum: {
            $cond: [
              {
                $in: [
                  "$profit_loss_details.sport_id",
                  ["4", "1", "2", "7", "4339"],
                ],
              },
              "$profit_loss_details.user_pl",
              0,
            ],
          },
        },
        casino_pl: {
          $sum: {
            $cond: [
              { $in: ["$profit_loss_details.sport_id", ["-100"]] },
              "$profit_loss_details.user_pl",
              0,
            ],
          },
        },
        other_pl: {
          $sum: {
            $cond: [
              { $in: ["$profit_loss_details.sport_id", ["QT"]] },
              "$profit_loss_details.user_pl",
              0,
            ],
          },
        },
      },
    },
    {
      $project: {
        _id: 1,
        name: 1,
        role: 1,
        total_pl: 1,
        sport_pl: 1,
        casino_pl: 1,
        other_pl: 1,
      },
    },
    {
      $sort: { total_pl: -1 }, // Sort by net profit/loss in descending order
    },
  ];
}

module.exports.partywinLossReportDocument = async (req, res) => {
  try {
    const { document_type } = req.body;
    const partywinLossReportRes = await partywinLossReport(req);
    if (partywinLossReportRes.statusCode != SUCCESS) {
      return partywinLossReportRes;
    }

    const list =
      Array.isArray(partywinLossReportRes?.data?.data) &&
        partywinLossReportRes.data.data.length
        ? partywinLossReportRes.data.data
        : [];
    const phead = [
      { title: "No" },
      { title: "User Name" },
      { title: "Level" },
      { title: "Casino Pts" },
      { title: "Sport Pts" },
      { title: "Third Party Pts" },
      { title: "Profit/Loss" },
      { title: "Ptype" },
    ];
    const ptextProperties = { title: "Party Profit Loss", x: 98, y: 9 };
    let columnCount = phead.length;
    const cellWidth = "auto",
      pbodyStyles = Object.fromEntries(
        phead.map((col, index) => [
          index,
          { cellWidth: col.width !== undefined ? col.width : cellWidth },
        ]),
      );
    let pbody = list
      .slice(0, list.length - 1)
      .map((item, index) => [
        index + 1,
        item.user_name,
        item.title,
        item.casino_pl,
        item.sport_pl,
        item.third_party_pl,
        item.profit_loss_pl,
        item.ptype,
      ]);

    let lastItem = list[list.length - 1];
    pbody.push([
      "",
      "",
      "",
      lastItem.casino_pl,
      lastItem.sport_pl,
      lastItem.third_party_pl,
      lastItem.profit_loss_pl,
      "",
    ]);
    if (document_type == "PDF") {
      const pdfRes = await PdfDocService.createPaginatedPdf(res, {
        orientation: "p",
        ptextProperties,
        phead,
        pbody,
        pbodyStyles,
        fileName: "Party Profit Loss",
      });

      return pdfRes;
    }
    if (document_type == "EXCEL") {
      let data = await CsvDocService.formatExcelData(phead, pbody);
      const xlsxRes = await XlsxDocService.createPaginatedlsx(res, {
        data,
        fileName: "partyWinLoss",
        columnCount: columnCount,
      });
      return xlsxRes;
    }
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
};
