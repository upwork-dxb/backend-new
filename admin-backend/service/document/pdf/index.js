const { jsPDF } = require("jspdf");
require("jspdf-autotable");
const logger = require("../../../../utils/loggers");
const { resultResponse } = require("../../../../utils/globalFunction");
const { SUCCESS, SERVER_ERROR } = require("../../../../utils/constants");

async function createPaginatedPdf(
  res,
  { orientation, ptextProperties, phead, pbody, pbodyStyles, fileName },
) {
  try {
    // Step 1: Initialize jsPDF instance
    const doc = new jsPDF(orientation);

    // Step 2: Add title
    const { title, x, y } = ptextProperties;
    doc.setFontSize(16);
    doc.text(title, x, y, { align: "center" });

    // Step 3: Define table headers and rows
    const tableHeaders = [phead];

    // Step 4: Generate table with custom styles
    doc.autoTable({
      startY: 14, // Position to start the table
      head: tableHeaders,
      body: pbody,
      theme: "grid",
      headStyles: {
        fillColor: [41, 128, 186], // Header background color (#2980ba)
      },
      bodyStyles: {
        halign: "left", // Center-align body text
        lineWidth: 0,
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245], // Alternate row color (#f5f5f5)
      },
      columnStyles: pbodyStyles,
    });

    const PDF = doc.output();

    // Set the response headers for file download
    res.setHeader("Content-Type", "application/pdf; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName || "report"}.pdf"`,
    );

    res.status(200).send(PDF);

    return resultResponse(SUCCESS, {
      msg: "Pdf Created Successfully",
      isDoc: true,
    });
  } catch (error) {
    // Handle any errors during the request and return a server error response
    logger.error(`Error createPaginatedPdf ${error.stack}`);
    return resultResponse(SERVER_ERROR, error.message);
  }
}

module.exports = {
  createPaginatedPdf,
};
