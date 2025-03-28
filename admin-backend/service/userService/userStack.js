const userStack = require('../../../config/constant/userStack');
const UserStack = require('../../../models/userStack');
const User = require('../../../models/user');
const { ObjectId } = require("bson")
const { resultResponse } = require("../../../utils/globalFunction");
const {
  SUCCESS,
  NOT_FOUND,
  SERVER_ERROR
} = require("../../../utils/constants");
async function saveUserStack(request) {
  try {
    await UserStack.create({
      user_id: request.user_id,
      gameButtons: userStack.DEFAULT_GAME_BUTTONS,
      casinoButtons: userStack.DEFAULT_CASINO_BUTTONS,
      parent_level_ids: request.parent_level_ids
    });
    return resultResponse(SUCCESS, {
      data: "Update Button Value."
    });
  } catch (error) {
    // Handle any errors during the request and return a server error response
    return resultResponse(SERVER_ERROR, error.message);
  }
};
module.exports.saveUserStack = saveUserStack;

module.exports.getUserStack = async function getUserStack(request) {
  try {
    // Fetch user stack data from the database
    let user_id = request.body.user_id ? request.body.user_id : request.User._id;
    let data = await UserStack.findOne(
      { user_id: user_id }, // Filter by user_id
      {
        casinoButtons: 1,
        gameButtons: 1,
        _id: 0
      }
    );

    // If no data is found, return an empty object
    if (!data) {
      return resultResponse(
        NOT_FOUND,
        "No user stack found!"
      );
    }


    // Return the cleaned data
    return resultResponse(SUCCESS, { data: data });
  } catch (error) {
    // Handle any errors during the request and return a server error response
    return resultResponse(SERVER_ERROR, { error: error.message });
  }
};

module.exports.updateUserStack = async function updateUserStack(request) {
  try {
    let user_id = request.body.user_id ? request.body.user_id : request.User._id;
    let parent_level_ids = request.body.user_id ? request.user.parent_level_ids : request.User.parent_level_ids;
    const { gameButtons, casinoButtons } = request.body;
    const userStackValue = await UserStack.findOne({ user_id: user_id });
    if (!userStackValue) {
      saveUserStack({ user_id, parent_level_ids: parent_level_ids })
      return resultResponse(SUCCESS, { data: "Update Button Value." });
    }

    if (gameButtons) {
      userStackValue.gameButtons = gameButtons;
    }
    if (casinoButtons) {
      userStackValue.casinoButtons = casinoButtons;
    }
    if (parent_level_ids) {
      userStackValue.parent_level_ids = parent_level_ids;
    }

    await userStackValue.save();
    // Return the cleaned data
    return resultResponse(SUCCESS, { data: "Update Button Value." });
  } catch (error) {
    // Handle any errors during the request and return a server error response
    return resultResponse(SERVER_ERROR, { error: error.message });
  }
};

module.exports.setUserStack = async function setUserStack(request) {
  try {
    // Fetch the user list based on the given criteria
    const userList = await UserStack.find(
      {
        "parent_level_ids.user_id": request.body.user_id,
      },
      {
        user_id: 1
      }
    ).exec();

    // Fetch existing UserStack entries for these users
    const existingUserNoStacks = await User.find({
      user_type_id: 1,
      "parent_level_ids.user_id": ObjectId(request.body.user_id),
      _id: { $nin: userList.map((user) => user.user_id) }
    }).select("_id parent_level_ids").exec();


    if (!existingUserNoStacks.length) {
      return resultResponse(
        NOT_FOUND,
        "No user found!"
      );
    }

    // Prepare bulk write operations for users without an existing UserStack
    const bulkOperations = existingUserNoStacks
      .map((user) => ({
        insertOne: {
          document: {
            user_id: user._id, // Use the user's `_id` as `user_id`
            gameButtons: userStack.DEFAULT_GAME_BUTTONS,
            casinoButtons: userStack.DEFAULT_CASINO_BUTTONS,
            parent_level_ids: user.parent_level_ids
          }
        }
      }));

    if (bulkOperations.length) {
      // Perform bulk write operation
      await UserStack.bulkWrite(bulkOperations);
    }
    // Return success response
    return resultResponse(SUCCESS, { data: "User stacks created successfully." });
  } catch (error) {
    // Handle any errors during the request and return a server error response
    return resultResponse(SERVER_ERROR, { error: error.message });
  }
};

