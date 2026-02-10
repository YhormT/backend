const prisma = require("../config/db");
const cache = require("../utils/cache");

const { createTransaction } = require("./transactionService");
const userService = require("./userService");

const submitCart = async (userId, mobileNumber = null) => {
  // Use a transaction to ensure atomicity
  return await prisma.$transaction(async (tx) => {
    const cart = await tx.cart.findUnique({
      where: { userId },
      include: {
        items: { include: { product: true } },
      },
    });

    if (!cart || cart.items.length === 0) {
      throw new Error("Cart is empty");
    }

    // Calculate total order price
    const totalPrice = cart.items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

    // Get user current balance
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error("User not found");
    }

    if (user.loanBalance < totalPrice) {
      throw new Error("Insufficient balance to place order");
    }

    // Set mobile number if provided
    if (mobileNumber && !cart.mobileNumber) {
      await tx.cart.update({
        where: { id: cart.id },
        data: { mobileNumber },
      });
    }

    // Create order
    const order = await tx.order.create({
      data: {
        userId,
        mobileNumber: cart.mobileNumber || mobileNumber,
        items: {
          create: cart.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            mobileNumber: item.mobileNumber,
            status: "Pending",
          })),
        },
      },
      include: { items: { include: { product: true } } },
    });

    // Record transaction for the order
    // createTransaction must use the transaction-bound prisma
    await createTransaction(
      userId,
      -totalPrice, // Negative amount for deduction
      "ORDER",
      `Order #${order.id} placed with ${order.items.length} items`,
      `order:${order.id}`,
      tx // pass the transaction-bound prisma
    );

    // Clear cart (we already have the items in the order)
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

    return order;
  });
};

async function getAllOrders(limit = 100, offset = 0) {
  // Optimize query with selective field loading and better pagination
  const orders = await prisma.order.findMany({
    take: Math.min(limit, 500), // Cap limit to prevent excessive memory usage
    skip: offset,
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      createdAt: true,
      status: true,
      mobileNumber: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
      },
      items: {
        select: {
          id: true,
          productId: true,
          quantity: true,
          mobileNumber: true,
          status: true,
          product: {
            select: {
              id: true,
              name: true,
              description: true,
              price: true,
            },
          },
        },
      },
    },
  });
  
  // Get total count for pagination
  const totalCount = await prisma.order.count();
  
  return {
    orders,
    totalCount,
    hasMore: (offset + limit) < totalCount
  };
}

// Admin: Process and complete an order
const processOrder = async (orderId, status) => {
  const validStatuses = ["Pending", "Processing", "Completed"];
  if (!validStatuses.includes(status)) {
    throw new Error("Invalid order status");
  }

  const order = await prisma.order.update({
    where: { id: orderId },
    data: { status },
    include: {
      user: true,
      items: { include: { product: true } }
    }
  });

  // Record transaction for status change
  await createTransaction(
    order.userId,
    0, // Zero amount for status change
    "ORDER_STATUS",
    `Order #${orderId} status changed to ${status}`,
    `order:${orderId}`
  );

  return order;
};

const processOrderItem = async (orderItemId, status) => {
  const validStatuses = ["Pending", "Processing", "Completed", "Cancelled", "Canceled"];
  if (!validStatuses.includes(status)) {
    throw new Error("Invalid order status");
  }
  const orderItem = await prisma.orderItem.update({
    where: { id: orderItemId },
    data: { status },
    include: { order: true, product: true }
  });

  // Auto-refund logic for cancelled/canceled
  if (["Cancelled", "Canceled"].includes(status)) {
    const refundAmount = orderItem.product.price * orderItem.quantity;
    const existingRefund = await prisma.transaction.findFirst({
      where: {
        userId: orderItem.order.userId,
        type: "ORDER_ITEM_REFUND",
        reference: `orderItem:${orderItemId}`
      }
    });
    if (!existingRefund) {
      // Refund user wallet and log transaction
      await createTransaction(
        orderItem.order.userId,
        refundAmount,
        "ORDER_ITEM_REFUND",
        `Order item #${orderItemId} (${orderItem.product.name}) refunded`,
        `orderItem:${orderItemId}`
      );
    }
  }

  await createTransaction(
    orderItem.order.userId,
    0,
    "ORDER_ITEM_STATUS",
    `Order item #${orderItemId} (${orderItem.product.name}) status changed to ${status}`,
    `orderItem:${orderItemId}`
  );
  return orderItem;
};

