const prisma = require('../config/db');

// Promo-aware effective price (matches storefrontService logic)
const effectivePriceOf = (product) => {
  if (!product) return 0;
  return (product.usePromoPrice && typeof product.promoPrice === 'number')
    ? product.promoPrice
    : product.price;
};

// Normalize data size to match Product.description format e.g. "5GB"
const normalizeDataSize = (raw) => {
  if (!raw) return '';
  const s = String(raw).trim().toUpperCase().replace(/\s+/g, '');
  if (/^\d+(\.\d+)?$/.test(s)) return `${s}GB`;
  return s;
};

class CommissionRequestService {
  // Agent: Create a commission request - auto compute commission
  async createRequest(agentId, data) {
    const { customerPhone, price, network, dataSize } = data;
    
    if (!customerPhone || !price || !network || !dataSize) {
      throw new Error('All fields are required: customerPhone, price, network, dataSize');
    }

    const agentPrice = parseFloat(price);
    const description = normalizeDataSize(dataSize);

    // Find admin product matching network name + dataSize
    const product = await prisma.product.findFirst({
      where: { name: network, description }
    });

    let suggestedCommission = null;
    let adminNote = null;
    if (product) {
      const basePrice = effectivePriceOf(product);
      const diff = agentPrice - basePrice;
      if (diff < 0) {
        adminNote = `Agent price (GHS ${agentPrice}) below admin base (GHS ${basePrice}). Manual review needed.`;
        suggestedCommission = 0;
      } else {
        suggestedCommission = parseFloat(diff.toFixed(2));
      }
    } else {
      adminNote = `No matching product found for "${network}" - "${description}". Set commission manually.`;
    }

    const request = await prisma.commissionRequest.create({
      data: {
        agentId,
        customerPhone,
        price: agentPrice,
        network,
        dataSize: description,
        commission: suggestedCommission,
        adminNotes: adminNote
      }
    });

    return request;
  }

  // Agent: Get my commission requests
  async getAgentRequests(agentId) {
    const requests = await prisma.commissionRequest.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' }
    });
    return requests;
  }

  // Admin: Get all commission requests
  async getAllRequests(status = null) {
    const where = status && status !== 'all' ? { status } : {};
    
    const requests = await prisma.commissionRequest.findMany({
      where,
      include: {
        agent: {
          select: { id: true, name: true, phone: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return requests;
  }

  // Admin: Get pending requests count
  async getPendingCount() {
    const count = await prisma.commissionRequest.count({
      where: { status: 'PENDING' }
    });
    return count;
  }

  // Admin: Approve commission request
  async approveRequest(requestId, commission, adminNotes = '') {
    const request = await prisma.commissionRequest.findUnique({
      where: { id: parseInt(requestId) },
      include: { agent: true }
    });

    if (!request) {
      throw new Error('Request not found');
    }

    if (request.status !== 'PENDING') {
      throw new Error('Request is not pending');
    }

    const commissionAmount = parseFloat(commission);

    // Find matching product to attach ReferralOrder to
    const product = await prisma.product.findFirst({
      where: { name: request.network, description: request.dataSize }
    });

    if (!product) {
      throw new Error(`Cannot approve - no product matches "${request.network}" / "${request.dataSize}". Ask agent to fix request or create product first.`);
    }

    const basePrice = effectivePriceOf(product);
    const agentPrice = request.price;

    // Wrap in transaction: update request + create ReferralOrder
    const [updated] = await prisma.$transaction([
      prisma.commissionRequest.update({
        where: { id: parseInt(requestId) },
        data: {
          status: 'APPROVED',
          commission: commissionAmount,
          adminNotes
        }
      }),
      prisma.referralOrder.create({
        data: {
          agentId: request.agentId,
          productId: product.id,
          customerName: 'Manual Order',
          customerPhone: request.customerPhone,
          basePrice,
          agentPrice,
          commission: commissionAmount,
          paymentRef: `CR-${request.id}-${Date.now()}`,
          paymentStatus: 'Paid',
          orderStatus: 'Completed',
          commissionPaid: false
        }
      })
    ]);

    return updated;
  }

  // Admin: Decline commission request
  async declineRequest(requestId, adminNotes = '') {
    const request = await prisma.commissionRequest.findUnique({
      where: { id: parseInt(requestId) }
    });

    if (!request) {
      throw new Error('Request not found');
    }

    if (request.status !== 'PENDING') {
      throw new Error('Request is not pending');
    }

    const updated = await prisma.commissionRequest.update({
      where: { id: parseInt(requestId) },
      data: {
        status: 'DECLINED',
        adminNotes
      }
    });

    return updated;
  }

  // Get single request by ID
  async getRequestById(requestId) {
    const request = await prisma.commissionRequest.findUnique({
      where: { id: parseInt(requestId) },
      include: {
        agent: {
          select: { id: true, name: true, phone: true }
        }
      }
    });
    return request;
  }
}

module.exports = new CommissionRequestService();
