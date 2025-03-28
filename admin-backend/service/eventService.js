const BetsOdds = require("../../models/betsOdds");
const Sport = require("../../models/sports");
const Match = require("../../models/match");
const Series = require("../../models/series");
const Fancy = require("../../models/fancy");
const Market = require("../../models/market");
const GameLock = require("../../models/gameLock");
const UserProfitLoss = require("../../models/userProfitLoss");
const eventQuery = require("./eventQuery");
const {
  SUCCESS,
  NOT_FOUND,
  SERVER_ERROR,
  SPORTS_IDS,
  LIVE_GAME_SPORT_ID,
  DIAMOND_CASINO_SPORT_ID,
  UNIVERSE_CASINO_SPORT_ID,
  MANUAL_CASINOS_IDS,
  USER_TYPE_USER,
  VALIDATION_ERROR,
  VALIDATION_FAILED,
  FANCY_CATEGORY_DIAMOND,
  GHR,
  HR,
} = require("../../utils/constants");
const { resultResponse } = require("../../utils/globalFunction");
const { ObjectId } = require("bson");
const _ = require("lodash");
const { USER_BLOCK_TYPE } = require("../../config/constant/user");

let getEvents = async (params) => {
  const { type } = params;
  let Model;
  if (["openBets", "settledBets"].includes(type)) {
    let filter = { is_live_sport: 0 };
    if (params.include_casinos) filter = { sport_id: { $in: SPORTS_IDS } };
    if (params.only_casinos)
      filter = {
        sport_id: {
          $in: [
            LIVE_GAME_SPORT_ID,
            DIAMOND_CASINO_SPORT_ID,
            UNIVERSE_CASINO_SPORT_ID,
          ],
        },
      };
    let sports = await Sport.find(filter).select("-_id sport_id").lean();
    params.sports_id = sports.map((sport) => sport.sport_id);
    Model = BetsOdds.aggregate(eventQuery.events(params));
  } else if (type == "eventsProfitLoss") {
    Model = eventsProfitLoss(params);
  } else if (["matchResult", "matchRollback"].includes(type))
    Model = Market.aggregate(eventQuery.matchResultRollback(params));
  else
    Model = Market.find({ market_id: params.search.market_id }).select(
      "-_id runners.selection_id runners.selection_name"
    );
  return Model.then((events) => {
    if (events.length) return resultResponse(SUCCESS, events);
    else return resultResponse(NOT_FOUND, "No events found!");
  }).catch((error) => resultResponse(SERVER_ERROR, error.message));
};

function eventsProfitLoss(params) {
  // Destructuring parameters for readability
  const { user_id, search, isUserPanel, from_date, to_date, event_type } =
    params;

  // Defining event types as constants
  const EVENTS_TYPES = {
    SPORTS: "sports",
    SERIES: "series",
    MATCHES: "matches",
    EVENTS_MARKETS_FANCIES: "events_m_f",
  };

  // Initialize the filter based on panel type
  let filter = isUserPanel
    ? { user_id }
    : { "agents_pl_distribution.user_id": user_id };

  // Add search filters if provided
  if (search && typeof search.constructor.name === "Object") {
    Object.assign(filter, search); // Merge additional search conditions
  }

  // Add specific conditions for `events_m_f` event type
  if (event_type === EVENTS_TYPES.EVENTS_MARKETS_FANCIES) {
    filter["sport_id"] = { $nin: MANUAL_CASINOS_IDS }; // Exclude manual casinos
    filter["casinoProvider"] = { $ne: "QT" }; // Exclude QT provider
  }

  // Date filter: use provided dates or default to today's range
  if (from_date && to_date) {
    filter["createdAt"] = {
      $gte: new Date(from_date),
      $lte: new Date(to_date),
    };
  } else {
    // Set default date range to today if no dates provided
    const today = new Date();
    filter["createdAt"] = {
      $gte: new Date(today.setUTCHours(0, 0, 0, 0)),
      $lte: new Date(today.setUTCHours(23, 59, 59, 999)),
    };
  }

  // Define the MongoDB match stage for aggregation
  const matchConditions = { $match: filter };

  // Generate the final query using eventQuery helper, passing event types and parameters
  const query = eventQuery.profitLossEvents(matchConditions, {
    ...params,
    EVENTS_TYPES,
  });

  // Execute the aggregate function with `allowDiskUse` to handle large data sets
  return UserProfitLoss.aggregate(query, { allowDiskUse: true });
}

