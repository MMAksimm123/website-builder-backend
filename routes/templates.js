const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();

// Получение всех активных шаблонов
router.get('/', async (req, res) => {
  const logger = req.logger?.child('templates.list') || console;
  
  try {
    const result = await pool.query(
      `SELECT id, name, description, thumbnail_url, created_at 
       FROM templates 
       WHERE is_active = true 
       ORDER BY created_at DESC`
    );
    
    logger.info('Templates fetched', { count: result.rows.length });
    res.json({ templates: result.rows });
  } catch (error) {
    logger.error('Error fetching templates', { 
      error: error.message,
      stack: error.stack,
      critical: true
    });
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Получение полного шаблона по ID
router.get('/:id', async (req, res) => {
  const logger = req.logger?.child('templates.get') || console;
  
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT id, name, description, html, css, js, thumbnail_url, created_at 
       FROM templates 
       WHERE id = $1 AND is_active = true`,
      [id]
    );
    
    if (result.rows.length === 0) {
      logger.warn('Template not found', { id });
      return res.status(404).json({ error: 'Template not found' });
    }
    
    logger.info('Template fetched', { id, name: result.rows[0].name });
    res.json({ template: result.rows[0] });
  } catch (error) {
    logger.error('Error fetching template', { 
      error: error.message,
      stack: error.stack,
      templateId: req.params.id
    });
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// Создание нового шаблона (только для администратора)
router.post('/', auth, async (req, res) => {
  const logger = req.logger?.child('templates.create') || console;
  
  try {
    const { name, description, html, css, js, thumbnail_url } = req.body;
    
    if (!name || !html) {
      return res.status(400).json({ error: 'Name and HTML are required' });
    }
    
    const result = await pool.query(
      `INSERT INTO templates (name, description, html, css, js, thumbnail_url, created_by) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING id, name, created_at`,
      [name, description || '', html, css || '', js || '', thumbnail_url || null, req.user.userId]
    );
    
    logger.info('Template created', { id: result.rows[0].id, name });
    res.json({ template: result.rows[0] });
  } catch (error) {
    logger.error('Error creating template', { 
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// Обновление шаблона
router.put('/:id', auth, async (req, res) => {
  const logger = req.logger?.child('templates.update') || console;
  
  try {
    const { id } = req.params;
    const { name, description, html, css, js, thumbnail_url, is_active } = req.body;
    
    const result = await pool.query(
      `UPDATE templates 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           html = COALESCE($3, html),
           css = COALESCE($4, css),
           js = COALESCE($5, js),
           thumbnail_url = COALESCE($6, thumbnail_url),
           is_active = COALESCE($7, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING id, name, updated_at`,
      [name, description, html, css, js, thumbnail_url, is_active, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    logger.info('Template updated', { id, name });
    res.json({ template: result.rows[0] });
  } catch (error) {
    logger.error('Error updating template', { 
      error: error.message,
      stack: error.stack,
      templateId: req.params.id
    });
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// Удаление шаблона (мягкое удаление)
router.delete('/:id', auth, async (req, res) => {
  const logger = req.logger?.child('templates.delete') || console;
  
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `UPDATE templates SET is_active = false WHERE id = $1 RETURNING id`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    logger.info('Template deleted', { id });
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    logger.error('Error deleting template', { 
      error: error.message,
      stack: error.stack,
      templateId: req.params.id
    });
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

module.exports = router;