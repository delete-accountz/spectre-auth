const crypto = require('crypto');

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function normalizeProductId(productLike) {
  if (!productLike) return null;
  if (typeof productLike === 'string') return productLike;
  if (productLike._id) return String(productLike._id);
  return String(productLike);
}

function computeProductHash(productId) {
  const salt = String(process.env.PRODUCT_HASH_SALT || process.env.KEY_SCOPE_SALT || '');
  return sha256Hex(`${salt}:product:${String(productId || '')}`);
}

function computeKeyScopeHash({ discordId, licenseKey, productId }) {
  const salt = String(process.env.KEY_SCOPE_SALT || '');
  return sha256Hex(`${salt}:scope:${String(discordId || '')}:${String(licenseKey || '').toUpperCase()}:${String(productId || '')}`);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

function ensureKeyHashes(keyDoc) {
  let changed = false;

  if (!keyDoc.codeHash && keyDoc.code) {
    keyDoc.codeHash = sha256Hex(String(keyDoc.code).toUpperCase());
    changed = true;
  }

  const productId = normalizeProductId(keyDoc.product);
  if (productId && !keyDoc.productHash) {
    keyDoc.productHash = computeProductHash(productId);
    changed = true;
  }

  return changed;
}

function activateKeyOnBind(keyDoc, now = new Date()) {
  let changed = false;

  if (!keyDoc.activatedAt) {
    keyDoc.activatedAt = now;
    changed = true;
  }

  const duration = Number(keyDoc.durationDays);
  if (!keyDoc.expiresAt && Number.isFinite(duration) && duration > 0) {
    keyDoc.expiresAt = addDays(now, Math.trunc(duration));
    changed = true;
  }

  return changed;
}

module.exports = {
  addDays,
  normalizeProductId,
  computeProductHash,
  computeKeyScopeHash,
  ensureKeyHashes,
  activateKeyOnBind,
};
