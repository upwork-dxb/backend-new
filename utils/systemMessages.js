const depositRequestMsg = (params) => {
  let { _id, name, user_name, amount, domain_name, accept_deposit_key, reject_deposit_key } = params;
  return `${name}[${user_name}] has initiated a deposit request of ₹${amount} on the domain ${domain_name}. Kindly approve it.\n\nPlease ensure the safety of your transaction code (code: ${_id}) as it will be essential for future processing.\n\nTo accept this deposit request, kindly provide the required information in the following format:\n\n<${accept_deposit_key}><SPACE><TRANSACTION_CODE><SPACE><REFERENCE_NUMBER>\n\nEx:-\n${accept_deposit_key} ${_id} unique_reference_number\n\nOR\n\nTo reject this deposit request, kindly provide the required information in the following format:\n\n<${reject_deposit_key}><SPACE><TRANSACTION_CODE><SPACE><REMARK>\n\nEx:-\n${reject_deposit_key} ${_id} remark\n\nPlease find the messages sent below and replace the dots with your unique six digit reference number OR your remark before sending it.`
}

const withdrawRequestMsg = (params) => {
  let { name, user_name, amount, domain_name } = params;
  return `${name}[${user_name}] has initiated a withdraw request of ₹${amount} on the domain ${domain_name}. \n\nKindly assign it to the respective operator to proceed with the withdrawal transaction.`
}

const withdrawRequestMsgForOpr = (params) => {
  let { _id, name, user_name, amount, domain_name, accept_withdraw_key } = params;
  return `${name}[${user_name}] has initiated a withdraw request of ₹${amount} on the domain ${domain_name}. Kindly approve it.\n\nPlease ensure the safety of your transaction code (code: ${_id}) as it will be essential for future processing.\n\nTo accept this withdraw request, kindly provide the required information in the following format:\n\n<${accept_withdraw_key}><SPACE><TRANSACTION_CODE><SPACE><REMARK>\n\nEx:-\n${accept_withdraw_key} ${_id} remark\n\nPlease find the message sent below and replace the dots with your remark before sending it.`
}

const telegramGenerateCodeMsg = (params) => {
  let { TELEGRAM_BOT_ID, TELEGRAM_OTP_EXPIRE_TIME_SECOENDS, connectionId } = params;
  return `Please follow below instructions for the telegram 2-step verification Find ${TELEGRAM_BOT_ID} in your telegram and type/start command. Bot will respond you.After this type /connect ${connectionId} and send it to BOT, it will expire in ${TELEGRAM_OTP_EXPIRE_TIME_SECOENDS} seconds. Now your telegram account will be linked with your website account and 2-Step verification will be enabled.`
}

const telegramStartMsg = () => {
  return `Hey! You are 1 step away from *2-Step Verification*, Now please proceed for further step: /connect *your_id* to enable it for your account.`
}

module.exports = { depositRequestMsg, withdrawRequestMsg, withdrawRequestMsgForOpr, telegramGenerateCodeMsg, telegramStartMsg }