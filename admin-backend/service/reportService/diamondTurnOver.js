const { ObjectId } = require("bson");
const moment = require("moment");
const BetsOdds = require("../../../models/betsOdds");
const BetsFancy = require("../../../models/betsFancy");
const LotusBets = require("../../../models/lotusBets");
const utils = require("../../../utils");
const logger = require("../../../utils/loggers");
const { resultResponse } = require("../../../utils/globalFunction");
const {
  SUCCESS,
  NOT_FOUND,
  SERVER_ERROR,
  USER_TYPE_USER,
} = require("../../../utils/constants");
const PdfDocService = require('../document/pdf/index');
const CsvDocService = require("../document/csv");

// Retrieves a paginated list of users with specific filtering and aggregation.
async function turnover(req) {
  // **Start timer to measure execution time:**
  const startTime = moment();

  // **Generate a unique log reference code for this operation:**
  const LOG_REF_CODE = utils.generateUUID();

  try {
    // **Construct the query object based on request parameters:**
    const query = Query(req);

    // **Attach the constructed query to the request object:**
    req.query = query;

    // **Execute the model operation with the query and retrieve the first result:**
    const result = (await Model(req))[0];

    // **Calculate the total turnover by summing all values in the result object:**
    const sum = Object.values(result).reduce(
      (accumulator, currentValue) => accumulator + currentValue,
      0,
    );

    // **Handle no records found scenario:**
    if (!sum) {
      return resultResponse(NOT_FOUND, "There are no records to show");
    }

    // **Calculate the time taken for the operation:**
    const executionTime = utils.getTimeTaken({ startTime });

    // **Log the execution time with the log reference code:**
    logger.info(`${LOG_REF_CODE} turnover Execution Time: ${executionTime}`);

    // **Return successful response with the result data:**
    return resultResponse(SUCCESS, { data: result });
  } catch (error) {
    // **Log the error with the log reference code and stack trace:**
    logger.error(`${LOG_REF_CODE} Error turnover ${error.stack}`);

    // **Return server error response with the error message:**
    return resultResponse(SERVER_ERROR, error.message);
  }
}

module.exports.turnover = turnover;

async function Model(req) {
  // Destructure the 'type' property from the request's Joi validated data.
  const { type } = req.joiData;

  // Declare a variable to hold the appropriate Mongoose model.
  let Model;

  // Determine which model to use based on the 'type' value.
  switch (type) {
    case "market":
      // If type is "market", use the BetsOdds model.
      Model = BetsOdds;
      break;
    case "fancy":
      // If type is "fancy", use the BetsFancy model.
      Model = BetsFancy;
      break;
    case "casino":
      // If type is "casino", use the LotusBets model.
      Model = LotusBets;
      break;
    default:
      // If type is anything else (or not provided), default to the BetsOdds model.
      Model = BetsOdds;
      break;
  }

  // Execute the aggregation query on the selected model using the provided query from the request.
  // allowDiskUse(true) is used to allow MongoDB to use disk space for larger aggregations.
  const result = await Model.aggregate(req.query).allowDiskUse(true);

  // Return the result of the aggregation.
  return result;
}

function Filter(req) {
  const { from_date, to_date, type, search } = req.joiData;
  var { user_id } = req.joiData;
  const { User: Self, user: Child } = req;
  const isSearch = user_id;
  var user_id = ObjectId(isSearch || Self.user_id || Self._id);
  var user_type_id = isSearch ? Child.user_type_id : Self.user_type_id;
  let filter = {};

  const isCasino = type == "casino";
  if (isCasino) {
    filter[(user_type_id == USER_TYPE_USER) ? "user_id" : "parentLevels.user_id"] = user_id;
    filter["isProcessed"] = 1;
  } else {
    filter[(user_type_id == USER_TYPE_USER) ? "user_id" : "parents.user_id"] = user_id;
    filter["is_result_declared"] = 1;
  }

  filter["createdAt"] = { $gte: new Date(from_date), $lte: new Date(to_date) };

  if (search) {
    Object.assign(filter, search);
  }

  return filter;
}

function Query(req) {
  const filter = Filter(req);
  const { type } = req.joiData;
  const isCasino = type == "casino";
  const stack = isCasino ? "$stake" : "$stack";
  const chips = "$chips";
  return [
    { $match: filter },
    {
      $facet: {
        losses: [
          { $match: { chips: { $lt: 0 } } },
          {
            $group: {
              _id: null,
              loss_turn_over: { $sum: stack },
              loss: { $sum: chips },
            },
          },
        ],
        wins: [
          { $match: { chips: { $gt: 0 } } },
          {
            $group: {
              _id: null,
              win_turn_over: { $sum: stack },
              win: { $sum: chips },
            },
          },
        ],
        totals: [
          {
            $group: {
              _id: null,
              total_turn_over: { $sum: stack },
              total_pl: { $sum: chips },
            },
          },
        ],
      },
    },
    {
      $project: {
        _id: 0,
        loss_turn_over: {
          $ifNull: [
            {
              $round: [
                {
                  $arrayElemAt: ["$losses.loss_turn_over", 0],
                },
                2,
              ],
            },
            0,
          ],
        },
        loss: {
          $ifNull: [
            {
              $round: [
                {
                  $arrayElemAt: ["$losses.loss", 0],
                },
                2,
              ],
            },
            0,
          ],
        },
        win_turn_over: {
          $ifNull: [
            {
              $round: [
                {
                  $arrayElemAt: ["$wins.win_turn_over", 0],
                },
                2,
              ],
            },
            0,
          ],
        },
        win: {
          $ifNull: [
            {
              $round: [{ $arrayElemAt: ["$wins.win", 0] }, 2],
            },
            0,
          ],
        },
        total_turn_over: {
          $ifNull: [
            {
              $round: [
                {
                  $arrayElemAt: ["$totals.total_turn_over", 0],
                },
                2,
              ],
            },
            0,
          ],
        },
        total_pl: {
          $ifNull: [
            {
              $round: [
                {
                  $arrayElemAt: ["$totals.total_pl", 0],
                },
                2,
              ],
            },
            0,
          ],
        },
      },
    },
  ];
}

module.exports.turnoverDocument = async (req, res) => {
  try {
    const { document_type } = req.body;
    const turnoverRes = await turnover(req);
    if (turnoverRes.statusCode != SUCCESS) {
      return turnoverRes;
    }
    let turnoverResData = []
    if (turnoverRes?.data?.data)
      turnoverResData.push(turnoverRes?.data?.data);

    const list =
      Array.isArray(turnoverResData) &&
        turnoverResData.length
        ? turnoverResData
        : [];
    const phead = [
      { title: "Loss Turn Over" },
      { title: "Loss" },
      { title: "Win Turn Over" },
      { title: "Win" },
      { title: "Total Turn Over" },
      { title: "Total P/L" },
    ];
    const ptextProperties = { title: "Turnover Report", x: 155, y: 9 };
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
        item.loss_turn_over,
        item.loss,
        item.win_turn_over,
        item.win,
        item.total_turn_over,
        item.total_pl,
      ]);
    if (document_type == "PDF") {
      const pdfRes = await PdfDocService.createPaginatedPdf(res, {
        orientation: "l",
        ptextProperties,
        phead,
        pbody,
        pbodyStyles,
        fileName: "turnoverreport",
      });

      return pdfRes;
    }
    if (document_type == "CSV") {
      let data = await CsvDocService.formatExcelData(phead, pbody);
      const csvbRes = await CsvDocService.createPaginatedCsv(res, {
        data,
        fileName: "turnoverreport",
        columnCount: columnCount,
      });
      return csvbRes;
    }
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
};
