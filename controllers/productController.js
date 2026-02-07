const productService = require("../services/productService");

const addProduct = async (req, res) => {
  const { name, description, price, stock } = req.body;
  try {
    const product = await productService.addProduct(
      name,
      description,
      price,
      stock
    );
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAllProducts = async (req, res) => {
  try {
    const products = await productService.getAllProducts();
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getProductById = async (req, res) => {
  try {
    const product = await productService.getProductById(
      parseInt(req.params.id)
    );
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateProduct = async (req, res) => {
  try {
    const product = await productService.updateProduct(
      parseInt(req.params.id),
      req.body
    );
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const setProductStockToZero = async (req, res) => {
  try {
    const product = await productService.setProductStockToZero(parseInt(req.params.id));
    res.json({ message: "Product stock set to zero", product });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteProduct = async (req, res) => {
  try {
    await productService.deleteProduct(parseInt(req.params.id));
    res.json({ message: "Product deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};



const resetAllProductStock = async (req, res) => {
  const { stock } = req.body;

  if (typeof stock !== 'number' || stock < 0) {
    return res.status(400).json({ error: 'Stock must be a non-negative number' });
  }

  try {
    const result = await productService.setAllProductStockToZero(stock);
    // res.status(200).json({
    //   message: 'All product stocks have been set to 0.',
    //   updatedCount: result.count,
    // });
    res.status(200).json({
      message: `All product stocks updated to ${stock}`,
      updatedCount: result.count,
    });
  } catch (error) {
    console.error('Error resetting product stock:', error);
    res.status(500).json({ error: 'Failed to reset product stock.' });
  }
};

// Get products visible in shop (public endpoint)
const getShopProducts = async (req, res) => {
  try {
    const products = await productService.getShopProducts();
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Toggle product shop visibility
const toggleShopVisibility = async (req, res) => {
  try {
    const { showInShop } = req.body;
    const product = await productService.toggleShopVisibility(
      parseInt(req.params.id),
      showInShop
    );
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};



module.exports = {
  addProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  setProductStockToZero,
  resetAllProductStock,
  getShopProducts,
  toggleShopVisibility
};
