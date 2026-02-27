const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();

// Сохранение информации о загруженном изображении
router.post('/', auth, async (req, res) => {
  try {
    const { projectId, fileName, fileSize, contentType, storagePath, supabaseUrl } = req.body;

    const result = await pool.query(
      `INSERT INTO project_images 
       (user_id, project_id, file_name, file_size, content_type, storage_path, supabase_url) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING id, supabase_url as url, file_name as name, project_id as "projectId"`,
      [req.userId, projectId || null, fileName, fileSize, contentType, storagePath, supabaseUrl]
    );

    // Конвертируем id в строку для фронтенда
    const image = {
      ...result.rows[0],
      id: result.rows[0].id.toString()
    };

    res.json({ image });
  } catch (error) {
    console.error('Error saving image info:', error);
    res.status(500).json({ error: 'Failed to save image information' });
  }
});

// Получение изображений проекта
router.get('/project/:projectId', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, supabase_url as url, file_name as name, created_at 
       FROM project_images 
       WHERE project_id = $1 AND user_id = $2 
       ORDER BY created_at DESC`,
      [req.params.projectId, req.userId]
    );

    res.json({ images: result.rows });
  } catch (error) {
    console.error('Error fetching images:', error);
    res.status(500).json({ error: 'Failed to fetch images' });
  }
});

// Удаление записи об изображении
router.delete('/:id', auth, async (req, res) => {
  try {
    // Сначала проверяем, принадлежит ли изображение пользователю
    const checkResult = await pool.query(
      'SELECT id FROM project_images WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }

    await pool.query(
      'DELETE FROM project_images WHERE id = $1',
      [req.params.id]
    );

    res.json({ message: 'Image record deleted successfully' });
  } catch (error) {
    console.error('Error deleting image record:', error);
    res.status(500).json({ error: 'Failed to delete image record' });
  }
});

module.exports = router;