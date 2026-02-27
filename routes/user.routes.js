const express = require("express");
const router = express.Router({ mergeParams: true });
const authController = require('../controllers/auth.controller');
const passport = require('../config/passport');
const { requireAuth } = require('../middleware/auth');
const { authLimiter, otpVerifyLimiter } = require('../middleware/rateLimiter');
const {
  registerValidationRules,
  loginValidationRules,
  validate,
} = require("../middleware/validation");

const hasGoogleOAuth = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const hasGithubOAuth = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);

// Registration routes
router.get("/register", authController.getRegister);
router.post("/register", authLimiter, registerValidationRules(), validate, authController.postRegister);

// Login routes
router.get("/login", authController.getLogin);
router.post("/login", authLimiter, loginValidationRules(), validate, authController.postLogin);

// Get current user
router.get("/me", requireAuth, authController.getCurrentUser);

// Logout route
router.get("/logout", authController.logout);

// Check if email exists
router.get("/check-email", authController.checkEmail);

// Forgot password routes
router.get("/forgot-password", authController.getForgotPassword);
router.post("/forgot-password", authLimiter, authController.postForgotPassword);

// Email link verification route
router.get("/verify-link", otpVerifyLimiter, authController.verifyOtpLink);

// Reset password routes
router.get("/reset-password", authController.getResetPassword);
router.post("/reset-password", authController.postResetPassword);

// OAuth routes
router.get('/auth/google', (req, res, next) => {
  if (!hasGoogleOAuth) return res.redirect('/user/login?error=Google login is not configured');
  return passport.authenticate('google', { scope: ['profile', 'email'], session: false })(req, res, next);
});
router.get('/auth/google/callback', (req, res, next) => {
  if (!hasGoogleOAuth) return res.redirect('/user/login?error=Google login is not configured');
  return passport.authenticate('google', { session: false, failureRedirect: '/user/login?error=Google login failed' })(req, res, next);
}, authController.completeOAuth);

router.get('/auth/github', (req, res, next) => {
  if (!hasGithubOAuth) return res.redirect('/user/login?error=GitHub login is not configured');
  return passport.authenticate('github', { scope: ['user:email'], session: false })(req, res, next);
});
router.get('/auth/github/callback', (req, res, next) => {
  if (!hasGithubOAuth) return res.redirect('/user/login?error=GitHub login is not configured');
  return passport.authenticate('github', { session: false, failureRedirect: '/user/login?error=GitHub login failed' })(req, res, next);
}, authController.completeOAuth);

module.exports = router;

