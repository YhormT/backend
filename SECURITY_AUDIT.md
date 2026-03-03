# KELISHUB SECURITY AUDIT - CRITICAL VULNERABILITIES

**Date:** March 2026
**Severity:** CRITICAL - Direct financial loss of $40,000+

---

## VULNERABILITY #1: FREE ORDERS VIA SHOP ENDPOINT (CRITICAL - THIS IS YOUR BIGGEST LOSS)

**File:** `routes/shopRoutes.js` line 12
**Endpoint:** `POST /api/shop/order`
**Auth:** NONE

**The Problem:** Anyone on the internet can create orders without paying. The endpoint accepts `productId` and `mobileNumber` and creates an order immediately - NO payment verification, NO authentication.

**Attack:**
```bash
curl -X POST https://your-backend.com/api/shop/order \
  -H "Content-Type: application/json" \
  -d '{"productId": 1, "mobileNumber": "0241234567"}'
```
This creates a real order that your admin team then fulfills (sends data bundles) - for FREE.

The shop user has `loanBalance: 999999999` so balance checks never fail.

**Impact:** Unlimited free orders. This is almost certainly your primary source of loss.

---

## VULNERABILITY #2: UNAUTHENTICATED DIRECT ORDER CREATION (CRITICAL)

**File:** `routes/orderRoutes.js` line 45
**Endpoint:** `POST /api/order/create-direct`
**Auth:** NONE

**The Problem:** Anyone can create orders charged to ANY user's wallet without authentication.

**Attack:**
```bash
curl -X POST https://your-backend.com/api/order/create-direct \
  -H "Content-Type: application/json" \
  -d '{"userId": 5, "items": [{"productId":1,"quantity":1,"price":10,"mobileNumber":"0241234567"}], "totalAmount": 10}'
```

---

## VULNERABILITY #3: ALL ADMIN ORDER ROUTES UNPROTECTED (CRITICAL)

**File:** `routes/orderRoutes.js`
**Affected endpoints (ALL have NO auth middleware):**
- `PUT /api/order/admin/process/:orderId` - Change order status
- `POST /api/order/admin/process/order` - Process order items
- `GET /api/order/admin/allorder` - View all orders
- `GET /api/order/admin/:userId` - View any user's order history
- `PUT /api/order/orders/:orderId/status` - Update order status
- `PUT /api/order/items/:itemId/status` - Update item status
- `POST /api/order/admin/orders-by-ids` - Fetch any orders
- `POST /api/order/admin/batch-complete` - Complete all processing orders
- `POST /api/order/upload-excel` - Upload Excel orders (no auth)

**Impact:** Anyone can view all orders, change statuses, batch-complete orders, and manipulate the system.

---

## VULNERABILITY #4: PAYMENT ADMIN ROUTES UNPROTECTED (HIGH)

**File:** `routes/paymentRoutes.js`
- `GET /api/payment/transactions` - View all payment transactions
- `GET /api/payment/orphaned` - View orphaned payments
- `POST /api/payment/reconcile` - Trigger payment reconciliation (creates orders!)

**Impact:** Attackers can trigger reconciliation to create orders, or view sensitive payment data.

---

## VULNERABILITY #5: DUPLICATE ORDER CREATION (HIGH - DOUBLE FULFILLMENT)

**Files:** `controllers/paymentController.js`
**The Problem:** Both the webhook AND the verify endpoint create orders for the same payment. Race condition:

1. Customer pays via Paystack
2. Paystack webhook fires → creates Order #1
3. Frontend calls verify → creates Order #2 (same payment!)

The check `if (!transaction.orderId)` in verify is NOT inside a transaction, so both paths can pass the check simultaneously.

**Impact:** Every successful shop payment could create 2 orders, doubling your loss.

---

## VULNERABILITY #6: STOREFRONT AGENT ROUTES UNPROTECTED (HIGH)

**File:** `routes/storefrontRoutes.js`
All agent management routes use `userId` from URL params with NO auth:
- Any user can manage any agent's storefront
- Any user can view any agent's referral summary
- Admin routes (referrals, commissions) have no auth

---

## VULNERABILITY #7: TOPUP ROUTES PARTIALLY UNPROTECTED (MEDIUM)

**File:** `routes/topUpRoutes.js`
- `GET /api/topup/topups` - View all topups (admin data, no auth)
- `GET /api/topup/topups/user/:userId` - View any user's topups
- `DELETE /api/topup/topups/:id` - Delete topup records (no auth!)

---

