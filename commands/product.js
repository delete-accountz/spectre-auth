const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { v2Card } = require('../utils/uiV2');
const Product = require('../database/models/Product');
const Config = require('../database/models/Config');
const Key = require('../database/models/Key');
const logger = require('../utils/logger');

function replyV2(interaction, title, blocks, accentColor) {
  return interaction.editReply({
    components: [v2Card({ title, blocks, accentColor })],
    flags: MessageFlags.IsComponentsV2,
    withComponents: true,
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('produto')
    .setDescription('Gerencia produtos e configs')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sc =>
      sc.setName('criar')
        .setDescription('Cria produto')
        .addStringOption(o => o.setName('nome').setDescription('Nome').setRequired(true))
    )
    .addSubcommand(sc =>
      sc.setName('atualizar')
        .setDescription('Atualiza versão/link do produto')
        .addStringOption(o => o.setName('produto').setDescription('Nome ou ID').setRequired(true).setAutocomplete(true))
        .addStringOption(o => o.setName('versao').setDescription('Ex: 1.0.0').setRequired(true))
        .addStringOption(o => o.setName('link').setDescription('Download link').setRequired(true))
    )
    .addSubcommand(sc =>
      sc.setName('apagar')
        .setDescription('Apaga produto (bloqueia se ainda tem keys)')
        .addStringOption(o => o.setName('produto').setDescription('Nome ou ID').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand(sc =>
      sc.setName('info')
        .setDescription('Info do produto')
        .addStringOption(o => o.setName('produto').setDescription('Nome ou ID').setRequired(true).setAutocomplete(true))
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
        if (v) choices.push({ name: `Criar novo -> ${v}`.slice(0, 100), value: v });
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
        const nome = interaction.options.getString('nome', true).trim().slice(0, 80);
        const p = await Product.findOneAndUpdate(
          { name: nome },
          { $setOnInsert: { name: nome } },
          { upsert: true, new: true },
        );
        return replyV2(interaction, 'Produto criado', [`**Produto ->** \`${p.name}\`\n**ID ->** \`${p._id}\``], 0x0);
      }

      const productInput = interaction.options.getString('produto', true);
      const isMongoId = /^[0-9a-fA-F]{24}$/.test(productInput);
      const product = isMongoId ? await Product.findById(productInput) : await Product.findOne({ name: productInput.trim() });
      if (!product) return replyV2(interaction, 'Erro', ['Produto não encontrado.']);

      if (sub === 'atualizar') {
        const versao = interaction.options.getString('versao', true).slice(0, 40);
        const link = interaction.options.getString('link', true).slice(0, 500);
        try { new URL(link); } catch { return replyV2(interaction, 'Erro', ['Link inválido.']); }

        const cfg = await Config.findOneAndUpdate(
          { product: product._id },
          { product: product._id, version: versao, downloadLink: link },
          { upsert: true, new: true },
        );

        return replyV2(interaction, 'Produto atualizado', [
          `**Produto ->** \`${product.name} (${product._id})\``,
          `**Versão ->** \`${cfg.version}\``,
          `**Link ->** \`${cfg.downloadLink}\``,
        ], 0x0);
      }

      if (sub === 'apagar') {
        const keysCount = await Key.countDocuments({ product: product._id });
        if (keysCount > 0) {
          return replyV2(interaction, 'Bloqueado', [
            `Não posso apagar: ainda existem \`${keysCount}\` keys neste produto.`,
          ], 0x0);
        }

        await Config.deleteOne({ product: product._id });
        await Product.deleteOne({ _id: product._id });

        return replyV2(interaction, 'Produto apagado', [
          `**Produto ->** \`${product.name} (${product._id})\``,
        ], 0x0);
      }

      if (sub === 'info') {
        const [cfg, totalKeys, activeKeys] = await Promise.all([
          Config.findOne({ product: product._id }).lean(),
          Key.countDocuments({ product: product._id }),
          Key.countDocuments({ product: product._id, expiresAt: { $gt: new Date() }, banned: { $ne: true }, paused: { $ne: true } }),
        ]);

        return replyV2(interaction, 'Info do produto', [
          `**Produto _>** \`${product.name} (${product._id})\``,
          `**Keys total ->** \`${totalKeys}\``,
          `**Keys ativas ->** \`${activeKeys}\``,
          `**Versão ->** \`${cfg?.version || 'N/A'}\``,
          `**Download ->** \`${cfg?.downloadLink || 'N/A'}\``,
        ], 0x0);
      }

      return replyV2(interaction, 'Erro', ['Subcommand inválido.']);
    } catch (e) {
      logger.error(`[/produto] ${e?.stack || e?.message || e}`);
      return replyV2(interaction, 'Erro | /produto', ['Ocorreu um erro interno.']);
    }
  },
};
