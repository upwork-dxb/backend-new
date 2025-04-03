const MessageTemplates = {
  depositRequest: ({ _id, name, user_name, amount, domain_name, accept_deposit_key, reject_deposit_key }) => {
    return (
      `${name || ''}[${user_name || ''}] has initiated a deposit request of ₹${amount || 0} on the domain ${domain_name || ''}. Kindly approve it.\n\n` +
      `Please ensure the safety of your transaction code (code: ${_id}) as it will be essential for future processing.\n\n` +
      `To accept this deposit request, kindly provide the required information in the following format:\n\n` +
      `<${accept_deposit_key}><SPACE><TRANSACTION_CODE><SPACE><REFERENCE_NUMBER>\n\n` +
      `Ex:-\n${accept_deposit_key} ${_id} unique_reference_number\n\nOR\n\n` +
      `To reject this deposit request, kindly provide the required information in the following format:\n\n` +
      `<${reject_deposit_key}><SPACE><TRANSACTION_CODE><SPACE><REMARK>\n\n` +
      `Ex:-\n${reject_deposit_key} ${_id} remark\n\n` +
      `Please find the messages sent below and replace the dots with your unique six digit reference number OR your remark before sending it.`
    );
  },

  withdrawRequest: ({ name, user_name, amount, domain_name }) => {
    return (
      `${name || ''}[${user_name || ''}] has initiated a withdraw request of ₹${amount || 0} on the domain ${domain_name || ''}.\n\n` +
      `Kindly assign it to the respective operator to proceed with the withdrawal transaction.`
    );
  },

  withdrawRequestForOperator: ({ _id, name, user_name, amount, domain_name, accept_withdraw_key }) => {
    return (
      `${name || ''}[${user_name || ''}] has initiated a withdraw request of ₹${amount || 0} on the domain ${domain_name || ''}. Kindly approve it.\n\n` +
      `Please ensure the safety of your transaction code (code: ${_id}) as it will be essential for future processing.\n\n` +
      `To accept this withdraw request, kindly provide the required information in the following format:\n\n` +
      `<${accept_withdraw_key}><SPACE><TRANSACTION_CODE><SPACE><REMARK>\n\n` +
      `Ex:-\n${accept_withdraw_key} ${_id} remark\n\n` +
      `Please find the message sent below and replace the dots with your remark before sending it.`
    );
  },

  telegramGenerateCode: ({ TELEGRAM_BOT_ID, TELEGRAM_OTP_EXPIRE_TIME_SECOENDS, connectionId }) => {
    return (
      `Please follow the steps below for Telegram 2-Step Verification:\n\n` +
      `1️⃣ Find and open ${TELEGRAM_BOT_ID} in your Telegram app.\n` +
      `2️⃣ Send the command /start.\n` +
      `3️⃣ Then, type and send:\n\n/connect ${connectionId}\n\n` +
      `⚠️ This connection code will expire in ${TELEGRAM_OTP_EXPIRE_TIME_SECOENDS || 60} seconds.\n\n` +
      `Once complete, your Telegram account will be linked with your website account and 2-Step Verification will be enabled.`
    );
  },

  telegramStart: () => {
    return (
      `Hey! You're just 1 step away from enabling *2-Step Verification*.\n\n` +
      `To continue, please send:\n\n/connect *your_id*\n\n` +
      `to link your Telegram account.`
    );
  }
};

module.exports = MessageTemplates;
