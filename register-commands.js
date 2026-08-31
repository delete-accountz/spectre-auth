/**
 * Script para registrar slash commands
 * @module register-commands
 */
const { REST, Routes } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const { botId, guildId, token } = require('./config');
const logger = require('./utils/logger');

async function registerCommands() {
  const commands = [];
  const commandsPath = path.join(__dirname, './commands');

  try {
    const commandFiles = await fs.readdir(commandsPath);
    for (const file of commandFiles) {
      if (file.endsWith('.js')) {
        const command = require(path.join(commandsPath, file));
        commands.push(command.data.toJSON());
      }
    }

    const rest = new REST({ version: '10' }).setToken(token);

    await rest.put(Routes.applicationGuildCommands(botId, guildId), {
      body: commands,
    });

    logger.info('Comandos registrados com sucesso!');
  } catch (error) {
    logger.error(`Erro ao registrar comandos: ${error.message}`);
  }
}

registerCommands();