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

// Get a single product
router.get('/:id', productController.getProductById);

// Admin: Update product
router.put('/update/:id', productController.updateProduct);

// Toggle product shop visibility
router.put('/toggle-shop/:id', productController.toggleShopVisibility);

// Set product stock to zero
router.put('/zero-stock/:id', productController.setProductStockToZero);

router.patch('/reset-all-stock-to-zero', productController.resetAllProductStock);


// Admin: Delete product
router.delete('/delete/:id', productController.deleteProduct);

module.exports = router;
