module.exports = {
  DEPOSIT_REQUEST: "DEPOSIT_REQUEST",
  WITHDRAW_REQUEST: "WITHDRAW_REQUEST",
  BANKING_TYPES: ["DEPOSIT", "WITHDRAW"],
  BANKING_METHODS: {
    UPI: "Upi",
    GPAY: "GPay",
    BANK: "Bank",
    PAYTM: "Paytm",
    PHONEPE: "PhonePe",
    FLOXYPAY: "Floxypay",
    BKASH: 'Bkash',
    NAGAD: 'Nagad',
    ROCKETT: 'Rocket'
  },
  METHOD_TYPE_COUNT: "METHOD_TYPE_COUNT",
  TELEGRAM_BOT: {
    SUPER: "/super_registration",
    MANAGER: "/manager_registration",
    OPERATOR: "/operator_registration",
    REGISTRATION_KEY: "TBR",
    ACCEPT_DEPOSIT_KEY: "ADR",
    REJECT_DEPOSIT_KEY: "RDR",
    ACCEPT_WITHDRAW_KEY: "AWR",
  },
  BANK_TYPE_UPDATE: "BANK_TYPE_UPDATE",
  EXPIRY_FOR_BANK_DETAILS: process.env.EXPIRY_FOR_BANK_DETAILS || 10
}