const prisma = require('../config/db');
const { createTransaction } = require('./transactionService');


const addItemToCart = async (userId, productId, quantity, mobileNumber = null) => {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new Error("Product not found");
  
  let cart = await prisma.cart.findUnique({ where: { userId } });
  if (!cart) {
    cart = await prisma.cart.create({
      data: { userId },
    });
  }
   
  // Calculate total price for this cart item
  const totalPrice = product.price * quantity;
  
  // Create cart item
  const cartItem = await prisma.cartItem.create({
    data: {
      cartId: cart.id,
      productId,
      quantity,
      price: totalPrice,
      mobileNumber,
    },
  });
  
  return cartItem;
};

const getUserCart = async (userId) => {
  return await prisma.cart.findUnique({
    where: { userId },
    include: {
      items: {
        include: {
          product: true,
        },
      },
    },
  });
};

const removeItemFromCart = async (cartItemId) => {
  // Get cart item details before deletion
  const cartItem = await prisma.cartItem.findUnique({
    where: { id: cartItemId },
    include: {
      cart: true,
      product: true
    }
  });
  
  if (!cartItem) throw new Error("Cart item not found");
  
  // Delete the cart item
  const deletedItem = await prisma.cartItem.delete({ where: { id: cartItemId } });
  
  return deletedItem;
};


const getAllCarts = async () => {
  return await prisma.cart.findMany({
    include: {
      user: true,
      items: true,
    },
  });
};

const clearUserCart = async (userId) => {
  const cart = await prisma.cart.findUnique({
    where: { userId },
  });

  if (!cart) {
    // If there's no cart, there's nothing to clear.
    return { message: "Cart is already empty." };
  }

  await prisma.cartItem.deleteMany({
    where: { cartId: cart.id },
  });

  return { message: "Cart cleared successfully." };
};

module.exports = { addItemToCart, getUserCart, removeItemFromCart, getAllCarts, clearUserCart };
