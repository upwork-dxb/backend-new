const mongoose = require("mongoose");
const _ = require('lodash');

const { MAX_RETRY_LIMIT, SessionResultQueueName } = require("../config");
const User = require("../../models/user");
const Fancy = require("../../models/fancy");
const Market = require("../../models/market");
const FailedBatchesLogs = require("../../models/failedBatchesLog");
const AccountStatement = require("../../models/accountStatement");
const { fixFloatingPoint } = require("../../utils");
const resultResponse = require("../../utils/globalFunction").resultResponse;
const { SUCCESS, SERVER_ERROR } = require("../../utils/constants");
const { sendMessageAlertToTelegram } = require("../../admin-backend/service/messages/telegramAlertService");
const { IS_STATEMENT_GENRATE_FOR_ZERO_SHARE } = require("../../config/constant/user");

async function SessionResultBatchProcessor(params, retryCount = 0) {
    const { id, data } = params;
    const { event_id, name } = data;
    const jobId = id;

    let returnStatusCode = SERVER_ERROR;
    let returnData = { msg: "SERVER_ERROR" };

    const session = await mongoose.startSession({
        defaultTransactionOptions: {
            readPreference: "primary",
            readConcern: { level: "majority" },
            writeConcern: { w: "majority" },
        },
    });

    try {
        await session.withTransaction(async (session) => {

            const result = await resultWorkInTransaction(params, session, retryCount);

            returnStatusCode = result.statusCode;
            returnData = result.data;

            if (result.statusCode != SUCCESS) {
                throw new Error(result.data.msg);
            }

        });

        // Pull Job Ids One Bu One
        if (name == "SessionResult") {
            await Fancy.updateOne({ fancy_id: event_id }, {
                $pull: {
                    bull_job_ids: jobId
                },
                $set: {
                    bull_job_last_updated_at: new Date(),
                }
            });
        } else if (name == "SessionRollback") {
            await Fancy.updateOne({ fancy_id: event_id }, {
                $pull: {
                    rollback_bull_job_ids: jobId
                },
                $set: {
                    rollback_bull_job_last_updated_at: new Date(),
                }
            });
        } else if (name == "MarketResult") {
            await Market.updateOne({ market_id: event_id }, {
                $pull: {
                    bull_job_ids: jobId
                },
                $set: {
                    bull_job_last_updated_at: new Date(),
                }
            });
        } else if (name == "MarketRollback") {
            await Market.updateOne({ market_id: event_id }, {
                $pull: {
                    rollback_bull_job_ids: jobId
                },
                $set: {
                    rollback_bull_job_last_updated_at: new Date(),
                }
            });
        }

        return resultResponse(returnStatusCode, {
            msg: returnData.msg,
            retryCount,
        });

    } catch (error) {

        console.error(
            "Error in SessionResultBatchProcessor: ",
            error.message,
            retryCount,
            "jobId: ",
            jobId,
        );

        if (returnStatusCode != SUCCESS) {
            if (returnData?.shouldRetry) {
                retryCount++;
                return await SessionResultBatchProcessor(params, retryCount);
            }
        }

        return resultResponse(SERVER_ERROR, {
            msg: error.message,
            retryCount,
        });
    }
}

async function resultWorkInTransaction(params, session, retryCount) {
    const newParams = _.cloneDeep(params); // Create a deep copy of params
    const { id, data } = newParams;
    const { usersArr } = data;
    const jobId = id;

    try {
        // Started
        let st = Date.now();

        const statementObjectArr = [];
        const updateObjectArr = [];
        const userFetchedObj = {};

        // Get User Ids Arr from Users Arr
        const combinedUserIds = usersArr.map((i) => i.user_id);

        // Fetch Users Balance
        const usersFetched = await User.find(
            { _id: { $in: combinedUserIds } },
            ["balance", "liability", "profit_loss"],
            { session },
        ).lean();

        // Add Users to Json User Id Wise
        usersFetched.map((i) => (userFetchedObj[i._id] = i));

        // Increment Available Balance with User Balance and
        // Push the Statement & Update Obj to Respective Arrays
        usersArr.map(({ user_id, user_type_id, statementObj, updateObj, statementObjComm }) => {
            // Get Users Balance
            const { balance, liability, profit_loss } = userFetchedObj[user_id];

            const p_l = user_type_id == 1 ? 0 : profit_loss;
            const dbCalculated = balance + Math.abs(liability) + p_l;

            // Increment Available Balance with User Balance
            statementObj.available_balance = fixFloatingPoint(
                dbCalculated + statementObj.available_balance
            );

            // Push to Respective Array's
            if (statementObj.amount != 0 ||
                IS_STATEMENT_GENRATE_FOR_ZERO_SHARE) {
                statementObjectArr.push(statementObj);
            }
            updateObjectArr.push(updateObj);

            if (statementObjComm) {
                // Increment Available Balance with User Balance
                statementObjComm.available_balance = fixFloatingPoint(
                    dbCalculated + statementObjComm.available_balance,
                );
                if (statementObjComm.amount != 0 ||
                    IS_STATEMENT_GENRATE_FOR_ZERO_SHARE) {
                    statementObjectArr.push(statementObjComm);
                }
            }
        });

        await Promise.all([
            User.bulkWrite(updateObjectArr, { session }),
            AccountStatement.insertMany(statementObjectArr, { session }),
        ]);

        console.log(
            "SessionResultBatchProcessor, Time Takes: ",
            Date.now() - st,
            "ms",
        );

        if (retryCount != 0) {
            console.log(
                "SessionResultBatchProcessor, Retrying, retryCount: ",
                retryCount,
                "jobId: ",
                jobId,
            );
        }

        return resultResponse(SUCCESS, { msg: "Result/Rollback Successfully..", });
    } catch (error) {
        console.error(
            "Error in resultWorkInTransaction: ",
            error.message,
            retryCount,
            "jobId: ",
            jobId,
        );

        let shouldRetry = false;

        retryCount++;
        if (retryCount < MAX_RETRY_LIMIT) {
            shouldRetry = true;
        }

        return resultResponse(SERVER_ERROR, {
            msg: error.message,
            retryCount,
            shouldRetry,
        });

    }
}

async function InsertFailedJob(job) {
    // Called whenever a job is moved to failed by any worker.
    const { id, data, failedReason, stacktrace, opts, attemptsStarted } = job;

    if (opts.attempts != attemptsStarted) {
        return;
    }

    console.error("Worker Failed: ", id, failedReason);
    // console.log(JSON.stringify(job))

    const failedBatch = new FailedBatchesLogs({
        queue_name: SessionResultQueueName,
        failed_reason: failedReason,
        job_id: id,
        error_stack: stacktrace.toString(),
        batch_data: data,
    });

    const message = `queue_name: ${SessionResultQueueName},\nfailed_reason: ${failedReason},\njob_id: ${id},\n`
    sendMessageAlertToTelegram({ message, chatType: "ResultDeclare" });

    await failedBatch.save();
}

module.exports = {
    SessionResultBatchProcessor,
    InsertFailedJob,
};
