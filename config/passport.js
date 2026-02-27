const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const pool = require('./db');
require('dotenv').config();

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const result = await pool.query(
      'SELECT id, email, full_name, avatar_url FROM users WHERE id = $1',
      [id]
    );
    done(null, result.rows[0]);
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
      const githubId = profile.id.toString();

      // Проверяем, есть ли пользователь с таким GitHub ID
      const existingUserByProvider = await pool.query(
        `SELECT u.* FROM users u 
         JOIN user_providers up ON u.id = up.user_id 
         WHERE up.provider = 'github' AND up.provider_id = $1`,
        [githubId]
      );

      if (existingUserByProvider.rows.length > 0) {
        // Обновляем информацию о пользователе
        await pool.query(
          `UPDATE users SET 
           full_name = COALESCE($1, full_name),
           avatar_url = COALESCE($2, avatar_url)
           WHERE id = $3`,
          [fullName, avatarUrl, existingUserByProvider.rows[0].id]
        );

        await pool.query(
          `UPDATE user_providers SET 
           provider_data = $1
           WHERE user_id = $2 AND provider = 'github'`,
          [{ profile, accessToken }, existingUserByProvider.rows[0].id]
        );

        return done(null, existingUserByProvider.rows[0]);
      }

      // Проверяем, есть ли пользователь с таким email
      const existingUserByEmail = await pool.query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );

      let userId;

      if (existingUserByEmail.rows.length > 0) {
        userId = existingUserByEmail.rows[0].id;
        
        await pool.query(
          `UPDATE users SET 
           full_name = COALESCE($1, full_name),
           avatar_url = COALESCE($2, avatar_url)
           WHERE id = $3`,
          [fullName, avatarUrl, userId]
        );
      } else {
        const newUser = await pool.query(
          `INSERT INTO users (email, full_name, avatar_url) 
           VALUES ($1, $2, $3) RETURNING id`,
          [email, fullName, avatarUrl]
        );
        userId = newUser.rows[0].id;
      }

      await pool.query(
        `INSERT INTO user_providers (user_id, provider, provider_id, provider_data) 
         VALUES ($1, 'github', $2, $3)`,
        [userId, githubId, { profile, accessToken }]
      );

      const result = await pool.query(
        'SELECT id, email, full_name, avatar_url FROM users WHERE id = $1',
        [userId]
      );

      return done(null, result.rows[0]);
    } catch (error) {
      console.error('GitHub auth error:', error);
      return done(error, null);
    }
  }
));

module.exports = passport;