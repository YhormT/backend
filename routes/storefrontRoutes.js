const express = require('express');
const router = express.Router();
const storefrontController = require('../controllers/storefrontController');

// ==================== AGENT STOREFRONT MANAGEMENT ====================

// Get or create storefront slug
router.get('/agent/:userId/slug', storefrontController.getStorefrontSlug);

// Get available products for storefront (filtered by agent role)
router.get('/agent/:userId/products/available', storefrontController.getAvailableProducts);

// Get agent's storefront products
router.get('/agent/:userId/products', storefrontController.getAgentStorefrontProducts);

// Add product to storefront
router.post('/agent/:userId/products', storefrontController.addProductToStorefront);

// Update product price
router.put('/agent/:userId/products/:productId', storefrontController.updateProductPrice);

// Remove product from storefront
router.delete('/agent/:userId/products/:productId', storefrontController.removeProduct);

// Toggle product active status
router.patch('/agent/:userId/products/:productId/toggle', storefrontController.toggleProduct);

// Get agent's referral summary
router.get('/agent/:userId/referrals', storefrontController.getAgentReferralSummary);

// ==================== PUBLIC STOREFRONT ====================

// Get public storefront by slug
router.get('/public/:slug', storefrontController.getPublicStorefront);

// Initialize referral payment
router.post('/public/:slug/pay', storefrontController.initializeReferralPayment);

// Verify referral payment
router.post('/verify', storefrontController.verifyReferralPayment);

// ==================== ADMIN FUNCTIONS ====================

// Get all referral orders
router.get('/admin/referrals', storefrontController.getAllReferralOrders);

// Mark commissions as paid
router.post('/admin/commissions/pay', storefrontController.markCommissionsPaid);

// Get weekly commission summary
router.get('/admin/commissions/weekly', storefrontController.getWeeklyCommissionSummary);

module.exports = router;
