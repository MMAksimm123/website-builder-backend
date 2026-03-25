const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const crypto = require('crypto');

// Функция для генерации UUID
const generateUUID = () => {
  return crypto.randomUUID();
};

// Стандартизированные уровни логирования
const levels = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4
};

// Стандартизированные цвета для уровней
const colors = {
  fatal: 'red',
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue'
};

winston.addColors(colors);

// Формат для консоли с цветами
const consoleFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, context, traceId, service, duration, ...rest } = info;
    
    let log = `${timestamp} [${level}] [${service || 'landing-builder'}]`;
    
    if (traceId) {
      log += ` [traceId: ${traceId}]`;
    }
    
    if (context) {
      log += ` [${context}]`;
    }
    
    if (duration) {
      log += ` [${duration}ms]`;
    }
    
    log += `: ${message}`;
    
    if (info.stack) {
      log += `\n${info.stack}`;
    }
    
    const additionalInfo = { ...rest };
    delete additionalInfo.stack;
    
    if (Object.keys(additionalInfo).length > 0) {
      log += `\n${JSON.stringify(additionalInfo, null, 2)}`;
    }
    
    if (info.level === 'fatal' || (info.level === 'error' && info.critical)) {
      log = '\n' + '='.repeat(80) + '\n' +
            '🔴 ' + log + ' 🔴\n' +
            '='.repeat(80) + '\n';
    }
    
    return log;
  })
);

// JSON формат для файлов
const jsonFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format((info) => {
    info.service = info.service || 'landing-builder';
    info.traceId = info.traceId || generateUUID();
    info.environment = process.env.NODE_ENV || 'development';
    
    if (info.message && typeof info.message === 'string') {
      info.message = info.message.replace(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/g, '***@***.***');
      info.message = info.message.replace(/password["']?\s*:\s*["'][^"']+["']/gi, 'password: "***"');
      info.message = info.message.replace(/token["']?\s*:\s*["'][^"']+["']/gi, 'token: "***"');
    }
    
    return info;
  })(),
  winston.format.json()
);

// Настройка ротации файлов
const fileRotateTransport = new DailyRotateFile({
  filename: 'logs/%DATE%-combined.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '30d',
  format: jsonFormat
});

const errorFileRotateTransport = new DailyRotateFile({
  filename: 'logs/%DATE%-error.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '30d',
  level: 'error',
  format: jsonFormat
});

const fatalFileRotateTransport = new DailyRotateFile({
  filename: 'logs/%DATE%-fatal.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '90d',
  level: 'fatal',
  format: jsonFormat
});

const consoleTransport = new winston.transports.Console({
  format: consoleFormat,
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
});

const logger = winston.createLogger({
  levels,
  level: process.env.LOG_LEVEL || 'info',
  format: jsonFormat,
  defaultMeta: { 
    service: 'landing-builder',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    consoleTransport,
    fileRotateTransport,
    errorFileRotateTransport,
    fatalFileRotateTransport
  ],
  exceptionHandlers: [
    new DailyRotateFile({
      filename: 'logs/%DATE%-exceptions.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      format: jsonFormat
    }),
    new winston.transports.Console({
      format: consoleFormat
    })
  ],
  rejectionHandlers: [
    new DailyRotateFile({
      filename: 'logs/%DATE%-rejections.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      format: jsonFormat
    }),
    new winston.transports.Console({
      format: consoleFormat
    })
  ]
});

class ContextLogger {
  constructor(context, traceId = generateUUID(), service = 'landing-builder') {
    this.context = context;
    this.traceId = traceId;
    this.service = service;
    this.startTime = Date.now();
  }

  log(level, message, meta = {}) {
    const logData = {
      level,
      message,
      context: this.context,
      traceId: this.traceId,
      service: this.service,
      duration: Date.now() - this.startTime,
      ...meta
    };

    if (level === 'error' || level === 'fatal') {
      const stack = new Error().stack;
      logData.stack = stack;
    }

    logger.log(logData);
  }

  fatal(message, meta = {}) {
    this.log('fatal', message, { ...meta, critical: true });
  }

  error(message, meta = {}) {
    this.log('error', message, meta);
  }

  warn(message, meta = {}) {
    this.log('warn', message, meta);
  }

  info(message, meta = {}) {
    this.log('info', message, meta);
  }

  debug(message, meta = {}) {
    if (process.env.NODE_ENV !== 'production') {
      this.log('debug', message, meta);
    }
  }

  child(subContext) {
    return new ContextLogger(
      `${this.context}.${subContext}`,
      this.traceId,
      this.service
    );
  }
}

const loggerMiddleware = (req, res, next) => {
  const traceId = req.headers['x-trace-id'] || generateUUID();
  req.traceId = traceId;
  res.setHeader('x-trace-id', traceId);
  
  req.logger = new ContextLogger('http', traceId);
  
  req.logger.info(`${req.method} ${req.url}`, {
    method: req.method,
    url: req.url,
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.get('user-agent')
  });
  
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : 
                  res.statusCode >= 400 ? 'warn' : 'info';
    
    req.logger[level](`${req.method} ${req.url} ${res.statusCode}`, {
      statusCode: res.statusCode,
      duration,
      contentLength: res.get('content-length')
    });
  });
  
  next();
};

const createServiceLogger = (serviceName, traceId = generateUUID()) => {
  return new ContextLogger(serviceName, traceId);
};

module.exports = {
  logger,
  ContextLogger,
  loggerMiddleware,
  createServiceLogger
};