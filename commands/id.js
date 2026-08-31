const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { v2Card } = require('../utils/uiV2');
const Key = require('../database/models/Key');
const User = require('../database/models/User');
const Product = require('../database/models/Product');
const logger = require('../utils/logger');
const {
  addDays,
  computeProductHash,
  computeKeyScopeHash,
  normalizeProductId,
  ensureKeyHashes,
  activateKeyOnBind,
} = require('../utils/licenseScope');

const DISCORD_ID_REGEX = /^\d{17,19}$/;

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

async function getKeyByDiscord(discordId) {
  const user = await User.findOne({ discordId }).lean();
  if (user?.key) return Key.findOne({ code: user.key });
  return Key.findOne({ usedBy: discordId });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('id')
    .setDescription('Gerencia usuários/IDs (discordId)')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    .addSubcommand(sc =>
      sc.setName('link')
        .setDescription('Vincula uma key a um discordId (admin)')
        .addStringOption(o => o.setName('discordid').setDescription('ID do Discord').setRequired(true))
        .addStringOption(o => o.setName('key').setDescription('License key').setRequired(true))
    )
    .addSubcommand(sc =>
      sc.setName('unlink')
        .setDescription('Desvincula o discordId da key e remove User')
        .addStringOption(o => o.setName('discordid').setDescription('ID do Discord').setRequired(true))
    )
    .addSubcommand(sc =>
      sc.setName('resetar')
        .setDescription('Reseta HWID do usuário (key vinculada)')
        .addStringOption(o => o.setName('discordid').setDescription('ID do Discord').setRequired(true))
    )
    .addSubcommand(sc =>
      sc.setName('produto')
        .setDescription('Muda o produto da key vinculada ao ID')
        .addStringOption(o => o.setName('discordid').setDescription('ID do Discord').setRequired(true))
        .addStringOption(o => o.setName('produto').setDescription('Nome ou ID').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand(sc =>
      sc.setName('dias')
        .setDescription('Adiciona/Remove dias na key vinculada')
        .addStringOption(o => o.setName('discordid').setDescription('ID do Discord').setRequired(true))
        .addIntegerOption(o => o.setName('dias').setDescription('Pode ser negativo').setRequired(true))
    )
    .addSubcommand(sc =>
      sc.setName('pausar')
        .setDescription('Pausa/Despausa o usuário')
        .addStringOption(o => o.setName('discordid').setDescription('ID do Discord').setRequired(true))
        .addBooleanOption(o => o.setName('ativo').setDescription('true=pausar, false=despausar').setRequired(true))
    )
    .addSubcommand(sc =>
      sc.setName('banir')
        .setDescription('Bane/Desbane o usuário com motivo')
        .addStringOption(o => o.setName('discordid').setDescription('ID do Discord').setRequired(true))
        .addBooleanOption(o => o.setName('ativo').setDescription('true=banir, false=desbanir').setRequired(true))
        .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false))
    )
    .addSubcommand(sc =>
      sc.setName('info')
        .setDescription('Info do usuário e key vinculada')
        .addStringOption(o => o.setName('discordid').setDescription('ID do Discord').setRequired(true))
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const choices = [];
    try {
      const escaped = focused.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const products = await Product.find({ name: { $regex: `^${escaped}`, $options: 'i' } }).limit(25);
      choices.push(...products.map(p => ({ name: `${p.name} (ID: ${p._id})`.slice(0, 100), value: p._id.toString() })));
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
      const discordId = interaction.options.getString('discordid', true).trim();
      if (!DISCORD_ID_REGEX.test(discordId)) return replyV2(interaction, 'Erro', ['Discord ID inválido.']);

      if (sub === 'link') {
        const key = interaction.options.getString('key', true).trim().toUpperCase();
        const keyDoc = await Key.findOne({ code: key });
        if (!keyDoc) return replyV2(interaction, 'Erro', ['Key não encontrada.']);

        if (keyDoc.usedBy && keyDoc.usedBy !== discordId) {
          return replyV2(interaction, 'Erro', ['Essa key já está vinculada a outro Discord ID.']);
        }

        keyDoc.usedBy = discordId;
        keyDoc.usedAt = keyDoc.usedAt ?? new Date();
        keyDoc.keyScopeHash = computeKeyScopeHash({
          discordId,
          licenseKey: keyDoc.code,
          productId: normalizeProductId(keyDoc.product),
        });
        ensureKeyHashes(keyDoc);
        activateKeyOnBind(keyDoc, new Date());
        await keyDoc.save();

        await User.findOneAndUpdate(
          { discordId },
          { discordId, key, linkedAt: new Date() },
          { upsert: true, new: true },
        );

        return replyV2(interaction, 'Vinculado', [`**Discord ID ->** \`${discordId}\`\n**Key ->** \`${key}\``], 0x0);
      }

      if (sub === 'unlink') {
        const keyDoc = await getKeyByDiscord(discordId);
        if (keyDoc) {
          keyDoc.usedBy = null;
          keyDoc.usedAt = null;
          keyDoc.keyScopeHash = null;
          keyDoc.hwid = null;
          if (Number.isFinite(Number(keyDoc.durationDays)) && Number(keyDoc.durationDays) > 0) {
            keyDoc.activatedAt = null;
            keyDoc.expiresAt = null;
          }
          await keyDoc.save();
        }
        await User.deleteOne({ discordId });
        return replyV2(interaction, 'Unlink', [
          `**Discord ID ->** \`${discordId}\``,
          `**Key ->** \`${keyDoc?.code || 'N/A'}\``,
        ], 0x0);
      }

      if (sub === 'resetar') {
        const keyDoc = await getKeyByDiscord(discordId);
        if (!keyDoc) return replyV2(interaction, 'Erro', ['Nenhuma key vinculada.']);
        keyDoc.hwid = null;
        await keyDoc.save();
        return replyV2(interaction, 'HWID resetado', [`**Discord ID ->** \`${discordId}\`\n**Key ->** \`${keyDoc.code}\``], 0x0);
      }

      if (sub === 'produto') {
        const productInput = interaction.options.getString('produto', true);
        const keyDoc = await getKeyByDiscord(discordId);
        if (!keyDoc) return replyV2(interaction, 'Erro', ['Nenhuma key vinculada.']);

        const product = await resolveProduct(productInput);
        keyDoc.product = product._id;
        keyDoc.productHash = computeProductHash(product._id);
        if (keyDoc.usedBy) {
          keyDoc.keyScopeHash = computeKeyScopeHash({
            discordId: keyDoc.usedBy,
            licenseKey: keyDoc.code,
            productId: String(product._id),
          });
        } else {
          keyDoc.keyScopeHash = null;
        }
        ensureKeyHashes(keyDoc);
        await keyDoc.save();

        return replyV2(interaction, 'Produto alterado', [
          `**Discord ID ->** \`${discordId}\``,
          `**Key ->** \`${keyDoc.code}\``,
          `**Produto ->** \`${product.name} (${product._id})\``,
        ], 0x0);
      }

      if (sub === 'dias') {
        const days = parseDays(interaction.options.getInteger('dias', true));
        if (days === null) return replyV2(interaction, 'Erro', ['Dias inválido.']);

        const keyDoc = await getKeyByDiscord(discordId);
        if (!keyDoc) return replyV2(interaction, 'Erro', ['Nenhuma key vinculada.']);

        if (keyDoc.expiresAt) {
          keyDoc.expiresAt = addDays(keyDoc.expiresAt, days);
        } else {
          const baseDuration = Number.isFinite(Number(keyDoc.durationDays)) ? Math.trunc(Number(keyDoc.durationDays)) : 0;
          keyDoc.durationDays = Math.max(1, baseDuration + days);
        }
        await keyDoc.save();

        return replyV2(interaction, 'Expiração atualizada', [
          `**Discord ID ->** \`${discordId}\``,
          `**Key ->** \`${keyDoc.code}\``,
          `**Dias alterados ->** \`${days}\``,
          keyDoc.expiresAt
            ? `**Expira ->** \`${keyDoc.expiresAt.toISOString()}\``
            : `**Validade (dias) pendente ->** \`${keyDoc.durationDays ?? 'N/A'}\``,
        ], 0x0);
      }

      if (sub === 'pausar') {
        const active = interaction.options.getBoolean('ativo', true);
        const u = await User.findOneAndUpdate(
          { discordId },
          { $set: { paused: active, pausedAt: active ? new Date() : null, pausedBy: active ? interaction.user.id : null } },
          { upsert: true, new: true },
        );
        return replyV2(interaction, 'Atualizado', [`**Discord ID ->** \`${discordId}\`\n**Paused ->** \`${u.paused}\``], 0x0);
      }

      if (sub === 'banir') {
        const active = interaction.options.getBoolean('ativo', true);
        const reason = interaction.options.getString('motivo')?.slice(0, 220) || null;
        const u = await User.findOneAndUpdate(
          { discordId },
          {
            $set: {
              banned: active,
              banReason: active ? (reason || 'Banned') : null,
              bannedAt: active ? new Date() : null,
              bannedBy: active ? interaction.user.id : null,
            },
          },
          { upsert: true, new: true },
        );

        return replyV2(interaction, 'Atualizado', [
          `**Discord ID ->** \`${discordId}\``,
          `**Banned ->** \`${u.banned}\``,
          `**Motivo ->** \`${u.banReason || 'N/A'}\``,
        ], 0x0);
      }

      if (sub === 'info') {
        const user = await User.findOne({ discordId }).lean();
        const keyDoc = await getKeyByDiscord(discordId);
        const key = keyDoc ? await Key.findOne({ _id: keyDoc._id }).populate('product').lean() : null;

        return replyV2(interaction, 'Info do ID', [
          `**Discord ID ->** \`${discordId}\``,
          `**Paused ->** \`${Boolean(user?.paused)}\``,
          `**Banned ->** \`${Boolean(user?.banned)}\``,
          user?.banReason ? `**Ban Reason ->** \`${user.banReason}\`` : null,
          `**Key ->** \`${key?.code || 'N/A'}\``,
          key?.product ? `**Produto ->** \`${key.product.name} (${key.product._id})\`` : null,
          key?.productHash ? `**Product Hash ->** \`${key.productHash}\`` : null,
          key?.activatedAt ? `**Ativada em ->** \`${new Date(key.activatedAt).toISOString()}\`` : `**Ativada em ->** \`N/A\``,
          key?.expiresAt
            ? `**Expira ->** \`${new Date(key.expiresAt).toISOString()}\``
            : (key ? `**Status ->** \`PENDENTE (ativa no vínculo)\`` : null),
        ].filter(Boolean), 0x0);
      }

      return replyV2(interaction, 'Erro', ['Subcommand inválido.']);
    } catch (e) {
      logger.error(`[/id] ${e?.stack || e?.message || e}`);
      return replyV2(interaction, 'Erro | /id', ['Ocorreu um erro interno.']);
    }
  },
};
