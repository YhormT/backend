const prisma = require('../config/db');
const crypto = require('crypto');
const { createTransaction } = require('./transactionService');

// Generate a secure API key
const generateApiKey = () => {
  return 'klh_' + crypto.randomBytes(32).toString('hex');
};

// Create a new API key for an agent
const createApiKey = async (agentId, partnerName) => {
  // Verify agent exists
  const agent = await prisma.user.findUnique({
    where: { id: parseInt(agentId) },
    select: { id: true, name: true, role: true }
  });
  if (!agent) throw new Error('Agent not found');
  if (agent.role === 'admin' || agent.role === 'ADMIN') throw new Error('Cannot create API key for admin users');

  const apiKey = generateApiKey();
  const record = await prisma.externalApiKey.create({
    data: {
      partnerName: partnerName || agent.name,
      agentId: agent.id,
      apiKey
    }
  });

  return { id: record.id, partnerName: record.partnerName, agentId: record.agentId, agentName: agent.name, apiKey: record.apiKey, createdAt: record.createdAt };
};

// List all API keys (mask the actual key for security)
const listApiKeys = async () => {
  const keys = await prisma.externalApiKey.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      agent: {
        select: { id: true, name: true, role: true, loanBalance: true, phone: true }
      }
    }
  });

  return keys.map(k => ({
    id: k.id,
    partnerName: k.partnerName,
    agentId: k.agentId,
    agentName: k.agent?.name || 'Unknown',
    agentRole: k.agent?.role || '',
    agentBalance: k.agent?.loanBalance || 0,
    agentPhone: k.agent?.phone || '',
    apiKeyPreview: k.apiKey.substring(0, 12) + '...',
    isActive: k.isActive,
    createdAt: k.createdAt,
    lastUsedAt: k.lastUsedAt,
    totalOrders: k.totalOrders
  }));
};

// Revoke an API key
const revokeApiKey = async (id) => {
  return await prisma.externalApiKey.update({
    where: { id: parseInt(id) },
    data: { isActive: false }
  });
};

// Reactivate an API key
const activateApiKey = async (id) => {
  return await prisma.externalApiKey.update({
    where: { id: parseInt(id) },
    data: { isActive: true }
  });
};

// Delete an API key permanently
const deleteApiKey = async (id) => {
  return await prisma.externalApiKey.delete({
    where: { id: parseInt(id) }
  });
};

// Get available products for external partners
const getAvailableProducts = async () => {
  const products = await prisma.product.findMany({
    where: { showForAgents: true },
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      promoPrice: true,
      usePromoPrice: true,
      stock: true
    },
    orderBy: { name: 'asc' }
  });

  return products.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description,
    price: (p.usePromoPrice && p.promoPrice != null) ? p.promoPrice : p.price,
    stock: p.stock
  }));
};

// Create an external order - debits agent wallet
const createExternalOrder = async (partnerId, agentId, items) => {
  return await prisma.$transaction(async (tx) => {
    // Get agent with current balance
    const agent = await tx.user.findUnique({
      where: { id: agentId },
      select: { id: true, name: true, loanBalance: true }
    });

    if (!agent) throw new Error('Agent account not found');

    // Validate all products exist and calculate total
    const productIds = items.map(i => parseInt(i.productId));
    const products = await tx.product.findMany({
      where: { id: { in: productIds } }
    });

    const productMap = {};
    for (const p of products) {
      productMap[p.id] = p;
    }

    // Validate each item
    const orderItems = [];
    let totalPrice = 0;

    for (const item of items) {
      const product = productMap[parseInt(item.productId)];
      if (!product) {
        throw new Error(`Product with ID ${item.productId} not found`);
      }

      const effectivePrice = (product.usePromoPrice && product.promoPrice != null) ? product.promoPrice : product.price;
      const quantity = parseInt(item.quantity) || 1;
      const itemTotal = effectivePrice * quantity;
      totalPrice += itemTotal;

      orderItems.push({
        productId: product.id,
        quantity,
        mobileNumber: item.mobileNumber || null,
        status: 'Pending',
        productName: product.name,
        productPrice: effectivePrice,
        productDescription: product.description
      });
    }

    // Check agent wallet balance (loanBalance is their wallet)
    if (agent.loanBalance < totalPrice) {
      throw new Error(`Insufficient wallet balance. Required: GHS ${totalPrice.toFixed(2)}, Available: GHS ${agent.loanBalance.toFixed(2)}. Please top up your wallet.`);
    }

    // Create the order under the agent's account
    const order = await tx.order.create({
      data: {
        userId: agent.id,
        mobileNumber: items[0]?.mobileNumber || null,
        status: 'Pending',
        items: {
          create: orderItems
        }
      },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, description: true, price: true }
            }
          }
        }
      }
    });

    // Debit agent wallet
    const debitAmount = -totalPrice; // negative = debit
    await createTransaction(
      agent.id,
      debitAmount,
      'DEBIT',
      `External API order #${order.id} (${orderItems.length} item${orderItems.length > 1 ? 's' : ''})`,
      `EXT-ORD-${order.id}`,
      tx
    );

    // Increment partner's total orders count
    await tx.externalApiKey.update({
      where: { id: partnerId },
      data: { totalOrders: { increment: 1 } }
    });

    return {
      orderId: order.id,
      status: order.status,
      totalPrice,
      walletBalanceAfter: agent.loanBalance - totalPrice,
      items: order.items.map(item => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        price: item.productPrice,
        mobileNumber: item.mobileNumber,
        status: item.status
      })),
      createdAt: order.createdAt
    };
  }, { timeout: 15000 });
};

// Check order status by order ID
const getExternalOrderStatus = async (orderId) => {
  const order = await prisma.order.findUnique({
    where: { id: parseInt(orderId) },
    include: {
      items: {
        select: {
          id: true,
          productId: true,
          productName: true,
          quantity: true,
          productPrice: true,
          mobileNumber: true,
          status: true,
          updatedAt: true
        }
      }
    }
  });

  if (!order) {
    throw new Error('Order not found');
  }

  return {
    orderId: order.id,
    status: order.status,
    items: order.items,
    createdAt: order.createdAt
  };
};

// Check multiple order statuses
const getExternalOrderStatuses = async (orderIds) => {
  const ids = orderIds.map(id => parseInt(id));
  const orders = await prisma.order.findMany({
    where: { id: { in: ids } },
    include: {
      items: {
        select: {
          id: true,
          productId: true,
          productName: true,
          quantity: true,
          productPrice: true,
          mobileNumber: true,
          status: true,
          updatedAt: true
        }
      }
    }
  });

  return orders.map(order => ({
    orderId: order.id,
    status: order.status,
    items: order.items,
    createdAt: order.createdAt
  }));
};

// Get list of agents for API key assignment
const getAgentsList = async () => {
  const agents = await prisma.user.findMany({
    where: {
      role: { not: 'admin' },
      isSuspended: false
    },
    select: { id: true, name: true, role: true, phone: true, loanBalance: true },
    orderBy: { name: 'asc' }
  });
  return agents;
};

module.exports = {
  generateApiKey,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  activateApiKey,
  deleteApiKey,
  getAvailableProducts,
  createExternalOrder,
  getExternalOrderStatus,
  getExternalOrderStatuses,
  getAgentsList
};
