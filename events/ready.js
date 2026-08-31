const logger = require('../utils/logger');
const { ActivityType } = require('discord.js');

const Key = require('../database/models/Key');
const Product = require('../database/models/Product');

function formatUptime(ms) {
  const total = Math.floor(ms / 1000);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600) % 24;
  const d = Math.floor(total / 86400);

  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    logger.info(`Bot conectado como ${client.user.tag}`);
    logger.info(`Guilds: ${client.guilds.cache.size} | WS Ping: ${client.ws.ping}ms`);

    const stats = {
      keys: 0,
      products: 0,
      lastRefresh: 0,
    };

    async function refreshStats() {
      try {
        const [keys, products] = await Promise.all([
          Key.countDocuments({}),
          Product.countDocuments({}),
        ]);
        stats.keys = keys;
        stats.products = products;
        stats.lastRefresh = Date.now();
      } catch (e) {
        logger.warn(`ready.refreshStats falhou: ${e?.message || e}`);
      }
    }

    await refreshStats();
    setInterval(refreshStats, 120_000);

    const activities = [
      () => ({ name: `Keys: ${stats.keys} | Produtos: ${stats.products}`, type: ActivityType.Watching }),
      () => ({ name: `Ping: ${client.ws.ping}ms`, type: ActivityType.Listening }),
      () => ({ name: `Uptime: ${formatUptime(client.uptime || 0)}`, type: ActivityType.Playing }),
    ];

    let idx = 0;
    function applyActivity() {
      try {
        const a = activities[idx % activities.length]();
        idx++;
        client.user.setActivity(a.name, { type: a.type });
      } catch (e) {
        logger.warn(`ready.applyActivity falhou: ${e?.message || e}`);
      }
    }

    applyActivity();
    setInterval(applyActivity, 15_000);
  },
};
