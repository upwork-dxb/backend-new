const fs = require("fs");
const { parse } = require("json2csv");
const logger = require("../../../../utils/loggers");
const { resultResponse } = require("../../../../utils/globalFunction");
const { SUCCESS, SERVER_ERROR, BAD_REQUEST } = require("../../../../utils/constants");

async function createPaginatedCsv(res, { data, fileName, columnCount }) {
  try {
    // Check if data is valid
    if (!data || !Array.isArray(data) || data.length === 0) {
      logger.error("Error: Data is undefined or empty.");
      return res.status(400).send(resultResponse(BAD_REQUEST, "Invalid data provided"));
    }

    // Convert object titles into an array of column headers
    const headers = data.slice(0, columnCount).map(item => item.title);

    // Extract the remaining rows
    const rows = data.slice(columnCount);

    // Final structured data
    const formattedData = [headers, ...rows];

    // Convert data to CSV format
    const csvData = formattedData.map(row => row.join(",")).join("\n");

    // Set response headers for CSV file download
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName || "report"}.csv"`
    );

    // Send CSV data as response
    res.status(200).send(csvData);

    return resultResponse(SUCCESS, {
      msg: "CSV Created Successfully",
      isDoc: true,
    });
  } catch (error) {
    // Handle any errors during the request and return a server error response
    logger.error(`Error createPaginatedCsv ${error.stack}`);
    return res.status(500).send(resultResponse(SERVER_ERROR, error.message));
  }
}

async function formatExcelData(headers, rows) {
  let formattedRows = Array.isArray(rows)
    ? rows.map(row => (Array.isArray(row) ? row : Object.values(row)))
    : [];

  return headers.concat(formattedRows);
}

module.exports = {
  createPaginatedCsv,
  formatExcelData
};
