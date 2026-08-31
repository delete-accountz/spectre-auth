const DISCORD_API_BASE = process.env.DISCORD_API_BASE || 'https://discord.com/api/v10';

function discordAvatarUrl(userId, avatarHash, size = 256) {
  if (!userId || !avatarHash) return null;
  const ext = String(avatarHash).startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${ext}?size=${size}`;
}

async function discordFetch(path) {
  const token = process.env.DISCORD_TOKEN;
  if (!token) throw new Error('DISCORD_TOKEN not set');

  const res = await fetch(`${DISCORD_API_BASE}${path}`, {
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(`Discord API ${res.status}: ${text.slice(0, 200)}`);
  }

  return text ? JSON.parse(text) : {};
}

async function fetchDiscordUser(discordId) {
  return discordFetch(`/users/${discordId}`);
}

module.exports = { fetchDiscordUser, discordAvatarUrl };
