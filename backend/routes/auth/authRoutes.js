import express from 'express';
import { 
  register, 
  login, 
  forgotPassword, 
  resetPassword, 
  logout, 
  protect 
} from '../../controllers/auth/authController.js';

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);

// Protected route (logout - optional auth, but good practice)
router.post('/logout', protect, logout);

export default router;