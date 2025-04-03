const bcrypt = require('bcrypt');
const config = require('./utils/constants');
const oAuthClient = require('./models/oAuthClient');
const OAuthToken = require('./models/oAuthToken');
const userModel = require('./models/user');
const redisClient = require('./connections/redisConnections');
const userQuery = require('./admin-backend/service/userQuery');
const oauthtokenService = require('./admin-backend/service/oauthtokenService');

/**
 * Utility: Load example clients for debugging.
 */
const loadExampleData = async () => {
  const clients = [
    new oAuthClient({
      id: config.OAUTH_CLIENT_ID_1,
      clientId: config.OAUTH_CLIENT_ID_1,
      clientSecret: config.OAUTH_CLIENT_SECRET_1,
      grants: ['password', 'refresh_token'],
      redirectUris: []
    }),
    new oAuthClient({
      clientId: config.OAUTH_CLIENT_ID_2,
      clientSecret: config.OAUTH_CLIENT_SECRET_2,
      grants: ['password', 'client_credentials'],
      redirectUris: []
    })
  ];

  for (const client of clients) {
    try {
      await client.save();
      console.warn('✅ Created client', client.clientId);
    } catch (err) {
      console.error('❌ Error creating client', err);
    }
  }
};

/**
 * Utility: Dump current database values for debug.
 */
const dump = async () => {
  try {
    const [clients, tokens, users] = await Promise.all([
      oAuthClient.find(),
      OAuthToken.find(),
      userModel.find()
    ]);
    console.warn('Clients:', clients);
    console.warn('Tokens:', tokens);
    console.warn('Users:', users);
  } catch (err) {
    console.error('❌ Error dumping data:', err);
  }
};

/**
 * OAuth2 required methods
 */
const getAccessToken = async (token, callback) => {
  await oauthtokenService.getAccessToken(token, callback);
};

const getClient = (clientId, clientSecret, callback) => {
  oAuthClient.findOne({ clientId, clientSecret }).lean().exec((err, client) => {
    if (!client) console.error('Client not found');
    callback(err, client);
  });
};

const saveToken = (token, client, user, callback) => {
  token.client = { id: client.clientId };
  token.user = user;
  const tokenInstance = new OAuthToken(token);

  tokenInstance.save((err, savedToken) => {
    if (!savedToken) console.error('Token not saved');
    else {
      const tokenObj = savedToken.toObject();
      delete tokenObj._id;
      delete tokenObj.__v;
      callback(err, tokenObj);
    }
  });
};

const getUser = async (user_name, password, callback) => {
  const key = `${config.USER_DATA_KEY}${user_name.toLowerCase()}${config.UNIQUE_IDENTIFIER_KEY}`;
  let user = null;

  try {
    // Redis disabled
    // const cachedUser = await redisClient.get(key);

    // if (cachedUser) user = JSON.parse(cachedUser);
    // else {
    user = await userModel
      .findOne({ user_name: user_name.toLowerCase() }, userQuery.getFieldForRedisUser())
      .lean();

    if (user) {
      user.user_id = user._id;
      user.id = user._id;

      // await redisClient.set(key, JSON.stringify(user));
    }
    // }

    const isValid = user && bcrypt.compareSync(password, user.password);
    return callback(null, isValid ? user : null);
  } catch (err) {
    return callback(err, null);
  }
};

const getUserFromClient = (client, callback) => {
  oAuthClient
    .findOne({
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      grants: 'client_credentials'
    })
    .lean()
    .exec((err, foundClient) => {
      if (!foundClient) console.error('Client not found');
      callback(err, { user_name: '' });
    });
};

const getRefreshToken = (refreshToken, callback) => {
  OAuthToken.findOne({ refreshToken })
    .lean()
    .exec((err, token) => {
      callback(err, token);
    });
};

const revokeToken = (token, callback) => {
  OAuthToken.deleteOne({ refreshToken: token.refreshToken }).exec((err, result) => {
    const success = result && result.deletedCount === 1;
    if (!success) console.error('Token not deleted');
    callback(err, success);
  });
};

/**
 * Export all OAuth2 hooks
 */
module.exports = {
  getAccessToken,
  getClient,
  saveToken,
  getUser,
  getUserFromClient,
  getRefreshToken,
  revokeToken,
  // Optional utility exports for debug
  loadExampleData,
  dump
};
