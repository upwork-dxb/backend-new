const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Website settings model schema
 */
const ThemeSettingSchema = new Schema({
	domain: { type: Schema.Types.ObjectId, ref: 'WebsiteSetting', default: null },
	login: {
		type: Object, default: {
			"background-image": "../assets/img/bg-login.jpg",
			"block-background-image": "../assets/img/loginside.jpeg",
			"block-first-gradient-color": "#A4DC60 0%",
			"block-second-gradient-color": "#4F9F21 100%",
			"title-color": "#eee",
			"btn-first-gradient-color": "#8ED5EC 0",
			"btn-second-gradient-color": "#4fa5c1 100%",
			"btn-border": "#8ED5EC",
			"btn-text-color": "#fff"
		}
	},
	header: {
		type: Object, default: {
			"background-first-gradient-color": "#8ED5EC 0",
			"background-second-gradient-color": "#4fa5c1 100%",
			"label-background-color": "#000",
			"label-text-color": "#fff",
			"header-label-text-color": "#fff",
			"icon-background-color": "#31cb26",
			"icon-border-color": "#fff"
		}
	},
	subHeader: {
		type: Object, default: {
			"background-first-gradient-color": "#A4DC60 0%",
			"background-second-gradient-color": "#4F9F21 100%",
			"label-text-color": "#000",
			"dropdown-text-color": "#fff"
		}
	},
}, { versionKey: false, timestamps: true, collection: 'theme_settings' });

module.exports = mongoose.model('ThemeSetting', ThemeSettingSchema);