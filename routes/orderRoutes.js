const express = require('express');
const orderController = require('../controllers/orderController'); // Import controller
const path = require('path');
const authMiddleware = require('../middleware/authMiddleware');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

// Download Excel template for order upload
const templatePath = path.join(__dirname, '../uploads/order_upload_template.xlsx');

// Route to download the Excel template
const router = express.Router();
router.get('/download-template', (req, res) => {
  res.download(templatePath, 'order_upload_template.xlsx');
});

// Excel upload for agent orders
router.post('/upload-excel', upload.single('file'), orderController.uploadExcelOrders);

// User: Submit cart as an order
router.post('/submit', authMiddleware, orderController.submitCart);

router.get('/download-simplified-template', orderController.downloadSimplifiedTemplate);
router.post('/upload-simplified', authMiddleware, upload.single('file'), orderController.uploadSimplifiedExcelOrders);

// Admin: Process an order (update status)
router.put('/admin/process/:orderId', orderController.processOrderController);

router.post('/admin/process/order', orderController.processOrderItem);

router.get('/admin/allorder', orderController.getOrderStatus);

router.get("/admin/:userId", orderController.getOrderHistory);

// Get specific order by ID for status sync
router.get("/status/:orderId", orderController.getOrderById);

// User: View completed orders
router.get('/user/completed/:userId', orderController.getUserCompletedOrdersController);

router.put('/orders/:orderId/status', orderController.updateOrderItemsStatus);
router.put('/items/:itemId/status', orderController.updateSingleOrderItemStatus);

// Direct order creation from ext_agent system
router.post('/create-direct', orderController.createDirectOrder);

// Get multiple orders by IDs for GB calculation
router.post('/admin/orders-by-ids', orderController.getOrdersByIds);

// Batch complete all processing orders
router.post('/admin/batch-complete', orderController.batchCompleteProcessing);

module.exports = router;