const OddsProfitLoss = require("../../../models/oddsProfitLoss");
const GameLock = require("../../../models/gameLock");
const Match = require("../../../models/match");
const {
  SUCCESS,
  NOT_FOUND,
  SERVER_ERROR,
  RACING_SPORTS,
  MATCH_ODDS_TYPE,
  BOOKMAKER_TYPE
} = require("../../../utils/constants");
const { resultResponse } = require("../../../utils/globalFunction");
const { deleteConcurrencyById } = require("../concurrencyControl");

module.exports.finalActionForMarketSettle = async (params) => {
  // Inactivate the team data for market analysis.
  updateTeamData(params);

  // Delete Game Lock 
  deleteGameLock(params);

  // Delete Coucurrency Entry
  // deleteConcurrencyById(params?.ccId, 5000);

  // Update HR & GHR match details.
  // updateMatchDetails(params);
};

async function updateTeamData(params) {
  try {
    // Extract the market ID from the parameters
    const { market_id } = params;

    // Update multiple documents in the OddsProfitLoss collection
    // where the market ID matches the provided one
    await OddsProfitLoss.updateMany({ market_id }, { is_active: false });

    // Send a success response with a message indicating successful update
    resultResponse(SUCCESS, "Team data updated successfully...");
  } catch (error) {
    // Handle errors and send an error response with the error message
    resultResponse(SERVER_ERROR, error.message);
  }
}

async function deleteGameLock(params) {
  try {
    // Extract the Match Id & Market Name from the parameters
    const { match_id, market_type } = params;

    if (market_type != MATCH_ODDS_TYPE && market_type != BOOKMAKER_TYPE) {
      return resultResponse(SUCCESS, message);
    }

    await GameLock.deleteMany({ match_id }).exec();

    const message = "Game Lock Deleted successfully for MatchId: " + match_id;

    // Send a success response with a message indicating successful update
    return resultResponse(SUCCESS, message);
  } catch (error) {
    // Handle errors and send an error response with the error message !
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function updateMatchDetails(params) {
  try {
    // Extract the match ID from the parameters
    const { match_id, sport_id } = params;

    // Only Hr & GHr sports are allowed.
    console.log(RACING_SPORTS.includes(sport_id), sport_id);
    if (RACING_SPORTS.includes(sport_id)) {
      // Update the corresponding match details in the Match collection
      const matchDetails = await Match.updateOne({ match_id }, { $set: { inplay: false } });
      console.log(matchDetails);
      return resultResponse(SUCCESS, "The inplay status updated successfully...");
    }

    return resultResponse(NOT_FOUND, "No need to update match data successfully...");

  } catch (error) {
    // Handle errors and send an error response with the error message
    resultResponse(SERVER_ERROR, error.message);
  }
}