## VULNERABILITY #8: EXCEL UPLOAD WITHOUT AUTH (HIGH)

**File:** `routes/orderRoutes.js` line 18
**Endpoint:** `POST /api/order/upload-excel`

Anyone can upload an Excel file with orders for any agent. No authentication required.

---

## VULNERABILITY #9: USER ROUTES COMPLETELY UNPROTECTED (CRITICAL)

**File:** `routes/userRoutes.js`
**ALL routes had ZERO authentication:**
- `GET /api/users/` - View all users (names, emails, balances)
- `POST /api/users/` - Create users
- `DELETE /api/users/:id` - Delete any user
- `POST /api/users/loan/assign` - Assign loans (add money) to any wallet
- `POST /api/users/refund` - Refund money to any wallet
- `POST /api/users/repay-loan` - Repay loans
- `PUT /api/users/loan/status` - Change loan status
- `PUT /api/users/:id/suspend` - Suspend/unsuspend any user

**Impact:** Attackers could assign themselves unlimited loans (free wallet money), delete users, or view all user data.

---

## VULNERABILITY #10: TRANSACTION ROUTES - AUTH COMMENTED OUT (CRITICAL)

**File:** `routes/transactionRoutes.js`
All auth middleware was literally COMMENTED OUT with `//`. Every route was publicly accessible:
- View any user's transaction history
- View all transactions across all users
- View admin balance sheet
- Search all transactions

---

## VULNERABILITY #11: CART ROUTES UNPROTECTED (HIGH)

**File:** `routes/cartRoutes.js`
- `POST /api/cart/add` - Add items to ANY user's cart (no auth)
- `GET /api/cart/:userId` - View any user's cart
- `DELETE /api/cart/remove/:cartItemId` - Remove items from any cart
- `GET /api/cart/admin/all` - View all carts (admin data, no auth)

---

## VULNERABILITY #12: PRODUCT ROUTES UNPROTECTED (CRITICAL)

**File:** `routes/productRoutes.js`
ALL admin operations had NO auth:
- Add products, update products, delete products
- Toggle shop/agent visibility
- Set stock to zero, bulk stock updates
- Toggle promo pricing

**Impact:** Attackers could delete all products, change prices, or manipulate stock.

---

## VULNERABILITY #13: DATABASE RESET WITHOUT AUTH (CRITICAL)

**File:** `routes/resetRoutes.js`
- `POST /api/reset/database` - **WIPE THE ENTIRE DATABASE** with zero authentication

---

## VULNERABILITY #14: ADMIN & SALES ROUTES UNPROTECTED (HIGH)

**Files:** `routes/adminRoutes.js`, `routes/salesRoutes.js`
- Admin add-package: no auth
- Sales daily/summary: no auth

---

## FIXES APPLIED

### Route-Level Fixes (13 files):
| File | Fix Applied |
|------|------------|
| `routes/shopRoutes.js` | **REMOVED** direct order creation endpoint. Added admin auth to shop orders view. |
| `routes/orderRoutes.js` | Added `authMiddleware` + `adminMiddleware` to ALL admin routes. Added `authMiddleware` to user routes. |
| `routes/paymentRoutes.js` | Added admin auth to transactions, orphaned, reconcile endpoints. |
| `routes/storefrontRoutes.js` | Added auth to all agent management routes. Added admin auth to admin routes. |
| `routes/topUpRoutes.js` | Added auth to initialize/verify. Added admin auth to admin routes. |
| `routes/userRoutes.js` | Added admin auth to ALL admin operations (loan, refund, delete, create, suspend). Added auth to user operations. |
| `routes/transactionRoutes.js` | Replaced commented-out auth with proper `authMiddleware` + `adminMiddleware`. |
| `routes/cartRoutes.js` | Added auth to all cart operations. Added admin auth to admin view. |
| `routes/productRoutes.js` | Added admin auth to ALL write operations. Auth to read operations. |
| `routes/resetRoutes.js` | Added admin auth to database reset. |
| `routes/adminRoutes.js` | Added admin auth to add-package. |
| `routes/salesRoutes.js` | Added auth to sales data access. |

### Controller-Level Fixes:
| File | Fix Applied |
|------|------------|
| `controllers/paymentController.js` | Added atomic `createOrderIfNotExists()` function using `$transaction` to prevent duplicate order creation from webhook + verify race condition. Both webhook and verify now use this function. |

### Verification:
- All 13 modified files pass `node --check` syntax validation
- Backend starts successfully on port 5000
