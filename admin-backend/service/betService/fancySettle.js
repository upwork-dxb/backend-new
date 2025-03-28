const FancyScorePosition = require("../../../models/fancyScorePosition");
const {
  SUCCESS,
  NOT_FOUND,
  SERVER_ERROR,
} = require("../../../utils/constants");
const { resultResponse } = require("../../../utils/globalFunction");
const { deleteConcurrencyById } = require("../concurrencyControl");

module.exports.finalActionForFancySettle = async (params) => {
  // Inactivate the team data for fancy analysis.
  updateTeamData(params);
};

async function updateTeamData(params) {
  try {
    // Extract the fancy ID from the parameters
    const { fancy_id } = params;

    // Update multiple documents in the FancyScorePosition collection
    // where the fancy ID matches the provided one
    await FancyScorePosition.updateMany({ fancy_id }, { is_active: false });

    // Delete the Result CC Entry
    // deleteConcurrencyById(params?.ccId);

    // Send a success response with a message indicating successful update
    resultResponse(SUCCESS, "Team data updated successfully...");
  } catch (error) {
    // Handle errors and send an error response with the error message
    resultResponse(SERVER_ERROR, error.message);
  }
}
