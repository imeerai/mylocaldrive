const User = require('../models/user.model');
const TokenBlacklist = require('../models/tokenBlacklist.model');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { signAccessToken, signRefreshToken } = require('../middleware/auth');

const normalizeComparable = (value) => String(value || '').trim().toLowerCase();
const isSameAsIdentityValue = (password, ...identityValues) => {
  const normalizedPassword = normalizeComparable(password);
  if (!normalizedPassword) return false;
  return identityValues.some((identityValue) => normalizedPassword === normalizeComparable(identityValue));
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
    maxAge: 60 * 60 * 1000
  });

  res.cookie('refreshToken', refreshToken, {
    ...AUTH_COOKIE_OPTIONS,
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
};

const getRegister = (req, res) => {
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

const postRegister = async (req, res) => {
  const { username, email, password, firstName, lastName } = req.body;

  try {
    if (!username || !email || !password) {
      return res.redirect('/user/register?error=All required fields are missing');
    }

    if (isSameAsIdentityValue(password, username, email)) {
      return res.redirect('/user/register?error=Password cannot be the same as email or username');
    }

    const normalizedUsername = String(username).trim().toLowerCase();
    const normalizedEmail = String(email).trim().toLowerCase();

    const existingUser = await User.findOne({
      $or: [{ username: normalizedUsername }, { email: normalizedEmail }]
    });

    if (existingUser) {
      const duplicateField = existingUser.username === normalizedUsername ? 'username' : 'email';
      return res.redirect(`/user/register?error=${duplicateField} already exists`);
    }

    const hashedPassword = bcrypt.hashSync(String(password), 10);
    const newUser = new User({
      username: normalizedUsername,
      email: normalizedEmail,
      password: hashedPassword,
      firstName: firstName || '',
      lastName: lastName || ''
    });

    await newUser.save();

    res.cookie('success', 'Account created successfully. Please login.', { maxAge: 5000 });
    return res.redirect('/user/login');
  } catch (err) {
    if (err.code === 11000) {
      const duplicateField = Object.keys(err.keyValue || {})[0] || 'username';
      return res.redirect(`/user/register?error=${duplicateField} already exists`);
    }

    console.error('Error registering user:', err);
    return res.redirect('/user/register?error=Registration failed. Please try again.');
  }
};

const getLogin = (req, res) => {
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

const postLogin = async (req, res, next) => {
  const { username, password } = req.body;

  try {
    const normalizedUsername = String(username || '').trim().toLowerCase();
    const existingUser = await User.findOne({ username: normalizedUsername });
    if (!existingUser) {
      return res.redirect('/user/login?error=Invalid username or password');
    }

    const passwordMatch = await bcrypt.compare(String(password || ''), existingUser.password);
    if (!passwordMatch) {
      return res.redirect('/user/login?error=Invalid username or password');
    }

    setAuthCookies(res, existingUser._id);

    return res.redirect('/dashboard');
  } catch (err) {
    return next(err);
  }
};

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

const logout = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    const userId = req.user?.id;

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

    res.clearCookie('token', AUTH_COOKIE_OPTIONS);
    res.clearCookie('refreshToken', AUTH_COOKIE_OPTIONS);

    return res.redirect('/');
  } catch (err) {
    res.clearCookie('token');
    res.clearCookie('refreshToken');
    return res.redirect('/');
  }
};

const checkEmail = async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.json({ exists: false });
    }

    const existingUser = await User.findOne({ email: String(email).toLowerCase() });
    return res.json({ exists: !!existingUser });
  } catch (err) {
    console.error('Error checking email:', err);
    return res.status(500).json({ error: 'Error checking email' });
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
};
