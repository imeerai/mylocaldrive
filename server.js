const app = require('./app');
const connectDB = require('./config/db');

// ========== VERCEL SERVERLESS ==========
if (process.env.VERCEL) {
  // Lazy DB connection for serverless cold starts
  let dbConnected = false;
  const ensureDb = async () => {
    if (!dbConnected) {
      await connectDB();
      dbConnected = true;
    }
  };

  // Export a handler that connects to DB before passing to Express
  module.exports = async (req, res) => {
    await ensureDb();

    // Vercel consumes the raw body stream before Express ever sees it.
    // We must fully read & parse the body here and stamp req._body = true
    // so Express's built-in body-parsers skip re-reading the empty stream.

    const ct = (req.headers['content-type'] || '').toLowerCase();

    // Case 1: Vercel already populated req.body (string, Buffer, or object)
    if (req.body !== undefined && req.body !== null && !req._body) {
      let parsed = req.body;

      if (typeof parsed === 'string' || Buffer.isBuffer(parsed)) {
        const raw = Buffer.isBuffer(parsed) ? parsed.toString('utf8') : parsed;
        if (raw.length > 0) {
          if (ct.includes('application/json')) {
            try { parsed = JSON.parse(raw); } catch (_) { /* keep as string */ }
          } else if (ct.includes('urlencoded')) {
            parsed = Object.fromEntries(new URLSearchParams(raw));
          }
        }
      }
      // If it's already a plain object Vercel auto-parsed, keep it

      // Mark as parsed only if we actually have meaningful payload.
      // If body is empty, leave req._body untouched so Express parsers can still run.
      const hasPayload =
        (typeof parsed === 'string' && parsed.length > 0) ||
        Buffer.isBuffer(parsed) ||
        (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0);

      if (hasPayload) {
        req.body = parsed;
        req._body = true;
      }
    }

    return app(req, res);
  };
} else {
  // ========== LOCAL / TRADITIONAL SERVER ==========
  const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET', 'PORT', 'NODE_ENV'];
  const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

  if (missingEnvVars.length > 0) {
    console.error(`❌ Missing required environment variables: ${missingEnvVars.join(', ')}`);
    process.exit(1);
  }

  const validEnvs = ['development', 'production', 'staging'];
  if (!validEnvs.includes(process.env.NODE_ENV)) {
    console.error(`❌ Invalid NODE_ENV: ${process.env.NODE_ENV}. Must be one of: ${validEnvs.join(', ')}`);
    process.exit(1);
  }

  const PORT = process.env.PORT || 3000;

  const startServer = async () => {
    try {
      await connectDB();
      
      const server = app.listen(PORT, () => {
        console.log(`
╔═══════════════════════════════════════════╗
║   IMEER.ai Cloud Storage Server           ║
║   Environment: ${process.env.NODE_ENV.padEnd(27)}║
║   Port: ${PORT.toString().padEnd(33)} ║
║   Security: ✓ Enabled                     ║
╚═══════════════════════════════════════════╝
        `);
      });

      process.on('SIGTERM', () => {
        console.log('⚠️  SIGTERM received. Shutting down gracefully...');
        server.close(() => {
          console.log('✓ Server closed');
          process.exit(0);
        });
      });

      process.on('SIGINT', () => {
        console.log('⚠️  SIGINT received. Shutting down gracefully...');
        server.close(() => {
          console.log('✓ Server closed');
          process.exit(0);
        });
      });

    } catch (err) {
      console.error('❌ Failed to start server:', err.message);
      process.exit(1);
    }
  };

  startServer();
}