let fancyMatchLists = (params) => {
  let query = eventQuery.fancyMatchLists(params);
  return Match.aggregate(query)
    .then((matches) => {
      if (matches.length) return resultResponse(SUCCESS, matches);
      else return resultResponse(NOT_FOUND, "No matches found!");
    })
    .catch((error) => resultResponse(SERVER_ERROR, error.message));
};

const block = async (req) => {
  let { event, filter, user_id } = req.joiData;

  const Models = { Sport, Series, Match, Market, Fancy };
  const modelWeight = {
    Market: { model: Market, weight: 3, key: "market_id" },
    Fancy: { model: Fancy, weight: 3, key: "category" },
    Match: { model: Match, weight: 2, key: "match_id" },
    Series: { model: Series, weight: 1, key: "series_id" },
    Sport: { model: Sport, weight: 0, key: "sport_id" },
  };

  user_id = ObjectId(
    user_id ? ObjectId(user_id) : req.User.user_id || req.User._id
  );

  let loggedInUserId = ObjectId(req.User.user_id || req.User._id);
  let updateFilter = JSON.parse(JSON.stringify(filter));
  let isExistInBlockList = false;
  let is_self_block = false;
  let shouldIPull = true;
  let user_id_str = user_id.toString();
  const currentWeight = modelWeight[event].weight;

  if (loggedInUserId.toString() == user_id_str) {
    is_self_block = true;
  }

  if (is_self_block && req.User.user_type_id == USER_TYPE_SUPER_ADMIN) {
    return resultResponse(VALIDATION_FAILED, {
      msg: "You are not allowed to perform self blocking action!",
    });
  }

  let message = `${event} ${is_self_block
    ? "unblocked successfully..."
    : `of ${req.user.user_type_id == USER_TYPE_USER ? "User" : "Agent"} ${req.user.name
    }(${req.user.user_name}) unblocked successfully...`
    }`;

  const isFancyCat = Models[event] == Models.Fancy && Boolean(filter?.category);
  let projet = [
    "_id",
    "self_blocked",
    "parent_blocked",
    "sport_id",
    "sport_name",
    "name",
    "series_id",
    "series_name",
    "match_id",
    "match_name",
    "market_type",
    "category",
  ];
  if (Models[event] != Models.Match) {
    projet.push("market_id");
  }

  let tempEvent = event;
  if (event == "Series") {
    if (filter.country_code) {
      if (![HR, GHR].includes(filter.sport_id)) {
        return resultResponse(VALIDATION_FAILED, {
          msg: `Country Code is valid for SportId ${HR} & ${GHR}`,
        });
      }
      tempEvent = "Match";
      projet = [
        "_id",
        "self_blocked",
        "parent_blocked",
        "sport_id",
        "sport_name",
        "name",
        "series_id",
        "series_name",
      ];
    }
  }

  const eventFound = await Models[tempEvent]
    .findOne(filter, projet)
    .lean()
    .exec();

  if (!eventFound) {
    return resultResponse(VALIDATION_ERROR, { msg: `${tempEvent} not found!` });
  }

  const gameLocksRes = await getAllGameLock(eventFound, {
    user_id: req.user._id,
    parent_id: req.User._id,
    is_self_block,
    filter,
  });

  if (gameLocksRes.statusCode != SUCCESS) {
    return resultResponse(VALIDATION_ERROR, gameLocksRes.data);
  }

  const gameLocksData = gameLocksRes.data;

  const isEventEntriesExists = gameLocksData.filter((i) => i.event == event);

  if (isEventEntriesExists.length) {
    const isMyEntryExists = isEventEntriesExists.find(
      (i) =>
        i.parent_id.toString() == req.User._id.toString() && i.event == event
    );
    if (isMyEntryExists) {
      isExistInBlockList = true;
    }
    if (isEventEntriesExists.length > 1) {
      shouldIPull = false;
    }
  }

  // let downlineLockKeyId = isFancyCat
  //   ? filter?.category
  //   : filter?.fancy_id ||
  //   filter?.market_id ||
  //   filter?.match_id ||
  //   filter?.series_id ||
  //   filter?.sport_id;
  // downlineLockKeyId = downlineLockKeyId.replace(".", "*");

  const fetchTasksList = [];

  if (USER_BLOCK_TYPE == "DEFAULT") {
    Object.keys(modelWeight).map((name) => {
      const { weight, key } = modelWeight[name];
      if (weight >= currentWeight) {
        return;
      }
      const innerFilter = { [key]: eventFound[key] };

      async function getData() {
        const result = await Models[name]
          .findOne(innerFilter)
          .select("self_blocked parent_blocked")
          .exec();

        return {
          result,
          name,
        };
      }
      fetchTasksList.push(getData());
    });

    const parentsFetchedData = await Promise.all(fetchTasksList);

    for (const fetchedData of parentsFetchedData) {
      const { result, name } = fetchedData;
      // console.log(name, result);
      if (
        is_self_block
          ? result.self_blocked.length &&
          result.self_blocked.includes(user_id_str)
          : result.parent_blocked.length &&
          result.parent_blocked.includes(user_id_str)
      ) {
        return resultResponse(VALIDATION_ERROR, {
          msg: `${name} is already Blocked!`,
        });
      }
    }
  }

  const eventUpdateTasks = await getBlockEventUpdateTasks({
    event,
    eventFound,
    currentWeight,
    modelWeight,
    gameLocksData,
    shouldIPull,
    isExistInBlockList,
    updateFilter,
    user_id_str,
    is_self_block,
  });

  if (eventUpdateTasks.statusCode != SUCCESS) {
    return resultResponse(SERVER_ERROR, eventUpdateTasks.data);
  }

  const tasks = eventUpdateTasks.data;

  if (tasks.length) {
    await tasks[0];

    if (tasks.length > 1) {
      Promise.all(tasks.slice(1));
    }
  }

  if (!isExistInBlockList) {
    message = message.replace("unblocked", "blocked");
  }

  if (!isExistInBlockList) {
    // Create
    await createGameLock(eventFound, {
      user_id: req.user._id,
      user_name: req.user.user_name,
      parent_id: req.User._id,
      parent_user_name: req.User.user_name,
      event,
      is_self_block,
      filter,
    });
  } else {
    // Remove
    await removeGameLock(eventFound, {
      user_id: req.user._id,
      parent_id: req.User._id,
      event,
      filter,
    });
  }

  return resultResponse(SUCCESS, { msg: message });
};

