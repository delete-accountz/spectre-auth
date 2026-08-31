/**
 * Configurações do bot
 * @module config
 */
require('dotenv').config();

module.exports = {
  token: process.env.DISCORD_TOKEN,
  guildId: process.env.GUILD_ID,
  botId: process.env.BOT_ID,
  accessRoleId: process.env.ACCESS_ROLE_ID,
  mongodbUri: process.env.MONGODB_URI,
  keyFormat: null, // aceita qualquer key que passe na validação básica de caracteres
  prefixFormat: /^[A-Z]+$/,
  timeOptions: ['7d', '30d', '999d'],
};