const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

const buildProfile = (provider, profile) => {
  const email = profile?.emails?.[0]?.value?.toLowerCase() || null;
  const firstName = profile?.name?.givenName || '';
  const lastName = profile?.name?.familyName || '';
  const displayName = profile?.displayName || '';
  const usernameHint = (profile?.username || displayName || email || provider)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20);

  return {
    provider,
    providerId: profile?.id,
    email,
    firstName,
    lastName,
    displayName,
    usernameHint: usernameHint || `${provider}_user`
  };
};

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${APP_URL}/user/auth/google/callback`
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const normalized = buildProfile('google', profile);
        if (!normalized.email || !normalized.providerId) {
          return done(null, false);
        }
        return done(null, normalized);
      } catch (err) {
        return done(err);
      }
    }
  ));
}

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: `${APP_URL}/user/auth/github/callback`
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const normalized = buildProfile('github', profile);
        if (!normalized.email || !normalized.providerId) {
          return done(null, false);
        }
        return done(null, normalized);
      } catch (err) {
        return done(err);
      }
    }
  ));
}

module.exports = passport;
