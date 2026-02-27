const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');

const router = express.Router();

// Регистрация через email/password
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Проверяем только в таблице users (email/password пользователи)
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
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
      { 
        userId: user.id, 
        email: user.email,
        userType: 'user' 
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ 
      user: { 
        ...user, 
        userType: 'user' 
      }, 
      token,
      userType: 'user' 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Вход через email/password
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        userType: 'user' 
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ 
      user: { 
        id: user.id, 
        email: user.email,
        userType: 'user' 
      }, 
      token,
      userType: 'user' 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Получение текущего пользователя
router.get('/me', require('../middleware/auth'), async (req, res) => {
  try {
    const { userType, userId } = req.user;
    
    if (userType === 'user') {
      const result = await pool.query(
        'SELECT id, email, full_name, avatar_url, created_at FROM users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

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
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ 
        user: { 
          ...result.rows[0], 
          userType: 'oauth' 
        } 
      });
    }
  } catch (error) {
    console.error(error);
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
    try {
      console.log('GitHub callback успешен, пользователь:', req.user);
      
      const token = jwt.sign(
        { 
          userId: req.user.id, 
          email: req.user.email,
          userType: 'oauth' 
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      console.log('JWT токен сгенерирован для oauth пользователя:', req.user.id);
      
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/auth/callback?token=${token}&userType=oauth`);
    } catch (error) {
      console.error('GitHub callback error:', error);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/login?error=server_error`);
    }
  }
);

module.exports = router;