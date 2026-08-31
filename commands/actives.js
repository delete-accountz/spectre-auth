const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { v2Card } = require('../utils/uiV2');
const Key = require('../database/models/Key');
const logger = require('../utils/logger');

function replyV2(interaction, title, blocks, accentColor) {
  return interaction.editReply({
    components: [v2Card({ title, blocks, accentColor })],
    flags: MessageFlags.IsComponentsV2,
    withComponents: true,
  });
}

function parseDays(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n < -36500 || n > 36500) return null;
  return Math.trunc(n);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ativos')
    .setDescription('Gerencia chaves ativas (bulk)')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sc => sc.setName('contar').setDescription('Conta quantas chaves ativas existem'))
    .addSubcommand(sc =>
      sc.setName('pausar-todos')
        .setDescription('Pausa/Despausa todas as chaves ativas')
        .addBooleanOption(o => o.setName('ativo').setDescription('true=pausar, false=despausar').setRequired(true))
    )
    .addSubcommand(sc => sc.setName('resetar-hwid-todos').setDescription('Reseta HWID de todas as chaves ativas'))
    .addSubcommand(sc =>
      sc.setName('dias-todos')
        .setDescription('Adiciona/Remove dias de todas as chaves ativas')
        .addIntegerOption(o => o.setName('dias').setDescription('Pode ser negativo').setRequired(true))
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();

    try {
      const now = new Date();
      const activeFilter = { expiresAt: { $gt: now }, banned: { $ne: true } };

      if (sub === 'contar') {
        const total = await Key.countDocuments(activeFilter);
        const paused = await Key.countDocuments({ ...activeFilter, paused: true });
        const pending = await Key.countDocuments({ expiresAt: null, activatedAt: null, banned: { $ne: true } });
        return replyV2(interaction, 'Ativos', [
          `**Ativas (inclui pausadas) ->** \`${total}\``,
          `**Pausadas ->** \`${paused}\``,
          `**Rodando ->** \`${Math.max(0, total - paused)}\``,
          `**Pendentes (ainda não vinculadas) ->** \`${pending}\``,
        ], 0x0);
      }

      if (sub === 'pausar-todos') {
        const pause = interaction.options.getBoolean('ativo', true);
        const update = pause
          ? { $set: { paused: true, pausedAt: now, pausedBy: interaction.user.id } }
          : { $set: { paused: false, pausedAt: null, pausedBy: null } };

        const r = await Key.updateMany(activeFilter, update);
        return replyV2(interaction, 'Atualizado', [
          `**Pausar ->** \`${pause}\``,
          `**Atualizados ->** \`${r.modifiedCount ?? r.nModified ?? 0}\``,
        ], 0x0);
      }

      if (sub === 'resetar-hwid-todos') {
        const r = await Key.updateMany(activeFilter, { $set: { hwid: null } });
        return replyV2(interaction, 'HWID resetado (bulk)', [
          `**Atualizados ->** \`${r.modifiedCount ?? r.nModified ?? 0}\``,
        ], 0x0);
      }

      if (sub === 'dias-todos') {
        const days = parseDays(interaction.options.getInteger('dias', true));
        if (days === null) return replyV2(interaction, 'Erro', ['Dias inválido.']);

        const keys = await Key.find(activeFilter).select('_id expiresAt').lean();
        let updated = 0;

        for (const k of keys) {
          await Key.updateOne({ _id: k._id }, { $set: { expiresAt: addDays(k.expiresAt, days) } });
          updated++;
        }

        return replyV2(interaction, 'Dias aplicados (bulk)', [
          `**Dias ->** \`${days}\``,
          `**Atualizados ->** \`${updated}\``,
        ], 0x0);
      }

      return replyV2(interaction, 'Erro', ['Subcommand inválido.']);
    } catch (e) {
      logger.error(`[/ativos] ${e?.stack || e?.message || e}`);
      return replyV2(interaction, 'Erro | /ativos', ['Ocorreu um erro interno.']);
    }
  },
};
