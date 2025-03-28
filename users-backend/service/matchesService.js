const { SUCCESS, NOT_FOUND, SERVER_ERROR, DATA_NULL } = require("../../utils/constants")
	, Market = require('../../models/market')
	, { resultResponse } = require('../../utils/globalFunction');

let getSelectionByMatchId = async (FilterQuery, Projection) => {
	try {
		let selections = await Market.findOne(FilterQuery, Projection);
		if (selections)
			return resultResponse(SUCCESS, selections);
		else
			return resultResponse(NOT_FOUND, DATA_NULL);
	} catch (error) {
		return resultResponse(SERVER_ERROR, DATA_NULL);
	}
};


async function getMatchesDetails(FilterQuery = {}, Projection = {}, findOne = false) {
	try {
		let matchDetails;
		if (findOne)
			matchDetails = await Match.findOne(FilterQuery, Projection);
		else
			matchDetails = await Match.find(FilterQuery, Projection);
		if (matchDetails)
			return resultResponse(SUCCESS, matchDetails);
		else
			return resultResponse(NOT_FOUND, DATA_NULL);
	} catch (error) {
		return resultResponse(SERVER_ERROR, error.message);
	}
};

async function getMatchDetail(FilterQuery = {}, Projection = {}) {
	return await getMatchesDetails(FilterQuery, Projection, true);
}

module.exports = { getSelectionByMatchId, getMatchDetail, getMatchesDetails }