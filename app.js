// ========== LOAD ENVIRONMENT VARIABLES FIRST ==========
const dotenv = require('dotenv');
dotenv.config();

// ========== DEPENDENCIES ==========
const express = require('express');
const path = require('path');
const app = express();
const helmet = require('helmet');
const compression = require('compression');
const session = require('express-session');
const regRouter = require('./routes/user.routes');
const indexRouter = require('./routes/index.routes');
const engine = require('ejs-mate');
const cookieParser = require('cookie-parser');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { sanitizeRequest } = require('./middleware/sanitize');

// ========== TRUST PROXY (required for Vercel / reverse-proxy deployments) ==========
// Without this, req.protocol is 'http' behind Vercel's HTTPS proxy, causing
// res.redirect() to emit http:// URLs → Vercel forces HTTPS → infinite redirect loop.
app.set('trust proxy', 1);

// ========== VIEW ENGINE CONFIGURATION ==========
app.engine('ejs', engine);
app.set('view engine', 'ejs');
app.set("views", path.join(__dirname, "views"));

// ========== SECURITY MIDDLEWARE ==========
// Helmet: Set security HTTP headers
app.use(helmet({
	contentSecurityPolicy: {
		directives: {
			defaultSrc: ["'self'"],
			scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com'],
			styleSrc: ["'self'", "'unsafe-inline'", 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net'],
			fontSrc: ["'self'", 'cdnjs.cloudflare.com'],
			imgSrc: ["'self'", 'data:', 'https:'],
			connectSrc: ["'self'"]
		}
	},
	hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
	frameguard: { action: 'deny' },
	referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// Compression: Enable gzip compression
app.use(compression());

// ========== STATIC FILES & MIDDLEWARE ==========
app.use(express.static(path.join(__dirname, "public"), { maxAge: '1d' }));
// Only serve local uploads in non-Vercel environments (files are served from R2 on Vercel)
if (!process.env.VERCEL) {
  app.use('/uploads', express.static(path.join(__dirname, "uploads"), { maxAge: '7d' }));
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Data Sanitization: Against NoSQL injection + XSS (must run AFTER body parsers)
app.use(sanitizeRequest);

// Session middleware for temporary data storage
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-session-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 10 * 60 * 1000, // 10 minutes
    sameSite: 'lax'
  },
  // Disable session store warning in production/serverless
  ...(process.env.VERCEL ? { store: new session.MemoryStore() } : {})
}));
// Suppress MemoryStore warning on Vercel (sessions are cookie-based via JWT anyway)
if (process.env.VERCEL) {
  process.env.DISABLE_MEMORY_STORE_WARNING = 'true';
}

// ========== CACHING MIDDLEWARE ==========
// Set cache headers for different content types
app.use((req, res, next) => {
	// No cache for dynamic content (pages, APIs)
	if (req.path.includes('/api') || req.path.includes('/files') || req.path.includes('/dashboard') || req.path.includes('/profile')) {
		res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
		res.set('Pragma', 'no-cache');
		res.set('Expires', '0');
	}
	// Cache static assets for 1 day
	else if (req.path.includes('/css') || req.path.includes('/js') || req.path.includes('/public')) {
		res.set('Cache-Control', 'public, max-age=86400'); // 1 day
	}
	next();
});

// ========== AUTH STATUS MIDDLEWARE ==========
// Check if user is logged in and pass to all views
app.use(async (req, res, next) => {
  // Flash message system
  res.locals.success = req.cookies.success || null;
  res.locals.error = req.cookies.error || null;
  res.clearCookie('success');
  res.clearCookie('error');
  
  // Helper function to set flash messages
  res.flash = (type, message) => {
    res.cookie(type, message, { maxAge: 5000 }); // 5 seconds
  };
  
  // Check if user has a valid token
  res.locals.isLoggedIn = false;
  
  // If logged in, fetch user and pass to views
  if (req.cookies.token) {
    try {
      const jwt = require('jsonwebtoken');
      const JWT_SECRET = process.env.JWT_SECRET || "dev-change-me";
      const decoded = jwt.verify(req.cookies.token, JWT_SECRET);
      
      if (decoded && decoded.type === 'access' && decoded.sub) {
        const User = require('./models/user.model');
        const user = await User.findById(decoded.sub).select('-password');
        if (user) {
          res.locals.user = user;
          res.locals.isLoggedIn = true;
        } else {
          // User not found, clear invalid token
          res.clearCookie('token');
          res.clearCookie('refreshToken');
        }
      } else {
        // Invalid token type, clear it
        res.clearCookie('token');
        res.clearCookie('refreshToken');
      }
    } catch (err) {
      // Token invalid or expired, clear it
      res.clearCookie('token');
      res.clearCookie('refreshToken');
    }
  }
  
  next();
});

// ========== ROUTES ==========
app.use('/', indexRouter);
app.use('/user', regRouter);

// ========== HANDLERS ==========
app.use(notFoundHandler);
app.use(errorHandler);

// ========== EXPORT APP ==========
module.exports = app;
