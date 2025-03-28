const getCurrentLine = require("get-current-line");
const { ObjectId } = require("bson");

const User = require("../../../models/user");
const BetsFancy = require("../../../models/betsFancy");
const BetsOdds = require("../../../models/betsOdds");

const logger = require("../../../utils/loggers");
const {
  SUCCESS,
  SERVER_ERROR,
  LIVE_SPORTS,
  RACING_SPORTS,
} = require("../../../utils/constants");
const { fixFloatingPoint } = require("../../../utils");
const { resultResponse } = require("../../../utils/globalFunction");
const {
  BET_FANCY_FETCH_BATCH_SIZE,
  BET_FANCY_UPDATE_BATCH_SIZE,
  BET_ODDS_FETCH_BATCH_SIZE,
  BET_ODDS_UPDATE_BATCH_SIZE,
} = require("../../../config/constant/result");

async function processBetFancyInBatches(params) {
  const { match_id, fancy_id, bet_result_id, result, LOG_REF_CODE } = params;
  try {
    const winnerFilter = {
      match_id,
      fancy_id,
      $or: [
        {
          $and: [{ is_back: { $eq: 1 } }, { run: { $lte: result } }],
        },
        {
          $and: [{ is_back: { $eq: 0 } }, { run: { $gt: result } }],
        },
      ],
    };
    const loserFilter = {
      match_id,
      fancy_id,
      $or: [
        {
          $and: [{ is_back: { $eq: 1 } }, { run: { $gt: result } }],
        },
        {
          $and: [{ is_back: { $eq: 0 } }, { run: { $lte: result } }],
        },
      ],
    };

    const winnerUpdate = {
      $set: {
        bet_result_id: ObjectId(bet_result_id),
        chips: "$profit",
        is_result_declared: 1,
        result: result,
        result_settled_at: new Date(),
      },
    };
    const loserUpdate = {
      $set: {
        bet_result_id: ObjectId(bet_result_id),
        chips: "$liability",
        is_result_declared: 1,
        result: result,
        result_settled_at: new Date(),
      },
    };

    let st0 = Date.now();

    logger.SessionResultRollBack(`processBetFancyInBatches: ${LOG_REF_CODE}
        STAGE: 'Started_processBetFancyInBatches'
        Params: ${JSON.stringify(params)}
      `);

    await Promise.all([
      betFancyBatchHelper({
        filter: winnerFilter,
        update: [winnerUpdate],
        LOG_REF_CODE,
      }),
      betFancyBatchHelper({
        filter: loserFilter,
        update: [loserUpdate],
        LOG_REF_CODE,
      }),
    ]);

    logger.SessionResultRollBack(`processBetFancyInBatches: ${LOG_REF_CODE}
        STAGE: 'End_processBetFancyInBatches'
        TimeTaken: ${Date.now() - st0} ms
      `);

    return resultResponse(SUCCESS, { msg: "processBetFancyInBatches Success" });
  } catch (error) {
    console.error("Error in processBetFancyInBatches: ", error);
    logger.SessionResultRollBack(`processBetFancyInBatches: ${LOG_REF_CODE}
        STAGE: 'CATCH_BLOCK_processBetFancyInBatches'
        Error: ${JSON.stringify(error)}
        Error_Stack: ${JSON.stringify(error.stack)}
      `);
    return resultResponse(SERVER_ERROR, { msg: error.message });
  }
}

