const { SessionResultQueueName } = require("../../bull/config");
const { SessionResultBatchProcessor } = require("../../bull/services/sessionResultService");
const FailedBatchesLog = require("../../models/failedBatchesLog");
const resultResponse = require("../../utils/globalFunction").resultResponse;
const { SUCCESS, NOT_FOUND, SERVER_ERROR } = require("../../utils/constants");

async function getBatchesList(req) {
  try {
    let { batch_id, job_id, queue_name, status, page, limit } = req.joiData;

    limit = parseInt(limit || 50, 10); // Default to 50 items per page
    page = parseInt(page || 1, 10); // Default to page 1 if not specified
    const skip = (page - 1) * limit; // Calculate the number of items to skip

    let filter = {
      status: { $ne: 'SUCCESS' },
    };

    if (queue_name) {
      filter.queue_name = queue_name;
    }
    if (batch_id) {
      filter._id = batch_id;
    }
    if (status) {
      filter.status = status;
    }
    if (job_id) {
      filter.job_id = job_id;
    }

    // Execute queries concurrently: batch list with pagination and total count for metadata
    const [result, total] = await Promise.all([
      FailedBatchesLog.find(filter)
        .select({ batch_data: 0 })
        .skip(skip)
        .limit(limit)
        .lean(), // Fetch paginated results
      FailedBatchesLog.count(filter), // Get total count for pagination metadata
    ]);

    // Check if there are no results.
    if (!result.length) {
      return resultResponse(NOT_FOUND, {
        msg: "Batch list is empty, No batch found!",
      });
    }

    // Construct successful response with batch data and pagination metadata
    return resultResponse(SUCCESS, {
      data: {
        metadata: {
          total, // Total batch matching the filter
          limit, // Items per page
          page, // Current page number
          pages: Math.ceil(total / limit), // Calculate total pages based on total and limit
        },
        data: result, // Paginated batch list
      },
    });
  } catch (error) {
    return resultResponse(SERVER_ERROR, { msg: error.message });
  }
}

async function processBatch(req) {
  try {
    let { batch_ids } = req.joiData;

    const response = [];

    for (const batch_id of batch_ids) {
      const batch = await FailedBatchesLog.findOne({ _id: batch_id })
        .lean();

      const resInner = {
        id: batch_id,
        job_id: batch?.job_id,
        response: {},
      }
      // Check if there are no results.
      if (!batch) {
        resInner.response = resultResponse(NOT_FOUND, {
          msg: "No batch found!",
        });
        response.push(resInner);
        continue;
      }

      const { queue_name, batch_data, job_id, status } = batch;

      if (status != "FAILED") {
        resInner.response = resultResponse(NOT_FOUND, {
          msg: "Batch Status is not FAILED",
        });
        response.push(resInner);
        continue;
      }

      if (queue_name == SessionResultQueueName) {
        // Process
        let status = "PROCESSING";
        await FailedBatchesLog.updateOne({ _id: batch_id }, { $set: { status } })

        const result = await SessionResultBatchProcessor({ id: job_id, data: batch_data });

        let expire_at;
        if (result.statusCode == SUCCESS) {
          status = "SUCCESS";
          expire_at = new Date(); // Current date
          expire_at.setDate(expire_at.getDate() + 7); // Add 7 day
        } else {
          status = "FAILED";
        }

        await FailedBatchesLog.updateOne({ _id: batch_id }, { $set: { status, expire_at } })

        resInner.response = result

        response.push(resInner);
        continue;
      } else {
        resInner.response = resultResponse(NOT_FOUND, {
          msg: `Batch with queue_name: ${queue_name} can't be processed`,
        });
        response.push(resInner);
        continue;
      }
    }

    return resultResponse(SUCCESS, { msg: "Processed", data: response })
  } catch (error) {
    return resultResponse(SERVER_ERROR, { msg: error.message });
  }
}

module.exports = {
  getBatchesList,
  processBatch,
};
