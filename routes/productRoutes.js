// routes/productRoutes.js
const express = require('express');
const productController = require('../controllers/productController');

const router = express.Router();

// Admin: Add product
router.post('/add', productController.addProduct);

// Get all products
router.get('/', productController.getAllProducts);

// Get products visible in shop (public endpoint)
router.get('/shop', productController.getShopProducts);

// Get products visible for agents
router.get('/agent-products', productController.getAgentProducts);

// Get a single product
router.get('/:id', productController.getProductById);

// Admin: Update product
router.put('/update/:id', productController.updateProduct);

// Toggle product shop visibility
router.put('/toggle-shop/:id', productController.toggleShopVisibility);

// Set product stock to zero
router.put('/zero-stock/:id', productController.setProductStockToZero);

router.patch('/reset-all-stock-to-zero', productController.resetAllProductStock);

// Bulk update stock by carrier (single DB call)
router.patch('/bulk-stock-by-carrier', productController.bulkUpdateStockByCarrier);

// Bulk update shop stock (open/close all)
router.patch('/bulk-shop-stock', productController.bulkUpdateShopStock);

// Toggle agent visibility for a single product
router.put('/toggle-agent/:id', productController.toggleAgentVisibility);

// Bulk update agent visibility (optionally filtered by carrier)
router.patch('/bulk-agent-visibility', productController.bulkUpdateAgentVisibility);

// Toggle promo price for a single product
router.put('/toggle-promo/:id', productController.togglePromoPrice);

// Bulk switch between main and promo prices
router.patch('/bulk-toggle-promo', productController.bulkTogglePromoPrice);

// Admin: Delete product
router.delete('/delete/:id', productController.deleteProduct);

module.exports = router;