async function betFancyBatchHelper(params) {
  const { filter, update, LOG_REF_CODE } = params;
  const fetchBatchSize = BET_FANCY_FETCH_BATCH_SIZE;
  const processBatchSize = BET_FANCY_UPDATE_BATCH_SIZE;

  logger.SessionResultRollBack(`betFancyBatchHelper: ${LOG_REF_CODE}
      STAGE: 'Started_betFancyBatchHelper'
      Params: ${JSON.stringify(params)}
    `);

  let ids = await BetsFancy.find(filter, { _id: 1 })
    .limit(fetchBatchSize)
    .sort({ _id: 1 })
    .lean()
    .exec();

  if (!ids.length) return;

  let shouldRun = true;
  let lastId = ids[ids.length - 1]._id;
  ids = ids.map(({ _id }) => _id);

  while (shouldRun) {
    // console.log("ids.length: ", ids.length);
    if (ids.length < processBatchSize) {
      const query = { _id: { $gt: ObjectId(lastId) }, ...filter };
      const newIds = await BetsFancy.find(query, { _id: 1 })
        .limit(fetchBatchSize)
        .sort({ _id: 1 })
        .lean()
        .exec();

      if (!ids.length && !newIds.length) break;

      if (newIds.length) {
        ids.push(...newIds.map(({ _id }) => _id));
        lastId = newIds[newIds.length - 1]._id;
      }
    }

    const batchIds = ids.splice(0, processBatchSize);
    if (!batchIds.length) break;

    logger.SessionResultRollBack(`betFancyBatchHelper: ${LOG_REF_CODE}
        STAGE: 'Running_Update_betFancyBatchHelper'
        Length: ${batchIds.length}
      `);

    await BetsFancy.updateMany({ _id: { $in: batchIds } }, update);
  }
}

async function processBetOddsInBatches(params) {
  const {
    match_id,
    market_id,
    selection_id,
    selection_ids,
    selection_name,
    bet_result_id,
    is_tbp,
    LOG_REF_CODE,
  } = params;

  try {
    const queries = [
      {
        query: {
          match_id,
          market_id,
          selection_id: is_tbp
            ? {
              $in: selection_id
                .toString()
                .split(",")
                .map((i) => parseInt(i)),
            }
            : selection_id,
          result: -11111,
          is_matched: 1,
        },
        update: {
          $set: {
            result: { $cond: [{ $eq: ["$is_back", 0] }, 0, 1] },
            chips: { $cond: [{ $eq: ["$is_back", 0] }, "$liability", "$p_l"] },
          },
        },
      },
      {
        query: {
          match_id,
          market_id,
          selection_id: { $in: selection_ids },
          result: -11111,
          is_matched: 1,
        },
        update: {
          $set: {
            result: { $cond: [{ $eq: ["$is_back", 0] }, 0, 1] },
            chips: {
              $cond: [{ $eq: ["$is_back", 0] }, "$stack", "$stack_inverse"],
            },
          },
        },
      },
      {
        query: {
          match_id,
          market_id,
          result: -11111,
          is_matched: 0,
        },
        update: {
          $set: {
            result: -1,
            chips: 0,
          },
        },
      },
      {
        query: {
          match_id,
          market_id,
          is_matched: 0,
          delete_status: 0,
        },
        update: {
          $set: {
            delete_status: 2,
            deleted_reason: "Void Un Matched Bets after Result.",
          },
        },
      },
      {
        query: {
          match_id,
          market_id,
        },
        update: {
          $set: {
            bet_result_id: ObjectId(bet_result_id),
            winner_name: selection_name,
            user_pl: "$chips",
            is_result_declared: 1,
            result_settled_at: new Date(),
          },
        },
      },
    ];

    let st0 = Date.now();

    logger.SessionResultRollBack(`processBetOddsInBatches: ${LOG_REF_CODE}
        STAGE: 'Started_processBetOddsInBatches'
        Params: ${JSON.stringify(params)}
      `);

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      console.log("Running Query:", i);
      await betOddsBatchHelper({
        filter: query.query,
        update: [query.update],
        LOG_REF_CODE,
      });
    }

    logger.SessionResultRollBack(`processBetOddsInBatches: ${LOG_REF_CODE}
      STAGE: 'End_processBetOddsInBatches'
      TimeTaken: ${Date.now() - st0} ms
    `);

    return resultResponse(SUCCESS, { msg: "processBetOddsInBatches Success" });
  } catch (error) {
    console.error("Error in processBetOddsInBatches: ", error);
    logger.SessionResultRollBack(`processBetOddsInBatches: ${LOG_REF_CODE}
        STAGE: 'CATCH_BLOCK_processBetOddsInBatches'
        Error: ${JSON.stringify(error)}
        Error_Stack: ${JSON.stringify(error.stack)}
      `);
    return resultResponse(SERVER_ERROR, { msg: error.message });
  }
}

