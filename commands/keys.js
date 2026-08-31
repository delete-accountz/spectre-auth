const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const crypto = require('crypto');

const { v2Card } = require('../utils/uiV2');
const { generateKey } = require('../utils/generateKey');

const Key = require('../database/models/Key');
const Product = require('../database/models/Product');
const User = require('../database/models/User');
const logger = require('../utils/logger');
const { prefixFormat, keyFormat } = require('../config');
const {
  addDays,
  computeProductHash,
  computeKeyScopeHash,
  ensureKeyHashes,
  activateKeyOnBind,
} = require('../utils/licenseScope');

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

async function resolveProduct(productInput) {
  const isMongoId = /^[0-9a-fA-F]{24}$/.test(productInput);
  let product = isMongoId ? await Product.findById(productInput) : await Product.findOne({ name: productInput.trim() });
  if (!product) {
    product = new Product({ name: productInput.trim().slice(0, 80) });
    await product.save();
  }
  return product;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('chave')
    .setDescription('Gerencia chaves da auth')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    // criar
    .addSubcommand(sc =>
      sc.setName('criar')
        .setDescription('Cria chaves')
        .addStringOption(o => o.setName('prefixo').setDescription('A-Z (máx 20)').setRequired(true))
        .addStringOption(o => o.setName('produto').setDescription('Nome ou ID do produto').setRequired(true).setAutocomplete(true))
        .addIntegerOption(o => o.setName('quantidade').setDescription('1 a 50').setRequired(true))
        .addIntegerOption(o => o.setName('dias').setDescription('Dias (ex: 7, 30, 999)').setRequired(true))
    )

    // apagar
    .addSubcommand(sc =>
      sc.setName('apagar')
        .setDescription('Apaga uma chave')
        .addStringOption(o => o.setName('key').setDescription('Chave').setRequired(true))
    )

    // resetar hwid
    .addSubcommand(sc =>
      sc.setName('resetar-hwid')
        .setDescription('Reseta o HWID de uma chave')
        .addStringOption(o => o.setName('key').setDescription('Chave').setRequired(true))
    )

    // unlink
    .addSubcommand(sc =>
      sc.setName('unlink')
        .setDescription('Desvincula discordId + hwid da chave')
        .addStringOption(o => o.setName('key').setDescription('Chave').setRequired(true))
    )

    // mudar produto
    .addSubcommand(sc =>
      sc.setName('mudar-produto')
        .setDescription('Altera o produto de uma chave')
        .addStringOption(o => o.setName('key').setDescription('Chave').setRequired(true))
        .addStringOption(o => o.setName('produto').setDescription('Nome ou ID').setRequired(true).setAutocomplete(true))
    )

    // adicionar/remover dias
    .addSubcommand(sc =>
      sc.setName('dias')
        .setDescription('Adiciona/Remove dias')
        .addStringOption(o => o.setName('key').setDescription('Chave').setRequired(true))
        .addIntegerOption(o => o.setName('dias').setDescription('Pode ser negativo (ex: -7)').setRequired(true))
    )

    // pausar/despausar
    .addSubcommand(sc =>
      sc.setName('pausar')
        .setDescription('Pausa/Despausa a chave')
        .addStringOption(o => o.setName('key').setDescription('Chave').setRequired(true))
        .addBooleanOption(o => o.setName('ativo').setDescription('true=pausar, false=despausar').setRequired(true))
    )

    // banir/desbanir
    .addSubcommand(sc =>
      sc.setName('banir')
        .setDescription('Bane/Desbane a chave com motivo')
        .addStringOption(o => o.setName('key').setDescription('Chave').setRequired(true))
        .addBooleanOption(o => o.setName('ativo').setDescription('true=banir, false=desbanir').setRequired(true))
        .addStringOption(o => o.setName('motivo').setDescription('Motivo (ban)').setRequired(false))
    )

    // info
    .addSubcommand(sc =>
      sc.setName('info')
        .setDescription('Info completa da chave')
        .addStringOption(o => o.setName('key').setDescription('Chave').setRequired(true))
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const choices = [];
    try {
      const escaped = focused.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const products = await Product.find({ name: { $regex: `^${escaped}`, $options: 'i' } }).limit(25);
      choices.push(...products.map(p => ({
        name: `${p.name} (ID: ${p._id})`.slice(0, 100),
        value: p._id.toString(),
      })));

      if (focused && !products.some(p => p.name.toLowerCase() === focused.toLowerCase())) {
        const v = focused.trim().slice(0, 80);
        if (v) choices.push({ name: `Criar novo: ${v}`.slice(0, 100), value: v });
      }
    } catch (e) {
      logger.error(`autocomplete produto: ${e?.message || e}`);
    }
    await interaction.respond(choices.length ? choices : [{ name: 'Nenhum produto', value: 'none' }]);
  },

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const sub = interaction.options.getSubcommand();

    try {
      if (sub === 'criar') {
        const prefix = interaction.options.getString('prefixo', true).trim().toUpperCase();
        const productInput = interaction.options.getString('produto', true);
        const quantity = interaction.options.getInteger('quantidade', true);
        const days = interaction.options.getInteger('dias', true);

        if (!prefixFormat.test(prefix) || prefix.length > 20) {
          return replyV2(interaction, 'Erro | /chave criar', ['Prefixo inválido (A-Z, máx 20).']);
        }
        if (quantity < 1 || quantity > 100) {
          return replyV2(interaction, 'Erro | /chave criar', ['Quantidade deve ser 1 a 100.']);
        }
        const d = parseDays(days);
        if (d === null || d < 1) {
          return replyV2(interaction, 'Erro | /chave criar', ['Dias inválido (mínimo 1).']);
        }
        if (productInput === 'none') {
          return replyV2(interaction, 'Erro | /chave criar', ['Produto inválido.']);
        }

        const product = await resolveProduct(productInput);
        const keys = [];
        for (let i = 0; i < quantity; i++) {
          let saved = false;
          for (let attempt = 0; attempt < 15 && !saved; attempt++) {
            const code = await generateKey(prefix);
            try {
              await Key.create({
                prefix,
                code,
                codeHash: crypto.createHash('sha256').update(String(code).toUpperCase()).digest('hex'),
                product: product._id,
                productHash: computeProductHash(product._id),
                durationDays: d,
                activatedAt: null,
                expiresAt: null,
                usedBy: null,
                usedAt: null,
                keyScopeHash: null,
              });
              keys.push(code);
              saved = true;
            } catch (err) {
              if (err?.code === 11000) continue;
              throw err;
            }
          }
          if (!saved) throw new Error('Falha ao gerar chave única (duplicados).');
        }

        return replyV2(interaction, 'Chaves criadas | @SpectreAuth', [
          `**Gerado por ->** \`${interaction.user.tag}\`\n**Produto ->** \`${product.name} (${product._id})\`\n**Validade (dias) ->** \`${d}\`\n**Início da validade ->** \`no vínculo\`\n**Quantidade ->** \`${keys.length}\``,
          `**Keys ->**\n\`\`\`\n${keys.join('\n')}\n\`\`\``,
        ], 0x0);
      }

      if (sub === 'apagar') {
        const key = interaction.options.getString('key', true).trim().toUpperCase();
        if (keyFormat && !keyFormat.test(key)) return replyV2(interaction, 'Erro', ['Formato de key inválido.']);
        const r = await Key.deleteOne({ code: key });
        return replyV2(interaction, 'Key removida', [`**Key ->** \`${key}\`\n**Deleted ->** \`${r.deletedCount}\``], 0x0);
      }

      if (sub === 'resetar-hwid') {
        const key = interaction.options.getString('key', true).trim().toUpperCase();
        const doc = await Key.findOne({ code: key });
        if (!doc) return replyV2(interaction, 'Erro', ['Key não encontrada.']);
        doc.hwid = null;
        await doc.save();
        return replyV2(interaction, 'HWID resetado', [`**Key ->** \`${key}\``], 0x0);
      }

      if (sub === 'unlink') {
        const key = interaction.options.getString('key', true).trim().toUpperCase();
        const doc = await Key.findOne({ code: key });
        if (!doc) return replyV2(interaction, 'Erro', ['Key não encontrada.']);

        const oldDiscord = doc.usedBy;
        doc.usedBy = null;
        doc.usedAt = null;
        doc.keyScopeHash = null;
        doc.hwid = null;
        if (Number.isFinite(Number(doc.durationDays)) && Number(doc.durationDays) > 0) {
          doc.activatedAt = null;
          doc.expiresAt = null;
        }
        await doc.save();

        if (oldDiscord) await User.deleteOne({ discordId: oldDiscord });

        return replyV2(interaction, 'Unlink concluído', [
          `**Key ->** \`${key}\``,
          `**Discord antigo ->** \`${oldDiscord || 'N/A'}\``,
        ], 0x0);
      }

      if (sub === 'mudar-produto') {
        const key = interaction.options.getString('key', true).trim().toUpperCase();
        const productInput = interaction.options.getString('produto', true);
        const doc = await Key.findOne({ code: key });
        if (!doc) return replyV2(interaction, 'Erro', ['Key não encontrada.']);

        const product = await resolveProduct(productInput);
        doc.product = product._id;
        doc.productHash = computeProductHash(product._id);
        if (doc.usedBy) {
          doc.keyScopeHash = computeKeyScopeHash({
            discordId: doc.usedBy,
            licenseKey: doc.code,
            productId: String(product._id),
          });
        } else {
          doc.keyScopeHash = null;
        }
        ensureKeyHashes(doc);
        await doc.save();

        return replyV2(interaction, 'Produto alterado', [
          `**Key ->** \`${key}\``,
          `**Novo produto ->** \`${product.name} (${product._id})\``,
        ], 0x0);
      }

      if (sub === 'dias') {
        const key = interaction.options.getString('key', true).trim().toUpperCase();
        const days = parseDays(interaction.options.getInteger('dias', true));
        if (days === null) return replyV2(interaction, 'Erro', ['Dias inválido.']);

        const doc = await Key.findOne({ code: key });
        if (!doc) return replyV2(interaction, 'Erro', ['Key não encontrada.']);

        if (doc.expiresAt) {
          doc.expiresAt = addDays(doc.expiresAt, days);
        } else {
          const baseDuration = Number.isFinite(Number(doc.durationDays)) ? Math.trunc(Number(doc.durationDays)) : 0;
          doc.durationDays = Math.max(1, baseDuration + days);
        }
        await doc.save();

        return replyV2(interaction, 'Expiração atualizada', [
          `**Key ->** \`${key}\``,
          `**Dias alterados ->** \`${days}\``,
          doc.expiresAt
            ? `**Nova expiração ->** \`${doc.expiresAt.toISOString()}\``
            : `**Validade (dias) pendente de ativação ->** \`${doc.durationDays}\``,
        ], 0x0);
      }

      if (sub === 'pausar') {
        const key = interaction.options.getString('key', true).trim().toUpperCase();
        const active = interaction.options.getBoolean('ativo', true); // true=pausar

        const doc = await Key.findOne({ code: key });
        if (!doc) return replyV2(interaction, 'Erro', ['Key não encontrada.']);

        doc.paused = active;
        doc.pausedAt = active ? new Date() : null;
        doc.pausedBy = active ? interaction.user.id : null;
        await doc.save();

        return replyV2(interaction, 'Atualizado', [
          `**Key ->** \`${key}\``,
          `**Paused ->** \`${doc.paused}\``,
        ], 0x0);
      }

      if (sub === 'banir') {
        const key = interaction.options.getString('key', true).trim().toUpperCase();
        const active = interaction.options.getBoolean('ativo', true);
        const reason = interaction.options.getString('motivo')?.slice(0, 220) || null;

        const doc = await Key.findOne({ code: key });
        if (!doc) return replyV2(interaction, 'Erro', ['Key não encontrada.']);

        doc.banned = active;
        doc.banReason = active ? (reason || 'Banned') : null;
        doc.bannedAt = active ? new Date() : null;
        doc.bannedBy = active ? interaction.user.id : null;
        await doc.save();

        return replyV2(interaction, 'Atualizado', [
          `**Key ->** \`${key}\``,
          `**Banned ->** \`${doc.banned}\``,
          `**Motivo ->** \`${doc.banReason || 'N/A'}\``,
        ], 0x0);
      }

      if (sub === 'info') {
        const key = interaction.options.getString('key', true).trim().toUpperCase();
        const doc = await Key.findOne({ code: key }).populate('product').lean();
        if (!doc) return replyV2(interaction, 'Erro', ['Key não encontrada.']);
        const pendingActivation = !doc.activatedAt && !doc.expiresAt;

        return replyV2(interaction, 'Info da Key', [
          `**Key ->** \`${doc.code}\``,
          `**Produto ->** \`${doc.product?.name || 'N/A'} (${doc.product?._id || 'N/A'})\``,
          `**Product Hash ->** \`${doc.productHash || 'N/A'}\``,
          `**Ativada em ->** \`${doc.activatedAt ? new Date(doc.activatedAt).toISOString() : 'N/A'}\``,
          pendingActivation
            ? `**Status ->** \`PENDENTE (ativa no vínculo)\``
            : `**Expira ->** \`${doc.expiresAt ? new Date(doc.expiresAt).toISOString() : 'N/A'}\``,
          `**Validade (dias) ->** \`${doc.durationDays ?? 'N/A'}\``,
          `**Used By ->** \`${doc.usedBy || 'N/A'}\``,
          `**HwiD ->** \`${doc.hwid ? 'SET' : 'NULL'}\``,
          `**Paused ->** \`${Boolean(doc.paused)}\``,
          `**Banned ->** \`${Boolean(doc.banned)}\``,
          doc.banReason ? `**Ban Reason ->** \`${doc.banReason}\`` : null,
        ].filter(Boolean), 0x0);
      }

      return replyV2(interaction, 'Erro', ['Subcommand inválido.']);
    } catch (e) {
      logger.error(`[/chave] ${e?.stack || e?.message || e}`);
      return replyV2(interaction, 'Erro | /chave', ['Ocorreu um erro interno.']);
    }
  },
};
