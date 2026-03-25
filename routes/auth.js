const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Регистрация
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 })
], async (req, res) => {
  const logger = req.logger?.child('auth.register') || console;
  
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Validation failed', { errors: errors.array() });
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    logger.debug('Checking existing user', { email });

    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      logger.warn('User already exists', { email });
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (email, password_hash) 
       VALUES ($1, $2) RETURNING id, email, created_at`,
      [email, hashedPassword]
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { userId: user.id, email: user.email, userType: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    logger.info('User registered successfully', { 
      userId: user.id,
      email: user.email 
    });

    res.json({ user, token });
  } catch (error) {
    logger.error('Registration error', { 
      error: error.message,
      stack: error.stack,
      critical: true
    });
    res.status(500).json({ error: 'Server error' });
  }
});

// Вход
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  const logger = req.logger?.child('auth.login') || console;
  
  try {
    const { email, password } = req.body;

    logger.debug('Attempting login', { email });

    const result = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      logger.warn('Login failed - user not found', { email });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      logger.warn('Login failed - invalid password', { userId: user.id });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, userType: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    logger.info('User logged in successfully', { 
      userId: user.id,
      email: user.email 
    });

    res.json({ 
      user: { id: user.id, email: user.email, userType: 'user' },
      token 
    });
  } catch (error) {
    logger.error('Login error', { 
      error: error.message,
      stack: error.stack,
      critical: true
    });
    res.status(500).json({ error: 'Server error' });
  }
});

// Получение текущего пользователя
router.get('/me', authMiddleware, async (req, res) => {
  const logger = req.logger?.child('auth.me') || console;
  
  try {
    const { userType, userId } = req.user;
    
    if (userType === 'user') {
      const result = await pool.query(
        'SELECT id, email, full_name, avatar_url, created_at FROM users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        logger.warn('User not found', { userId, userType });
        return res.status(404).json({ error: 'User not found' });
      }

      logger.info('User data retrieved', { userId, userType });
      res.json({ 
        user: { 
          ...result.rows[0], 
          userType: 'user' 
        } 
      });
    } else {
      const result = await pool.query(
        `SELECT id, provider, provider_id as "providerId", 
                email, full_name, avatar_url, created_at 
         FROM oauth_users WHERE id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        logger.warn('OAuth user not found', { userId, userType });
        return res.status(404).json({ error: 'User not found' });
      }

      logger.info('OAuth user data retrieved', { userId, userType });
      res.json({ 
        user: { 
          ...result.rows[0], 
          userType: 'oauth' 
        } 
      });
    }
  } catch (error) {
    logger.error('Failed to fetch user data', { 
      error: error.message,
      stack: error.stack,
      critical: true,
      userId: req.user?.userId,
      userType: req.user?.userType
    });
    res.status(500).json({ error: 'Server error' });
  }
});

// GitHub OAuth
router.get('/github', passport.authenticate('github', { scope: ['user:email'] }));

// GitHub OAuth callback
router.get('/github/callback', 
  passport.authenticate('github', { 
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=github_auth_failed`,
    session: false 
  }),
  async (req, res) => {
    const logger = req.logger?.child('auth.github') || console;
    
    try {
      logger.info('GitHub callback successful', { user: req.user });
      
      const token = jwt.sign(
        { 
          userId: req.user.id, 
          email: req.user.email,
          userType: 'oauth' 
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      logger.info('JWT token generated for oauth user', { userId: req.user.id });
      
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/auth/callback?token=${token}&userType=oauth`);
    } catch (error) {
      logger.error('GitHub callback error', { 
        error: error.message,
        stack: error.stack,
        critical: true
      });
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/login?error=server_error`);
    }
  }
);

// Получение информации о GitHub аккаунте
router.get('/github/user/:userId', async (req, res) => {
  const logger = req.logger?.child('auth.github.user') || console;
  
  try {
    const result = await pool.query(
      `SELECT provider_data FROM user_providers 
       WHERE user_id = $1 AND provider = 'github'`,
      [req.params.userId]
    );

    if (result.rows.length === 0) {
      return res.json({ connected: false });
    }

    res.json({ 
      connected: true,
      data: result.rows[0].provider_data 
    });
  } catch (error) {
    logger.error('Error fetching GitHub user', { 
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Failed to fetch GitHub info' });
  }
});

// Отключение GitHub аккаунта
router.delete('/github/:userId', async (req, res) => {
  const logger = req.logger?.child('auth.github.disconnect') || console;
  
  try {
    await pool.query(
      `DELETE FROM user_providers 
       WHERE user_id = $1 AND provider = 'github'`,
      [req.params.userId]
    );

    res.json({ message: 'GitHub account disconnected' });
  } catch (error) {
    logger.error('Error disconnecting GitHub', { 
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Failed to disconnect GitHub' });
  }
});

module.exports = router;