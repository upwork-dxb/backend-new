const express = require('express')
  , walletController = require('../../admin-backend/controllers/walletController')
  , contentService = require('../../admin-backend/service/contentService');
const WalletValidator = require('../../admin-backend/validator/walletValidator');
//Routes for account statements 
module.exports = () => {
  const walletRoutes = express.Router();
  walletRoutes.post('/walletchipIn', contentService.wallet.single('image'), walletController.walletchipIn);
  walletRoutes.post('/walletchipOut', walletController.walletchipOut);
  walletRoutes.post('/getPayementMethod', WalletValidator.getPayementMethod, walletController.getPayementMethod);
  walletRoutes.post('/getParentPayementDetails', WalletValidator.getParentPayementDetails, walletController.getParentPayementDetails);
  walletRoutes.post('/createPaymentMethod', walletController.createPaymentMethod);
  walletRoutes.post('/getwalletBankDetail', walletController.getwalletBankDetail);
  walletRoutes.post('/getwalletsummary', walletController.getwalletsummary);
  walletRoutes.post('/removePaymentDetails', walletController.removePaymentDetails);
  walletRoutes.post('/updatePayment', walletController.updatePayment);
  walletRoutes.post('/walletBonuschipIn', walletController.walletBonuschipIn);
  walletRoutes.post('/walletchipOutV2', walletController.walletchipOutV2);
  walletRoutes.post('/updateFloxypayBankDetailsStatus', walletController.updateFloxypayBankDetailsStatus);
  walletRoutes.post('/walletDailyBonus', walletController.walletDailyBonus);
  walletRoutes.get('/getBonusDetails', walletController.getBonusDetails);
  return walletRoutes;
};