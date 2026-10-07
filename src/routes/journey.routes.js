const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../middleware/auth.middleware');
const journeyController = require('../controllers/journey.controller');

// All journey operations require authenticated passenger
router.post('/board', authenticateToken, journeyController.board);
router.post('/alight', authenticateToken, journeyController.alight);
router.get('/active', authenticateToken, journeyController.getActive);
router.get('/history', authenticateToken, journeyController.getHistory);
// Public fare calculator estimate
router.post('/fare-estimate', journeyController.getEstimate);
router.get('/notifications', authenticateToken, journeyController.getNotifications);
router.put('/notifications/:id/read', authenticateToken, journeyController.markRead);

module.exports = router;