async function createGameLock(eventFound, usersData) {
  try {
    const {
      sport_id,
      sport_name,
      name,
      series_id,
      series_name,
      match_id,
      match_name,
      market_id,
      market_type,
      category,
    } = eventFound;

    const {
      user_id,
      user_name,
      event,
      parent_id,
      parent_user_name,
      is_self_block,
      filter,
    } = usersData;

    const gameLockObj = {
      user_id,
      user_name,
      parent_id,
      parent_user_name,
      sport_id,
      sport_name: sport_name || name,
      series_id: filter.country_code || series_id,
      series_name,
      match_id,
      match_name, 
      market_id,
      category,
      is_self_block,
      name: match_name || series_name || sport_name || name,
      ...(event == "Match"
        ? {}
        : { market_name: market_type || FANCY_CATEGORY_DIAMOND[category] }),
      event,
    };

    const saveObj = new GameLock(gameLockObj);
    await saveObj.save();
  } catch (error) {
    console.error("Error in createGameLock: ", error);
  }
}

async function removeGameLock(eventFound, usersData) {
  try {
    const {
      sport_id,
      sport_name,
      name,
      series_id,
      series_name,
      match_id,
      match_name,
      market_id,
      market_type,
      category,
    } = eventFound;

    const { user_id, parent_id, event, filter } = usersData;
    const market_name = market_type || FANCY_CATEGORY_DIAMOND[category];
    let filterObj = {
      user_id,
      ...(sport_id ? { sport_id } : {}),
      ...(series_id ? { series_id: filter.country_code || series_id } : {}),
      ...(match_id ? { match_id } : {}),
      ...(market_id ? { market_id } : {}),
      ...(category ? { category } : {}),
      parent_id,
      name: match_name || series_name || sport_name || name,
      ...(market_name && event != "Match" ? { market_name: market_name } : {}),
      event,
    };

    await GameLock.deleteOne(filterObj).exec();
  } catch (error) {
    console.error("Error in createGameLock: ", error);
  }
}

