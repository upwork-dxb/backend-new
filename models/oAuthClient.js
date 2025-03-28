const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const OAuthClientSchema = new Schema({
	id: String,
	clientId: String,
	clientSecret: String,
	grants: [String],
	redirectUris: [String]
}, {
	strict: false,
	versionKey: false,
	timestamps: { createdAt: true, updatedAt: false },
	id: false,
	collection: 'oauth_client'
});

module.exports = mongoose.model('OAuthClient', OAuthClientSchema);