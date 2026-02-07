const express = require('express');
const shopController = require('../controllers/shopController');

const router = express.Router();

// Public routes - no authentication required

// Get products available in shop
router.get('/products', shopController.getShopProducts);

// Create a shop order (for guest users)
router.post('/order', shopController.createShopOrder);

// Track orders by mobile number
router.get('/track', shopController.trackOrders);

// Get all shop orders (for admin)
router.get('/orders', shopController.getAllShopOrders);

module.exports = router;
