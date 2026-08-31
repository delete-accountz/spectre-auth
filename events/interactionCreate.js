/**
 * Manipula interações do Discord (slash commands)
 * @module events/interactionCreate
 */
const { checkPermissions } = require('../utils/permissions');
const logger = require('../utils/logger');
const { MessageFlags } = require('discord.js');
const { v2Card } = require('../utils/uiV2');

function isMaintenanceOn() {
  return String(process.env.MAINTENANCE_MODE || '0') === '1';
}

function maintenanceMessage() {
  return String(process.env.MAINTENANCE_MESSAGE || 'Sistema em manutenção.');
}

function isOwnerUser(interaction) {
  const ownerId = String(process.env.OWNER_DISCORD_ID || '').trim();
  return ownerId && interaction.user?.id === ownerId;
}

function replyV2(interaction, { title, blocks, accentColor = 0xF1C40F, ephemeral = true }) {
  return interaction.reply({
    ephemeral,
    components: [v2Card({ title, blocks, accentColor })],
    flags: MessageFlags.IsComponentsV2,
    withComponents: true,
  });
}

function followUpV2(interaction, { title, blocks, accentColor = 0xE74C3C, ephemeral = true }) {
  return interaction.followUp({
    ephemeral,
    components: [v2Card({ title, blocks, accentColor })],
    flags: MessageFlags.IsComponentsV2,
    withComponents: true,
  });
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    // =====================
    // Autocomplete
    // =====================
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (!command || typeof command.autocomplete !== 'function') return;

      try {
        await command.autocomplete(interaction, client);
      } catch (error) {
        logger.error(`Erro no autocomplete /${interaction.commandName}: ${error.stack || error.message}`);
      }
      return;
    }
    if (!interaction.isChatInputCommand()) return;

    // =====================
    // Maintenance gate
    // =====================
    if (isMaintenanceOn() && !isOwnerUser(interaction)) {
      return replyV2(interaction, {
        title: 'Manutenção | @SpectreAuth',
        blocks: [maintenanceMessage()],
        accentColor: 0x0,
        ephemeral: true,
      });
    }

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      const hasPermission = await checkPermissions(interaction, command);
      if (!hasPermission) {
        return replyV2(interaction, {
          title: 'Sem permissão',
          blocks: ['Você não tem permissão para usar este comando.'],
          accentColor: 0x0,
          ephemeral: true,
        });
      }

      await command.execute(interaction, client);
      logger.info(`Comando /${interaction.commandName} executado por ${interaction.user.tag}`);
    } catch (error) {
      logger.error(`Erro ao executar comando /${interaction.commandName}: ${error.stack || error.message}`);

      if (interaction.replied || interaction.deferred) {
        await followUpV2(interaction, {
          title: 'Erro',
          blocks: ['Ocorreu um erro ao executar o comando.'],
          accentColor: 0x0,
          ephemeral: true,
        });
      } else {
        await replyV2(interaction, {
          title: 'Erro',
          blocks: ['Ocorreu um erro ao executar o comando.'],
          accentColor: 0x0,
          ephemeral: true,
        });
      }
    }
  },
};
