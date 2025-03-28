const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const OAuthTokenSchema = new Schema({
	accessToken: String,
	accessTokenExpiresAt: Date,
	refreshToken: String,
	refreshTokenExpiresAt: Date,
	client: Object,
	user: Object
}, {
	versionKey: false,
	timestamps: true,
	id: false,
	collection: 'oauth_tokens'
})

OAuthTokenSchema.index({ user_id: 1 });
OAuthTokenSchema.index({ accessToken: 1 });
OAuthTokenSchema.index({ 'user.user_id': 1 });
OAuthTokenSchema.index({ accessTokenExpiresAt: 1 }, { expireAfterSeconds: 1 });

module.exports = mongoose.model('OAuthToken', OAuthTokenSchema);