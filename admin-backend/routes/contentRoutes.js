const express = require('express')
  , contentService = require('../service/contentService')
  , ContentController = require('../controllers/contentController')
  , contentValidator = require('../validator/contentValidator');

//Routes for fancy 
module.exports = () => {
  const Routes = express.Router();
  Routes.post('/create', ContentController.createValidate, ContentController.create);
  Routes.get('/footer-items', ContentController.footer);
  Routes.post('/get', ContentController.getContent);
  Routes.all('/getLogo', ContentController.get, contentValidator.getLogo, ContentController.getLogo);
  Routes.post('/getLogoAndBackground', ContentController.get, ContentController.getLogoAndBackground);
  Routes.get('/getbackgroundImage', ContentController.getbackgroundImage);
  Routes.post('/delete', ContentController.delete);
  Routes.get('/sliders', ContentController.sliders);
  Routes.get('/sliders-manage', ContentController.sliders);
  Routes.post('/upload/slider', contentService.slider.single('image'), ContentController.createValidate, ContentController.validateFile, ContentController.slider, ContentController.cloudService, ContentController.create, ContentController.errorHandler);
  Routes.post('/upload/backgroundImage', ContentController.createValidate, contentService.bgImage.single('backgroundImage'), ContentController.validateFile, ContentController.bgImage, ContentController.create);
  Routes.post('/upload/logo', ContentController.createValidate, contentService.logo.single('logo'), ContentController.validateFile, ContentController.logo, ContentController.cloudService, contentService.removeLogoFromCache, ContentController.create, ContentController.errorHandler);
  Routes.post('/upload/logoAndBackground', ContentController.createValidate, contentService.logo.fields([{ name: 'logo', maxCount: 1 }, { name: 'background', maxCount: 1 }, { name: 'blockBackground', maxCount: 1 }]), ContentController.validateFile, ContentController.createLogoAndBackground);
  Routes.post('/upload/mobile-app', ContentController.createValidate, contentService.application.single('apps'), ContentController.validateFile, ContentController.mobileApp, ContentController.create);
  Routes.get('/download-mobile-app', ContentController.get, ContentController.download);
  Routes.post('/', ContentController.get, ContentController.getThemeSettings);
  Routes.post('/createSocialHandler', ContentController.socialHandler, ContentController.createValidate, ContentController.createSocialHandler);
  Routes.get('/getContentType', ContentController.getContentType);
  Routes.post('/uploadContent', contentService.slider.single('image'), ContentController.validateContentFile, ContentController.uploadContentValidate, ContentController.cloudService, ContentController.uploadContent);
  Routes.post('/uploadPopupContent', contentService.popUp.single('image'), ContentController.validateContentFile, contentValidator.uploadPopupContent, ContentController.cloudService, ContentController.uploadPopupContent, ContentController.errorHandler);
  Routes.get('/contentGet', ContentController.contentGet);
  return Routes;
};