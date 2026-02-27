const User = require('../models/user.model');
const OTP = require('../models/otp.model');
const TokenBlacklist = require('../models/tokenBlacklist.model');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { signAccessToken, signRefreshToken } = require('../middleware/auth');
const { sendOTPEmail } = require('../config/email');

const normalizeOtpType = (type) => {
  if (typeof type === 'undefined' || type === null) {
    return null;
  }

  const value = String(type).trim().toLowerCase();

  if (!value || value === 'undefined' || value === 'null') {
    return null;
  }

  if (value === 'verification' || value === 'verify' || value === 'register') {
    return 'registration';
  }

  if (value === 'registration') {
    return 'registration';
  }

  if (value === 'password-reset' || value === 'password_reset' || value === 'reset') {
    return 'password-reset';
  }

  return null;
};

const resolveOtpType = async (email, rawType) => {
  const normalized = normalizeOtpType(rawType);
  if (normalized) {
    return normalized;
  }

  if (!email) {
    return null;
  }

  const existingOtp = await OTP.findOne({ email: String(email).toLowerCase() })
    .sort({ expiresAt: -1 })
    .select('type');

  return existingOtp?.type || null;
};
const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax'
};

const setAuthCookies = (res, userId) => {
  const accessToken = signAccessToken(userId);
  const refreshToken = signRefreshToken(userId);

  res.cookie('token', accessToken, {
    ...AUTH_COOKIE_OPTIONS,
    maxAge: 60 * 60 * 1000 // 1 hour
  });

  res.cookie('refreshToken', refreshToken, {
    ...AUTH_COOKIE_OPTIONS,
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  });
};

const ensureHashedPassword = (password) => {
  const value = String(password || '');
  return value.startsWith('$2a$') || value.startsWith('$2b$') || value.startsWith('$2y$')
    ? value
    : bcrypt.hashSync(value, 10);
};

const loginExistingUserIfAny = async (res, email) => {
  if (!email) return false;
  const existingUser = await User.findOne({ email: String(email).toLowerCase() });
  if (!existingUser) return false;

  setAuthCookies(res, existingUser._id);
  res.cookie('success', 'Email already verified. Welcome back!', { maxAge: 5000 });
  return true;
};

// Get registration page
const getRegister = (req, res) => {
  // If user is already logged in, redirect to dashboard
  if (req.cookies.token) {
    return res.redirect('/dashboard');
  }
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.render('pages/register', {
    title: 'User Registration',
    currentPage: 'register',
    error: req.query.error || null,
  });
};

// Handle registration
const postRegister = async (req, res, next) => {
  const { username, email, password, firstName, lastName } = req.body;
  
  try {
    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      const duplicateField = existingUser.username === username ? 'username' : 'email';
      return res.redirect(`/user/register?error=${duplicateField} already exists`);
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const pendingUser = {
      username,
      email: email.toLowerCase(),
      password: hashedPassword,
      firstName: firstName || '',
      lastName: lastName || ''
    };

    // Create OTP and send email
    const { otp, verificationToken } = await OTP.createOTP(email, 'registration', { pendingUser });
    await sendOTPEmail(email, otp, 'verification', verificationToken);

    // Store user data temporarily in session or pass via query
    req.session = req.session || {};
    req.session.pendingUser = pendingUser;

    return res.redirect(`/user/verify-otp?email=${encodeURIComponent(email)}&type=registration`);
  } catch (err) {
    if (err.code === 11000) {
      const duplicateField = Object.keys(err.keyValue || {})[0] || 'username';
      return res.redirect(`/user/register?error=${duplicateField} already exists`);
    }
    console.error('Error registering user:', err);
    return res.redirect('/user/register?error=Failed to send verification email');
  }
};

// Get login page
const getLogin = (req, res) => {
  // If user is already logged in, redirect to dashboard
  if (req.cookies.token) {
    return res.redirect('/dashboard');
  }
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.render('pages/login', { 
    title: 'User Login', 
    currentPage: 'login',
    error: req.query.error || null,
  });
};

// Handle login
const postLogin = async (req, res, next) => {
  const { username, password } = req.body;
  
  try {
    const existingUser = await User.findOne({ username });
    if (!existingUser) {
      return res.redirect('/user/login?error=Invalid username or password');
    }

    const passwordMatch = await bcrypt.compare(password, existingUser.password);

    if (!passwordMatch) {
      return res.redirect('/user/login?error=Invalid username or password');
    }

    // Set access + refresh cookies
    setAuthCookies(res, existingUser._id);

    return res.redirect('/dashboard');
  } catch (err) {
    return next(err);
  }
};

// Get current user
const getCurrentUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.json({ user });
  } catch (err) {
    console.error('Error fetching profile:', err);
    return next(err);
  }
};

