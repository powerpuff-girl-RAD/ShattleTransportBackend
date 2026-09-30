const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../middleware/auth.middleware');
const tokenController = require('../controllers/token.controller');

// Passenger-scoped token endpoints (require passenger auth)
router.post('/activate', authenticateToken, tokenController.activateToken);
router.get('/', authenticateToken, tokenController.getActiveToken);
router.get('/qr', authenticateToken, tokenController.generateQR);
router.delete('/:tokenSerial', authenticateToken, tokenController.deactivateToken);

// QR validation endpoint — called by the inspector/gate device.
// The inspector must be authenticated (their own JWT); the passenger JWT is
// carried inside the QR payload and validated cryptographically by the service.
router.post('/validate', authenticateToken, tokenController.validateQR);

module.exports = router;

