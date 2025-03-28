const { ResSuccess } = require('../../lib/expressResponder')
  , apiUrlSettingsService = require('../../admin-backend/service/apiUrlSettingsService')
  , adminEventsController = require('../../admin-backend/controllers/eventsController')

module.exports = {
  getEvents: function (req, res) {
    req.body.isUserPanel = true;
    return adminEventsController.getEvents(req, res);
  },
  getEventsLimit: function (req, res) {
    return adminEventsController.getEventsLimit(req, res);
  },
  applyValidation: function (req, res) {
    return apiUrlSettingsService.applyValidation().then(async applyValidation => {
      return ResSuccess(res, { applyValidation });
    });
  }
}