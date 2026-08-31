/**
 * /wipe - Apaga dados em massa (Keys / Users / Products / Tudo)
 * Segurança: exige ser OWNER (OWNER_DISCORD_ID) + Administrator
 */

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { v2Card } = require('../utils/uiV2');
const Key = require('../database/models/Key');
const User = require('../database/models/User');
const Product = require('../database/models/Product');
const logger = require('../utils/logger');

function isOwner(interaction) {
  const ownerId = String(process.env.OWNER_DISCORD_ID || '').trim();
  return ownerId && interaction.user?.id === ownerId;
}

function randToken(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function replyV2(interaction, title, blocks, accentColor = 0xE74C3C) {
  return interaction.editReply({
    components: [v2Card({ title, blocks, accentColor })],
    flags: MessageFlags.IsComponentsV2,
    withComponents: true,
  });
}

function clampText(s, max = 950) {
  const txt = String(s ?? '').replace(/\u0000/g, '').trim();
  if (!txt) return '—';
  return txt.length > max ? `${txt.slice(0, max)}…` : txt;
}


module.exports = {
  data: new SlashCommandBuilder()
    .setName('wipe')
    .setDescription('Apaga dados em massa (irreversível)')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o =>
      o
        .setName('alvo')
        .setDescription('O que será apagado')
        .setRequired(true)
        .addChoices(
          { name: 'keys (todas as chaves)', value: 'keys' },
          { name: 'users (todos os usuários)', value: 'users' },
          { name: 'products (todos os produtos)', value: 'products' },
          { name: 'all (tudo: keys+users+products)', value: 'all' },
        ),
    )
    .addStringOption(o =>
      o
        .setName('confirmar')
        .setDescription('Token de confirmação (use o token mostrado na prévia)')
        .setRequired(false),
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!isOwner(interaction)) {
      return replyV2(
        interaction,
        'Sem permissão',
        ['Apenas o **nash** pode executar wipe.'],
        0x0,
      );
    }

    const alvo = interaction.options.getString('alvo', true);
    const confirmar = interaction.options.getString('confirmar');

    // Token por usuário (em memória)
    if (!interaction.client.cache) interaction.client.cache = new Map();
    const cacheKey = `wipe:${interaction.user.id}:${alvo}`;

    // Etapa 1: gerar token e mostrar prévia
    if (!confirmar) {
      const token = randToken(6);
      const expiresAt = Date.now() + 60_000; // 60s

      interaction.client.cache.set(cacheKey, { token, expiresAt });

      const blocks = [
  clampText(`Você está prestes a executar um **WIPE IRREVERSÍVEL**.`),
  clampText(`**Alvo ->** \`${alvo}\``),
  clampText(`Para confirmar, execute novamente:`),
  clampText(`\`/wipe alvo:${alvo} confirmar:${token}\``),
  clampText(`Token expira em **60 segundos**.`),
];


      return replyV2(interaction, 'Confirmação necessária | /wipe', blocks, 0x0);
    }

    const entry = interaction.client.cache.get(cacheKey);
    if (!entry || Date.now() > entry.expiresAt) {
      interaction.client.cache.delete(cacheKey);
      return replyV2(
        interaction,
        'Token inválido/expirado',
        ['Gere um novo token executando `/wipe` sem o parâmetro `confirmar`.'],
        0x0,
      );
    }

    if (String(confirmar).trim().toUpperCase() !== entry.token) {
      return replyV2(
        interaction,
        'Confirmação incorreta',
        ['Token incorreto. Rode `/wipe` de novo para gerar outro token.'],
        0x0,
      );
    }

    interaction.client.cache.delete(cacheKey);

    try {
      let result = {};

      if (alvo === 'keys' || alvo === 'all') {
        const r = await Key.deleteMany({});
        result.keys = r.deletedCount || 0;
      }

      if (alvo === 'users' || alvo === 'all') {
        const r = await User.deleteMany({});
        result.users = r.deletedCount || 0;
      }

      if (alvo === 'products' || alvo === 'all') {
        const r = await Product.deleteMany({});
        result.products = r.deletedCount || 0;
      }

      logger.warn(`[WIPE] alvo=${alvo} by=${interaction.user.id} result=${JSON.stringify(result)}`);

      const blocks = [
        `**Wipe concluído**`,
        `**Alvo ->** \`${alvo}\``,
        ``,
        result.keys !== undefined ? ` Keys apagadas -> \`${result.keys}\`` : null,
        result.users !== undefined ? ` Users apagados -> \`${result.users}\`` : null,
        result.products !== undefined ? ` Products apagados -> \`${result.products}\`` : null,
      ].filter(Boolean);

      return replyV2(interaction, 'Wipe executado', blocks, 0x0);
    } catch (err) {
      logger.error(`[WIPE] erro: ${err.stack || err.message}`);
      return replyV2(
        interaction,
        'Erro',
        ['Ocorreu um erro ao executar o wipe. Verifique os logs do servidor.'],
        0x0,
      );
    }
  },
};
