const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const commissionRequestController = require('../controllers/commissionRequestController');

// Agent routes (auth required)
router.post('/', authMiddleware, commissionRequestController.createRequest);
router.get('/my-requests', authMiddleware, commissionRequestController.getMyRequests);

// Admin routes
router.get('/all', authMiddleware, adminMiddleware, commissionRequestController.getAllRequests);
router.get('/pending-count', authMiddleware, adminMiddleware, commissionRequestController.getPendingCount);
router.put('/:requestId/approve', authMiddleware, adminMiddleware, commissionRequestController.approveRequest);
router.put('/:requestId/decline', authMiddleware, adminMiddleware, commissionRequestController.declineRequest);
router.get('/:requestId', authMiddleware, commissionRequestController.getRequest);

module.exports = router;
