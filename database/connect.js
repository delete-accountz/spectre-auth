/**
 * Conexão com o banco de dados MongoDB
 * @module database/connect
 */
const mongoose = require('mongoose');
const { mongodbUri } = require('../config');
const logger = require('../utils/logger');

async function connectDB() {
  try {
    await mongoose.connect(mongodbUri);
    logger.info('Conectado ao MongoDB com sucesso');
  } catch (error) {
    logger.error(`Erro ao conectar ao MongoDB: ${error.message}`);
    throw error;
  }
}

module.exports = { connectDB };