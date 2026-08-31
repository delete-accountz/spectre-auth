const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { v2Card } = require('../utils/uiV2');
const logger = require('../utils/logger');

function isOwner(interaction) {
  const ownerId = String(process.env.OWNER_DISCORD_ID || '').trim();
  return ownerId && interaction.user.id === ownerId;
}

function replyV2(interaction, title, blocks, accentColor) {
  return interaction.reply({
    ephemeral: true,
    components: [v2Card({ title, blocks, accentColor })],
    flags: MessageFlags.IsComponentsV2,
    withComponents: true,
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('manutencao')
    .setDescription('Ativa/Desativa modo manutenção (bot + auth)')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addBooleanOption(o =>
      o.setName('ativo').setDescription('true=ativar, false=desativar').setRequired(true),
    )
    .addStringOption(o =>
      o.setName('mensagem').setDescription('Mensagem opcional para mostrar aos users').setRequired(false),
    ),

  async execute(interaction) {
    if (!isOwner(interaction)) {
      return replyV2(interaction, 'Sem permissão', ['Apenas o **nash** pode usar este comando.'], 0x0);
    }

    const ativo = interaction.options.getBoolean('ativo', true);
    const msg = interaction.options.getString('mensagem')?.slice(0, 220) || null;

    process.env.MAINTENANCE_MODE = ativo ? '1' : '0';
    if (msg) process.env.MAINTENANCE_MESSAGE = msg;

    logger.warn(`[MAINTENANCE] mode=${process.env.MAINTENANCE_MODE} by=${interaction.user.id} msg=${msg || 'default'}`);

    return replyV2(
      interaction,
      'Manutenção atualizada',
      [
        `**Ativo ->** \`${ativo}\``,
        `**Mensagem ->** \`${String(process.env.MAINTENANCE_MESSAGE || 'N/A')}\``,
        `**Obs ->** isso muda em runtime. Se reiniciar o bot, volta pro valor do \`.env\`.`,
      ],
      0x0,
    );
  },
};
