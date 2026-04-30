const commissionRequestService = require('../services/commissionRequestService');

class CommissionRequestController {
  // Agent: Create a commission request
  async createRequest(req, res) {
    try {
      const agentId = req.user.id;
      const request = await commissionRequestService.createRequest(agentId, req.body);
      
      res.status(201).json({
        success: true,
        message: 'Commission request submitted successfully',
        data: request
      });
    } catch (error) {
      console.error('Error creating commission request:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Agent: Get my commission requests
  async getMyRequests(req, res) {
    try {
      const agentId = req.user.id;
      const requests = await commissionRequestService.getAgentRequests(agentId);
      
      res.json({
        success: true,
        data: requests
      });
    } catch (error) {
      console.error('Error fetching agent requests:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Admin: Get all commission requests
  async getAllRequests(req, res) {
    try {
      const { status } = req.query;
      const requests = await commissionRequestService.getAllRequests(status);
      
      res.json({
        success: true,
        data: requests
      });
    } catch (error) {
      console.error('Error fetching all requests:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Admin: Get pending count (for badge)
  async getPendingCount(req, res) {
    try {
      const count = await commissionRequestService.getPendingCount();
      res.json({
        success: true,
        count
      });
    } catch (error) {
      console.error('Error fetching pending count:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Admin: Approve commission request
  async approveRequest(req, res) {
    try {
      const { requestId } = req.params;
      const { commission, adminNotes } = req.body;
      
      if (!commission || commission <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Commission amount is required and must be greater than 0'
        });
      }

      const request = await commissionRequestService.approveRequest(
        requestId,
        commission,
        adminNotes || ''
      );
      
      res.json({
        success: true,
        message: 'Commission request approved',
        data: request
      });
    } catch (error) {
      console.error('Error approving request:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Admin: Decline commission request
  async declineRequest(req, res) {
    try {
      const { requestId } = req.params;
      const { adminNotes } = req.body;
      
      const request = await commissionRequestService.declineRequest(
        requestId,
        adminNotes || ''
      );
      
      res.json({
        success: true,
        message: 'Commission request declined',
        data: request
      });
    } catch (error) {
      console.error('Error declining request:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get single request
  async getRequest(req, res) {
    try {
      const { requestId } = req.params;
      const request = await commissionRequestService.getRequestById(requestId);
      
      if (!request) {
        return res.status(404).json({
          success: false,
          message: 'Request not found'
        });
      }
      
      res.json({
        success: true,
        data: request
      });
    } catch (error) {
      console.error('Error fetching request:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new CommissionRequestController();
