/**
 * Função para gerar chaves no formato PREFIXO-XXXXXX-XXXXXX-XXX
 * @module utils/generateKey
 */
const { randomInt } = require('crypto');
const Key = require('../database/models/Key');
const { prefixFormat } = require('../config');

function gen(charset, len) {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += charset[randomInt(0, charset.length)];
  }
  return out;
}

async function generateKey(prefix) {
  if (typeof prefix !== 'string') {
    throw new Error('Prefixo inválido');
  }

  const cleanPrefix = prefix.trim().toUpperCase();
  if (!prefixFormat.test(cleanPrefix) || cleanPrefix.length > 20) {
    throw new Error('Prefixo inválido (use apenas letras A-Z, máx 20)');
  }

  const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  let retries = 0;
  const maxRetries = 20;

  while (retries < maxRetries) {
    const code = `${cleanPrefix}-${gen(ALNUM, 6)}-${gen(ALNUM, 6)}-${gen(ALNUM, 3)}`;
    const exists = await Key.exists({ code });
    if (!exists) return code;
    retries++;
  }

  throw new Error('Não foi possível gerar uma chave única após várias tentativas');
}

module.exports = { generateKey };