async function betOddsBatchHelper(params) {
  const { filter, update, LOG_REF_CODE } = params;
  const fetchBatchSize = BET_ODDS_FETCH_BATCH_SIZE;
  const processBatchSize = BET_ODDS_UPDATE_BATCH_SIZE;

  logger.SessionResultRollBack(`betOddsBatchHelper: ${LOG_REF_CODE}
      STAGE: 'Started_betOddsBatchHelper'
      Params: ${JSON.stringify(params)}
    `);

  let ids = await BetsOdds.find(filter, { _id: 1 })
    .limit(fetchBatchSize)
    .sort({ _id: 1 })
    .lean()
    .exec();

  if (!ids.length) return;

  let shouldRun = true;
  let lastId = ids[ids.length - 1]._id;
  ids = ids.map(({ _id }) => _id);

  while (shouldRun) {
    // console.log("ids.length: ", ids.length);
    if (ids.length < processBatchSize) {
      const query = { _id: { $gt: ObjectId(lastId) }, ...filter };
      const newIds = await BetsOdds.find(query, { _id: 1 })
        .limit(fetchBatchSize)
        .sort({ _id: 1 })
        .lean()
        .exec();

      if (!ids.length && !newIds.length) break;

      if (newIds.length) {
        ids.push(...newIds.map(({ _id }) => _id));
        lastId = newIds[newIds.length - 1]._id;
      }
    }

    const batchIds = ids.splice(0, processBatchSize);
    if (!batchIds.length) break;

    logger.SessionResultRollBack(`betOddsBatchHelper: ${LOG_REF_CODE}
        STAGE: 'Running_Update_betOddsBatchHelper'
        Length: ${batchIds.length}
      `);

    await BetsOdds.updateMany({ _id: { $in: batchIds } }, update);
  }
}

