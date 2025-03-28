const { ObjectId } = require("bson");
const BetsOdds = require('../../models/betsOdds')
const BetsFancy = require('../../models/betsFancy')
const { resultResponse } = require("../../utils/globalFunction");
const {
  SERVER_ERROR,
  SUCCESS
} = require("../../utils/constants");
module.exports.getMarketAnalysis = async function getMarketAnalysis(req) {
  try {
    const user_id = ObjectId(req.User.user_id || req.User._id);
    // Create a search filter
    const filter = { user_id, is_result_declared: 0, delete_status: 0 }
    // Execute queries concurrently: domain list with pagination and total count for metadata
    const oddsBetQuery = betsOddsQuery(filter);
    const fancyBetQuery = betsFancyQuery(filter);
    const [betsOddsResult, betsFancyResult] = await Promise.all([
      BetsOdds.aggregate(oddsBetQuery),
      BetsFancy.aggregate(fancyBetQuery), // Get total count for pagination metadata
    ]);

    const mergedArray = [...betsOddsResult, ...betsFancyResult];
    // Sort the array by 'createdAt' in descending order
    return resultResponse(SUCCESS, {
      data: mergedArray.sort((a, b) => b.createdAt - a.createdAt), // Extract doamin name from result
    });
  } catch (error) {
    // Handle any errors during the request and return a server error response
    return resultResponse(SERVER_ERROR, error.message);
  }
};
function betsOddsQuery(filter) {
  return [
    { $match: filter }, // Apply the search filter,
    {
      $group: {
        _id: "$market_id", // Group by market_id
        sport_name: { $first: "$sport_name" }, // Get the first sport_name in each group
        match_name: { $first: "$match_name" }, // Get the first match_name in each group
        market_name: { $first: "$market_name" }, // Get the first market_name in each group
        match_id: { $first: "$match_id" }, // Get the first match_id in each group
        createdAt: { $first: "$createdAt" }, // Get the first createdAt in each group
        total: { $sum: 1 } // Count the total records in each group
      }
    },
    {
      $project: {
        _id: 0, // Exclude the default _id field
        market_id: "$_id", // Include market_id in the result
        sport_name: 1,
        match_name: 1,
        market_name: 1,
        match_id: 1,
        total: 1,
        createdAt: 1,
        is_fancy: { $literal: 0 }
      }
    }
  ];
}
function betsFancyQuery(filter) {
  return [
    // Match records for a specific user_id
    { $match: filter }, // Apply the search filter,
    // Join with the Fancy collection using fancy_id
    {
      $lookup: {
        from: "fancies", // Name of the Fancy collection
        localField: "fancy_id", // Field in Bets to match
        foreignField: "fancy_id", // Field in Fancy to match
        as: "fancy_details" // Output array field
      }
    },
    // Unwind the joined Fancy array to work with individual documents
    {
      $unwind: {
        path: "$fancy_details",
        preserveNullAndEmptyArrays: true // Keep records even if no match is found
      }
    },
    // Add a field to map category to market name
    {
      $addFields: {
        market_name: {
          $switch: {
            branches: [
              { case: { $eq: ["$fancy_details.category", 0] }, then: "Normal" },
              { case: { $eq: ["$fancy_details.category", 1] }, then: "Session Market" },
              { case: { $eq: ["$fancy_details.category", 2] }, then: "Over by Over" },
              { case: { $eq: ["$fancy_details.category", 3] }, then: "Ball by Ball" },
              { case: { $eq: ["$fancy_details.category", 6] }, then: "oddeven" },
            ],
            default: "Normal" // Fallback for unmapped categories
          }
        }
      }
    },
    // Group by category and match_id
    {
      $group: {
        _id: {
          category: "$fancy_details.category", // Group by category
          match_id: "$match_id" // Group by match_id
        },
        market_name: { $first: "$market_name" }, // Market name for the category
        match_name: { $first: "$match_name" }, // Match name for the match_id
        sport_name: { $first: "$sport_name" }, // Sport name
        createdAt: { $first: "$createdAt" }, // Get the first createdAt in each group
        total: { $sum: 1 } // Total records for each group
      }
    },
    // Project the final output fields
    {
      $project: {
        _id: 0, // Exclude default _id field
        match_id: "$_id.match_id", // Include match_id from _id
        market_name: 1,
        match_name: 1,
        sport_name: 1,
        total: 1,
        createdAt: 1,
        is_fancy: { $literal: 1 }
      }
    }
  ];
}