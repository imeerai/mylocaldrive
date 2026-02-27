// Profile Controller
const User = require('../models/user.model');
const bcrypt = require('bcryptjs');

const normalizeComparable = (value) => String(value || '').trim().toLowerCase();

// Get user profile
const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).render('errors/error', {
        title: 'User Not Found',
        status: 404,
        message: 'User profile not found'
      });
    }
    res.render('pages/profile', { 
      title: "Profile - IMEER.ai", 
      isLoggedIn: true,
      user,
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (err) {
    console.error("Error fetching profile:", err);
    return next(err);
  }
};

// Get edit profile name page
const getEditProfileName = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.render('pages/edit-name', { 
      title: "Edit Profile - IMEER.ai", 
      isLoggedIn: true,
      user,
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (err) {
    console.error("Error fetching edit profile:", err);
    return next(err);
  }
};

// Update profile name
const updateProfileName = async (req, res, next) => {
  try {
    const { firstName = '', lastName = '' } = req.body;

    const safeFirst = firstName.trim();
    const safeLast = lastName.trim();

    const nameRegex = /^[a-zA-Z\s'.-]{1,50}$/;
    if (!safeFirst || !safeLast || !nameRegex.test(safeFirst) || !nameRegex.test(safeLast)) {
      res.flash('error', 'Please provide valid names (letters, spaces, . \' - only, max 50 chars)');
      return res.redirect('/profile/edit-name');
    }

    await User.findByIdAndUpdate(req.user.id, { firstName: safeFirst, lastName: safeLast });
    res.flash('success', 'Name updated successfully');
    res.redirect('/profile');
  } catch (err) {
    console.error("Error updating profile:", err);
    return next(err);
  }
};

// Get change password page
const getChangePassword = (req, res) => {
  res.render('pages/change-password', { 
    title: "Security Settings - IMEER.ai", 
    isLoggedIn: true
  });
};

// Change password
const changePassword = async (req, res, next) => {
  const { currentPassword = '', newPassword = '', confirmPassword = '' } = req.body;

  try {
    // Basic validations
    if (!currentPassword || !newPassword || !confirmPassword) {
      res.flash('error', 'All fields are required');
      return res.redirect('/profile/change-password');
    }

    if (newPassword !== confirmPassword) {
      res.flash('error', 'New password and confirm password do not match');
      return res.redirect('/profile/change-password');
    }

    if (newPassword.length < 8 || newPassword.length > 128) {
      res.flash('error', 'Password must be between 8 and 128 characters');
      return res.redirect('/profile/change-password');
    }

    const complexity = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,}$/;
    if (!complexity.test(newPassword)) {
      res.flash('error', 'Password must include uppercase, lowercase, and a number');
      return res.redirect('/profile/change-password');
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      res.flash('error', 'User not found');
      return res.redirect('/profile/change-password');
    }

    const normalizedNewPassword = normalizeComparable(newPassword);
    const normalizedEmail = normalizeComparable(user.email);
    const normalizedUsername = normalizeComparable(user.username);

    if (normalizedNewPassword === normalizedEmail || normalizedNewPassword === normalizedUsername) {
      res.flash('error', 'Password cannot be the same as email or username');
      return res.redirect('/profile/change-password');
    }

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) {
      res.flash('error', 'Current password is incorrect');
      return res.redirect('/profile/change-password');
    }

    const sameAsOld = await bcrypt.compare(newPassword, user.password);
    if (sameAsOld) {
      res.flash('error', 'New password must be different from current password');
      return res.redirect('/profile/change-password');
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;
    await user.save();

    res.flash('success', 'Password updated successfully');
    return res.redirect('/profile');
  } catch (err) {
    console.error("Error changing password:", err);
    return next(err);
  }
};

// Get security settings page
const getSecuritySettings = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.render('pages/profile', { 
      title: "Security Settings - IMEER.ai", 
      isLoggedIn: true,
      user: user
    });
  } catch (err) {
    console.error("Error fetching security settings:", err);
    return next(err);
  }
};

// Delete account
const deleteAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    const User = require('../models/user.model');
    const File = require('../models/file.model');
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    const r2 = require('../config/r2');
    const BUCKET = process.env.R2_BUCKET;
    
    // Delete all user files from R2
    const userFiles = await File.find({ userId });
    for (const file of userFiles) {
      if (file.r2Key && BUCKET) {
        try {
          const command = new DeleteObjectCommand({
            Bucket: BUCKET,
            Key: file.r2Key
          });
          await r2.send(command);
        } catch (err) {
          console.error('Error deleting file from R2:', err);
        }
      }
    }
    
    // Delete all file records
    await File.deleteMany({ userId });
    
    // Delete user account
    await User.findByIdAndDelete(userId);
    
    // Clear session
    req.session.destroy();
    
    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (err) {
    console.error('Error deleting account:', err);
    res.json({ success: false, error: 'Failed to delete account' });
  }
};

module.exports = {
  getProfile,
  getEditProfileName,
  updateProfileName,
  getChangePassword,
  changePassword,
  deleteAccount
};
