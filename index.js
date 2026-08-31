/**
 * Ponto de entrada — API HTTP only (sem bot Discord)
 */
require('dotenv').config();

const mongoose = require('mongoose');
const { connectDB } = require('./database/connect');
const logger = require('./utils/logger');
const { startApi } = require('./api');

async function shutdown(signal, server) {
  logger.warn(`Recebido ${signal}. Encerrando...`);
  try {
    if (server) await new Promise((r) => server.close(() => r()));
    if (mongoose.connection.readyState === 1) await mongoose.connection.close();
  } catch (err) {
    logger.error(`Erro no shutdown: ${err.stack || err.message}`);
  } finally {
    process.exit(0);
  }
}

async function main() {
  let server;
  try {
    await connectDB();

    const port = Number(process.env.PORT || process.env.API_PORT || 3000);
    const api = await startApi(port);
    server = api.server;

    logger.info(`API rodando na porta ${port}`);
  } catch (err) {
    logger.error(`Falha ao iniciar: ${err.stack || err.message}`);
    process.exit(1);
  }

  process.on('SIGINT',  () => shutdown('SIGINT',  server));
  process.on('SIGTERM', () => shutdown('SIGTERM', server));

  process.on('unhandledRejection', (reason) => {
    logger.error(`unhandledRejection: ${reason?.stack || reason}`);
  });
  process.on('uncaughtException', (err) => {
    logger.error(`uncaughtException: ${err?.stack || err}`);
  });
}

main();
