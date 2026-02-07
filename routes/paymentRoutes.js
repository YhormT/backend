const express = require('express');
const paymentController = require('../controllers/paymentController');

const router = express.Router();

// Public routes for shop payments (Paystack)

// Initialize Paystack payment
router.post('/initialize', paymentController.initializePayment);

// Paystack webhook callback
router.post('/webhook', paymentController.handleWebhook);

// Verify payment status (called after redirect from Paystack)
router.post('/verify', paymentController.verifyPaymentStatus);

// Check payment status
router.get('/status/:externalRef', paymentController.checkStatus);

// Get all transactions (admin - should add auth middleware in production)
router.get('/transactions', paymentController.getAllTransactions);

// Get orphaned payments (successful payments without orders)
router.get('/orphaned', paymentController.getOrphanedPayments);

// Reconcile orphaned payments - creates orders for successful payments
router.post('/reconcile', paymentController.reconcilePayments);

module.exports = router;
