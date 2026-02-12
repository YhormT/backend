const prisma = require("../config/db");

const addProduct = async (name, description, price, stock) => {
  return await prisma.product.create({
    data: { name, description, price, stock },
  });
};

const getAllProducts = async () => {
  return await prisma.product.findMany({
    orderBy: {
      createdAt: "desc",
    },
  });
};

const getProductById = async (id) => {
  return await prisma.product.findUnique({ where: { id } });
};

const updateProduct = async (id, data) => {
  return await prisma.product.update({ where: { id }, data });
};


const setProductStockToZero = async (id) => {
  return await prisma.product.update({
    where: { id },
    data: { stock: 0 },
  });
};

const setAllProductStockToZero = async (stockValue) => {
  return await prisma.product.updateMany({
    data: { stock: stockValue },
  });
};

// Get products visible in shop (includes out-of-stock products)
const getShopProducts = async () => {
  return await prisma.product.findMany({
    where: {
      showInShop: true
    },
    orderBy: {
      createdAt: "desc",
    },
  });
};

// Toggle product shop visibility
const toggleShopVisibility = async (id, showInShop) => {
  return await prisma.product.update({
    where: { id },
    data: { showInShop },
  });
};

const deleteProduct = async (id) => {
  return await prisma.$transaction(async (tx) => {
    // Delete related cart items
    await tx.cartItem.deleteMany({
      where: { productId: id }
    });
    
    // Delete related order items
    await tx.orderItem.deleteMany({
      where: { productId: id }
    });

    // Delete related referral orders
    await tx.referralOrder.deleteMany({
      where: { productId: id }
    });
    
    // Delete the product
    return await tx.product.delete({
      where: { id }
    });
  }, { timeout: 15000 });
};

const roleBasedPriceMap = {

};

/**
 * Get the correct price for a product based on user role.
 * @param {string} role - The user's role (e.g., 'AGENT', 'SUPERAGENT')
 * @param {object} product - Product object from DB
 * @returns {number} price
 */
const getPriceForUserRole = (role, product) => {
  if (!role || !product) return null;
  // If a mapping exists for this role and product, use it
  if (
    roleBasedPriceMap[role] &&
    roleBasedPriceMap[role][product.name]
  ) {
    return roleBasedPriceMap[role][product.name];
  }
  // Default to product.price from DB
  return product.price;
};

module.exports = {
  addProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  setProductStockToZero,
  setAllProductStockToZero,
  getPriceForUserRole,
  getShopProducts,
  toggleShopVisibility
};