// ... (rest of the code remains the same)

const getOrderStatus = async (options = {}) => {
  const {
    page = 1,
    limit = 50,
    orderIdFilter,
    phoneNumberFilter,
    selectedProduct,
    selectedStatusMain,
    selectedDate,
    startTime,
    endTime,
    sortOrder = 'newest',
    showNewRequestsOnly = false
  } = options;

  // Build where clause for filtering
  const where = {};
  const itemsWhere = {};

  // Date filtering
  if (selectedDate) {
    const startDate = new Date(selectedDate);
    const endDate = new Date(selectedDate);
    endDate.setDate(endDate.getDate() + 1);
    
    if (startTime && endTime) {
      const startDateTime = new Date(`${selectedDate}T${startTime}`);
      const endDateTime = new Date(`${selectedDate}T${endTime}`);
      where.createdAt = {
        gte: startDateTime,
        lte: endDateTime
      };
    } else {
      where.createdAt = {
        gte: startDate,
        lt: endDate
      };
    }
  }

  // New requests filter (last 5 minutes)
  if (showNewRequestsOnly) {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    where.createdAt = {
      gte: fiveMinutesAgo
    };
  }

  // Phone number filter - search both order-level and item-level mobile numbers
  // Handle various phone number formats (with/without 0 prefix, with 233 prefix)
  if (phoneNumberFilter) {
    const cleanedNumber = phoneNumberFilter.replace(/\D/g, '');
    const phoneVariants = [cleanedNumber];
    
    // Generate phone number variants for comprehensive search
    if (cleanedNumber.startsWith('0') && cleanedNumber.length === 10) {
      // 0XXXXXXXXX -> add XXXXXXXXX and 233XXXXXXXXX
      phoneVariants.push(cleanedNumber.substring(1));
      phoneVariants.push('233' + cleanedNumber.substring(1));
    } else if (cleanedNumber.startsWith('233') && cleanedNumber.length === 12) {
      // 233XXXXXXXXX -> add 0XXXXXXXXX and XXXXXXXXX
      phoneVariants.push('0' + cleanedNumber.substring(3));
      phoneVariants.push(cleanedNumber.substring(3));
    } else if (cleanedNumber.length === 9) {
      // XXXXXXXXX -> add 0XXXXXXXXX and 233XXXXXXXXX
      phoneVariants.push('0' + cleanedNumber);
      phoneVariants.push('233' + cleanedNumber);
    }
    
    // Build OR conditions for all phone variants
    const phoneConditions = [];
    phoneVariants.forEach(variant => {
      phoneConditions.push({
        mobileNumber: { contains: variant }
      });
      phoneConditions.push({
        items: {
          some: {
            mobileNumber: { contains: variant }
          }
        }
      });
    });
    
    where.OR = phoneConditions;
  }

  // Order ID filter
  if (orderIdFilter) {
    where.id = parseInt(orderIdFilter) || undefined;
  }

  // Product filter
  if (selectedProduct) {
    itemsWhere.product = {
      name: selectedProduct
    };
  }

  // Status filter
  if (selectedStatusMain) {
    itemsWhere.status = selectedStatusMain;
  }

  // Add items filter to where clause if needed
  if (Object.keys(itemsWhere).length > 0) {
    where.items = {
      some: itemsWhere
    };
  }

  // Calculate pagination
  const skip = (page - 1) * limit;

  const totalCount = await prisma.order.count({ where });
  
  // Get status counts - cached for 30 seconds to reduce DB load
  const statusCacheKey = 'order_status_counts';
  let statusCounts = cache.get(statusCacheKey);
  if (!statusCounts) {
    const allOrderItems = await prisma.orderItem.groupBy({
      by: ['status'],
      _count: { status: true }
    });
    
    statusCounts = {
      pending: 0,
      processing: 0,
      completed: 0,
      cancelled: 0
    };
    
    allOrderItems.forEach(item => {
      const status = item.status?.toLowerCase();
      if (status === 'pending') statusCounts.pending = item._count.status;
      else if (status === 'processing') statusCounts.processing = item._count.status;
      else if (status === 'completed') statusCounts.completed = item._count.status;
      else if (status === 'cancelled' || status === 'canceled') statusCounts.cancelled = item._count.status;
    });
    
    cache.set(statusCacheKey, statusCounts, 30000); // 30 second cache
  }
  
  // Determine sort order
  const orderBy = sortOrder === 'newest' 
    ? { createdAt: 'desc' }
    : { createdAt: 'asc' };

  // Fetch orders with optimized query
  const orders = await prisma.order.findMany({
    where,
    skip,
    take: limit,
    orderBy,
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              description: true,
              price: true
            }
          }
        }
      },
      user: {
        select: { id: true, name: true, email: true, phone: true }
      }
    }
  });

  // Transform data to match frontend expectations - include nested order structure
  const transformedData = [];
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  
  // Build phone number variants for item-level filtering
  let phoneVariantsForItemFilter = null;
  if (phoneNumberFilter) {
    const cleanedNumber = phoneNumberFilter.replace(/\D/g, '');
    phoneVariantsForItemFilter = [cleanedNumber];
    if (cleanedNumber.startsWith('0') && cleanedNumber.length === 10) {
      phoneVariantsForItemFilter.push(cleanedNumber.substring(1));
      phoneVariantsForItemFilter.push('233' + cleanedNumber.substring(1));
    } else if (cleanedNumber.startsWith('233') && cleanedNumber.length === 12) {
      phoneVariantsForItemFilter.push('0' + cleanedNumber.substring(3));
      phoneVariantsForItemFilter.push(cleanedNumber.substring(3));
    } else if (cleanedNumber.length === 9) {
      phoneVariantsForItemFilter.push('0' + cleanedNumber);
      phoneVariantsForItemFilter.push('233' + cleanedNumber);
    }
  }

  for (const order of orders) {
    const orderCreatedAt = new Date(order.createdAt).getTime();
    const isNew = orderCreatedAt > fiveMinutesAgo;
    
    for (const item of order.items) {
      // If status filter is applied, only include items with that exact status
      if (selectedStatusMain && item.status !== selectedStatusMain) {
        continue; // Skip items that don't match the status filter
      }
      
      // If product filter is applied, only include items with that product
      if (selectedProduct && item.product.name !== selectedProduct) {
        continue; // Skip items that don't match the product filter
      }

      // If phone number filter is applied, only include items whose mobileNumber matches
      if (phoneVariantsForItemFilter) {
        const itemPhone = (item.mobileNumber || order.mobileNumber || '').replace(/\D/g, '');
        const matchesPhone = phoneVariantsForItemFilter.some(variant => itemPhone.includes(variant));
        if (!matchesPhone) {
          continue; // Skip items that don't match the phone number filter
        }
      }
      
      transformedData.push({
        id: item.id,
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        mobileNumber: item.mobileNumber || order.mobileNumber,
        user: {
          id: order.user.id,
          name: order.user.name,
          email: order.user.email,
          phone: order.user.phone
        },
        product: {
          id: item.product.id,
          name: item.product.name,
          description: item.product.description,
          price: item.product.price
        },
        order: {
          id: order.id,
          createdAt: order.createdAt,
          items: [{
            status: item.status
          }]
        },
        isNew
      });
    }
  }

  return {
    data: transformedData,
    pagination: {
      total: totalCount,
      totalItems: transformedData.length,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(totalCount / limit),
      hasMore: (page * limit) < totalCount
    },
    statusCounts
  };
};

