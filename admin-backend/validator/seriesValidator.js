const { fmImportOrigin, createSeries } = require('./');
const Joi = require('joi')
  , JoiObjectId = require('joi-oid')
  , { validator } = require('./')

module.exports = {
  validator,
  updateSeriesStatus: (req, res, next) => {
    req.validationFields = {
      userid: Joi.string().required(),
      series_id: Joi.required(),
      is_active: Joi.string().valid(0, 1).required(),
      user_typeId: Joi.optional()
    };
    return module.exports.validator(req, res, next);
  },
  fmImportOrigin, createSeries
};