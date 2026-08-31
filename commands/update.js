const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { v2Card } = require('../utils/uiV2');

const DLL_FOLDER = path.join(__dirname, '..', 'dlls');

if (!fs.existsSync(DLL_FOLDER)) {
  fs.mkdirSync(DLL_FOLDER);
}

function replyV2(interaction, title, blocks, accentColor = 0x0) {
  return interaction.editReply({
    components: [v2Card({ title, blocks, accentColor })],
    flags: MessageFlags.IsComponentsV2,
    withComponents: true,
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('update-mod')
    .setDescription('Atualiza o DLL (rage ou safe) via link ou upload')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addStringOption(option =>
      option
        .setName('versao')
        .setDescription('Versão do DLL')
        .setRequired(true)
        .addChoices(
          { name: 'Rage (Risco)', value: 'rage' },
          { name: 'Legit (Safe)', value: 'safe' }
        )
    )
    .addStringOption(option =>
      option
        .setName('link')
        .setDescription('Link direto do .dll (opcional - se vazio, pede upload)')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const version = interaction.options.getString('versao');
    const link = interaction.options.getString('link')?.trim();

    const fileName = version === 'rage' ? 'rage.dll' : 'safe.dll';
    const filePath = path.join(DLL_FOLDER, fileName);

    try {
      let buffer;

      if (link) {
        if (!link.toLowerCase().endsWith('.dll')) {
          return replyV2(interaction, 'Erro | /update-mod', ['O link deve terminar com `.dll`.'], 0x0);
        }

        await replyV2(interaction, 'Atualizando DLL', ['Baixando do link informado...'], 0x0);

        const response = await fetch(link, { timeout: 30000 });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        buffer = await response.arrayBuffer();
      } else {
        await replyV2(interaction, 'Aguardando upload', [
          'Envie o arquivo `.dll` agora (responda esta mensagem ou envie no canal).',
          'Tempo limite: **60 segundos**.',
        ], 0x0);

        if (!interaction.channel) {
          return replyV2(interaction, 'Erro | /update-mod', ['Canal não disponível para coletar upload.'], 0x0);
        }

        const filter = m =>
          m.author.id === interaction.user.id &&
          m.attachments.size === 1 &&
          m.attachments.first().name.toLowerCase().endsWith('.dll');

        const collector = interaction.channel.createMessageCollector({
          filter,
          time: 60000,
          max: 1,
        });

        const collected = await new Promise((resolve) => {
          collector.on('collect', m => resolve(m));
          collector.on('end', collected => {
            if (collected.size === 0) resolve(null);
          });
        });

        if (!collected) {
          return replyV2(interaction, 'Timeout | /update-mod', ['Você não enviou o arquivo a tempo.'], 0x0);
        }

        const attachment = collected.attachments.first();
        const response = await fetch(attachment.url);
        if (!response.ok) throw new Error('Falha ao baixar o attachment');

        buffer = await response.arrayBuffer();

        try { await collected.delete(); } catch {}
      }

      fs.writeFileSync(filePath, Buffer.from(buffer));
      logger.info(`DLL ${version.toUpperCase()} atualizado por ${interaction.user.tag}`);

      return replyV2(interaction, 'DLL atualizado | @SpectreAuth', [
        `**Versão ->** \`${version.toUpperCase()}\``,
        `**Método ->** \`${link ? 'Link' : 'Upload'}\``,
        `**Arquivo ->** \`${fileName}\``,
      ], 0x0);

    } catch (err) {
      logger.error(`[/update-mod] ${err?.stack || err?.message || err}`);
      return replyV2(interaction, 'Erro | /update-mod', [
        `Falha ao atualizar DLL: ${String(err?.message || 'erro interno')}`,
      ], 0x0);
    }
  },
};