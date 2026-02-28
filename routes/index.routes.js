const express = require("express");
const router = express.Router({ mergeParams: true });
const dashboardController = require('../controllers/dashboard.controller');
const profileController = require('../controllers/profile.controller');
const fileController = require('../controllers/file.controller');
const contactController = require('../controllers/contact.controller');
const statsController = require('../controllers/stats.controller');
const { requireAuth } = require('../middleware/auth');
const { uploadLimiter, apiLimiter } = require('../middleware/rateLimiter');
const upload = require('../config/multer');

// Home page route
router.get('/', (req, res) => {
   if (res.locals.isLoggedIn) {
    return res.redirect('/dashboard');
  }
  res.render('pages/home', { title: "IMEER.ai" });
});

// About page route
router.get('/about', (req, res) => {
  res.render('pages/about', { title: "About Us - IMEER.ai" });
});

// Features page route
router.get('/features', (req, res) => {
  res.render('pages/features', { title: "Features - IMEER.ai" });
});

// Contact page route
router.get('/contact', (req, res) => {
  res.render('pages/contact', { 
    title: "Contact Us - IMEER.ai",
    user: res.locals.user || null,
    isLoggedIn: res.locals.isLoggedIn
  });
});

// Contact form submission (requires auth - user must be logged in)
router.post(
  '/contact/send',
  requireAuth,
  contactController.sendContactMessage
);

// Dashboard route (after login)
router.get('/dashboard', requireAuth, dashboardController.getDashboard);

// Profile page routes
router.get('/profile', requireAuth, profileController.getProfile);
router.get('/profile/change-password', requireAuth, profileController.getChangePassword);
router.post('/profile/change-password', requireAuth, profileController.changePassword);
router.post('/profile/delete-account', requireAuth, profileController.deleteAccount);

// Files management routes
router.get('/files', requireAuth, fileController.getFiles);
router.post('/files/upload', requireAuth, uploadLimiter, upload.array('files', 10), fileController.uploadMultipleFiles);
router.get('/files/:fileId', requireAuth, fileController.downloadFile);
router.delete('/files/:fileId', requireAuth, fileController.deleteFile);
router.post('/files/:fileId/restore', requireAuth, fileController.restoreFile);
router.delete('/files/:fileId/permanent', requireAuth, fileController.deleteForever);
router.put('/files/:fileId/rename', requireAuth, fileController.renameFile);
router.post('/files/:fileId/share', requireAuth, fileController.shareFile);
router.post('/files/:fileId/generate-share-link', requireAuth, fileController.generateShareLink);

// Stats API route
router.get('/api/stats', apiLimiter, statsController.getPlatformStats);
router.get('/api/storage-health', requireAuth, apiLimiter, fileController.getStorageHealth);

// Public share link route
router.get('/share/:shareCode', fileController.accessSharedFile);

module.exports = router;
