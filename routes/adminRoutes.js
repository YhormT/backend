const express = require("express");
const { addPackage } = require("../controllers/adminController");

const router = express.Router();
router.post("/add-package", addPackage);

module.exports = router;
