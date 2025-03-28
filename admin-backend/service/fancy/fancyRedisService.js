const moment = require("moment/moment");

// Models
const Fancy = require("../../../models/fancy");
const Match = require("../../../models/match");

const redisClient = require("../../../connections/redisConnections");
const {
  FANCY_KEY,
  UNIQUE_IDENTIFIER_KEY,
  EXPIRY_FOR_REDIS_FANCIES,
  AUTO,
  MANUAL,
  SUCCESS,
} = require("../../../utils/constants");
const { resultResponse } = require("../../../utils/globalFunction");
const CONSTANTS = require("../../../utils/constants");
const BetCountService = require("../betCount/betCountService");
const websiteService = require("../websiteService");
const logger = require('../../../utils/loggers/');
const { USER_BLOCK_TYPE } = require("../../../config/constant/user");

module.exports = {
  updateFanciesInRedis: async function (fancyDataRedisObj, fancy) {
    try {
      const redisObj = fancyDataRedisObj[fancy.fancy_id];
      if (redisObj) {
        let { key, redisData } = redisObj;
        redisData.oddsObj = fancy;
        fancyDataRedisObj[fancy.fancy_id] = redisData;
        redisClient
          .set(
            key,
            JSON.stringify(fancyDataRedisObj[fancy.fancy_id]),
            "EX",
            EXPIRY_FOR_REDIS_FANCIES,
          )
          .then();
      }
    } catch (error) {
      // console.log("Error in updateFanciesInRedis: ", error);
      logger.error(`FILE: FancyRedisService.js
          FUNCTION: updateFanciesInRedis
          ERROR: ${error.stack}
        `);
    }
  },
  deleteFanciesInRedis: async function (fancyIdsToNotRemove, match_id) {
    try {
      const pattern = `${FANCY_KEY}${match_id}:${"*"}${AUTO}${UNIQUE_IDENTIFIER_KEY}`;
      let keys = await redisClient.keys(pattern);

      keys = keys.filter((i) => {
        if (!i) return false;
        const fancyIdFromKey = i && i.split(":")[2];
        return !fancyIdsToNotRemove.includes(fancyIdFromKey);
      });

      if (keys.length) {
        await redisClient.del(...keys);
      }
    } catch (error) {
      // console.log("Error in deleteFanciesInRedis: ", error);
      logger.error(`FILE: FancyRedisService.js
          FUNCTION: deleteFanciesInRedis
          ERROR: ${error.stack}
        `);
    }
  },
  fancyDumpRedis: async () => {
    try {
      const startTime = moment(),
        todayDate = new Date();
      todayDate.setHours(0, 0, 0, 0);
      todayDate.setDate(todayDate.getDate() - 5);

      const matches = await Match.find(
        {
          is_active: 1,
          is_visible: true,
          is_result_declared: 0,
          sport_id: "4",
          enable_fancy: 1,
          is_abandoned: 0,
          match_date: { $gte: todayDate },
        },
        ["match_id"],
      ).lean();

      const fancies = await Fancy.find({
        is_active: 1,
        centralId: { $ne: null },
        match_id: { $in: matches.map((i) => i.match_id) },
      }).lean();

      const fanciesLength = fancies.length;

      // Return if No Market is Present !!
      if (!fanciesLength) {
        return;
      }

      const keys = fancies.map(
        (i) => {
          const manualText = !i.is_manual ? AUTO : MANUAL;
          return `${FANCY_KEY}${i.match_id}:${i.fancy_id}${manualText}${UNIQUE_IDENTIFIER_KEY}`;
        },
      );

      if (!keys.length) {
        return;
      }
      const redisData = await redisClient.mget(...keys);

      const multi = redisClient.multi();

      for (let i = 0; i < fanciesLength; i++) {
        const key = keys[i];
        let redisItem = redisData[i];
        let fancy = fancies[i];

        let finalObj;
        if (!redisItem) {
          // If No Data Exists in Redis
          finalObj = JSON.stringify(fancy);
        } else {
          // If Redis Item Exists;

          // Parse Redis Item before operations
          redisItem = JSON.parse(redisItem);

          finalObj = {
            ...redisItem,
            ...fancy,
          };
          finalObj = JSON.stringify(finalObj);
        }

        multi.set(key, finalObj);
        multi.expire(key, EXPIRY_FOR_REDIS_FANCIES);
      }

      await multi.exec(); // Execute the commands
      // console.timeLog("fancyDump")

      // console.log("Fancies -> ", fanciesLength);
    } catch (error) {
      // console.log("Error in FancyDumpService: ", error);
      logger.error(`FILE: FancyRedisService.js
          FUNCTION: FancyDumpService
          ERROR: ${error.stack}
        `);
    }
  },
  getFanciesV2: async function (request) {
    try {
      let { match_id, combine, category_wise_fancy, category } = request.joiData;
      const isOpen = request.path.includes("/fancies");

      // If isOpen Is true then these values will be undefined !!
      const {
        user_name,
        user_id,
        sports_permission,
        parent_level_ids,
        check_event_limit,
        domain_name,
      } = request.User || {};

      const pattern = `${FANCY_KEY}${match_id}:*${UNIQUE_IDENTIFIER_KEY}`;
      const keys = await redisClient.keys(pattern);

      if (!keys.length) {
        return resultResponse(
          CONSTANTS.VALIDATION_ERROR,
          "No Fancies Found !!",
        );
      }

      let fanciesDataRedis = await redisClient.mget(keys);

      const sportPermissionSportIds = isOpen
        ? []
        : sports_permission.map((data) => data.sport_id);
      const userIdsSet = new Set(
        isOpen
          ? []
          : [
            ...parent_level_ids.map((data) => data.user_id),
            user_id.toString(),
          ],
      );

      fanciesDataRedis = fanciesDataRedis
        .map((i) => JSON.parse(i))
        .filter((i) => {
          if (!i) return false;
          const {
            sport_id: fancySportId,
            is_active,
            centralId,
          } = i;

          let parent_blocked = i.parent_blocked ?? [];
          let self_blocked = i.self_blocked ?? [];

          // Ensure user is not blocked
          const isUserBlocked = isOpen
            ? false
            : (USER_BLOCK_TYPE == 'DEFAULT')
              ? parent_blocked.some((item) => userIdsSet.has(item)) || self_blocked.some((item) => userIdsSet.has(item))
              : false;

          // Check Is Active
          const checkIsActive = is_active == 1;

          // Check Is Central Id Not NULL
          const checkIsCentralId = centralId != null;

          // Check If not a Casino Sport Id
          const checkIfSportPermissionAllowed = isOpen
            ? true
            : sportPermissionSportIds.includes(fancySportId);

          // Check Category
          const checkCategory = category ? i.category == category : true;

          return (
            checkIsActive &&
            checkIsCentralId &&
            checkIfSportPermissionAllowed &&
            !isUserBlocked &&
            checkCategory
          );
        })
        .sort((a, b) => a.category - b.category || a.chronology - b.chronology);

      const fields = [
        "fancy_id",
        "fancy_name",
        "session_min_stack",
        "session_max_stack",
        "category",
      ];

      if (isOpen) {
        fields.push(
          ...[
            "session_value_yes",
            "session_value_no",
            "session_size_no",
            "session_size_yes",
            "display_message",
          ],
        );
      } else {
        fields.push(
          ...[
            "name",
            "selection_id",
            "is_active",
            "is_lock",
            "is_created",
            "news",
            "chronology",
            "session_live_odds_validation",
            "session_live_max_stack",
            "session_live_min_stack",
            "session_max_profit",
          ],
        );
      }
      let getWebsiteSettings;
      if (!isOpen && combine) {
        getWebsiteSettings = await websiteService.getWebsiteSettingsFromCache({
          domain_name,
        });
      }

      fanciesDataRedis = fanciesDataRedis.map((fancy) => {
        let data = {};

        fields.map((key) => {
          data[key] = fancy[key];
        });

        if (!isOpen && combine) {
          data.LayPrice1 = 0;
          data.LaySize1 = 0;
          data.BackPrice1 = 0;
          data.BackSize1 = 0;
          data.GameStatus = CONSTANTS.SUSPENDED;
          data.MarkStatus = "";
          data.Min = 0;
          data.Max = 0;
          data.backLayLength = 1;
          let redisFancy = fancy.oddsObj;
          if (redisFancy) {
            const {
              RunnerName,
              // LayPrice1,
              // LaySize1,
              // BackPrice1,
              // BackSize1,
              GameStatus,
              MarkStatus,
              Min,
              Max,
              backLayLength,
            } = redisFancy;

            const tempBackLayData = {};
            for (let i = 1; i <= (backLayLength || 1); i++) {
              tempBackLayData[`LayPrice${i}`] = redisFancy[`LayPrice${i}`]
              tempBackLayData[`LaySize${i}`] = redisFancy[`LaySize${i}`]
              tempBackLayData[`BackPrice${i}`] = redisFancy[`BackPrice${i}`]
              tempBackLayData[`BackSize${i}`] = redisFancy[`BackSize${i}`]
            }

            redisFancy = {
              RunnerName,
              ...tempBackLayData,
              backLayLength: (backLayLength || 1),
              // LayPrice1,
              // LaySize1,
              // BackPrice1,
              // BackSize1,
              GameStatus,
              MarkStatus,
              Min,
              Max,
            };

            redisFancy.fancy_name = redisFancy?.RunnerName || fancy.fancy_name;
            redisFancy.RunnerName = redisFancy?.RunnerName;

            // if (redisFancy?.Category)
            //   redisFancy.category = parseInt(redisFancy.Category);

            // if (redisFancy?.Srno)
            //   redisFancy.Srno = parseInt(redisFancy.Srno);

            // if user limit is enabled.
            if (check_event_limit == false) {
              // Session setting is disabling.
              redisFancy.session_live_odds_validation = false;
              redisFancy.user_setting_limit = true;
            } else {
              //  user limit is disabled
              redisFancy.user_setting_limit = false;

              let diamond_rate_limit_enabled = false;
              if (getWebsiteSettings.statusCode == SUCCESS) {
                diamond_rate_limit_enabled =
                  getWebsiteSettings.data.diamond_rate_limit_enabled;
              }
              if (diamond_rate_limit_enabled) {
                // Assign Min and Max based on session_live_odds_validation
                if (fancy.session_live_odds_validation == true) {
                  if (redisFancy.hasOwnProperty("Min"))
                    redisFancy.Min = parseInt(redisFancy.Min);
                  if (redisFancy.hasOwnProperty("Max"))
                    redisFancy.Max = parseInt(redisFancy.Max);
                } else {
                  if (fancy.hasOwnProperty("session_min_stack"))
                    redisFancy.Min = fancy.session_min_stack;
                  if (fancy.hasOwnProperty("session_max_stack"))
                    redisFancy.Max = fancy.session_max_stack;
                }
              } else {
                if (fancy.hasOwnProperty("session_min_stack"))
                  redisFancy.Min = fancy.session_min_stack;
                if (fancy.hasOwnProperty("session_max_stack"))
                  redisFancy.Max = fancy.session_max_stack;
              }
              // delete data.session_min_stack;
              // delete data.session_max_stack;
            }

            Object.assign(data, redisFancy);
          }
        }

        return data;
      });

      if (!isOpen) {
        await BetCountService.getAndAppendBetCount(user_name, fanciesDataRedis, 'FANCY');
      }

      let response;
      let groupedFancies = {}

      if (category_wise_fancy) {
        const fancy_category_keys = Object.keys(CONSTANTS.FANCY_CATEGORY);
        fancy_category_keys.map(key => {
          groupedFancies[CONSTANTS.FANCY_CATEGORY[key]] = [];
        });
        fanciesDataRedis.map(i => {
          groupedFancies[CONSTANTS.FANCY_CATEGORY[i.category]].push(i)
        })
      }

      if (isOpen) {
        if (category_wise_fancy) {
          response = groupedFancies;
        } else {
          response = fanciesDataRedis;
        }
      } else {
        if (category_wise_fancy) {
          response = { data: groupedFancies };
        } else {
          response = {
            data: fanciesDataRedis,
            fancy_category: CONSTANTS.FANCY_CATEGORY,
          };
        }
      }

      return resultResponse(
        CONSTANTS.SUCCESS,
        response
      );
    } catch (error) {
      return resultResponse(CONSTANTS.SERVER_ERROR, error.message);
    }
  },
  manualFancyOddsDumpRedis: async () => {
    try {
      const todayDate = new Date();
      todayDate.setHours(0, 0, 0, 0);
      todayDate.setDate(todayDate.getDate() - 5);

      const matches = await Match.find(
        {
          is_active: 1,
          is_visible: true,
          is_result_declared: 0,
          sport_id: "4",
          enable_fancy: 1,
          is_abandoned: 0,
          match_date: { $gte: todayDate },
        },
        ["match_id"],
      ).lean();

      const fancies = await Fancy.find({
        is_active: 1,
        centralId: { $ne: null },
        is_manual: 1,
        match_id: { $in: matches.map((i) => i.match_id) },
      }).lean();

      const fancyIds = [];

      const keys = fancies.map(
        (i) => {
          fancyIds.push(i.fancy_id);
          return `${FANCY_KEY}${i.match_id}:${i.fancy_id}${MANUAL}${UNIQUE_IDENTIFIER_KEY}`
        },
      );

      if (!keys.length) return;

      const fancyOdds = await redisClient.mget(...fancyIds);

      const multi = redisClient.multi();

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        let fancyOdd = fancyOdds[i];
        let fancy = fancies[i];

        if (!fancy) continue;
        fancyOdd = JSON.parse(fancyOdd);

        let finalObj = {
          ...fancy,
          oddsObj: fancyOdd || {},
        }
        finalObj = JSON.stringify(finalObj);

        multi.set(key, finalObj);
        multi.expire(key, EXPIRY_FOR_REDIS_FANCIES);
      }

      await multi.exec();

    } catch (error) {
      // console.log("Error in manualFancyOddsDumpRedis: ", error);
      logger.error(`FILE: FancyRedisService.js
          FUNCTION: manualFancyOddsDumpRedis
          ERROR: ${error.stack}
        `);
    }
  }
};
