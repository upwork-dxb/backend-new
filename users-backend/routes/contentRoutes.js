const express = require('express');
const ContentController = require('../../admin-backend/controllers/contentController');
const contentValidator = require('../validator/contentValidator');

//Routes for fancy 
module.exports = () => {
  const Routes = express.Router();
  Routes.get('/footer-items', ContentController.footer);
  Routes.post('/get', ContentController.getContent);
  Routes.post("/getSocialMediaContent", ContentController.getContent);
  Routes.all('/getLogo', ContentController.get, contentValidator.getLogo, ContentController.getLogo);
  Routes.get('/sliders', ContentController.sliders);
  Routes.get('/getbackgroundImage', ContentController.getbackgroundImage);
  Routes.get('/download-mobile-app', ContentController.get, ContentController.download);
  Routes.post('/', ContentController.get, ContentController.getThemeSettings);
  Routes.get('/contentGet', ContentController.contentGet);
  return Routes;
};