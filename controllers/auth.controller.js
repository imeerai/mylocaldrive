const User = require('../models/user.model');
const OTP = require('../models/otp.model');
const TokenBlacklist = require('../models/tokenBlacklist.model');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { signAccessToken, signRefreshToken } = require('../middleware/auth');
const { sendOTPEmail } = require('../config/email');
const crypto = require('crypto');

const normalizeComparable = (value) => String(value || '').trim().toLowerCase();
const isSameAsIdentityValue = (password, ...identityValues) => {
  const normalizedPassword = normalizeComparable(password);
  if (!normalizedPassword) return false;
  return identityValues.some((identityValue) => normalizedPassword === normalizeComparable(identityValue));
};

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

const OTP_RESET_VERIFIED_COOKIE = 'otpResetVerifiedEmail';
const OTP_RESET_VERIFIED_MAX_AGE = 10 * 60 * 1000;

const setPasswordResetVerifiedCookie = (res, email) => {
  res.cookie(OTP_RESET_VERIFIED_COOKIE, normalizeComparable(email), {
    ...AUTH_COOKIE_OPTIONS,
    maxAge: OTP_RESET_VERIFIED_MAX_AGE
  });
};

const clearPasswordResetVerifiedCookie = (res) => {
  res.clearCookie(OTP_RESET_VERIFIED_COOKIE, AUTH_COOKIE_OPTIONS);
};

const isPasswordResetVerified = (req, email) => {
  const verifiedEmail = normalizeComparable(req.cookies?.[OTP_RESET_VERIFIED_COOKIE]);
  const targetEmail = normalizeComparable(email);
  return Boolean(verifiedEmail && targetEmail && verifiedEmail === targetEmail);
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

const generateOAuthPassword = () => crypto.randomBytes(24).toString('hex');

const generateUniqueOAuthUsername = async (seedValue) => {
  const base = String(seedValue || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20) || 'user';

  let candidate = base;
  let suffix = 1;
  while (await User.findOne({ username: candidate })) {
    const suffixStr = String(suffix++);
    const maxBaseLength = Math.max(3, 20 - suffixStr.length);
    candidate = `${base.slice(0, maxBaseLength)}${suffixStr}`;
  }
  return candidate;
};

const upsertOAuthUser = async (oauthProfile) => {
  const providerField = oauthProfile.provider === 'google' ? 'googleId' : 'githubId';

  let user = await User.findOne({ [providerField]: oauthProfile.providerId });
  if (user) return user;

  user = await User.findOne({ email: oauthProfile.email });
  if (user) {
    if (!user[providerField]) {
      user[providerField] = oauthProfile.providerId;
      if (!user.firstName && oauthProfile.firstName) user.firstName = oauthProfile.firstName;
      if (!user.lastName && oauthProfile.lastName) user.lastName = oauthProfile.lastName;
      await user.save();
    }
    return user;
  }

  const username = await generateUniqueOAuthUsername(oauthProfile.usernameHint || oauthProfile.email);
  const password = bcrypt.hashSync(generateOAuthPassword(), 10);

  const newUser = new User({
    username,
    email: oauthProfile.email,
    password,
    firstName: oauthProfile.firstName || '',
    lastName: oauthProfile.lastName || '',
    [providerField]: oauthProfile.providerId
  });

  await newUser.save();
  return newUser;
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
    showGoogleAuth: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    showGithubAuth: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
  });
};

// Handle registration
const postRegister = async (req, res, next) => {
  const { username, email, password, firstName, lastName } = req.body;
  
  try {
    if (!username || !email || !password) {
      return res.redirect('/user/register?error=All required fields are missing');
    }

    if (isSameAsIdentityValue(password, username, email)) {
      return res.redirect('/user/register?error=Password cannot be the same as email or username');
    }

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

    return res.redirect('/user/login?error=Verification link sent to your email. Open your email and continue using that link.');
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
    showGoogleAuth: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    showGithubAuth: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
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
    if (!email) {
      return res.redirect('/user/forgot-password?error=Email is required');
    }

    // Check if user exists
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.redirect('/user/forgot-password?error=Email not found');
    }

    clearPasswordResetVerifiedCookie(res);

    // Create OTP and send email
    const { otp, verificationToken } = await OTP.createOTP(email, 'password-reset');
    await sendOTPEmail(email, otp, 'password-reset', verificationToken);

    return res.redirect('/user/login?error=Password reset link sent to your email. Open your email and continue using that link.');
  } catch (err) {
    console.error('Error in forgot password:', err);
    return res.redirect('/user/forgot-password?error=Failed to send reset link. Please try again.');
  }
};

const completeOAuth = async (req, res) => {
  try {
    if (!req.user || !req.user.email || !req.user.provider || !req.user.providerId) {
      return res.redirect('/user/login?error=Social login failed. Please try again.');
    }

    const user = await upsertOAuthUser(req.user);
    setAuthCookies(res, user._id);
    return res.redirect('/dashboard');
  } catch (err) {
    console.error('OAuth callback error:', err);
    return res.redirect('/user/login?error=Social login failed. Please try again.');
  }
};

// OTP page disabled (link-only verification flow)
const getVerifyOTP = async (req, res) => {
  return res.redirect('/user/login?error=Please use the verification link sent to your email.');
};

// OTP code verification disabled (link-only verification flow)
const postVerifyOTP = async (req, res) => {
  return res.redirect('/user/login?error=Please use the verification link sent to your email.');
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
      if (normalizedType === 'password-reset') {
        return res.redirect(`/user/forgot-password?error=${encodeURIComponent(result.message)}`);
      }
      return res.redirect(`/user/register?error=${encodeURIComponent(result.message)}`);
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
      setPasswordResetVerifiedCookie(res, email);
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
    if (fallbackType === 'password-reset') {
      return res.redirect('/user/forgot-password?error=Verification failed');
    }
    return res.redirect('/user/register?error=Verification failed');
  }
};

// Resend OTP endpoint disabled (link-only verification flow)
const resendOTP = async (req, res) => {
  return res.status(410).json({ success: false, message: 'OTP code flow is disabled. Please use email verification links.' });
};

// Get reset password page
const getResetPassword = (req, res) => {
  const { email } = req.query;
  
  if (!email) {
    return res.redirect('/user/login');
  }

  if (!isPasswordResetVerified(req, email)) {
    return res.redirect('/user/forgot-password?error=Please verify reset link first');
  }

  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');

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
    if (!isPasswordResetVerified(req, email)) {
      return res.redirect('/user/forgot-password?error=Please verify reset link first');
    }

    if (password !== confirmPassword) {
      return res.redirect(`/user/reset-password?email=${encodeURIComponent(email)}&error=Passwords do not match`);
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.redirect('/user/login?error=User not found');
    }

    if (isSameAsIdentityValue(password, user.email, user.username)) {
      return res.redirect(`/user/reset-password?email=${encodeURIComponent(email)}&error=Password cannot be the same as email or username`);
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    user.password = hashedPassword;
    await user.save();

    clearPasswordResetVerifiedCookie(res);

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
  verifyOtpLink,
  completeOAuth,
  getResetPassword,
  postResetPassword
};
