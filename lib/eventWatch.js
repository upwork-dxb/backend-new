const Sport = require('../models/sports')
  , Series = require('../models/series')
  , Match = require('../models/match')
  , Market = require('../models/market')
  , Fancy = require('../models/fancy')
  , BetCount = require('../models/betCount')
  , BankingType = require('../models/bankingType')
  , BankingMethod = require('../models/bankingMethod')
  , QTechRoundsStatus = require('../models/qtechRoundsStatus')
  , ApiUrlSetting = require('../models/apiUrlSetting')
  , OAuthToken = require('../models/oAuthToken')
  , user = require('../models/user')
  , publisher = require("../connections/redisConnections")
  , betServiceAdmin = require('../admin-backend/service/betService')
  , event = require('./node-event').event
  , { METHOD_TYPE_COUNT, BANK_TYPE_UPDATE } = require("../utils/b2cConstants")
  , { QT_RESULT_RETRY } = require('../utils/qtechConstant')
  , { EVENT_OAUTH_TOKEN } = require('../utils/events')
  , { API_SETTINGS, USER_CHANGE_EVENT, CRICKET, MATCH_ODDS_TYPE,
    MARKET_CHANGE_EVENT,
    FANCY_CHANGE_EVENT,
  } = require('../utils/constants');

const fs = require("fs");
const path = require("path");

const RESUME_TOKEN_DIR = path.join(__dirname, 'resumeTokens');

let Fields = {
  _id: 0,
  market_min_stack: 1,
  market_max_stack: 1,
  market_min_odds_rate: 1,
  market_max_odds_rate: 1,
  market_max_profit: 1,
  market_advance_bet_stake: 1,
  market_live_odds_validation: 1,
  session_min_stack: 1,
  session_max_stack: 1,
  session_max_profit: 1,
  session_live_odds_validation: 1,
  volume_stake_enable: 1,
  min_volume_limit: 1,
  betting_will_start_time: 1,
  is_back_bet_allowed: 1,
  is_lay_bet_allowed: 1,
  inplay_betting_allowed: 1,
  market_back_rate_range: 1,
  market_bookmaker_min_odds_rate: 1,
  market_bookmaker_max_odds_rate: 1,
  market_lay_rate_range: 1,
  unmatch_bet_allowed: 1,
  no_of_unmatch_bet_allowed: 1,
  inplay_max_volume_stake_0_10: 1,
  inplay_max_volume_stake_10_40: 1,
  inplay_max_volume_stake_40: 1,
  max_volume_stake_0_10: 1,
  max_volume_stake_10_40: 1,
  max_volume_stake_40: 1,
  self_blocked: 1,
  parent_blocked: 1,
}, EventMatch = [
  { "$match": { "operationType": { "$in": ["insert", "update"] } } }
];

