const express = require('express');
const router = express.Router();
const TopUpController = require('../controllers/topUpController');

// Initialize Paystack payment for wallet top-up
router.post('/topup/initialize', TopUpController.initializeTopup);

// Verify top-up using Transaction ID (SMS verification)
router.post('/verify-sms', TopUpController.verifyTransactionId);

// Verify Paystack payment and credit wallet
router.post('/topup/verify', TopUpController.verifyTopup);

// Paystack webhook for top-ups
router.post('/topup/webhook', TopUpController.handleWebhook);

// Get all top-ups (for admin - filtered by date/status)
router.get('/topups', TopUpController.getTopUps);

// Get user's top-up history
router.get('/topups/user/:userId', TopUpController.getUserTopups);

// Delete a top-up record
router.delete('/topups/:id', TopUpController.deleteTopup);

module.exports = router;