async function getUserAndAgentCalculatedUpdateObject({
  user_profit_loss,
  isRollback,
  LOG_UUID,
  isFancy,
}) {
  try {
    const userIdSet = new Set(),
      agentIdSet = new Set();

    user_profit_loss.map((i) => {
      userIdSet.add(i.user_id);
      i.agents_pl_distribution.map((a) => {
        agentIdSet.add(a.user_id);
      });
    });

    const userFetchedObj = {},
      usersData = {},
      agentUsersData = {};

    const combinedUserIds = [
      ...Array.from(userIdSet),
      ...Array.from(agentIdSet),
    ];

    let st5 = Date.now();

    const userSelectList = [
      "_id",
      "user_type_id",
      "point",
      "parent_id",
      "parent_user_name",
      "parent_level_ids",
    ];
    const userFetchQuery = { _id: { $in: combinedUserIds } };

    logger.SessionResultRollBack(`getUserAndAgentCalculatedUpdateObject: ${LOG_UUID}
          STAGE: 'Start_UserFetch'
          Select: ${JSON.stringify(userSelectList)}
          `);
    // Query: ${JSON.stringify(userFetchQuery)}

    const usersFetched = await User.find(userFetchQuery, userSelectList).lean();

    logger.SessionResultRollBack(`getUserAndAgentCalculatedUpdateObject: ${LOG_UUID}
          STAGE: 'End_UserFetch'
          TimeTaken: ${Date.now() - st5} ms
        `);
    // Response: ${JSON.stringify(usersFetched)}

    usersFetched.map((i) => (userFetchedObj[i._id] = i));

    // Creating User & Agents Statement Obj & Update Objects
    let st6 = Date.now();

    logger.SessionResultRollBack(`getUserAndAgentCalculatedUpdateObject: ${LOG_UUID}
        STAGE: 'Start_UserAgentObjectCreation'
        `);

    for (const i of user_profit_loss) {
      const { user_id, user_name, agents_pl_distribution } = i;

      const userDataItem = userFetchedObj[user_id];
      const { user_type_id } = userDataItem;
      const userStatementObj = generateAccountStatement(
        i,
        userDataItem,
        isRollback,
        isFancy
      );

      for (const a of agents_pl_distribution) {
        const { user_id: agent_id } = a;

        const userDbItem = userFetchedObj[agent_id];
        if (!userDbItem) continue;

        let agentData = agentUsersData[agent_id];

        let calculatedData = generateAccountStatementAgent(
          a,
          i,
          userDbItem,
          agentData?.numericObj,
          isRollback,
          isFancy
        );

        agentUsersData[agent_id] = {
          ...calculatedData,
        };
      }

      usersData[user_id] = {
        user_id,
        user_name,
        user_type_id,
        ...userStatementObj,
      };
    }

    logger.SessionResultRollBack(`getUserAndAgentCalculatedUpdateObject: ${LOG_UUID}
        STAGE: 'End_UserAgentObjectCreation'
        TimeTaken: ${Date.now() - st6} ms
      `);

    return resultResponse(SUCCESS, [
      ...Object.values(usersData),
      ...Object.values(agentUsersData),
    ]);
  } catch (error) {
    console.error("Error in getUserAndAgentCalculatedUpdateObject : ", error);

    logger.SessionResultRollBack(`getUserAndAgentCalculatedUpdateObject: ${LOG_UUID}
        STAGE: 'ERROR_CATCH_BLOCK'
        Error: ${error.stack}
      `);
    return resultResponse(SERVER_ERROR, { msg: error.message });
  }
}

