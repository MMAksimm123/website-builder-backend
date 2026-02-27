const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const pool = require('./db');
require('dotenv').config();

passport.serializeUser((user, done) => {
  done(null, { id: user.id, type: 'oauth' });
});

passport.deserializeUser(async (data, done) => {
  try {
    if (data.type === 'oauth') {
      const result = await pool.query(
        'SELECT id, provider, email, full_name, avatar_url FROM oauth_users WHERE id = $1',
        [data.id]
      );
      if (result.rows.length > 0) {
        return done(null, { ...result.rows[0], userType: 'oauth' });
      }
    }
    done(null, null);
  } catch (error) {
    done(error, null);
  }
});

passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.GITHUB_CALLBACK_URL,
    scope: ['user:email']
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      console.log('GitHub profile received:', profile.username);
      
      const email = profile.emails?.[0]?.value || `${profile.username}@github.user`;
      const fullName = profile.displayName || profile.username;
      const avatarUrl = profile.photos?.[0]?.value;
      const providerId = profile.id.toString();

      // Проверяем существование пользователя в oauth_users
      const existingUser = await pool.query(
        `SELECT * FROM oauth_users 
         WHERE provider = 'github' AND provider_id = $1`,
        [providerId]
      );

      if (existingUser.rows.length > 0) {
        // Обновляем существующего пользователя
        await pool.query(
          `UPDATE oauth_users SET 
           full_name = COALESCE($1, full_name),
           avatar_url = COALESCE($2, avatar_url),
           provider_data = $3,
           updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [fullName, avatarUrl, { profile, accessToken }, existingUser.rows[0].id]
        );

        const user = existingUser.rows[0];
        return done(null, { 
          id: user.id, 
          email: user.email,
          full_name: fullName,
          avatar_url: avatarUrl,
          provider: 'github',
          userType: 'oauth' 
        });
      }

      // Создаем нового пользователя в oauth_users
      const newUser = await pool.query(
        `INSERT INTO oauth_users 
         (provider, provider_id, email, full_name, avatar_url, provider_data) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         RETURNING id, email, full_name, avatar_url`,
        ['github', providerId, email, fullName, avatarUrl, { profile, accessToken }]
      );

      const user = newUser.rows[0];
      return done(null, { 
        id: user.id, 
        email: user.email,
        full_name: user.full_name,
        avatar_url: user.avatar_url,
        provider: 'github',
        userType: 'oauth' 
      });
    } catch (error) {
      console.error('GitHub auth error:', error);
      return done(error, null);
    }
  }
));

module.exports = passport;