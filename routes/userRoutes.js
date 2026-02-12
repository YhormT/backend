const express = require("express");
const multer = require("multer");
const {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  repayLoan,
  getLoanBalance,
  downloadExcel,
  uploadExcel,
  downloadLatestExcel,
  updateUserPassword,
  updateUserProfile,
  getUserProfile,
  updateLoanStatus,
  updateAdminLoanBalance,
  updateAdminLoanBalanceController,
  refundUser,
  assignLoan
} = require("../controllers/userController");

const upload = require("../middleware/uploadMiddleware");

const createUserRouter = (io, userSockets) => {
  const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, file.originalname),
});
router.get("/", getAllUsers);
router.post("/", createUser);
router.put("/:id", (req, res) => updateUser(req, res, io, userSockets));
router.delete("/:id", deleteUser);
router.post("/loan/assign", assignLoan);
router.post("/refund", refundUser);
router.post("/repay-loan", repayLoan);
router.post("/loan/repay", refundUser);
router.get("/loan/:userId", getLoanBalance);
router.put("/loan/status", updateLoanStatus);
router.put("/updateLoan/loanAmount", updateAdminLoanBalance);
router.post("/upload-excel", upload.single("file"), uploadExcel);
router.post("/download/:filename", downloadExcel);
router.put('/:userId/updatePassword', updateUserPassword)
router.put('/:userId/password', updateUserPassword)
router.get('/:userId', getUserProfile);
router.put('/:userId/profile', updateUserProfile);

  return router;
};

module.exports = createUserRouter;