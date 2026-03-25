const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passport = require('./config/passport');
require('dotenv').config();

const { loggerMiddleware, createServiceLogger } = require('./config/logger');
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const githubRoutes = require('./routes/github');
const imageRoutes = require('./routes/images');

const app = express();
const logger = createServiceLogger('main');

// Логгер middleware
app.use(loggerMiddleware);

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-trace-id']
}));

app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/github', githubRoutes);
app.use('/api/images', imageRoutes);

// Тестовый маршрут
app.get('/api/health', (req, res) => {
  req.logger.info('Health check requested');
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    traceId: req.traceId
  });
});

// Тестовый маршрут для демонстрации ошибок
app.get('/api/test-error', (req, res) => {
  const testLogger = req.logger.child('test');
  
  testLogger.warn('Это предупреждение', { test: 'data' });
  testLogger.error('Это обычная ошибка', { test: 'data' });
  testLogger.error('Это КРИТИЧЕСКАЯ ошибка!', { 
    critical: true,
    test: 'data',
    userId: 123
  });
  testLogger.fatal('Это фатальная ошибка!', { 
    test: 'data',
    important: 'value'
  });
  
  res.json({ message: 'Check console for colored logs!' });
});

// Обработка ошибок 404
app.use((req, res) => {
  req.logger.warn(`Route not found: ${req.method} ${req.url}`);
  res.status(404).json({ error: 'Not found', traceId: req.traceId });
});

// Централизованная обработка ошибок
app.use((err, req, res, next) => {
  const isCritical = err.statusCode >= 500;
  
  if (isCritical) {
    req.logger.fatal('Unhandled error', {
      error: err.message,
      stack: err.stack,
      critical: true
    });
  } else {
    req.logger.error('Handled error', {
      error: err.message,
      stack: err.stack
    });
  }
  
  res.status(err.statusCode || 500).json({ 
    error: err.message || 'Internal server error',
    traceId: req.traceId
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(`Server started`, { port: PORT });
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`📝 Logs are written to /logs directory`);
  console.log(`🔍 Test error endpoint: http://localhost:${PORT}/api/test-error\n`);
});