const getOrderHistory = async (userId) => {
  return await prisma.order.findMany({
    where: { userId },
    include: {
      items: {
        include: { product: true }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 50
  });
};

const getUserCompletedOrders = async (userId) => {
  return await prisma.order.findMany({
    where: { userId, status: "Completed" },
    include: {
      items: {
        include: {
          product: true
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });
};

const updateSingleOrderItemStatus = async (itemId, newStatus) => {
  try {
    const item = await prisma.orderItem.findUnique({
      where: { id: parseInt(itemId) },
      include: { order: true, product: true }
    });
    
    if (!item) {
      throw new Error("Order item not found");
    }
    
    // If status is cancelled/canceled, handle refund logic for this single item
    if (["Cancelled", "Canceled"].includes(newStatus)) {
      const refundReference = `order_item_refund:${itemId}`;
      
      const existingRefund = await prisma.transaction.findFirst({
        where: {
          userId: item.order.userId,
          type: "ORDER_ITEM_REFUND",
          reference: refundReference
        }
      });
      
      if (!existingRefund) {
        const refundAmount = item.product.price * item.quantity;
        
        if (refundAmount > 0) {
          await createTransaction(
            item.order.userId,
            refundAmount,
            "ORDER_ITEM_REFUND",
            `Item #${itemId} in order #${item.orderId} refunded (Amount: ${refundAmount})`,
            refundReference
          );
        }
      }
    }
    
    // Update single order item status
    const updatedItem = await prisma.orderItem.update({
      where: { id: parseInt(itemId) },
      data: { status: newStatus }
    });
    
    return { 
      success: true, 
      item: updatedItem,
      message: `Successfully updated item #${itemId} to ${newStatus}` 
    };
  } catch (error) {
    console.error("Error updating single order item status:", error);
    throw new Error("Failed to update order item status");
  }
};

const updateOrderItemsStatus = async (orderId, newStatus) => {
  try {
    const order = await prisma.order.findUnique({ 
      where: { id: parseInt(orderId) }, 
      select: { userId: true } 
    });
    
    if (!order) {
      throw new Error("Order not found");
    }
    
    // If status is cancelled/canceled, handle refund logic
    if (["Cancelled", "Canceled"].includes(newStatus)) {
      const refundReference = `order_items_refund:${orderId}`;
      
      const existingRefund = await prisma.transaction.findFirst({
        where: {
          userId: order.userId,
          type: "ORDER_ITEMS_REFUND",
          reference: refundReference
        }
      });
      
      if (!existingRefund) {
        // Calculate total order amount
        const items = await prisma.orderItem.findMany({
          where: { orderId: parseInt(orderId) },
          include: { product: true }
        });
        
        let totalOrderAmount = 0;
        for (const item of items) {
          totalOrderAmount += item.product.price * item.quantity;
        }
        
        // Find the original order transaction to get the amount that was deducted
        const originalOrderTransaction = await prisma.transaction.findFirst({
          where: {
            userId: order.userId,
            type: "ORDER",
            reference: `order:${orderId}`,
            amount: { lt: 0 } // Negative amount (deduction)
          }
        });
        
        let refundAmount = totalOrderAmount;
        
        if (originalOrderTransaction) {
          refundAmount = Math.abs(originalOrderTransaction.amount);
        }
        
        if (refundAmount > 0) {
          // Process the refund
          await createTransaction(
            order.userId,
            refundAmount,
            "ORDER_ITEMS_REFUND",
            `All items in order #${orderId} refunded (Amount: ${refundAmount})`,
            refundReference
          );
        }
      } else {
        console.log(`Refund already processed for order ${orderId}. Skipping duplicate refund.`);
      }
    }
    
    // Update order items status
    const updatedItems = await prisma.orderItem.updateMany({ 
      where: { orderId: parseInt(orderId) }, 
      data: { status: newStatus } 
    });
    
    // Create status change transaction (only if not a duplicate)
    const statusChangeReference = `order_status:${orderId}:${newStatus}`;
    const existingStatusChange = await prisma.transaction.findFirst({
      where: {
        userId: order.userId,
        type: "ORDER_ITEMS_STATUS",
        reference: statusChangeReference
      }
    });
    
    if (!existingStatusChange) {
      await createTransaction(
        order.userId, 
        0, 
        "ORDER_ITEMS_STATUS", 
        `All items in order #${orderId} status changed to ${newStatus}`, 
        statusChangeReference
      );
    }
    
    return { 
      success: true, 
      updatedCount: updatedItems.count, 
      message: `Successfully updated ${updatedItems.count} order items to ${newStatus}` 
    };
  } catch (error) {
    console.error("Error updating order items status:", error);
    throw new Error("Failed to update order items status");
  }
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Exporting functions for use in controllers
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const orderService = {
  async getOrdersPaginated({ page = 1, limit = 20, filters = {} }) {
    const { startDate, endDate, status, product, mobileNumber } = filters;
    
    // Build where clause
    const where = {};
    
    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }
    
    if (status) {
      where.items = {
        some: {
          status,
        },
      };
    }
    
    if (product) {
      where.items = {
        ...(where.items || {}),
        some: {
          ...(where.items?.some || {}),
          product: {
            name: product,
          },
        },
      };
    }
    
    if (mobileNumber) {
      where.mobileNumber = {
        contains: mobileNumber,
      };
    }
    
    // Calculate pagination parameters
    const skip = (page - 1) * parseInt(limit);
    
    // Get count for pagination info
    const totalOrders = await prisma.order.count({ where });
    
    // Get paginated orders
    const orders = await prisma.order.findMany({
      where,
      skip,
      take: parseInt(limit),
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                price: true,
                description: true,
              },
            },
          },
        },
        user: {
          select: { 
            id: true, 
            name: true, 
            email: true, 
            phone: true 
          },
        },
      },
    });
    
    // Transform data more efficiently - avoid flatMap and deep copying
    const transformedItems = [];
    for (const order of orders) {
      for (const item of order.items) {
        transformedItems.push({
          id: item.id,
          orderId: order.id,
          mobileNumber: order.mobileNumber,
          user: order.user,
          createdAt: order.createdAt,
          product: item.product,
          status: item.status,
          order: {
            id: order.id,
            createdAt: order.createdAt,
            items: [{ status: item.status }]
          }
        });
      }
    }
    
    return {
      items: transformedItems,
      pagination: {
        total: totalOrders,
        pages: Math.ceil(totalOrders / parseInt(limit)),
        currentPage: parseInt(page),
        limit: parseInt(limit)
      }
    };
  },
  
  async getOrderStats() {
    // Cache order stats for 5 minutes since they don't change frequently
    const cacheKey = 'order_stats';
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Use more efficient aggregation query
    const stats = await prisma.$queryRaw`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN EXISTS(SELECT 1 FROM OrderItem oi WHERE oi.orderId = o.id AND oi.status = 'Pending') THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN EXISTS(SELECT 1 FROM OrderItem oi WHERE oi.orderId = o.id AND oi.status = 'Completed') THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN EXISTS(SELECT 1 FROM OrderItem oi WHERE oi.orderId = o.id AND oi.status = 'Processing') THEN 1 ELSE 0 END) as processing
      FROM \`Order\` o
    `;

    const result = {
      total: Number(stats[0]?.total || 0),
      pending: Number(stats[0]?.pending || 0),
      completed: Number(stats[0]?.completed || 0),
      processing: Number(stats[0]?.processing || 0)
    };

    // Cache for 5 minutes
    cache.set(cacheKey, result, 300000);
    return result;
  },
  
  async updateOrderStatus(orderId, status) {
    const id = parseInt(orderId);
    if (isNaN(id)) {
      throw new Error('Invalid order ID');
    }
    return await prisma.order.update({
      where: { id },
      data: {
        items: {
          updateMany: {
            where: {},
            data: { status }
          }
        }
      }
    });
  },

  async batchCompleteProcessingOrders() {
    // Update all Processing order items to Completed
    const result = await prisma.orderItem.updateMany({
      where: { status: 'Processing' },
      data: { status: 'Completed' }
    });
    return { count: result.count };
  },

  // Create direct order from ext_agent system
  async createDirectOrder(userId, items, totalAmount) {
    console.log(`🔄 [ORDER SERVICE] Starting createDirectOrder for user ${userId}`);
    console.log(`🔄 [ORDER SERVICE] Items to create:`, items);
    console.log(`🔄 [ORDER SERVICE] Total amount: ${totalAmount}`);
    
    return await prisma.$transaction(async (tx) => {
      // Validate user exists
      console.log(`🔍 [ORDER SERVICE] Looking up user ${userId}...`);
      const user = await tx.user.findUnique({ where: { id: parseInt(userId) } });
      if (!user) {
        console.log(`❌ [ORDER SERVICE] User ${userId} not found`);
        throw new Error("User not found");
      }

      console.log(`✅ [ORDER SERVICE] Found user: ${user.name} (${user.email})`);
      console.log(`💰 User ${userId} current loanBalance: ${user.loanBalance}`);
      console.log(`💰 Order total amount: ${totalAmount}`);

      // Check if user has sufficient balance (this should already be checked by ext_agent)
      if (user.loanBalance < totalAmount) {
        throw new Error("Insufficient balance to place order");
      }

      // Create order
      console.log(`🔄 [ORDER SERVICE] Creating order in database...`);
      const order = await tx.order.create({
        data: {
          userId: parseInt(userId),
          mobileNumber: items[0]?.mobileNumber || null, // Use mobile number from first item
          items: {
            create: items.map((item) => ({
              productId: parseInt(item.productId),
              quantity: parseInt(item.quantity),
              price: parseFloat(item.price),
              mobileNumber: item.mobileNumber || null,
              status: "Pending"
            }))
          }
        },
        include: {
          items: { include: { product: true } },
          user: true
        }
      });
      
      console.log(`✅ [ORDER SERVICE] Order created with ID: ${order.id}`);

      // Deduct balance from user's loanBalance
      await tx.user.update({
        where: { id: parseInt(userId) },
        data: {
          loanBalance: {
            decrement: totalAmount
          }
        }
      });

      // Record transaction for the order (similar to submitCart)
      await createTransaction(
        parseInt(userId),
        -totalAmount, // Negative amount for deduction
        "ORDER",
        `Order #${order.id} placed via ext_agent system`,
        `order:${order.id}`,
        tx // Pass the transaction context
      );

      console.log(`✅ Deducted ${totalAmount} from user ${userId} loanBalance`);
      console.log(`✅ Created transaction record for order ${order.id}`);
      console.log(`✅ Created order ${order.id} with ${order.items.length} items`);

      return order;
    });
  },

  // Get multiple orders by IDs
  async getOrdersByIds(orderIds) {
    const orders = await prisma.order.findMany({
      where: {
        id: {
          in: orderIds.map(id => parseInt(id))
        }
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                description: true,
                price: true
              }
            }
          }
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        }
      }
    });

  return orders;
}
};

module.exports = {
  submitCart,
  getAllOrders,
  processOrder,
  getUserCompletedOrders,
  processOrderItem,
  getOrderStatus,
  getOrderHistory,
  updateOrderItemsStatus,
  updateSingleOrderItemStatus,
  createDirectOrder: orderService.createDirectOrder,
  getOrdersByIds: orderService.getOrdersByIds,
  batchCompleteProcessingOrders: orderService.batchCompleteProcessingOrders,

  orderService
};