const { Queue } = require("bullmq");
const { connection, SessionResultQueueName, FAILED_JOB_MAX_ATTEMPTS } = require("./config");

// Create a new connection in every instance
const SessionResultQueue = new Queue(SessionResultQueueName, {
  connection: {
    ...connection,
    enableOfflineQueue: false,
  },
  defaultJobOptions: {
    attempts: FAILED_JOB_MAX_ATTEMPTS,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

module.exports = {
  SessionResultQueue,
};
