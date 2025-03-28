const Joi = require('joi');
// const JoiObjectId = require('joi-oid');
const { ResError } = require('../../lib/expressResponder');
const { uploadPopupContent } = require('./');

module.exports = {

  validator: (req, res, next) => {
    req.validationWith = req.validationWith ? req.validationWith : req.body;
    return Joi.object(req.validationFields).validateAsync(req.validationWith, { abortEarly: false })
      .then(joiData => { req.joiData = joiData; next() }).catch(error => {
        return ResError(res, error);
      });
  },

  getLogo: (req, res, next) => {
    req.validationFields = {
      slug: Joi.string().required(),
    };
    return module.exports.validator(req, res, next);
  },

  uploadPopupContent
};