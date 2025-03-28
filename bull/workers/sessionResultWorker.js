const { Worker } = require("bullmq");
const {
  connection,
  SessionResultQueueName,
} = require("../config");
const { SessionResultBatchProcessor, InsertFailedJob } = require("../services/sessionResultService");
const { SUCCESS, SERVER_ERROR } = require("../../utils/constants");
const { BULL_WORKER_CONCURRENCY } = require("../../config/constant/result");


const SessionResultWorker = new Worker(
  SessionResultQueueName,
  async (job) => {
    try {
      // console.log("Job started: ", "jobId: ", job.id);

      const response = await SessionResultBatchProcessor(
        {
          id: job.id,
          data: job.data,
        },
        0,
      );

      if (response.statusCode == SUCCESS) {
        // Success
        // console.log("Job Ended: ", "jobId: ", job.id, response);
        return response.data;
      } else {
        // Failure
        // console.log(response);
        throw new Error(response.data.msg);
      }
    } catch (error) {
      console.error("Error in Worker: ", "jobId: ", job.id, error);
      throw new Error(error);
    }
  },
  {
    connection,
    // autorun: false,
    concurrency: BULL_WORKER_CONCURRENCY,
    removeOnComplete: {
      count: 10, // keep up to 10 jobs
    },
  },
);

SessionResultWorker.on("completed", (job) => {
  // Called every time a job is completed by any worker.
  // console.log("Worker completed: ", job.id);
});

SessionResultWorker.on("failed", InsertFailedJob);

module.exports = {
  SessionResultWorker,
};
