const express = require('express');
const auth = require('../middleware/auth');
const pool = require('../config/db');

const router = express.Router();

// Получение GitHub настроек пользователя (из первого проекта)
router.get('/settings', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT github_repo, github_token, github_last_sync 
       FROM user_projects 
       WHERE user_id = $1 AND github_repo IS NOT NULL 
       LIMIT 1`,
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.json({ settings: null });
    }

    res.json({ settings: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;