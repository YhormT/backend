const express = require("express");
const { resetDatabase } = require("../controllers/resetController");

const router = express.Router();

// POST /api/reset/database - Reset database (admin only)
router.post("/database", resetDatabase);

module.exports = router;
