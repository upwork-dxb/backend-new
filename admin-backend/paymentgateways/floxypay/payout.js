const { decryptData } = require('../../paymentgateways/floxypay/generalFunctions');
module.exports = {
  payout: async (req, res) => {
    try {
      // Handle incoming webhook payload
      const payload = req.body;
      // Process the payload (this is where you handle the webhook data)
      console.log('Received payout payload:', payload, payload, req.params, req.query, req.headers);
      // Decrypt the response data
      const decryptedData = decryptData(payload.data);
      // Parse the decrypted data as JSON
      const responseData = JSON.parse(decryptedData);
      console.log("responseData:", responseData)
      res.status(200).json(responseData);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
}