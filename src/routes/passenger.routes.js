const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../middleware/auth.middleware');
const passengerController = require('../controllers/passenger.controller');

// All passenger routes require authentication.
// A passenger can only access their own data because req.user.id
// is taken directly from the verified JWT — never from the request body.

router.get('/profile', authenticateToken, passengerController.getProfile);
router.put('/profile', authenticateToken, passengerController.updateProfile);
router.put('/password', authenticateToken, passengerController.changePassword);

module.exports = router;