// Handle logout - blacklist only refresh token (access tokens auto-expire in 1h)
const logout = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    const userId = req.user?.id;

    // Blacklist ONLY refresh token (so it cannot be reused after logout)
    // Access token doesn't need blacklist since it expires in 1 hour anyway
    if (refreshToken && userId) {
      const decoded = jwt.decode(refreshToken);
      if (decoded && decoded.exp) {
        await TokenBlacklist.blacklistToken(
          refreshToken,
          userId,
          new Date(decoded.exp * 1000)
        );
      }
    }

    // Clear all auth cookies
    res.clearCookie('token', AUTH_COOKIE_OPTIONS);
    res.clearCookie('refreshToken', AUTH_COOKIE_OPTIONS);
    
    res.redirect('/');
  } catch (err) {
    res.clearCookie('token');
    res.clearCookie('refreshToken');
    res.redirect('/');
  }
};

// Check if email exists
const checkEmail = async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.json({ exists: false });
    }
    
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    
    return res.json({ exists: !!existingUser });
  } catch (err) {
    console.error('Error checking email:', err);
    return res.status(500).json({ error: 'Error checking email' });
  }
};

// ===== FORGOT PASSWORD & OTP VERIFICATION =====

// Get forgot password page
const getForgotPassword = (req, res) => {
  res.render('pages/forgot-password', {
    title: 'Forgot Password',
    currentPage: 'forgot-password',
    error: req.query.error || null
  });
};

// Handle forgot password request
const postForgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    // Check if user exists
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.redirect('/user/forgot-password?error=Email not found');
    }

    // Create OTP and send email
    const { otp, verificationToken } = await OTP.createOTP(email, 'password-reset');
    await sendOTPEmail(email, otp, 'password-reset', verificationToken);

    return res.redirect(`/user/verify-otp?email=${encodeURIComponent(email)}&type=password-reset`);
  } catch (err) {
    console.error('Error in forgot password:', err);
    return res.redirect('/user/forgot-password?error=Failed to send OTP. Please try again.');
  }
};

// Get OTP verification page
const getVerifyOTP = async (req, res) => {
  const { email, type } = req.query;

  if (!email) {
    return res.redirect('/user/login');
  }

  try {
    const normalizedType = await resolveOtpType(email, type);
    if (!normalizedType) {
      return res.redirect('/user/login');
    }
    const initialCountdown = await OTP.getRemainingSeconds(email, normalizedType);
    const otpExpiresAtMs = await OTP.getExpiryTimestamp(email, normalizedType);

    res.render('pages/verify-otp', {
      title: 'Verify OTP',
      currentPage: 'verify-otp',
      email,
      type: normalizedType,
      initialCountdown,
      otpExpiresAtMs,
      error: req.query.error || null
    });
  } catch (err) {
    console.error('Error loading verify OTP page:', err);
    return res.redirect('/user/login?error=Unable to load OTP verification');
  }
};

// Handle OTP verification
const postVerifyOTP = async (req, res) => {
  const { email, otp, type } = req.body;
  let normalizedType;

  try {
    normalizedType = await resolveOtpType(email, type);

    if (!normalizedType) {
      return res.redirect('/user/login?error=Invalid OTP request');
    }

    const result = await OTP.verifyOTP(email, otp, normalizedType);

    if (!result.success) {
      return res.redirect(`/user/verify-otp?email=${encodeURIComponent(email)}&type=${normalizedType}&error=${encodeURIComponent(result.message)}`);
    }

    // If registration OTP, create user and log in
    if (normalizedType === 'registration') {
      const alreadyLoggedIn = await loginExistingUserIfAny(res, email);
      if (alreadyLoggedIn) {
        delete req.session.pendingUser;
        return res.redirect('/dashboard');
      }

      const pendingUser = result.pendingUser || req.session?.pendingUser;
      if (!pendingUser || !pendingUser.username || !pendingUser.email) {
        return res.redirect('/user/register?error=Registration data expired. Please register again.');
      }

      const newUser = new User({
        username: pendingUser.username,
        email: String(pendingUser.email).toLowerCase(),
        password: ensureHashedPassword(pendingUser.password),
        firstName: pendingUser.firstName,
        lastName: pendingUser.lastName
      });

      await newUser.save();
      delete req.session.pendingUser;

      setAuthCookies(res, newUser._id);
      res.cookie('success', 'Registration successful! Welcome to MyDrive.', { maxAge: 5000 });
      return res.redirect('/dashboard');
    }

    // If password reset OTP, redirect to reset password page
    if (normalizedType === 'password-reset') {
      return res.redirect(`/user/reset-password?email=${encodeURIComponent(email)}`);
    }

    return res.redirect('/user/login');
  } catch (err) {
    console.error('Error verifying OTP:', err);
    const fallbackType = normalizedType || await resolveOtpType(email, type) || 'registration';
    return res.redirect(`/user/verify-otp?email=${encodeURIComponent(email)}&type=${fallbackType}&error=Verification failed`);
  }
};