function generateAccountStatement(
  user_profit_loss,
  user_db,
  isRollback,
  isFancy
) {
  const {
    user_id,
    user_name,
    domain_name,
    sport_id,
    sport_name,
    series_id,
    series_name,
    match_id,
    match_name,
    match_date,
    event_id,
    event_name,
    description,
    user_pl,
    user_commission_pl,
    liability,
    is_demo,
    market_type,
    auraMarketId,
    auraRountId,
    casinoProvider,
  } = user_profit_loss;

  const {
    balance,
    parent_id,
    parent_user_name,
    parent_level_ids,
    user_type_id,
    point,
  } = user_db;

  let statementType = "2",
    statementTypeComm = "3",
    marketType = "1";
  if (isFancy) {
    statementType = "4";
    statementTypeComm = "5";
    marketType = "2";
  }

  let user_p_l_2 = user_pl;
  let user_commission_pl_2 = user_commission_pl;
  let isRollback_2 = "0";
  let rollBackText = "";
  let liability_2 = liability;

  if (isRollback) {
    user_p_l_2 = user_pl * -1;
    user_commission_pl_2 = user_commission_pl * -1;
    isRollback_2 = "1";
    rollBackText = "Rollback Result: ";
    liability_2 = liability * -1;
  }
  //party in loss
  let party_win_loss = {};

  if ([...LIVE_SPORTS, ...RACING_SPORTS].includes(sport_id)) {
    party_win_loss = {
      sport_pl: {
        $round: [
          {
            $add: [
              { $ifNull: ["$sport_pl", 0] },
              user_p_l_2,
              user_commission_pl_2,
            ],
          },
          2,
        ],
      },
    };
  } else if (casinoProvider === "QT") {
    party_win_loss = {
      third_party_pl: {
        $round: [
          {
            $add: [
              { $ifNull: ["$third_party_pl", 0] },
              user_p_l_2,
              user_commission_pl_2,
            ],
          },
          2,
        ],
      },
    };
  } else if (sport_id === "-100") {
    party_win_loss = {
      casino_pl: {
        $round: [
          {
            $add: [
              { $ifNull: ["$casino_pl", 0] },
              user_p_l_2,
              user_commission_pl_2,
            ],
          },
          2,
        ],
      },
    };
  }

  const statementObj = {
    user_id,
    user_name,
    domain_name,
    sport_id,
    sport_name,
    series_id,
    series_name,
    match_id,
    match_name,
    match_date,
    event_id,
    event_name,
    user_type_id,
    point,
    parent_id,
    parent_user_name,
    agents: parent_level_ids.map(
      ({ user_id, user_name, name, user_type_id }) => ({
        user_id,
        user_name,
        name,
        user_type_id,
      })
    ),
    description: `${rollBackText}${description}`,
    description_comm: `${rollBackText}Commission on ${description}`,
    statement_type: statementType,
    statement_type_comm: statementTypeComm,
    amount: fixFloatingPoint(user_p_l_2),
    amount_comm: fixFloatingPoint(user_commission_pl_2),
    available_balance: fixFloatingPoint(user_p_l_2),
    available_balance_comm: fixFloatingPoint(user_p_l_2 + user_commission_pl_2),
    type: marketType,
    isRollback: isRollback_2,
    created_at: new Date(),
    is_demo,
    market_type: market_type,
    auraMarketId: auraMarketId,
    auraRountId: auraRountId,
  };

  const updateObj = {
    updateOne: {
      filter: { _id: user_id },
      update: [
        {
          $set: {
            balance: {
              $round: [
                {
                  $add: [
                    { $ifNull: ["$balance", 0] },
                    user_p_l_2,
                    liability_2,
                    user_commission_pl_2,
                  ],
                },
                2,
              ],
            },
            liability: {
              $round: [
                {
                  $add: [{ $ifNull: ["$liability", 0] }, liability_2],
                },
                2,
              ],
            },
            profit_loss: {
              $round: [
                {
                  $add: [
                    { $ifNull: ["$profit_loss", 0] },
                    user_p_l_2,
                    user_commission_pl_2,
                  ],
                },
                2,
              ],
            },
            // Ukraine Concept
            balance_reference: {
              $round: [
                {
                  $add: [
                    { $ifNull: ["$balance_reference", 0] },
                    user_p_l_2,
                    user_commission_pl_2,
                  ],
                },
                2,
              ],
            },
            // Chip Summary
            settlement_pl: {
              $round: [
                {
                  $add: [{ $ifNull: ["$settlement_pl", 0] }, -user_p_l_2],
                },
                2,
              ],
            },
            settlement_comm: {
              $round: [
                {
                  $add: [
                    { $ifNull: ["$settlement_comm", 0] },
                    -user_commission_pl_2,
                  ],
                },
                2,
              ],
            },
            settlement_pl_comm: {
              $round: [
                {
                  $add: [
                    { $ifNull: ["$settlement_pl_comm", 0] },
                    -(user_p_l_2 + user_commission_pl_2),
                  ],
                },
                2,
              ],
            },
            // Party In Loss
            ...party_win_loss,
          },
        },
      ],
    },
  };

  let statementObjComm = undefined;

  if (statementObj.amount_comm != 0) {
    statementObjComm = {
      ...statementObj,
      description: statementObj.description_comm,
      statement_type: statementObj.statement_type_comm,
      amount: statementObj.amount_comm,
      available_balance: statementObj.available_balance_comm,
    };
  }

  return {
    statementObj,
    updateObj,
    ...(statementObjComm ? { statementObjComm } : {}),
  };
}

