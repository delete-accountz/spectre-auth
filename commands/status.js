const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, version: djsVersion } = require('discord.js');
const { v2Card } = require('../utils/uiV2');
const os = require('node:os');
const mongoose = require('mongoose');

const Key = require('../database/models/Key');
const User = require('../database/models/User');
const Product = require('../database/models/Product');
const logger = require('../utils/logger');

function replyV2(interaction, title, blocks, accentColor) {
  return interaction.editReply({
    components: [v2Card({ title, blocks, accentColor })],
    flags: MessageFlags.IsComponentsV2,
    withComponents: true,
  });
}

function fmtUptime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const d = Math.floor(sec / 86400);
  sec -= d * 86400;
  const h = Math.floor(sec / 3600);
  sec -= h * 3600;
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${d}d ${h}h ${m}m ${s}s`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Status geral do bot e da auth')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const now = new Date();
      const [keys, users, products, activeKeys, pendingActivation] = await Promise.all([
        Key.countDocuments({}),
        User.countDocuments({}),
        Product.countDocuments({}),
        Key.countDocuments({ expiresAt: { $gt: now }, banned: { $ne: true }, paused: { $ne: true } }),
        Key.countDocuments({ expiresAt: null, activatedAt: null, banned: { $ne: true } }),
      ]);

      const dbState = mongoose.connection.readyState; // 1=connected
      const dbText = dbState === 1 ? 'connected' : `state=${dbState}`;

      const blocks = [
        `**Auth**\n Users -> \`${users}\`\n Keys -> \`${keys}\`\n Produtos -> \`${products}\`\n Keys ativas -> \`${activeKeys}\`\n Keys pendentes -> \`${pendingActivation}\``,
        `**Bot**\n Ping -> \`${client.ws.ping}ms\`\n Uptime -> \`${fmtUptime(process.uptime())}\`\n Discord.js -> \`${djsVersion}\`\n Node -> \`${process.version}\``,
        `**Host**\n OS -> \`${os.platform()} ${os.release()}\`\n CPU -> \`${os.cpus()?.[0]?.model || 'N/A'}\`\n RAM -> \`${Math.round(os.totalmem() / 1024 / 1024)}MB\`\n Database -> \`${dbText}\``,
      ];

      return replyV2(interaction, 'Status | @SpectreAuth', blocks, 0x0);
    } catch (e) {
      logger.error(`[/status] ${e?.stack || e?.message || e}`);
      return replyV2(interaction, 'Erro | /status', ['Ocorreu um erro ao coletar status.']);
    }
  },
};
