const lotusService = require('../service/lotusService');

module.exports.auth = async function (req, res) {
  return lotusService.auth(req)
    .then(result => res.json(result.data))
    .catch(console.error);
}

module.exports.exposure = async function (req, res) {
  return lotusService.exposure(req)
    .then(result => res.json(result.data))
    .catch(console.error);
}

module.exports.results = async function (req, res) {
  return lotusService.results(req)
    .then(result => res.json(result.data))
    .catch(console.error);
}

module.exports.refund = async function (req, res) {
  return lotusService.refund(req)
    .then(result => res.json(result.data))
    .catch(console.error);
}