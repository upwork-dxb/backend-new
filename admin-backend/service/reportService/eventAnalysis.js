const moment = require('moment');
const logger = require('../../../utils/loggers');
const utils = require("../../../utils");
const { resultResponse } = require('../../../utils/globalFunction');
const { getMarketAnalysis } = require("./marketAnalysis");
const { getFancyAnalysis } = require("./fancyAnalysis");
const {
  SUCCESS,
  NOT_FOUND,
  SERVER_ERROR,
  FANCY_CATEGORY_DIAMOND,
  CRICKET,
  RACING_SPORTS,
} = require("../../../utils/constants");

module.exports.eventAnalysis = async (req) => {
  // Capture start time for performance measurement
  const startTime = moment();

  // Generate a unique reference code for logging (optional)
  const LOG_REF_CODE = utils.generateUUID();

  try {
    req.log = { calling: "reportService:eventAnalysis", LOG_REF_CODE };

    // Execute both API calls concurrently
    const [marketAnalysis, fancyAnalysis] = await Promise.all([
      getMarketAnalysis(req),
      getFancyAnalysis(req),
    ]);

    // Initialize an empty result array
    let result = [];

    // Check and accumulate data from both analyses
    if (marketAnalysis.statusCode === SUCCESS) {
      result.push(...marketAnalysis.data);
    }
    if (fancyAnalysis.statusCode === SUCCESS) {
      result.push(...fancyAnalysis.data);
    }

    if (!result.length) {
      return resultResponse(NOT_FOUND, "Event Analysis data not found!");
    }

    // Initialize output structure
    const output = {};

    result.forEach((item) => {
      const {
        sport_id: sportId,
        sport_name: sportName,
        match_id: matchId,
        match_name: matchName,
        match_date: matchDate,
        event_id: eventId,
        event_name: eventName,
        event_type: eventType,
        type,
        team_id: selectionId,
        team_name: selectionName,
        team_sort_priority: sortPriority,
        win_loss: winLoss,
        win_loss_total_exposure: winLossTotalExposure,
        max_profit: profit,
        max_full_profit: fullProfit,
        category,
        event_name: fancyName,
      } = item;

      // Initialize sport if not present
      if (!output[sportName]) {
        output[sportName] = [];
      }

      // Find or create the match object
      let match = output[sportName].find((m) => m.match_id === matchId);
      if (!match) {
        match = {
          match_id: matchId,
          match_name: matchName,
          match_date: matchDate,
          markets: {},
        };
        if ([CRICKET].includes(sportId)) {
          match.fancies = {};
        }
        output[sportName].push(match);
      }

      // Define the market or fancy type name
      const typeName = `${RACING_SPORTS.includes(sportId) ? eventName.toUpperCase().replace(/ /g, "_") : eventType}|${eventId}`;

      // Process based on item type (market or fancy)
      if (type === 1) {
        // Market processing
        if (!match.markets[typeName]) {
          match.markets[typeName] = [];
        }
        match.markets[typeName].push({
          selection_id: selectionId,
          selection_name: selectionName,
          sort_priority: sortPriority,
          win_loss: winLoss.toFixed(2),
          win_loss_total_exposure: winLossTotalExposure,
        });
      } else if (type === 2) {
        // Fancy processing
        const fancyCategory = (
          FANCY_CATEGORY_DIAMOND[category] || "NORMAL"
        ).toUpperCase();
        if (!match.fancies[fancyCategory]) {
          match.fancies[fancyCategory] = [];
        }
        match.fancies[fancyCategory].push({
          fancy_name: fancyName,
          fancy_id: eventId,
          profit: profit,
          full_profit: fullProfit,
          liability: winLoss.toFixed(2),
          liability_total: winLossTotalExposure,
        });
      }
    });

    // Return successful response with structured data
    return resultResponse(SUCCESS, { data: output });
  } catch (error) {
    logger.error(`${LOG_REF_CODE} Error eventAnalysis`, {
      error: error.message,
    });
    return resultResponse(SERVER_ERROR, error.message);
  } finally {
    logger.info(
      `${LOG_REF_CODE} Event Analysis Execution Time: ${utils.getTimeTaken({ startTime })}`,
    );
  }
}