async function getAllGameLock(eventFound, usersData) {
  try {
    const { sport_id, series_id, match_id, market_id, category } = eventFound;

    const { user_id, parent_id, is_self_block, filter } = usersData;
    let filterObj = {
      user_id,
      // parent_id,
      is_self_block,
      ...(sport_id ? { sport_id } : {}),
      ...(series_id ? { series_id: filter.country_code || series_id } : {}),
      ...(match_id ? { match_id } : {}),
      ...(market_id ? { market_id } : {}),
      ...(category ? { category } : {}),
    };

    const gameLocks = await GameLock.find(filterObj, {
      parent_id: 1,
      user_id: 1,
      event: 1,
      sport_id: 1,
      series_id: 1,
      match_id: 1,
      market_id: 1,
      category: 1,
    })
      .lean()
      .exec();

    return resultResponse(SUCCESS, gameLocks);
  } catch (error) {
    console.error("Error in getAllGameLock: ", error);
    return resultResponse(SERVER_ERROR, { msg: error.message });
  }
}

async function getBlockEventUpdateTasks(params) {
  try {
    const {
      event,
      eventFound,
      currentWeight,
      modelWeight,
      gameLocksData,
      shouldIPull,
      isExistInBlockList,
      updateFilter,
      user_id_str,
      is_self_block,
    } = params;

    const queries = [];

    if (!shouldIPull) {
      return resultResponse(SUCCESS, queries);
    }

    const gameLockDataFiltered = gameLocksData.filter((i) => i.event != event);

    const gameLocksGrouped = _.groupBy(gameLockDataFiltered, "event");

    const names = Object.keys(modelWeight);

    const commandName = isExistInBlockList ? "$pull" : "$addToSet";
    const fieldName = is_self_block ? "self_blocked" : "parent_blocked";

    names.sort((a, b) => {
      let aa = modelWeight[a].weight;
      let bb = modelWeight[b].weight;
      return aa - bb;
    });

    names.map((innerEvent) => {
      let { weight, key, model } = modelWeight[innerEvent];
      if (
        weight < currentWeight ||
        (innerEvent != event && weight == currentWeight)
      ) {
        return;
      }

      let filter = updateFilter;
      if (innerEvent == "Fancy") {
        filter = {
          ...updateFilter,
          is_active: { $in: [0, 1] },
          is_result_declared: 0,
        };
      } else if (innerEvent == "Market") {
        filter = {
          ...updateFilter,
          is_active: 1,
          is_result_declared: 0,
        };
      }
      if (innerEvent != event && isExistInBlockList) {
        const idsSet = new Set();

        const innerEventGameLockData = gameLocksGrouped[innerEvent] || [];
        innerEventGameLockData.map((i) => {
          idsSet.add(i[key]);
        });

        if (idsSet.size) {
          filter[key] = { $nin: Array.from(idsSet) };
        }
      }

      const update = { [commandName]: { [fieldName]: user_id_str } };
      queries.push(model.updateMany(filter, update));
    });

    return resultResponse(SUCCESS, queries);
  } catch (error) {
    console.error("Error in getBlockEventUpdateTasks: ", error);
    return resultResponse(SERVER_ERROR, { msg: error.message });
  }
}

module.exports = {
  getEvents,
  fancyMatchLists,
  block,
};
