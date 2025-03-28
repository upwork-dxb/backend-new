const service = require('../../service/casinos/universalCasino');

module.exports.auth = async function (req, res) {
  return service.auth(req)
    .then(result => res.json(result.data))
    .catch(console.error);
}

module.exports.getBalance = async function (req, res) {
  return service.getBalance(req)
    .then(result => res.json(result.data))
    .catch(console.error);
}

module.exports.placeBet = async function (req, res) {
  return service.placeBet(req)
    .then(result => res.json(result.data))
    .catch(console.error);
}

module.exports.settlements = async function (req, res) {
  return service.settlements(req)
    .then(result => res.json(result.data))
    .catch(console.error);
}