// Handle verification via direct link (email button)
const verifyOtpLink = async (req, res) => {
  const { email, token, type } = req.query;

  if (!email || !token) {
    return res.redirect('/user/login');
  }

  let normalizedType;

  try {
    normalizedType = await resolveOtpType(email, type);
    if (!normalizedType) {
      return res.redirect('/user/login');
    }

    const result = await OTP.verifyOTPByToken(email, token, normalizedType);

    if (!result.success) {
      if (normalizedType === 'registration') {
        const alreadyLoggedIn = await loginExistingUserIfAny(res, email);
        if (alreadyLoggedIn) {
          delete req.session.pendingUser;
          return res.redirect('/dashboard');
        }
      }
      return res.redirect(`/user/verify-otp?email=${encodeURIComponent(email)}&type=${normalizedType}&error=${encodeURIComponent(result.message)}`);
    }

    if (normalizedType === 'registration') {
      const alreadyLoggedIn = await loginExistingUserIfAny(res, email);
      if (alreadyLoggedIn) {
        delete req.session.pendingUser;
        return res.redirect('/dashboard');
      }

      const pendingUser = result.pendingUser || req.session?.pendingUser;
      if (!pendingUser || !pendingUser.username || !pendingUser.email) {
        return res.redirect('/user/register?error=Registration data expired. Please register again.');
      }

      const newUser = new User({
        username: pendingUser.username,
        email: String(pendingUser.email).toLowerCase(),
        password: ensureHashedPassword(pendingUser.password),
        firstName: pendingUser.firstName,
        lastName: pendingUser.lastName
      });

      await newUser.save();
      delete req.session.pendingUser;

      setAuthCookies(res, newUser._id);
      res.cookie('success', 'Registration successful! Welcome to MyDrive.', { maxAge: 5000 });
      return res.redirect('/dashboard');
    }

    if (normalizedType === 'password-reset') {
      return res.redirect(`/user/reset-password?email=${encodeURIComponent(email)}`);
    }

    return res.redirect('/user/login');
  } catch (err) {
    console.error('Error verifying OTP via link:', err);

    if (normalizedType === 'registration') {
      try {
        const alreadyLoggedIn = await loginExistingUserIfAny(res, email);
        if (alreadyLoggedIn) {
          delete req.session.pendingUser;
          return res.redirect('/dashboard');
        }
      } catch (lookupErr) {
        console.error('Error checking existing user after link verify failure:', lookupErr);
      }
    }

    const fallbackType = normalizedType || await resolveOtpType(email, type) || 'registration';
    return res.redirect(`/user/verify-otp?email=${encodeURIComponent(email)}&type=${fallbackType}&error=Verification failed`);
  }
};

// Resend OTP
const resendOTP = async (req, res) => {
  const { email, type } = req.body;

  try {
    const normalizedType = await resolveOtpType(email, type) || 'registration';
    const { otp, verificationToken } = await OTP.createOTP(email, normalizedType);
    await sendOTPEmail(
      email,
      otp,
      normalizedType === 'registration' ? 'verification' : 'password-reset',
      verificationToken
    );

    return res.json({ success: true });
  } catch (err) {
    console.error('Error resending OTP:', err);
    return res.status(500).json({ success: false, message: 'Failed to resend OTP. Please try again.' });
  }
};

// Get reset password page
const getResetPassword = (req, res) => {
  const { email } = req.query;
  
  if (!email) {
    return res.redirect('/user/login');
  }

  res.render('pages/reset-password', {
    title: 'Reset Password',
    currentPage: 'reset-password',
    email,
    error: req.query.error || null
  });
};

// Handle password reset
const postResetPassword = async (req, res) => {
  const { email, password, confirmPassword } = req.body;

  try {
    if (password !== confirmPassword) {
      return res.redirect(`/user/reset-password?email=${encodeURIComponent(email)}&error=Passwords do not match`);
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.redirect('/user/login?error=User not found');
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    user.password = hashedPassword;
    await user.save();

    res.cookie('success', 'Password reset successful! Please login with your new password.', { maxAge: 5000 });
    return res.redirect('/user/login');
  } catch (err) {
    console.error('Error resetting password:', err);
    return res.redirect(`/user/reset-password?email=${encodeURIComponent(email)}&error=Failed to reset password`);
  }
};

module.exports = {
  getRegister,
  postRegister,
  getLogin,
  postLogin,
  getCurrentUser,
  logout,
  checkEmail,
  getForgotPassword,
  postForgotPassword,
  getVerifyOTP,
  postVerifyOTP,
  resendOTP,
  verifyOtpLink,
  getResetPassword,
  postResetPassword
};
