/**
 * Sistema de logs
 * @module utils/logger
 */
const winston = require('winston');
const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack }) => {
      const msg = stack || message;
      return `${timestamp} [${level.toUpperCase()}]: ${msg}`;
    })
  ),
  transports: [
    new winston.transports.File({ filename: path.join(logsDir, 'app.log') }),
    new winston.transports.Console(),
  ],
});

module.exports = logger;
