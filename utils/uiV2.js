// uiV2.js — versão sem discord.js
// v2Card retorna um objeto simples com toJSON() para manter compatibilidade com o api.js

function clampText(s, max = 950) {
  const txt = String(s ?? '').replace(/\u0000/g, '').trim();
  if (!txt) return '—';
  return txt.length > max ? `${txt.slice(0, max)}…` : txt;
}

function v2Card({ title, blocks = [] } = {}) {
  const parts = [];

  if (title) parts.push(`**${clampText(title, 950)}**`);

  for (const b of blocks) {
    if (b) parts.push(clampText(b, 950));
  }

  return {
    toJSON() {
      return {
        type: 'container',
        content: parts.join('\n\n---\n\n'),
      };
    },
  };
}

module.exports = { v2Card };
