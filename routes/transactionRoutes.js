const express = require('express');
const router = express.Router();
const { 
  getUserTransactionHistory, 
  getAllTransactionHistory, 
  getUserBalanceSummary, 
  getAuditLog, 
  getTransactionStats,
  getAdminBalanceSheetData,
  searchTransactions
} = require('../controllers/transactionController');
// const { authenticate } = require('../middleware/authMiddleware');
// const { isAdmin, isOwnerOrAdmin } = require('../middleware/accessControlMiddleware');

// Route to get transaction history for a specific user
// Accessible by the user themselves or by an admin
router.get('/users/:userId/transactions', 
//   authenticate, 
//   isOwnerOrAdmin, 
  getUserTransactionHistory
);

// Route to get balance summary for a specific user
// Accessible by the user themselves or by an admin
router.get('/users/:userId/balance', 
//   authenticate, 
//   isOwnerOrAdmin, 
  getUserBalanceSummary
);

// Route to get all transactions across all users
// Admin only access
router.get('/transactions', 
//   authenticate, 
//   isAdmin, 
  getAllTransactionHistory
);

// Route to get transaction statistics
// Admin only access
router.get('/transactions/stats', 
//   authenticate, 
//   isAdmin, 
  getTransactionStats
);

// Audit Log for Admin Dashboard
router.get('/admin-balance-sheet/audit-log', require('../controllers/transactionController').getAuditLog);

// Route to get admin balance sheet data
router.get('/admin-balance-sheet', 
//   authenticate, 
//   isAdmin, 
  getAdminBalanceSheetData
);

// Route to search transactions across entire database
router.get('/search', 
//   authenticate, 
//   isAdmin, 
  searchTransactions
);

module.exports = router;