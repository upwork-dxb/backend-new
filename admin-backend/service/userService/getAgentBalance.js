const { ObjectId } = require("bson");
const { getLiability } = require("./getLiabilityFullAndShare.js");
const User = require("../../../models/user");
const { resultResponse } = require("../../../utils/globalFunction");
const {
  SUCCESS,
  NOT_FOUND,
  SERVER_ERROR,
} = require("../../../utils/constants");

module.exports.getAgentBalance = async (req) => {
  user_id = ObjectId(req.user._id);

  // Execute both the main query and the total count query concurrently
  let [totalBalance, exposure] = await Promise.all([
    getBalanceReferenceSum(user_id),
    getLiability({ user_ids: [user_id] }), // Get the total number of matching users
  ]);

  if (totalBalance.statusCode != SUCCESS) {
    totalBalance = 0;
  } else {
    totalBalance = totalBalance.data;
  }

  if (exposure.statusCode != SUCCESS) {
    exposure = 0;
  } else {
    exposure = exposure.data[0]?.liability || 0;
  }

  return resultResponse(SUCCESS, {
    data: {
      creditReference: req.user.credit_reference,
      availableBalance: req.user.balance,
      totalBalance,
      exposure,
    },
  });
};

async function getBalanceReferenceSum(user_id) {
  try {
    let query = getBalanceReferenceSumQuery(user_id);

    let getBalanceReferenceSum = await User.aggregate(query).allowDiskUse(true);

    if (getBalanceReferenceSum.length)
      return resultResponse(
        SUCCESS,
        getBalanceReferenceSum[0].balance_reference,
      );
    else return resultResponse(SUCCESS, 0);
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

function getBalanceReferenceSumQuery(user_id) {
  return [
    {
      $match: {
        parent_id: user_id,
      },
    },
    {
      $group: {
        _id: null,
        balance_reference: {
          $sum: { $round: ["$balance_reference", 2] },
        },
      },
    },
    {
      $project: {
        balance_reference: {
          $round: ["$balance_reference", 2],
        },
      },
    },
  ];
}
