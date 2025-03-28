const express = require('express');
const OAuthController = require('../controllers/oAuthController');

module.exports = () => {
	const oAuthRoutes = express.Router();
	// oAuthRoutes.all('/token', OAuthController.obtainToken);
	return oAuthRoutes;
}