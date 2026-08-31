const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { v2Card } = require('../utils/uiV2');
const AppSetting = require('../database/models/AppSetting');

function replyV2(interaction, title, blocks, accentColor) {
  return interaction.editReply({
    components: [v2Card({ title, blocks, accentColor })],
    flags: MessageFlags.IsComponentsV2,
    withComponents: true,
  });
}

function parseBoolLike(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().toLowerCase();
  if (['1','true','yes','y','on'].includes(s)) return true;
  if (['0','false','no','n','off'].includes(s)) return false;
  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('censura')
    .setDescription('Ativa/desativa censura (mascarar infos sensíveis) na dashboard/API/logs')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addBooleanOption(o =>
      o.setName('ativo')
        .setDescription('true = ativar censura, false = desativar censura')
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const ativo = interaction.options.getBoolean('ativo', true);

    await AppSetting.findOneAndUpdate(
      { key: 'privacy' },
      { $set: { value: { censorEnabled: Boolean(ativo) }, updatedBy: `bot:${interaction.user.id}` } },
      { upsert: true, new: true }
    );

    return replyV2(interaction, 'Privacy | @SpectreAuth', [
      `**Censura ->** \`${ativo ? 'ATIVADA' : 'DESATIVADA'}\``,
      `**Por ->** \`${interaction.user.tag}\``,
      `**Efeito ->** dashboard / rotas admin / audit logs / webhook`,
      `Dica: na dashboard também pode usar override por request com \`?censor=0\` ou header \`x-censor: 0\` (admin).`,
    ], 0x0);
  },
};
