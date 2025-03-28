const XLSX = require("xlsx");
const logger = require("../../../../utils/loggers");
const { resultResponse } = require("../../../../utils/globalFunction");
const { SUCCESS, SERVER_ERROR, BAD_REQUEST } = require("../../../../utils/constants");

async function createPaginatedlsx(res, { data, fileName, columnCount }) {
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
    // Create a new workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(formattedData);

    // Add the worksheet to the workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

    // Write the workbook to a buffer
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xls" });

    // Set the response headers for file download
    res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName || "report"}.xls"`
    );

    // Send the buffer as a response
    res.status(200).send(buffer);

    return resultResponse(SUCCESS, {
      msg: "XLSX Created Successfully",
      isDoc: true,
    });
  } catch (error) {
    // Handle any errors during the request and return a server error response
    logger.error(`Error createPaginatedlsx ${error.stack}`);
    return res.status(500).send(resultResponse(SERVER_ERROR, error.message));
  }
}

module.exports = {
  createPaginatedlsx,
};
