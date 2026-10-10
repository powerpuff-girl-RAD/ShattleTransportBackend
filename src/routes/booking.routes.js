const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../middleware/auth.middleware');
const bookingController = require('../controllers/booking.controller');

// Route and schedule discovery (can be viewed before or after login)
router.get('/routes', bookingController.getRoutes);
router.get('/routes/:routeId', bookingController.getRouteDetails);
router.post('/calculate-fare', bookingController.calculateFare);

// Authenticated booking management
router.post('/', authenticateToken, bookingController.createBooking);
router.get('/', authenticateToken, bookingController.getUserBookings);
router.get('/:bookingId', authenticateToken, bookingController.getBookingById);
router.post('/:bookingId/activate-token', authenticateToken, bookingController.activateToken);
router.post('/:bookingId/cancel', authenticateToken, bookingController.cancelBooking);

module.exports = router;