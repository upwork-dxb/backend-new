const Partnerships = require('../../models/partnerships');
const CONSTANTS = require('../../utils/constants');
const globalFunction = require('../../utils/globalFunction');
let resultResponse = globalFunction.resultResponse;

let sportskeyforpopulate = 'name sport_id';
let userkeyforpopulate = 'name user_name user_type_id';

let checkParentPartnership = async (userId, sport_id, user_share) => {
  try {
    let partnershipDetails = await Partnerships.findOne({ user_id: userId, 'sports_share.sport_id': sport_id }, {
      'sports_share.$': 1
    }).populate(
      'sports_share.sport_id', sportskeyforpopulate
    ).lean();
    if (partnershipDetails) {
      if (user_share <= partnershipDetails.sports_share[0].percentage[partnershipDetails.sports_share[0].percentage.length - 1].parent_share)
        return resultResponse(CONSTANTS.SUCCESS, partnershipDetails.sports_share[0]);
      else
        return resultResponse(CONSTANTS.NOT_FOUND, partnershipDetails.sports_share[0]);
    } else
      return resultResponse(CONSTANTS.NOT_FOUND, CONSTANTS.DATA_NULL);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

let validatePartnership = async (userId, sport_id, user_share) => {
  try {
    let partnershipDetails = await Partnerships.findOne({
      parent_id: userId, "sports_share": {
        "$elemMatch": {
          "sport_id": sport_id,
          "percentage": {
            "$elemMatch": {
              "parent_id": userId,
              "user_share": { $gt: user_share }
            }
          }
        }
      },
    }, {
      'sports_share.$': 1
    }).populate(
      'sports_share.sport_id', sportskeyforpopulate
    ).lean();
    if (partnershipDetails)
      return resultResponse(CONSTANTS.NOT_FOUND, partnershipDetails.sports_share[0]);
    else
      return resultResponse(CONSTANTS.SUCCESS, CONSTANTS.DATA_NULL);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

let getPartnershipByUserId = async (id, sport_id) => {
  try {
    let partnershipsdetails = await Partnerships.findOne({ user_id: id, 'sports_share.sport_id': sport_id }, {
      'sports_share.$': 1
    }).populate(
      'sports_share.sport_id', sportskeyforpopulate
    ).populate(
      'parent_id', userkeyforpopulate
    ).lean();
    if (partnershipsdetails)
      return resultResponse(CONSTANTS.SUCCESS, partnershipsdetails);
    else
      return resultResponse(CONSTANTS.NOT_FOUND, CONSTANTS.DATA_NULL);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

let updatePartnershipByUserAndSportId = async (user_id, sport_id, user_share, newParentPartnership, newChildPartnership, updateObjectId, updateUserParentObjectId, parentId) => {
  try {
    let parentPartnershipsdetails = await Partnerships.updateOne(
      {
        user_id: user_id,
        "sports_share": {
          "$elemMatch": {
            sport_id, "percentage._id": updateObjectId
          }
        }
      },
      {
        "$set": {
          "sports_share.$[outer].percentage.$[inner].user_share": user_share,
          "sports_share.$[outer].percentage.$[inner].share": user_share,
          "sports_share.$[outer].percentage.$[inner].parent_partnership_share": newParentPartnership
        }
      },
      {
        "arrayFilters": [
          { "outer.sport_id": sport_id },
          { "inner._id": updateObjectId }
        ]
      }
    );
    await Partnerships.updateOne(
      {
        user_id: user_id,
        "sports_share": {
          "$elemMatch": {
            sport_id, "percentage._id": updateUserParentObjectId
          }
        }
      },
      {
        "$set": {
          "sports_share.$[outer].percentage.$[inner].share": newParentPartnership,
        }
      },
      {
        "arrayFilters": [
          { "outer.sport_id": sport_id },
          { "inner._id": updateUserParentObjectId }
        ]
      }
    );
    await Partnerships.updateMany(
      {
        parent_id: user_id,
        "sports_share": {
          "$elemMatch": {
            sport_id, "percentage.parent_id": user_id
          }
        }
      },
      {
        "$set": {
          "sports_share.$[outer].percentage.$[inner].parent_share": user_share
        },
        "$inc": {
          "sports_share.$[outer].percentage.$[inner].parent_partnership_share": newChildPartnership
        }
      },
      {
        "arrayFilters": [
          { "outer.sport_id": sport_id },
          { "inner.parent_id": user_id }
        ]
      }
    );
    await Partnerships.updateMany(
      {
        parent_id: user_id,
        "sports_share": {
          "$elemMatch": {
            "sport_id": sport_id
          }
        }
      },
      {
        "$set": {
          "sports_share.$[outer].percentage.$[inner].user_share": user_share,
          "sports_share.$[outer].percentage.$[inner].share": newParentPartnership,
          "sports_share.$[outer].percentage.$[inner].parent_partnership_share": newParentPartnership,
        },
        "$inc": {
          "sports_share.$[outer].percentage.$[grandParentInner].share": newChildPartnership
        }
      },
      {
        "arrayFilters": [
          { "outer.sport_id": sport_id },
          { "inner.user_id": user_id },
          { "grandParentInner.user_id": parentId }
        ]
      }
    )
    if (parentPartnershipsdetails)
      return resultResponse(CONSTANTS.SUCCESS, parentPartnershipsdetails);
    else
      return resultResponse(CONSTANTS.NOT_FOUND, CONSTANTS.DATA_NULL);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

let getUserPartnershipByUserId = async (FilterQuery = {}, Projection = {}) => {
  try {
    let partnershipsdetails = await Partnerships
      .findOne(FilterQuery, Projection)
      .lean();
    if (partnershipsdetails) {
      partnershipsdetails = partnershipsdetails.sports_share[0].percentage.map(data => {
        const { share, user_id } = data;
        return { share, user_id };
      });
      return resultResponse(CONSTANTS.SUCCESS, partnershipsdetails);
    } else
      return resultResponse(CONSTANTS.NOT_FOUND, CONSTANTS.DATA_NULL);
  } catch (error) {
    return resultResponse(CONSTANTS.SERVER_ERROR, CONSTANTS.DATA_NULL);
  }
};

async function getUserPartnershipByUserIdAndSportId(user_id, sport_id) {
  return getUserPartnershipByUserId(
    { user_id: user_id, 'sports_share.sport_id': parseInt(sport_id) },
    { _id: 0, 'sports_share.percentage.$': 1 }
  ).then();
}

module.exports = {
  checkParentPartnership, validatePartnership, getPartnershipByUserId,
  updatePartnershipByUserAndSportId, getUserPartnershipByUserId, getUserPartnershipByUserIdAndSportId
}