function getResumeToken(fileName) {
  try {
    if (fs.existsSync(path.join(RESUME_TOKEN_DIR, fileName))) {
      const data = fs.readFileSync(path.join(RESUME_TOKEN_DIR, fileName), "utf8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Error reading resume token:", err);
  }
  return null;
}

/**
 * Saves the resume token to the JSON file.
 * @param {Object} token - The resume token to save.
 */
function saveResumeToken(token, fileName) {
  try {
    fs.writeFileSync(path.join(RESUME_TOKEN_DIR, fileName), JSON.stringify(token), "utf8");
  } catch (error) {
    console.error("Error writing resume token:", error);
  }
}

const streams = {
  SPORTS_STREAM: null,
  SERIES_STREAM: null,
  MATCH_STREAM: null,
  MARKET_STREAM: null,
  FANCY_STREAM: null,
  OAUTHTOKEN_STREAM: null,
  METHOD_TYPE_STREAM: null,
  BANK_METHOD_STREAM: null,
  BET_COUNT_STREAM: null,
  USER_STREAM: null,
}

module.exports = {
  wrapper: async ({
    tokenFileName,
    resumeToken,
    name,
  }, callback) => {
    let options = {};

    if (resumeToken) {
      options.resumeAfter = resumeToken;
    }
    if (streams[name]) {
      streams[name].removeAllListeners();
      streams[name].close();
    }

    console.log(name)
    streams[name] = await callback(streams[name], tokenFileName, options);

    // Handle errors by closing the stream and restarting after a delay
    streams[name].on("error", (error) => {
      console.error(`Change stream ${name} Event error:`, error);
      streams[name].close();
      setTimeout(async () => {
        console.info("Restarting change stream after error...");
        const resumeToken = getResumeToken(tokenFileName)
        module.exports.wrapper(
          {
            tokenFileName,
            resumeToken,
            name,
          },
          callback,
        )
      }, 1000);
    });

    // Handle close events and attempt a restart
    streams[name].on("close", () => {
      console.info(`Change stream ${name} closed. Restarting...`);
      setTimeout(async () => {
        const resumeToken = getResumeToken(tokenFileName)
        module.exports.wrapper(
          {
            tokenFileName,
            resumeToken,
            name,
          },
          callback,
        )
      }, 1000);
    });

    // Optionally handle the "end" event if needed
    streams[name].on("end", () => {
      console.warn("Change stream eventStream ended");
    });

  },

  sportEventHandler: async (sportEventEmitter, tokenFileName, options) => {

    sportEventEmitter = Sport.watch(EventMatch, {
      // fullDocumentBeforeChange: "required",
      ...options,
    });

    sportEventEmitter.on('change', change => {
      try {
        if (change._id) {
          saveResumeToken(change._id, tokenFileName);
        }
        const { documentKey, updateDescription,
          // fullDocumentBeforeChange 
        } = change;
        if (documentKey != undefined) {
          if (updateDescription != undefined) {
            const { updatedFields } = updateDescription;
            let isUpdated = false, sportFilter = { _id: 0 }
              , fieldsLength = Object.keys(updatedFields).length;
            // if (
            //   (updatedFields.hasOwnProperty("parent_blocked") ||
            //     updatedFields.hasOwnProperty("self_blocked")) 
            //     &&
            //   fieldsLength == 2
            // ) {
            //   isUpdated = true;
            //   sportFilter["sport_id"] = 1;
            //   sportFilter["is_active"] = 1;
            //   sportFilter["is_visible"] = 1;
            //   sportFilter["downline_events_locked"] = 1;
            // }
            if (updatedFields.hasOwnProperty("is_visible") && fieldsLength == 2) {
              isUpdated = true;
              sportFilter["sport_id"] = 1;
              sportFilter["is_active"] = 1;
            }
            // if (updatedFields.hasOwnProperty("is_active") && fieldsLength == 2) {
            //   if (updatedFields.is_active == 0) {
            //     isUpdated = true;
            //     sportFilter["sport_id"] = 1;
            //   }
            // }
            if (isUpdated) {
              Sport.findById(documentKey, sportFilter).lean().then(sport => {
                sport = JSON.parse(JSON.stringify(sport));
                const query = { ...sport };
                const update = { $set: {}, $addToSet: {}, $pull: {} };

                getUpdateObject({
                  updatedFields,
                  //fullDocumentBeforeChange 
                }, update);

                updateModelData(Series, query, update);
              });
            }
          }
        }
      } catch (error) {
        console.error("Event Watch -> 'Sport Event' Error: ", error);
      }
    })

    return sportEventEmitter;
  },
  sportEventInit: () => {
    const tokenFileName = "sports.json";
    const resumeToken = getResumeToken(tokenFileName)
    module.exports.wrapper(
      {
        tokenFileName,
        resumeToken,
        name: "SPORTS_STREAM",
      },
      module.exports.sportEventHandler,
    )
  },

  sereisEventHandler: async (seriesEventEmitter, tokenFileName, options) => {

    seriesEventEmitter = Series.watch(EventMatch, {
      // fullDocumentBeforeChange: "required",
      ...options,
    });

    seriesEventEmitter.on('change', change => {
      try {
        if (change._id) {
          saveResumeToken(change._id, tokenFileName);
        }
        const { documentKey, updateDescription, operationType, fullDocument,
          // fullDocumentBeforeChange 
        } = change;
        if (documentKey != undefined) {
          if (updateDescription != undefined) {
            const { updatedFields } = updateDescription;
            let isUpdated = false, seriesFilter = { _id: 0 }
              , fieldsLength = Object.keys(updatedFields).length;
            // if (
            //   (updatedFields.hasOwnProperty("parent_blocked") ||
            //     updatedFields.hasOwnProperty("self_blocked")) &&
            //   fieldsLength == 2
            // ) {
            //   isUpdated = true;
            //   seriesFilter["series_id"] = 1;
            //   seriesFilter["is_active"] = 1;
            //   seriesFilter["is_visible"] = 1;
            // }
            if (updatedFields.hasOwnProperty("is_visible") && fieldsLength == 2) {
              isUpdated = true;
              seriesFilter["series_id"] = 1;
              seriesFilter["is_active"] = 1;
            }
            // if (updatedFields.hasOwnProperty("is_active") && fieldsLength == 2) {
            //   if (updatedFields.is_active == 0) {
            //     isUpdated = true;
            //     seriesFilter["series_id"] = 1;
            //   }
            // }
            if (isUpdated) {
              Series.findById(documentKey, seriesFilter).lean().then(series => {
                series = JSON.parse(JSON.stringify(series));
                const query = { ...series };
                const update = { $set: {}, $addToSet: {}, $pull: {} };

                getUpdateObject({
                  updatedFields,
                  // fullDocumentBeforeChange 
                }, update);

                updateModelData(Match, query, update);
              });
            }
          }
          if (operationType != undefined) {
            if (operationType == "insert") {
              if (fullDocument != undefined) {
                const { sport_id, series_id } = fullDocument;
                Sport.findOne({ sport_id }, Fields).lean().then(sport => {
                  Series.updateOne({ series_id }, sport).then().catch(console.error)
                }).catch(console.error);
              }
            }
          }
        }
      } catch (error) {
        console.error("Event Watch -> 'Series Event' Error: ", error);
      }
    })

    return seriesEventEmitter;
  },
  seriesEventInit: () => {
    const tokenFileName = "series.json";
    const resumeToken = getResumeToken(tokenFileName);
    module.exports.wrapper(
      {
        tokenFileName,
        resumeToken,
        name: "SERIES_STREAM",
      },
      module.exports.sereisEventHandler,
    )
  },

  matchEventHandler: async (matchEventEmitter, tokenFileName, options) => {

    matchEventEmitter = Match.watch(EventMatch, {
      // fullDocumentBeforeChange: "required",
      ...options,
    });

    matchEventEmitter.on('change', change => {
      try {
        if (change._id) {
          saveResumeToken(change._id, tokenFileName);
        }
        const { documentKey, updateDescription, operationType, fullDocument,
          // fullDocumentBeforeChange
        } = change;
        if (documentKey != undefined) {
          if (updateDescription != undefined) {
            const { updatedFields } = updateDescription;
            let isUpdated = false, matchFilter = { _id: 0 }
              , fieldsLength = Object.keys(updatedFields).length;
            // if (
            //   (updatedFields.hasOwnProperty("parent_blocked") ||
            //     updatedFields.hasOwnProperty("self_blocked")) &&
            //   fieldsLength == 2
            // ) {
            //   isUpdated = true;
            //   matchFilter["match_id"] = 1;
            //   matchFilter["session_category_locked"] = 1;
            //   matchFilter["downline_events_locked"] = 1;
            // matchFilter["is_active"] = 1;
            // matchFilter["is_visible"] = 1;
            // }
            if (updatedFields.hasOwnProperty("enable_fancy") && fieldsLength == 2) {
              isUpdated = true;
              matchFilter["market_id"] = 1;
            }
            if (updatedFields.hasOwnProperty("is_visible") && fieldsLength == 2) {
              isUpdated = true;
              matchFilter["match_id"] = 1;
              matchFilter["is_active"] = 1;
            }
            if (updatedFields.hasOwnProperty("is_active") && fieldsLength == 2)
              if (updatedFields.is_active == 0) {
                isUpdated = true;
                matchFilter["match_id"] = 1;
              }
            if (isUpdated) {
              Match.findById(documentKey, matchFilter).lean().then(match => {
                match = JSON.parse(JSON.stringify(match));
                const query = { ...match };
                delete query.session_category_locked;
                let update = { $set: {}, $addToSet: {}, $pull: {} };

                getUpdateObject({
                  updatedFields,
                  //fullDocumentBeforeChange 
                }, update);
                query["is_active"] = 1;

                updateModelData(Market, query, update);
                if (
                  updatedFields.hasOwnProperty("is_visible")
                  // || updatedFields.hasOwnProperty("parent_blocked") ||
                  // updatedFields.hasOwnProperty("self_blocked")) 
                  && fieldsLength == 2) {
                  update = { $set: {}, $addToSet: {}, $pull: {} };
                  query["is_active"] = { $in: [1, 0] };

                  getUpdateObject({
                    updatedFields,
                    // fullDocumentBeforeChange,
                    // session_category_locked: match.session_category_locked
                  }, update, query, true);
                  updateModelData(Fancy, query, update);
                }
              });
            }
          }
          if (operationType != undefined) {
            if (operationType == "insert") {
              if (fullDocument != undefined) {
                const { series_id, match_id } = fullDocument;
                Series.findOne({ series_id }, Fields).lean().then(series => {
                  Match.updateOne({ match_id }, series).then().catch(console.error)
                }).catch(console.error);
              }
            }
          }
        }
      } catch (error) {
        console.error("Event Watch -> 'Match Event' Error: ", error);
      }
    });

    return matchEventEmitter;
  },
  matchEventInit: () => {
    const tokenFileName = "match.json";
    const resumeToken = getResumeToken(tokenFileName)
    module.exports.wrapper(
      {
        tokenFileName,
        resumeToken,
        name: "MATCH_STREAM",
      },
      module.exports.matchEventHandler,
    )
  },
  marketEventHandler: async (marketEventEmitter, tokenFileName, options) => {

    marketEventEmitter = Market.watch(EventMatch, { ...options, });

    marketEventEmitter.on('change', change => {
      try {
        if (change._id) {
          saveResumeToken(change._id, tokenFileName);
        }
        // event.emit(MARKET_CHANGE_EVENT, change)
        const { updateDescription, operationType, fullDocument } = change;
        if (updateDescription != undefined) {
          const { updatedFields } = updateDescription;
          if (updatedFields != undefined) {
            const { runners, inplay, status } = updatedFields;
            let update_field = {};
            if (runners != undefined)
              if (runners.length)
                update_field["runners"] = runners;
            if (inplay != undefined)
              update_field["inplay"] = inplay ? true : false;
            if (status != undefined)
              update_field["status"] = status;
            if (Object.keys(update_field).length) {
              const query = { market: change.documentKey._id };
              let update = { "$set": update_field };
              Match.updateOne(query, update).then();
            }
          }
        }
        if (operationType != undefined) {
          if (operationType == "insert") {
            if (fullDocument != undefined) {
              const { match_id, market_id } = fullDocument;
              Fields["sport_id"] = 1;

              Match.findOne({ match_id }, Fields).lean().then(match => {

                Market.updateOne({ market_id }, match).then().catch(console.error);

                if (match?.sport_id == CRICKET && match?.unmatch_bet_allowed && fullDocument?.market_type != MATCH_ODDS_TYPE) {
                  Market.updateOne({ market_id }, { unmatch_bet_allowed: false }).then().catch(console.error);
                }

              }).catch(console.error);
            }
          }
        }
      } catch (error) {
        console.error("Event Watch -> 'Market Event' Error: ", error);
      }
    });

    return marketEventEmitter;
  },
  marketEventInit: () => {
    const tokenFileName = "market.json";
    const resumeToken = getResumeToken(tokenFileName)
    module.exports.wrapper(
      {
        tokenFileName,
        resumeToken,
        name: "MARKET_STREAM",
      },
      module.exports.marketEventHandler,
    )
  },

  fancyEventHandler: async (fancyEventEmitter, tokenFileName, options) => {

    fancyEventEmitter = Fancy.watch(EventMatch, { ...options, });

    fancyEventEmitter.on('change', change => {
      try {
        if (change._id) {
          saveResumeToken(change._id, tokenFileName);
        }
        // event.emit(FANCY_CHANGE_EVENT, change)
        const { operationType, fullDocument } = change;
        if (operationType != undefined) {
          if (operationType == "insert") {
            if (fullDocument != undefined) {
              const { match_id, fancy_id, category } = fullDocument;
              Match.findOne({ match_id }, Object.assign(Fields, { session_category_limites: 1 }))
                .lean()
                .then(match => {
                  let session_category_limites = match?.session_category_limites;
                  if (session_category_limites)
                    if (session_category_limites[category])
                      match = { ...match, ...session_category_limites[category] };
                  Fancy.updateOne({ fancy_id }, match).then().catch(console.error)
                }).catch(console.error);
            }
          }
        }
      } catch (error) {
        console.error("Event Watch -> 'Fancy Event' Error: ", error);
      }
    });

    return fancyEventEmitter;
  },
  fancyEventInit: () => {
    const tokenFileName = "fancy.json";
    const resumeToken = getResumeToken(tokenFileName)
    module.exports.wrapper(
      {
        tokenFileName,
        resumeToken,
        name: "FANCY_STREAM",
      },
      module.exports.fancyEventHandler,
    )
  },
  qtechRetryResult: () => {
    const qtEventEmitter = QTechRoundsStatus.watch();
    qtEventEmitter.on('change', change => {
      try {
        const { documentKey, operationType, updateDescription } = change;
        if (operationType != undefined)
          if (operationType == "update")
            if (updateDescription != undefined) {
              const { updatedFields } = updateDescription;
              if (updatedFields)
                event.emit(QT_RESULT_RETRY, { ...documentKey, ...updatedFields });
            }
      } catch (error) {
        console.error("Event Watch -> 'QTechRetryResult' Error: ", error);
      }
    });
  },
  OAuthTokenEventHandler: async (oAuthTokenEventEmitter, tokenFileName, options) => {

    oAuthTokenEventEmitter = OAuthToken.watch(
      [
        {
          $match: { operationType: { $in: ["insert", "delete"] } },
        },
      ],
      {
        fullDocument: "updateLookup",
        fullDocumentBeforeChange: "required",
        ...options,
      },
    );

    oAuthTokenEventEmitter.on('change', change => {
      try {
        if (change._id) {
          saveResumeToken(change._id, tokenFileName);
        }
        event.emit(EVENT_OAUTH_TOKEN, change);
      } catch (error) {
        console.error("Event Watch -> 'oAuthToken Event' Error: ", error);
      }
    });

    return oAuthTokenEventEmitter;
  },
  oAuthTokenEventInit: () => {
    const tokenFileName = "oauthtoken.json";
    const resumeToken = getResumeToken(tokenFileName)
    module.exports.wrapper(
      {
        tokenFileName,
        resumeToken,
        name: "OAUTHTOKEN_STREAM",
      },
      module.exports.OAuthTokenEventHandler,
    )
  },

  apiUrlSettingEventHandler: async (apiEventEmitter, tokenFileName, options) => {

    apiEventEmitter = ApiUrlSetting.watch([], { ...options, });

    apiEventEmitter.on('change', change => {
      try {
        if (change._id) {
          saveResumeToken(change._id, tokenFileName);
        }
        const { documentKey, updateDescription } = change;
        if (documentKey != undefined) {
          if (updateDescription != undefined) {
            publisher.keys(API_SETTINGS + "*").then(data => data.map(key => publisher.del(key).then()));
          }
        }
      } catch (error) {
        console.error("Event Watch -> 'apiUrlSetting' Error: ", error);
      }
    });

    return apiEventEmitter;
  },
  apiUrlSettingEventInit: () => {
    const tokenFileName = "apiurlsetting.json";
    const resumeToken = getResumeToken(tokenFileName)
    module.exports.wrapper(
      {
        tokenFileName,
        resumeToken,
        name: "API_URL_SETTINGS_STREAM",
      },
      module.exports.apiUrlSettingEventHandler,
    )
  },

  methodTypeEventHandler: async (methodTypeCountEmitter, tokenFileName, options) => {

    methodTypeCountEmitter = BankingType.watch([], { ...options, });

    methodTypeCountEmitter.on('change', change => {
      try {
        if (change._id) {
          saveResumeToken(change._id, tokenFileName);
        }
        const { documentKey, updateDescription } = change;
        event.emit(METHOD_TYPE_COUNT, { documentKey, updateDescription });
      } catch (error) {
        console.error("Event Watch -> 'MethodType Event' Error: ", error);
      }
    });

    return methodTypeCountEmitter;
  },
  methodTypeEventInit: () => {
    const tokenFileName = "methodtype.json";
    const resumeToken = getResumeToken(tokenFileName)
    module.exports.wrapper(
      {
        tokenFileName,
        resumeToken,
        name: "METHOD_TYPE_STREAM",
      },
      module.exports.methodTypeEventHandler,
    )
  },

  bankingMethodEventHandler: async (bankingMethodEventEmitter, tokenFileName, options) => {

    bankingMethodEventEmitter = BankingMethod.watch([{ "$match": { "operationType": { "$in": ["update"] } } }], { ...options, });

    bankingMethodEventEmitter.on('change', change => {
      try {
        if (change._id) {
          saveResumeToken(change._id, tokenFileName);
        }
        const { documentKey, operationType, updateDescription } = change;
        if (operationType != undefined)
          if (operationType == "update")
            if (updateDescription != undefined) {
              const { updatedFields } = updateDescription;
              if (updatedFields)
                event.emit(BANK_TYPE_UPDATE, { documentKey, updatedFields });
            }
      } catch (error) {
        console.error("Event Watch -> 'Banking Method Event' Error: ", error);
      }
    });

    return bankingMethodEventEmitter;
  },
  bankingMethodEventInit: () => {
    const tokenFileName = "bankingmethod.json";
    const resumeToken = getResumeToken(tokenFileName)
    module.exports.wrapper(
      {
        tokenFileName,
        resumeToken,
        name: "BANK_METHOD_STREAM",
      },
      module.exports.bankingMethodEventHandler,
    )
  },

  betCountEventInit: async () => {
    const betCountStream = await BetCount.watch(EventMatch, { fullDocument: 'updateLookup' });
    try {
      let firstChange = null;
      while (firstChange = await betCountStream.next()) {
        try {
          await betServiceAdmin.betCountUpdateInRedis(firstChange);
        } catch (error) {
          console.error("Event Watch -> 'Bet Count Event' Error: ", error);
        }
      }
    } catch (err) {
      console.error('Error betCount:', err);
    }
  },

  userEventHandler: async (userEventEmitter, tokenFileName, options) => {

    userEventEmitter = user.watch(
      [
        {
          $match: { operationType: { $in: ["update"] } },
        },
      ],
      { ...options },
    );

    userEventEmitter.on("change", (change) => {
      try {
        if (change._id) {
          saveResumeToken(change._id, tokenFileName);
        }
        event.emit(USER_CHANGE_EVENT, change);
      } catch (error) {
        console.error("Event Watch -> 'User Event' Error: ", error);
      }
    });

    return userEventEmitter;
  },
  userEventInit: () => {
    const tokenFileName = "user.json";
    const resumeToken = getResumeToken(tokenFileName)
    module.exports.wrapper(
      {
        tokenFileName,
        resumeToken,
        name: "USER_STREAM",
      },
      module.exports.userEventHandler,
    )
  },

};

function updateModelData(Model, query, update) {
  Model.updateMany(query, update).then();
}

// function getPreImageObject(updatedFields, fullDocumentBeforeChange) {
//   let preImage = {};
//   try {

//     Object.keys(updatedFields).map(key => {
//       if (key.includes('session_category_locked')) {
//         const splitted = key.split('.');
//         let scl_key, cat, self_parent_blocked_key;
//         let preImageKey = "";

//         if (splitted.length == 3) {
//           [scl_key, cat, self_parent_blocked_key] = splitted;
//           preImageKey = key;

//         } else if (splitted.length == 2) {
//           [scl_key, cat] = splitted;
//           const subKeys = Object.keys(updatedFields[key]);
//           [self_parent_blocked_key] = subKeys
//           preImageKey = `${key}.${self_parent_blocked_key}`;
//           updatedFields[preImageKey] = updatedFields[key][self_parent_blocked_key];
//           delete updatedFields[key];

//         } else if (splitted.length == 1) {
//           [scl_key] = splitted;
//           const subKeys = Object.keys(updatedFields[key]);
//           [cat] = subKeys;
//           const subKeys2 = Object.keys(updatedFields[key][cat]);
//           [self_parent_blocked_key] = subKeys2;
//           preImageKey = `${key}.${cat}.${self_parent_blocked_key}`;
//           updatedFields[preImageKey] = updatedFields[key][cat][self_parent_blocked_key];
//           delete updatedFields[key];

//         }
//         preImage[preImageKey] = !fullDocumentBeforeChange[scl_key]
//           ? []
//           : !fullDocumentBeforeChange[scl_key][cat]
//             ? []
//             : fullDocumentBeforeChange[scl_key][cat][self_parent_blocked_key] || [];

//       } else {
//         preImage[key] = fullDocumentBeforeChange[key]
//       }
//     });

//   } catch (error) {
//     console.error("Error in getPreImageObject: ", error)
//   }
//   return preImage;
// }

// function getOddElements(newArr, oldArr) {
//   try {
//     const set1 = new Set(newArr || []);
//     const set2 = new Set(oldArr || []);

//     // Find elements in arr1 but not in arr2
//     const oddFromNewArr = newArr.filter(el => !set2.has(el));
//     // Find elements in arr2 but not in arr1
//     const oddFromOldArr = oldArr.filter(el => !set1.has(el));

//     // Combine the results
//     return { newItem: oddFromNewArr, oldItems: oddFromOldArr };
//   } catch (error) {
//     console.error("Error in getOddElements: ", error);
//     return { newItem: [], oldItems: [] };
//   }
// }

function getUpdateObject(data, update, query = undefined, isFancy = false) {
  try {
    const {
      updatedFields,
      // fullDocumentBeforeChange 
    } = data;

    Object.keys(updatedFields).map(updated_key => {
      // if (
      //   ['parent_blocked', 'self_blocked'].includes(updated_key)
      // ) {
      //   const preImage = getPreImageObject(updatedFields, fullDocumentBeforeChange);
      //   const { newItem, oldItems } = getOddElements(updatedFields[updated_key], preImage[updated_key]);

      //   let key_name = updated_key;

      //   // Set Update Qbject
      //   if (preImage[updated_key].length > updatedFields[updated_key].length) {
      //     // Remove
      //     update['$pull'][key_name] = { $in: oldItems };

      //     if (downline_events_locked) {
      //       const idsToSkip = [];
      //       Object.keys(downline_events_locked).map(id => {
      //         const { parent_blocked, self_blocked } = downline_events_locked[id] || {};
      //         if (parent_blocked?.length && parent_blocked.includes(oldItems[0]) ||
      //           self_blocked?.length && self_blocked.includes(oldItems[0])) {
      //           idsToSkip.push(id.replace('*', '.'));
      //         }
      //       });
      //       if (idsToSkip.length) {
      //         query[skipKey] = { $nin: idsToSkip };
      //       }
      //     }
      //   } else {
      //     // Add
      //     update['$addToSet'][key_name] = { $each: newItem };
      //   }
      // } else {
      update['$set'][updated_key] = updatedFields[updated_key];
      // }
    });
  } catch (error) {
    console.error("Error in getUpdateObject: ", error);
  }
}