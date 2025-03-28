/**
 * Configuration.
 */
const bcrypt = require('bcrypt');
const config = require('./utils/constants');
const oAuthClient = require('./models/oAuthClient');
const OAuthToken = require('./models/oAuthToken');
const userModel = require('./models/user');
const redisClient = require("./connections/redisConnections");
const userQuery = require('./admin-backend/service/userQuery');
const oauthtokenService = require('./admin-backend/service/oauthtokenService');

/**
 * Add example client and user to the database (for debug).
 */

var loadExampleData = function () {

  var client1 = new oAuthClient({
    id: `${config.OAUTH_CLIENT_ID_1}`,	// TODO: Needed by refresh_token grant, because there is a bug at line 103 in https://github.com/oauthjs/node-oauth2-server/blob/v3.0.1/lib/grant-types/refresh-token-grant-type.js (used client.id instead of client.clientId)
    clientId: `${config.OAUTH_CLIENT_ID_1}`,
    clientSecret: `${config.OAUTH_CLIENT_SECRET_1}`,
    grants: [
      'password',
      'refresh_token'
    ],
    redirectUris: []
  });

  var client2 = new oAuthClient({
    clientId: `${config.OAUTH_CLIENT_ID_2}`,
    clientSecret: `${config.OAUTH_CLIENT_SECRET_2}`,
    grants: [
      'password',
      'client_credentials'
    ],
    redirectUris: []
  });

  client1.save(function (err, client) {

    if (err) {
      return console.error(err);
    }
    console.warn('Created client', client);
  });

  client2.save(function (err, client) {

    if (err) {
      return console.error(err);
    }
    console.warn('Created client', client);
  });
};

/**
 * Dump the database content (for debug).
 */

var dump = function () {

  oAuthClient.find(function (err, clients) {

    if (err) {
      return console.error(err);
    }
    console.warn('clients', clients);
  });

  OAuthToken.find(function (err, tokens) {

    if (err) {
      return console.error(err);
    }
    console.warn('tokens', tokens);
  });

  userModel.find(function (err, users) {

    if (err) {
      return console.error(err);
    }
    console.warn('users', users);
  });
};
/*
 * Methods used by all grant types.
 */

var getAccessToken = async function (token, callback) {

  await oauthtokenService.getAccessToken(token, callback);

};

var getClient = function (clientId, clientSecret, callback) {

  oAuthClient.findOne({
    clientId: clientId,
    clientSecret: clientSecret
  }).lean().exec((function (callback, err, client) {

    if (!client) {
      console.error('Client not found');
    }

    callback(err, client);
  }).bind(null, callback));
};

var saveToken = function (token, client, user, callback) {

  token.client = {
    id: client.clientId
  };
  token.user = user;
  var tokenInstance = new OAuthToken(token);
  tokenInstance.save((function (callback, err, token) {
    if (!token) {
      console.error('Token not saved');
    } else {
      token = token.toObject();
      delete token._id;
      delete token.__v;
    }

    callback(err, token);
  }).bind(null, callback));
};

/*
 * Method used only by password grant type.
 */

var getUser = async function (user_name, password, callback) {

  const key = `${config.USER_DATA_KEY}${user_name.toLowerCase()}${config.UNIQUE_IDENTIFIER_KEY}`; // Combine and lowercase in one step
  let user = null;

  try {
    // Try to fetch user data from Redis
    const cachedUser = 0;
    // const cachedUser = await redisClient.get(key);

    if (cachedUser) {
      user = JSON.parse(cachedUser);
    } else {
      // If no cached user, fetch from database
      user = await userModel.findOne(
        { user_name: user_name.toLowerCase() },
        userQuery.getFieldForRedisUser()
      ).lean();

      // Store fetched user data in Redis if found
      if (user) {
        user = JSON.parse(JSON.stringify(user));
        user.user_id = user._id;
        user.id = user._id;

        // await redisClient.set(key, JSON.stringify(user));
      }
    }

    // If user exists, verify password
    if (user && bcrypt.compareSync(password, user.password)) {
      return callback(null, user); // Return user if password matches
    }

    // If user not found or password doesn't match
    return callback(null, null);

  } catch (error) {
    return callback(error, null); // Pass error to callback
  }


  // userModel.findOne(
  //   {
  //     user_name: user_name.toLowerCase()
  //   },
  //   {
  //     user_id: 1, name: 1, user_name: 1, user_type_id: 1, is_demo: 1,
  //     password: 1, parent_level_ids: 1, exposure_limit: 1, partnership: 1,
  //     parent_id: 1, parent_name: 1, point: 1, parent_user_name: 1,
  //     self_lock_user: 1, parent_lock_user: 1, last_login_ip_address: 1,
  //     self_lock_betting: 1, parent_lock_betting: 1,
  //     self_lock_fancy_bet: 1, parent_lock_fancy_bet: 1,
  //     self_close_account: 1, parent_close_account: 1,
  //     userSettingSportsWise: 1, partnerships: 1, domain_name: 1,
  //     have_admin_rights: 1, sports_permission: 1, belongs_to: 1
  //   }
  // ).exec((function (callback, err, user) {
  //   if (!user)
  //     user = null
  //   else {
  //     var passwordCheck = bcrypt.compareSync(password, user.password); // true
  //     if (!passwordCheck)
  //       user = null
  //   }
  //   user = JSON.parse(JSON.stringify(user));
  //   user.user_id = user._id;
  //   callback(err, user);
  // }).bind(null, callback));
};

/*
 * Method used only by client_credentials grant type.
 */

var getUserFromClient = function (client, callback) {

  oAuthClient.findOne({
    clientId: client.clientId,
    clientSecret: client.clientSecret,
    grants: 'client_credentials'
  }).lean().exec((function (callback, err, client) {

    if (!client) {
      console.error('Client not found');
    }

    callback(err, {
      user_name: ''
    });
  }).bind(null, callback));
};

/*
 * Methods used only by refresh_token grant type.
 */

var getRefreshToken = function (refreshToken, callback) {

  OAuthToken.findOne({
    refreshToken: refreshToken
  }).lean().exec((function (callback, err, token) {

    // if (!token)
    // 	console.error('Token not found');

    callback(err, token);
  }).bind(null, callback));
};

var revokeToken = function (token, callback) {

  OAuthToken.deleteOne({
    refreshToken: token.refreshToken
  }).exec((function (callback, err, results) {

    var deleteSuccess = results && results.deletedCount === 1;

    if (!deleteSuccess) {
      console.error('Token not deleted');
    }

    callback(err, deleteSuccess);
  }).bind(null, callback));
};

/**
 * Export model definition object.
 */

module.exports = {
  getAccessToken: getAccessToken,
  getClient: getClient,
  saveToken: saveToken,
  getUser: getUser,
  getUserFromClient: getUserFromClient,
  getRefreshToken: getRefreshToken,
  revokeToken: revokeToken
};