function generateAccountStatementAgent(
  agents_pl_distribution_item,
  user_profit_loss,
  user_db,
  numericObj,
  isRollback,
  isFancy
) {
  const {
    user_id: agent_id,
    user_name,
    p_l,
    added_pl,
    added_comm,
    commission,
  } = agents_pl_distribution_item;

  const { parent_id, parent_user_name, parent_level_ids, user_type_id, point } =
    user_db;

  const {
    sport_id,
    sport_name,
    series_id,
    series_name,
    match_id,
    match_name,
    match_date,
    event_id,
    event_name,
    description,
    domain_name,
    user_pl,
    user_commission_pl,
    is_demo,
    market_type,
    auraMarketId,
    auraRountId,
    casinoProvider,
  } = user_profit_loss;

  let statementType = "2";
  let statementTypeComm = "3";
  let marketType = "1";
  if (isFancy) {
    statementType = "4";
    statementTypeComm = "5";
    marketType = "2";
  }

  let p_l_2 = p_l;
  let commission_2 = commission;
  let added_pl_2 = added_pl;
  let added_comm_2 = added_comm;
  let user_pl_2 = user_pl;
  let user_commission_pl_2 = user_commission_pl;
  let isRollback_2 = "0";
  let rollBackText = "";

  if (isRollback) {
    p_l_2 = p_l * -1;
    commission_2 = commission * -1;
    added_pl_2 = added_pl * -1;
    added_comm_2 = added_comm * -1;
    user_pl_2 = user_pl * -1;
    user_commission_pl_2 = user_commission_pl * -1;
    isRollback_2 = "1";
    rollBackText = "Rollback Result: ";
  }

  if (!numericObj) {
    numericObj = {
      amount: 0,
      p_l: 0,
      commission: 0,
      added_pl: 0,
      added_comm: 0,
      user_pl: 0,
      user_commission_pl: 0,
      amount_comm: 0,
    };
  }

  numericObj.p_l = numericObj.p_l + p_l_2;
  numericObj.amount = numericObj.amount + p_l_2;
  numericObj.amount_comm = numericObj.amount_comm + commission_2;
  numericObj.user_pl = numericObj.user_pl + user_pl_2;
  numericObj.user_commission_pl =
    numericObj.user_commission_pl + user_commission_pl_2;
  numericObj.added_pl = numericObj.added_pl + added_pl_2;
  numericObj.added_comm = numericObj.added_comm + added_comm_2;
  numericObj.available_balance = numericObj.amount;
  numericObj.available_balance_comm =
    numericObj.amount + numericObj.amount_comm;

  //Party Win Loss
  let party_win_loss = {};

  if ([...LIVE_SPORTS, ...RACING_SPORTS].includes(sport_id)) {
    party_win_loss = {
      sport_pl: {
        $round: [
          {
            $add: [
              { $ifNull: ["$sport_pl", 0] },
              -(numericObj.user_pl + numericObj.user_commission_pl),
            ],
          },
          2,
        ],
      },
    };
  } else if (casinoProvider === "QT") {
    party_win_loss = {
      third_party_pl: {
        $round: [
          {
            $add: [
              { $ifNull: ["$third_party_pl", 0] },
              -(numericObj.user_pl + numericObj.user_commission_pl),
            ],
          },
          2,
        ],
      },
    };
  } else if (sport_id === "-100") {
    party_win_loss = {
      casino_pl: {
        $round: [
          {
            $add: [
              { $ifNull: ["$casino_pl", 0] },
              -(numericObj.user_pl + numericObj.user_commission_pl),
            ],
          },
          2,
        ],
      },
    };
  }

  const statementObj = {
    user_id: agent_id,
    user_name,
    domain_name,
    sport_id,
    sport_name,
    series_id,
    series_name,
    match_id,
    match_name,
    match_date,
    event_id,
    event_name,
    user_type_id,
    point,
    parent_id,
    parent_user_name,
    agents: parent_level_ids.map(
      ({ user_id, user_name, name, user_type_id }) => ({
        user_id,
        user_name,
        name,
        user_type_id,
      })
    ),
    description: `${rollBackText}${description}`,
    description_comm: `${rollBackText}Commission on ${description}`,
    statement_type: statementType,
    statement_type_comm: statementTypeComm,
    type: marketType,
    isRollback: isRollback_2,
    created_at: new Date(),
    //
    amount: fixFloatingPoint(numericObj.amount), //1000.45252 -> 1000.45
    p_l: fixFloatingPoint(numericObj.p_l),
    amount_comm: fixFloatingPoint(numericObj.amount_comm),
    available_balance: fixFloatingPoint(numericObj.available_balance),
    available_balance_comm: fixFloatingPoint(numericObj.available_balance_comm),
    is_demo,
    market_type: market_type || null,
    auraMarketId: auraMarketId || null,
    auraRountId: auraRountId || null,
  };

  const updateObj = {
    updateOne: {
      filter: { _id: agent_id },
      update: [
        {
          $set: {
            profit_loss: {
              $round: [
                {
                  $add: [
                    { $ifNull: ["$profit_loss", 0] },
                    numericObj.p_l,
                    numericObj.amount_comm,
                  ],
                },
                2,
              ],
            },
            // Ukraine Concept
            balance_reference: {
              $round: [
                {
                  $add: [
                    { $ifNull: ["$balance_reference", 0] },
                    numericObj.user_pl,
                    numericObj.user_commission_pl,
                  ],
                },
                2,
              ],
            },
            // Chip Summary
            settlement_pl: {
              $round: [
                {
                  $add: [
                    { $ifNull: ["$settlement_pl", 0] },
                    numericObj.added_pl,
                  ],
                },
                2,
              ],
            },
            settlement_comm: {
              $round: [
                {
                  $add: [
                    { $ifNull: ["$settlement_comm", 0] },
                    numericObj.added_comm,
                  ],
                },
                2,
              ],
            },
            settlement_pl_comm: {
              $round: [
                {
                  $add: [
                    { $ifNull: ["$settlement_pl_comm", 0] },
                    numericObj.added_pl + numericObj.added_comm,
                  ],
                },
                2,
              ],
            },
            // Party Win Loss
            ...party_win_loss,
          },
        },
      ],
    },
  };

  let statementObjComm = undefined;

  if (statementObj.amount_comm != 0) {
    statementObjComm = {
      ...statementObj,
      description: statementObj.description_comm,
      statement_type: statementObj.statement_type_comm,
      amount: statementObj.amount_comm,
      available_balance: statementObj.available_balance_comm,
    };
  }

  return {
    user_id: agent_id,
    user_name,
    user_type_id,
    statementObj,
    updateObj,
    ...(statementObjComm ? { statementObjComm } : {}),
    numericObj,
  };
}

function getDataInBatchesForQueues(dataArr, name, batchSize, event_id) {
  try {
    const dataGrouped = [];

    dataArr.map((data, i) => {
      if (i % batchSize == 0) {
        // Insert New Array to idsToFetch
        dataGrouped.push([data]);
      } else {
        // Update the Existing Inner Array
        const index = dataGrouped.length - 1;
        const innerArray = dataGrouped[index];
        innerArray.push(data);
      }
    });

    const queueData = dataGrouped.map((data) => ({
      name,
      data: {
        usersArr: data,
        event_id,
        name,
      },
      opts: {
        delay: 1000,
      },
    }));

    return resultResponse(SUCCESS, queueData);
  } catch (error) {
    console.log("GetDataInBatchesForQueues: ", error.message);
    return resultResponse(SERVER_ERROR, {
      msg: "Error in Creating Queue Data, Error: " + error.message,
    });
  }
}

module.exports = {
  processBetFancyInBatches,
  betFancyBatchHelper,
  getUserAndAgentCalculatedUpdateObject,
  generateAccountStatement,
  generateAccountStatementAgent,
  getDataInBatchesForQueues,
  processBetOddsInBatches,
  betOddsBatchHelper,
};
