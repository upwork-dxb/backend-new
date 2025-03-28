const { ResError, ResSuccess } = require('../../lib/expressResponder')
  , analyticsService = require('../service/analyticsService')
  , { SUCCESS } = require('../../utils/constants')
  , { STATUS_500, STATUS_200 } = require('../../utils/httpStatusCode')

module.exports = {
  transactionalData: async function (req, res) {
    const data = req.body;
    data.user_id = req.User.user_id;
    try {
      return analyticsService.transactionalService(data).then(result => {
        if (result.statusCode != SUCCESS)
          return ResError(res, { msg: result.data, statusCode: STATUS_200 });
        return ResSuccess(res, { data: result.data });
      }).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
    } catch (error) {
      return ResError(res, { msg: error.message, statusCode: STATUS_500 });
    }
  },
}