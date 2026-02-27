const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();

// Получение списка проектов пользователя
router.get('/', auth, async (req, res) => {
  try {
    const { userType, userId } = req.user;
    
    const result = await pool.query(
      `SELECT id, name, updated_at 
       FROM user_projects 
       WHERE owner_type = $1 AND owner_id = $2 
       ORDER BY updated_at DESC 
       LIMIT 10`,
      [userType, userId]
    );

    res.json({ projects: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Создание нового проекта
router.post('/', auth, async (req, res) => {
  try {
    const { name, html = '', css = '', js = '' } = req.body;
    const { userType, userId } = req.user;

    const result = await pool.query(
      `INSERT INTO user_projects (owner_type, owner_id, name, html, css, js) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, created_at`,
      [userType, userId, name, html, css, js]
    );

    res.json({ project: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Получение проекта по ID
router.get('/:id', auth, async (req, res) => {
  try {
    const { userType, userId } = req.user;
    
    const result = await pool.query(
      `SELECT id, name, html, css, js, github_repo, github_last_sync 
       FROM user_projects 
       WHERE id = $1 AND owner_type = $2 AND owner_id = $3`,
      [req.params.id, userType, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({ project: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Обновление проекта
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, html, css, js } = req.body;
    const { userType, userId } = req.user;

    const result = await pool.query(
      `UPDATE user_projects 
       SET name = COALESCE($1, name),
           html = COALESCE($2, html),
           css = COALESCE($3, css),
           js = COALESCE($4, js)
       WHERE id = $5 AND owner_type = $6 AND owner_id = $7
       RETURNING id, name, updated_at`,
      [name, html, css, js, req.params.id, userType, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({ project: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Удаление проекта
router.delete('/:id', auth, async (req, res) => {
  try {
    const { userType, userId } = req.user;
    
    const result = await pool.query(
      'DELETE FROM user_projects WHERE id = $1 AND owner_type = $2 AND owner_id = $3 RETURNING id',
      [req.params.id, userType, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;