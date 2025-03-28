const { ObjectId } = require("bson");
const BetLock = require("../../../models/betLock");
const User = require("../../../models/user");
const { resultResponse } = require("../../../utils/globalFunction");
const {
  SUCCESS,
  NOT_FOUND,
  LABEL_DIAMOND,
  USER_TYPE_SUPER_ADMIN,
} = require("../../../utils/constants");
const BET_LOCK_TTL = 7;

module.exports.lockUnlock = async (req) => {
  const { updateFilter } = req; // Filter to find the document to update.
  const { lockType, user_id } = req.joiData; // Determine whether to lock or unlock based on the `lockType` parameter.
  const { User: Self } = req;

  // Retrieve the IDs of users who are blocking.
  const users = await getBlockingUserIds(req);

  // If no users are found, return a "not found" response.
  if (!users.length) {
    return resultResponse(NOT_FOUND, "No blocking user found.");
  }

  let update;
  if (lockType) {
    // If lockType is true, add the blocking users to the `bet_lock` array using `$addToSet`.
    update = { $addToSet: { bet_lock: { $each: users } } };
  } else {
    // If lockType is false, remove the blocking users from the `bet_lock` array using `$pull`.
    update = { $pull: { bet_lock: { $in: users } } };
  }

  let todayDate = new Date(); // Get the current date.
  const expireAt = todayDate.setDate(todayDate.getDate() + BET_LOCK_TTL); // Calculate the expiry date by adding TTL.
  update["$set"] = { expireAt }; // Add expiry date to the update object.

  // Update the BetLock collection with the constructed update object. Use `upsert` to create a new document if none exists.
  const updateStatus = await BetLock.updateOne(updateFilter, update, {
    upsert: true,
  });

  // Check if the update modified an existing document or created a new one.
  if (!updateStatus.modifiedCount && !updateStatus.upsertedId) {
    return resultResponse(NOT_FOUND, `Nothing to lock!`); // If no changes, return a "not found" response.
  }

  if (user_id === Self._id.toString()) {
    // Return success response with the appropriate lock/unlock message.
    return resultResponse(SUCCESS, lockType ? `All User Locked` : `All User unlocked`);
  } else {
    // Return success response with the appropriate lock/unlock message.
    return resultResponse(SUCCESS, `User ${!lockType ? "Un" : ""}locked`);
  }
};

async function getBlockingUserIds(req) {
  // Destructure user ID from validated request data (assuming joi middleware)
  const { user_id } = req.joiData;

  // Destructure user models from request context
  const { User: Self, user: Child } = req;

  // Initialize an empty array to store user IDs for blocking
  let userIdsForBlock = [];

  // If the current user is a super admin (USER_TYPE_SUPER_ADMIN), they can block anyone
  // so return an empty array (no restrictions)
  if (Child.user_type_id === USER_TYPE_SUPER_ADMIN) {
    return userIdsForBlock;
  }

  // If the user is trying to block themself, identify their children (users with them as parent)
  if (user_id === Self._id.toString()) {
    const filter = { parent_id: ObjectId(Self._id) }; // Filter for users with current user as parent

    // Find child users with only the "_id" field and convert them to string for easier comparison
    const users = await User.find(filter).select(["_id"]).lean().exec();
    if (users.length) {
      userIdsForBlock = users.map((user) => user._id.toString()); // Extract and convert child user IDs
    }
  } else {
    // If not blocking themself, simply add the target user ID to the list
    userIdsForBlock.push(user_id);
  }

  // Return the final list of user IDs for blocking
  return userIdsForBlock;
}

module.exports.getBetLockList = async (req) => {
  // Destructure user model and bet lock filter from request context
  const { User: Self, betLockFilter } = req;

  // Define the base filter for finding users
  let filter = {
    parent_id: ObjectId(Self._id), // Users under the current user (parent)
    belongs_to_credit_reference: 1, // Include users with credit reference
    belongs_to: LABEL_DIAMOND, // Filter by specific label (e.g., Diamond)
    self_close_account: 0, // Exclude users who closed their own account
    parent_close_account: 0, // Exclude users whose parent closed their account
  };

  // Set default pagination options and calculate skip value
  let { page, limit } = req.joiData;
  limit = parseInt(limit || 50, 10); // Default to 50 items per page
  page = parseInt(page || 1, 10); // Default to page 1 if not specified
  const skip = (page - 1) * limit; // Calculate number of items to skip

  // Execute multiple queries concurrently for efficiency
  let [result, total, betLockList] = await Promise.all([
    // Find paginated user list with specific fields and apply skip/limit
    User.find(filter)
      .select(["_id", "name"])
      .skip(skip)
      .limit(limit)
      .lean()
      .exec(),
    // Get total count of users matching the filter (for pagination metadata)
    User.find(filter).countDocuments(),
    // Find specific bet lock details using the provided filter
    BetLock.findOne(betLockFilter).select(["-_id", "bet_lock"]).lean().exec(),
  ]);

  // Handle potential missing bet lock data
  if (betLockList) {
    betLockList = betLockList?.bet_lock ? betLockList.bet_lock : [];
  } else {
    betLockList = [];
  }

  // Loop through user data and add additional properties
  result.map((data) => {
    data.user_id = data._id.toString(); // Convert user ID to string for easier comparison
    delete data._id; // Remove unnecessary "_id" field from response
    // Check if user ID is present in the bet lock list and set a flag accordingly
    data.is_blocked = betLockList.includes(data.user_id);
  });

  // Check if all users in the result are blocked
  const allDeleted = result.every((item) => item.is_blocked === true);

  // Add a special "All Account" entry at the beginning of the list
  result.unshift({
    name: "All Account",
    user_id: Self._id, // User ID of the current user
    is_blocked: allDeleted, // Set "is_blocked" based on all users being blocked
  });

  // Return formatted response with data and pagination metadata
  return resultResponse(SUCCESS, {
    data: {
      metadata: {
        total, // Total users matching the filter
        limit, // Items per page
        page, // Current page number
        pages: Math.ceil(total / limit), // Calculate total pages based on total and limit
      },
      data: result, // Paginated user list with additional properties
    },
  });
};
