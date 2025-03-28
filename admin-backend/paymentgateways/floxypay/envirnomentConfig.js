const dotenv = require('dotenv')
dotenv.config()
/** export env constant */
const e = process.env
module.exports = {
  SECRET_KEY: e.SECRET_KEY,
  SECRET_IV: e.SECRET_IV,
  AGENT_CODE: e.AGENT_CODE,
  GENERATE_ORDER: e.GENERATE_ORDER,
  CHECK_DEPOSIT_STATUS: e.CHECK_DEPOSIT_STATUS,
  WITHDRAWAL: e.WITHDRAWAL,
  CHECK_WITHDRAWAL_STATUS: e.CHECK_WITHDRAWAL_STATUS
}