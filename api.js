const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const crypto = require('crypto');
const cors = require("cors");
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const Key = require('./database/models/Key');
const Product = require('./database/models/Product');
const Config = require('./database/models/Config');
const User = require('./database/models/User');
const AppSetting = require('./database/models/AppSetting');
const Ticket = require('./database/models/Ticket');
const ConfigUpload = require('./database/models/ConfigUpload');
const Badge = require('./database/models/Badge');
const UserBadge = require('./database/models/UserBadge');
const Account = require("./database/models/Account");
const PortalSession = require("./database/models/PortalSession");
const Order = require("./database/models/Order");
const AdminUser = require('./database/models/AdminUser');
const AdminSession = require('./database/models/AdminSession');

const logger = require('./utils/logger');
const { keyFormat } = require('./config');
const { v2Card } = require('./utils/uiV2');
const ApiLog = require('./database/models/ApiLog');
const HWID_REGEX = /^[A-Za-z0-9:_\-.]{8,256}$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_.\-]{3,40}$/;
// Mantido para o portal (Account model ainda usa discordId opcional)
const DISCORD_ID_REGEX = /^\d{17,19}$/;

const dllPath = path.join(__dirname, 'dlls');

if (!fs.existsSync(dllPath)) {
  fs.mkdirSync(dllPath);
}

// =====================
// Helpers: resposta padrÃ£o
// =====================
function isHex24(id) {
  return /^[0-9a-f]{24}$/i.test(String(id || '').trim());
}

function cleanStr(v, max = 120) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function requireClientAccess(req, res, next) {
  const username = String(req.get('x-username') || '').trim().toLowerCase();
  const licenseKey = String(req.get('x-license-key') || '').trim().toUpperCase();
  const productHash = String(req.get('x-product-hash') || '').trim().toLowerCase();

  if (!USERNAME_REGEX.test(username)) {
    return fail(res, req, 401, 'Unauthorized (username)', 'UNAUTHORIZED');
  }
  if (!licenseKey || licenseKey.length < 10 || licenseKey.length > 80) {
    return fail(res, req, 401, 'Unauthorized (key)', 'UNAUTHORIZED');
  }
  if (!/^[a-f0-9]{64}$/.test(productHash)) {
    return fail(res, req, 401, 'Unauthorized (product)', 'UNAUTHORIZED');
  }

  req.clientAuth = { username, licenseKey, productHash };
  return next();
}

async function loadClientKey(req) {
  const { username, licenseKey, productHash } = req.clientAuth;
  const now = new Date();

  const keyDoc = await Key.findOne({ code: licenseKey }).populate('product').lean();
  if (!keyDoc) return { ok: false, reason: 'not_found' };

  const productId = normalizeProductId(keyDoc.product);
  const expectedProductHash = keyDoc.productHash || (productId ? computeProductHash(productId) : null);
  if (!expectedProductHash || !timingSafeEqual(expectedProductHash, productHash)) {
    return { ok: false, reason: 'product_mismatch', keyDoc };
  }

  if (!keyDoc.expiresAt || new Date(keyDoc.expiresAt) <= now) return { ok: false, reason: 'expired', keyDoc };
  if (keyDoc.banned) return { ok: false, reason: 'banned', keyDoc };
  if (keyDoc.paused) return { ok: false, reason: 'paused', keyDoc };

  if (keyDoc.usedBy && keyDoc.usedBy !== username) return { ok: false, reason: 'user_mismatch', keyDoc };

  if (!keyDoc.usedBy) return { ok: false, reason: 'not_linked', keyDoc };

  return { ok: true, keyDoc };
}

async function requireActiveClient(req, res, next) {
  const { ok: okKey, reason, keyDoc } = await loadClientKey(req);
  if (!okKey) {
    audit({
      level: 'WARN',
      event: 'CLIENT_AUTH_BLOCK',
      req,
      statusCode: 401,
      message: `client auth blocked: ${reason}`,
      meta: {
        usernameMasked: mask(req.clientAuth.username, 2, 0),
        keyMasked: mask(req.clientAuth.licenseKey),
        reason,
      },
    });
    return fail(res, req, 401, 'Unauthorized', 'UNAUTHORIZED', { reason });
  }

  req.clientKey = keyDoc;
  req.clientProduct = keyDoc.product
    ? { id: String(keyDoc.product._id), name: keyDoc.product.name }
    : { id: null, name: null };

  return next();
}

async function ensureClientHasProduct(req, res, next) {
  if (!req.clientProduct?.id) {
    return fail(res, req, 400, 'Product not found on key', 'BAD_REQUEST');
  }
  return next();
}

async function getSetting(key, fallbackValue) {
  const doc = await AppSetting.findOne({ key }).lean();
  return doc?.value ?? fallbackValue;
}

async function setSetting(key, value, updatedBy = 'dashboard') {
  return AppSetting.findOneAndUpdate(
    { key },
    { $set: { value, updatedBy, updatedAt: new Date() } },
    { upsert: true, new: true }
  ).lean();
}


const DEFAULT_CENSOR = String(process.env.DEFAULT_CENSOR || '1') === '1';
const CENSOR_CACHE_TTL_MS = 5000;

let censorCache = { value: DEFAULT_CENSOR, ts: 0 };

function parseBoolLike(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(s)) return false;
  return null;
}

async function getCensorEnabled() {
  const now = Date.now();
  if (now - censorCache.ts < CENSOR_CACHE_TTL_MS) return censorCache.value;

  try {
    const doc = await AppSetting.findOne({ key: 'privacy' }).lean();
    const enabled = doc && typeof doc.value?.censorEnabled === 'boolean'
      ? doc.value.censorEnabled
      : DEFAULT_CENSOR;

    censorCache = { value: enabled, ts: now };
    return enabled;
  } catch {
    censorCache = { value: DEFAULT_CENSOR, ts: now };
    return DEFAULT_CENSOR;
  }
}

async function setCensorEnabled(enabled, updatedBy = null) {
  const v = Boolean(enabled);
  const doc = await AppSetting.findOneAndUpdate(
    { key: 'privacy' },
    { $set: { value: { censorEnabled: v }, updatedBy } },
    { upsert: true, new: true }
  ).lean();

  censorCache = { value: v, ts: Date.now() };
  return doc;
}

function getCensorOverride(req) {
  return parseBoolLike(req.get('x-censor')) ?? parseBoolLike(req.query?.censor);
}

function maskIp(ip) {
  const s = String(ip || '').trim();
  if (!s) return null;

  // IPv4
  const m4 = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m4) return `${m4[1]}.${m4[2]}.***.***`;

  // IPv6
  if (s.includes(':')) {
    const parts = s.split(':').filter(Boolean);
    if (parts.length <= 2) return '****:****';
    return `${parts[0]}:${parts[1]}:****:****`;
  }

  return '***';
}

function outKey(req, raw) {
  if (!raw) return null;
  return req.censorEnabled ? mask(String(raw), 6, 4) : String(raw);
}

function outUsername(req, raw) {
  if (!raw) return null;
  return req.censorEnabled ? mask(String(raw), 2, 0) : String(raw);
}

function outHwid(req, raw) {
  if (!raw) return null;
  return req.censorEnabled ? mask(String(raw), 6, 4) : String(raw);
}

function outUa(req, raw) {
  if (!raw) return null;
  return req.censorEnabled ? '[censored]' : String(raw);
}

function outIp(req, raw) {
  if (!raw) return null;
  return req.censorEnabled ? maskIp(raw) : String(raw);
}

function hoursDiff(a, b) {
  return Math.abs(a.getTime() - b.getTime()) / 36e5;
}

function isMaintenanceOn() {
  return String(process.env.MAINTENANCE_MODE || '0') === '1';
}

function maintenanceMessage() {
  return String(process.env.MAINTENANCE_MESSAGE || 'System in maintenance');
}

function isOwnerReq(_req) {
  // Sem Discord: ownership is handled via API_ADMIN_TOKEN only
  return false;
}



function isoNow() {
  return new Date().toISOString();
}

function ok(res, req, message, data = {}) {
  return res.status(200).json({
    success: true,
    message,
    data,
    requestId: req.requestId,
    timestamp: isoNow(),
  });
}

function fail(res, req, status, message, code = 'ERROR', details) {
  const payload = {
    success: false,
    message,
    error: { code },
    requestId: req.requestId,
    timestamp: isoNow(),
  };
  if (details !== undefined) payload.error.details = details;
  return res.status(status).json(payload);
}

function mask(value, keepStart = 4, keepEnd = 3) {
  if (typeof value !== 'string') return '<invalid>';
  if (value.length <= keepStart + keepEnd) return '***';
  return `${value.slice(0, keepStart)}***${value.slice(-keepEnd)}`;
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function computeProductHash(productId) {
  const salt = String(process.env.PRODUCT_HASH_SALT || process.env.KEY_SCOPE_SALT || '');
  return sha256Hex(`${salt}:product:${String(productId || '')}`);
}

async function ensureProductHash(productDoc) {
  if (!productDoc) return null;
  const productId = normalizeProductId(productDoc);
  if (!productId) return null;

  const currentHash = typeof productDoc.productHash === 'string' ? productDoc.productHash : null;
  if (currentHash && /^[a-f0-9]{64}$/i.test(currentHash)) return currentHash.toLowerCase();

  const nextHash = computeProductHash(productId);
  if (productDoc._id) {
    try {
      await Product.updateOne({ _id: productId }, { $set: { productHash: nextHash } });
    } catch {}
  }

  return nextHash;
}

function computeKeyScopeHash({ username, licenseKey, productId }) {
  const salt = String(process.env.KEY_SCOPE_SALT || '');
  return sha256Hex(`${salt}:scope:${String(username || '')}:${String(licenseKey || '').toUpperCase()}:${String(productId || '')}`);
}

function normalizeProductId(productLike) {
  if (!productLike) return null;
  if (typeof productLike === 'string') return productLike;
  if (productLike._id) return String(productLike._id);
  return String(productLike);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function ensureKeyHashes(keyDoc) {
  let changed = false;

  if (!keyDoc.codeHash) {
    keyDoc.codeHash = sha256Hex(String(keyDoc.code || '').toUpperCase());
    changed = true;
  }

  const productId = normalizeProductId(keyDoc.product);
  if (productId && !keyDoc.productHash) {
    const productHash = typeof keyDoc?.product?.productHash === 'string' && keyDoc.product.productHash
      ? String(keyDoc.product.productHash).toLowerCase()
      : computeProductHash(productId);
    keyDoc.productHash = productHash;
    changed = true;
  }

  return changed;
}

function activateKeyOnBind(keyDoc, now) {
  let changed = false;

  if (!keyDoc.activatedAt) {
    keyDoc.activatedAt = now;
    changed = true;
  }

  const duration = Number(keyDoc.durationDays);
  if (!keyDoc.expiresAt && Number.isFinite(duration) && duration > 0) {
    // Support sub-day durations (hours): multiply days by ms per day
    const ms = Math.round(duration * 24 * 60 * 60 * 1000);
    keyDoc.expiresAt = new Date(now.getTime() + ms);
    changed = true;
  }

  return changed;
}

async function upsertUserProductLink({ username, keyDoc, now }) {
  const productId = normalizeProductId(keyDoc.product);
  if (!username || !productId) return;

  const link = {
    product: productId,
    key: String(keyDoc.code || '').toUpperCase(),
    linkedAt: now,
    expiresAt: keyDoc.expiresAt || null,
    productHash: keyDoc.productHash || computeProductHash(productId),
    keyScopeHash: keyDoc.keyScopeHash || null,
  };

  const user = await User.findOne({ username });
  if (!user) {
    await User.create({ username, key: link.key, linkedAt: now, productLinks: [link] });
    return;
  }

  const links = Array.isArray(user.productLinks) ? [...user.productLinks] : [];
  const idx = links.findIndex((x) => String(x.product) === String(productId));
  if (idx >= 0) {
    const current = typeof links[idx]?.toObject === 'function' ? links[idx].toObject() : links[idx];
    links[idx] = { ...current, ...link };
  } else {
    links.push(link);
  }

  user.key = link.key;
  user.linkedAt = now;
  user.productLinks = links;
  await user.save();
}

async function removeUserProductLink({ username, productId, licenseKey }) {
  if (!username) return;
  const user = await User.findOne({ username });
  if (!user) return;

  const links = Array.isArray(user.productLinks) ? user.productLinks : [];
  const next = links.filter((x) => {
    if (productId && String(x.product) === String(productId)) return false;
    if (licenseKey && String(x.key || '').toUpperCase() === String(licenseKey).toUpperCase()) return false;
    return true;
  });

  user.productLinks = next;
  if (!next.length) {
    user.key = null;
    user.linkedAt = null;
  } else {
    const latest = next.sort((a, b) => new Date(b.linkedAt || 0) - new Date(a.linkedAt || 0))[0];
    user.key = latest?.key || null;
    user.linkedAt = latest?.linkedAt || null;
  }
  await user.save();
}

function computeStoredHwid(incomingHwid) {
  const salt = process.env.HWID_SALT || '';
  return sha256Hex(`${salt}:${incomingHwid}`);
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function getClientIp(req) {
  const ip = req.ip || req.connection?.remoteAddress || '';
  return String(ip).slice(0, 80);
}

// =====================
// Logs via webhook (Discord)
// =====================

const IS_COMPONENTS_V2 = 1 << 15;
const LEVEL_RANK = { INFO: 1, WARN: 2, ERROR: 3 };

async function getWebhookConfig() {
  const fallbackMinLevel = String(process.env.LOG_WEBHOOK_MIN_LEVEL || 'WARN').toUpperCase();
  const cfg = await getSetting('webhooks', {
    enabled: true,
    url: null,
    minLevel: LEVEL_RANK[fallbackMinLevel] ? fallbackMinLevel : 'WARN',
    username: null,
    avatarUrl: null,
    allowSensitive: false,
  });

  const minLevelRaw = String(cfg?.minLevel || fallbackMinLevel || 'WARN').toUpperCase();
  const minLevel = LEVEL_RANK[minLevelRaw] ? minLevelRaw : 'WARN';

  return {
    enabled: cfg?.enabled !== false,
    url: cfg?.url || null,
    minLevel,
    username: cfg?.username || process.env.LOG_WEBHOOK_USERNAME || null,
    avatarUrl: cfg?.avatarUrl || process.env.LOG_WEBHOOK_AVATAR_URL || null,
    allowSensitive: cfg?.allowSensitive === true,
  };
}

function shouldSendWebhook(level, min) {
  return (LEVEL_RANK[level] || 0) >= (LEVEL_RANK[min] || 2);
}

async function isSensitiveEnabled() {
  const cfg = await getWebhookConfig();
  const allowSetting = cfg.allowSensitive === true;

  const allowEnv = String(process.env.LOG_WEBHOOK_SENSITIVE || '0') === '1';
  const allow = allowSetting || allowEnv;

  const censorEnabled = await getCensorEnabled();
  return allow && !censorEnabled;
}


function accentForLevel(level) {
  if (level === 'ERROR') return 0x0;
  if (level === 'WARN') return 0x0;
  return 0x0;
}

function safeInline(v, max = 180) {
  const s = String(v ?? 'N/A')
    .replace(/`/g, 'Â´')      
    .replace(/\n/g, ' ')
    .replace(/\r/g, ' ')
    .trim();
  return s.length > max ? s.slice(0, max) + 'â€¦' : s;
}

function safeBlock(v, max = 900) {
  const s = String(v ?? '')
    .replace(/\u0000/g, '')
    .trim();
  return s.length > max ? s.slice(0, max) + '\nâ€¦(truncado)' : s;
}

function addQueryParam(url, key, value) {
  try {
    const u = new URL(url);
    if (!u.searchParams.has(key)) u.searchParams.set(key, value);
    return u.toString();
  } catch {

    if (url.includes('?')) return `${url}&${key}=${encodeURIComponent(value)}`;
    return `${url}?${key}=${encodeURIComponent(value)}`;
  }
}

async function webhookSendV2({ title, blocks, level, cfg }) {
  const localCfg = cfg || await getWebhookConfig();
  if (!localCfg.enabled || !localCfg.url) return;
  const url = localCfg.url;
  if (!url) return;

  const finalUrl = addQueryParam(url, 'with_components', 'true');

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 2500);

  try {
    const container = v2Card({
      title,
      blocks,
      accentColor: accentForLevel(level),
    });

    const payload = {
      flags: IS_COMPONENTS_V2,
      components: [container.toJSON()],
    };

    const username = localCfg.username;
    const avatar = localCfg.avatarUrl;
    if (username) payload.username = username;
    if (avatar) payload.avatar_url = avatar;

    await fetch(finalUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(payload),
    });
  } catch (e) {
    logger.warn(`[WEBHOOK_V2] falhou: ${e?.message || e}`);
  } finally {
    clearTimeout(t);
  }
}

function buildAdminLogBlocks({ level, event, base, message, meta, sensitive }) {
  const discordValue =
    (sensitive && (meta.discordIdRaw || base.discordIdRaw)) ||
    meta.discordIdMasked ||
    base.discordIdMasked ||
    null;

  const keyValue =
    (sensitive && (meta.keyRaw || base.keyRaw)) ||
    meta.keyMasked ||
    base.keyMasked ||
    null;

  const hwidValue =
    (sensitive && (meta.hwidRaw || base.hwidRaw)) ||
    meta.hwidMasked ||
    base.hwidMasked ||
    null;

  const linesResumo = [
    `**Evento ->** \`${safeInline(event, 80)}\``,
    `**Status ->** \`${safeInline(base.statusCode)}\` | **LatÃªncia:** \`${safeInline(Math.round(base.latencyMs || 0))}ms\``,
    `**Mensagem ->** ${safeInline(message, 260)}`,
  ];

  if (meta.reason) linesResumo.push(`**Reason ->** \`${safeInline(meta.reason, 120)}\``);

  const blocks = [];

  blocks.push(linesResumo.join('\n'));

  blocks.push(
    [
      `**Request Information**`,
      `ReqId -> \`${safeInline(base.requestId, 80)}\``,
      `Route -> \`${safeInline(base.method)} ${safeInline(base.route, 120)}\``,
      `IP -> \`${safeInline(base.ip, 80)}\``,
      `UA -> \`${safeInline(base.ua, 160)}\``,
    ].join('\n'),
  );

  if (discordValue || keyValue || hwidValue) {
    blocks.push(
      [
        `**Auth Information**`,
        discordValue ? `Discord -> \`${safeInline(discordValue, 80)}\`` : null,
        keyValue ? `Key -> \`${safeInline(keyValue, 120)}\`` : null,
        hwidValue ? `HwiD -> \`${safeInline(hwidValue, 140)}\`` : null,
      ].filter(Boolean).join('\n'),
    );
  }

  const clientObj = meta.client || base.client;
  if (clientObj && typeof clientObj === 'object') {
    blocks.push(
      [
        `**Client Information**`,
        `Name -> \`${safeInline(clientObj.name, 40)}\``,
        `Version -> \`${safeInline(clientObj.version, 40)}\``,
        `Platform -> \`${safeInline(clientObj.platform, 20)}\``,
      ].join('\n'),
    );
  }

  if (level === 'ERROR' && (meta.stack || base.stack)) {
    blocks.push(
      `**Stack**\n\`\`\`\n${safeBlock(meta.stack || base.stack, 900)}\n\`\`\``
    );
  }

  return blocks;
}

async function sendAdminWebhookLog({ level, event, base, message, meta }) {
  const cfg = await getWebhookConfig();
  if (!cfg.enabled || !cfg.url) return;
  if (!shouldSendWebhook(level, cfg.minLevel)) return;

  const sensitive = await isSensitiveEnabled();
  const title = `Safety API | ${level} | ${event}`;
  const blocks = buildAdminLogBlocks({ level, event, base, message, meta, sensitive });

  setImmediate(() => webhookSendV2({ title, blocks, level, cfg }));
}



function audit({ level = 'INFO', event, req, statusCode, message, meta = {} }) {
  const ip = getClientIp(req);
  const ua = String(req.get('user-agent') || '').slice(0, 180);
  const b = req?.body && typeof req.body === 'object' ? req.body : {};
  const latencyNow =
  typeof req._startAt === 'bigint'
    ? Number(process.hrtime.bigint() - req._startAt) / 1e6
    : null;
 const metaSafe = { ...meta };

  const base = {
    requestId: req.requestId,
    event,
    route: req.originalUrl,
    method: req.method,
    statusCode,
    ip,
    ua,
    latencyMs: req.latencyMs ?? latencyNow ?? null,
     ...metaSafe,
  };

  const line = `[${event}] ${message} | reqId=${req.requestId} ip=${ip} status=${statusCode}`;
  if (level === 'ERROR') logger.error(line);
  else if (level === 'WARN') logger.warn(line);
  else logger.info(line);

  if (level !== 'INFO') {
    const lines = [
      `\`reqId\`: \`${base.requestId}\``,
      `\`route\`: \`${base.method} ${base.route}\``,
      `\`status\`: \`${base.statusCode}\``,
      `\`ip\`: \`${base.ip}\``,
      `\`ua\`: \`${base.ua}\``,
    ];

     if (!metaSafe.keyRaw && typeof b.licenseKey === 'string') metaSafe.keyRaw = b.licenseKey;
     if (!metaSafe.discordIdRaw && typeof b.discordId === 'string') metaSafe.discordIdRaw = b.discordId;
     if (!metaSafe.hwidRaw && typeof b.hwid === 'string') metaSafe.hwidRaw = b.hwid;
     if (!metaSafe.keyMasked && metaSafe.keyRaw) metaSafe.keyMasked = mask(metaSafe.keyRaw);
     if (!metaSafe.discordIdMasked && metaSafe.discordIdRaw) metaSafe.discordIdMasked = mask(metaSafe.discordIdRaw, 4, 2);
     if (!metaSafe.hwidMasked && metaSafe.hwidRaw) metaSafe.hwidMasked = mask(metaSafe.hwidRaw, 6, 4);

     sendAdminWebhookLog({
    level,
    event,
    base,
    message,
      meta: metaSafe,
  });

// ================
// PersistÃªncia no Mongo (Audit Log)
// ================

  setImmediate(async () => {
    try {
      await ApiLog.create({
        requestId: base.requestId,
        level,
        event,
        route: base.route,
        method: base.method,
        statusCode: base.statusCode,
        latencyMs: base.latencyMs,

        ip: base.ip,
        userAgent: base.ua,

        keyMasked: metaSafe.keyMasked || null,
        hwidMasked: metaSafe.hwidMasked || null,
        discordIdMasked: metaSafe.discordIdMasked || null,

        message,
        meta: metaSafe || {},
      });
    } catch (e) {
      logger.warn(`[AUDIT_DB] falhou: ${e?.message || e}`);
    }
  });
  }
}

// =====================
// Middlewares
// =====================

function requestContext(req, res, next) {
  req.requestId = crypto.randomUUID();
  res.setHeader('x-request-id', req.requestId);

  req._startAt = process.hrtime.bigint();

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    req.latencyMs = Number(end - req._startAt) / 1e6;
  });

  next();
}

async function attachCensorMode(req, res, next) {
  req.censorEnabled = await getCensorEnabled();

  const ov = getCensorOverride(req);
  if (ov !== null && isAdminAuthed(req)) req.censorEnabled = ov;

  res.setHeader('x-censor-enabled', req.censorEnabled ? '1' : '0');
  return next();
}

function validateLoginBody(req, res, next) {
  const body = req.body ?? {};

  const licenseKey = body.licenseKey;
  const hwid = body.hwid;
  const productHash = body.productHash;

  if (
    typeof licenseKey !== 'string' ||
    typeof hwid !== 'string' ||
    typeof productHash !== 'string'
  ) {
    return fail(res, req, 400, 'Invalid parameters', 'BAD_REQUEST');
  }

  const cleanKey = licenseKey.trim().toUpperCase();
  const cleanHwid = hwid.trim();
  const cleanProductHash = productHash.trim().toLowerCase();

  if (cleanKey.length < 10 || cleanKey.length > 80 || !/^[A-Z0-9-]+$/.test(cleanKey)) {
    return fail(res, req, 400, 'Invalid licenseKey', 'INVALID_KEY');
  }
  if (!HWID_REGEX.test(cleanHwid)) {
    return fail(res, req, 400, 'Invalid hwid', 'INVALID_HWID');
  }
  if (!/^[a-f0-9]{64}$/.test(cleanProductHash)) {
    return fail(res, req, 400, 'Invalid productHash', 'INVALID_PRODUCT_HASH');
  }
  if (keyFormat && !keyFormat.test(cleanKey)) {
    return fail(res, req, 400, 'Invalid licenseKey format', 'INVALID_KEY_FORMAT');
  }

  let client = null;
  if (body.client && typeof body.client === 'object') {
    const name = typeof body.client.name === 'string' ? body.client.name.slice(0, 40) : null;
    const version = typeof body.client.version === 'string' ? body.client.version.slice(0, 40) : null;
    const platform = typeof body.client.platform === 'string' ? body.client.platform.slice(0, 20) : null;
    client = { name, version, platform };
  }

  req.body = {
    licenseKey: cleanKey,
    hwid: cleanHwid,
    productHash: cleanProductHash,
    client,
  };

  return next();
}
function safeTokenEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function getAdminTokenFromReq(req) {
  const auth = req.get('authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : null;
  return bearer || req.get('x-api-token') || null;
}

function isAdminAuthed(req) {
  const required = process.env.API_ADMIN_TOKEN;
  if (!required) return false;
  const token = getAdminTokenFromReq(req);
  return token ? safeTokenEqual(token, required) : false;
}

const ROLE_PERMISSIONS = {
  OWNER: ['*'],
  SUPER_ADMIN: [
    'overview.read', 'system.read', 'logs.read',
    'keys.manage', 'users.manage', 'products.manage', 'settings.manage',
    'tickets.manage', 'configs.manage', 'badges.manage',
  ],
  ADMIN: ['overview.read', 'system.read', 'logs.read', 'keys.manage', 'users.manage', 'products.manage', 'tickets.manage', 'configs.manage'],
  SUPPORT: ['overview.read', 'logs.read', 'users.manage', 'tickets.manage'],
  VIEWER: ['overview.read', 'system.read', 'logs.read'],
};

function normalizeUsername(v) {
  return String(v || '').trim().toLowerCase();
}

const PORTAL_COOKIE = process.env.PORTAL_COOKIE_NAME || "portal_session";
const PORTAL_COOKIE_DOMAIN = process.env.PORTAL_COOKIE_DOMAIN || undefined;
const PORTAL_COOKIE_SECURE = String(process.env.PORTAL_COOKIE_SECURE ?? "1") === "1";
const PORTAL_COOKIE_SAMESITE_RAW = String(process.env.PORTAL_COOKIE_SAMESITE || "none").toLowerCase();
const PORTAL_COOKIE_SAMESITE = ['none', 'lax', 'strict'].includes(PORTAL_COOKIE_SAMESITE_RAW)
  ? PORTAL_COOKIE_SAMESITE_RAW
  : 'lax';
const PORTAL_SESSION_HOURS_RAW = Number(process.env.PORTAL_SESSION_HOURS || 24 * 7);
const PORTAL_SESSION_HOURS = Number.isFinite(PORTAL_SESSION_HOURS_RAW) && PORTAL_SESSION_HOURS_RAW > 0
  ? PORTAL_SESSION_HOURS_RAW
  : (24 * 7);
const ADMIN_COOKIE = process.env.ADMIN_COOKIE_NAME || "admin_session";
const ADMIN_SESSION_HOURS_RAW = Number(process.env.ADMIN_SESSION_HOURS || 12);
const ADMIN_SESSION_HOURS = Number.isFinite(ADMIN_SESSION_HOURS_RAW) && ADMIN_SESSION_HOURS_RAW > 0
  ? ADMIN_SESSION_HOURS_RAW
  : 12;

function sanitizeCookieDomain(value) {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  if (raw.includes('://') || raw.includes('/') || /\s/.test(raw)) return undefined;

  const hasLeadingDot = raw.startsWith('.');
  const core = hasLeadingDot ? raw.slice(1) : raw;

  if (!core || !core.includes('.')) return undefined;
  if (!/^[a-z0-9.-]+$/i.test(core)) return undefined;
  if (core.startsWith('.') || core.endsWith('.')) return undefined;

  return hasLeadingDot ? `.${core}` : core;
}

const SAFE_COOKIE_DOMAIN = sanitizeCookieDomain(PORTAL_COOKIE_DOMAIN);

function parseCookies(req) {
  const h = String(req?.headers?.cookie || "");
  const out = {};
  h.split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i === -1) return;
    const k = p.slice(0, i).trim();
    const v = p.slice(i + 1).trim();
    if (!k) return;
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function makeCsrfToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function hashPassword(password) {
  const pass = String(password || "");
  const salt = crypto.randomBytes(16);
  const N = 16384;
  const r = 8;
  const p = 1;
  const keyLen = 64;
  const derived = crypto.scryptSync(pass, salt, keyLen, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

function verifyPassword(password, stored) {
  try {
    const parts = String(stored || "").split("$");
    if (parts.length !== 6) return false;
    const [alg, N, r, p, saltB64, hashB64] = parts;
    if (alg !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const derived = crypto.scryptSync(String(password || ""), salt, expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
    return crypto.timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

function adminHasPermission(auth, permission) {
  if (!permission) return true;
  if (!auth) return false;
  if (auth.isOwner) return true;
  const perms = Array.isArray(auth.permissions) ? auth.permissions : [];
  return perms.includes('*') || perms.includes(permission);
}

function getAdminRoutePermission(req) {
  const path = String(req.path || '');

  if (path.startsWith('/v1/admin/owner/')) return 'owner.manage';
  if (path === '/v1/admin/overview') return 'overview.read';
  if (path === '/v1/admin/system/status') return 'system.read';
  if (path.startsWith('/v1/admin/audit-logs')) return 'logs.read';
  if (path.startsWith('/v1/admin/settings/')) return 'settings.manage';
  if (path.startsWith('/v1/admin/maintenance')) return 'settings.manage';
  if (path.startsWith('/v1/admin/products')) return 'products.manage';
  if (path.startsWith('/v1/admin/keys') || path.startsWith('/v1/admin/key') || path.startsWith('/v1/admin/actives')) return 'keys.manage';
  if (path.startsWith('/v1/admin/users')) return 'users.manage';
  if (path.startsWith('/v1/admin/tickets')) return 'tickets.manage';
  if (path.startsWith('/v1/admin/configs')) return 'configs.manage';
  if (path.startsWith('/v1/admin/badges')) return 'badges.manage';
  return null;
}

async function loadAdminSession(req) {
  const cookies = parseCookies(req);
  const token = cookies[ADMIN_COOKIE];
  if (!token) return null;

  const session = await AdminSession.findOne({
    tokenHash: sha256Hex(token),
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  }).populate('admin');

  if (!session || !session.admin) return null;
  if (session.admin.status !== 'ACTIVE') return null;
  if (session.admin.lockedUntil && session.admin.lockedUntil > new Date()) return null;

  AdminSession.updateOne({ _id: session._id }, { $set: { lastSeenAt: new Date() } }).catch(() => {});

  const rolePerms = ROLE_PERMISSIONS[session.admin.role] || [];
  const directPerms = Array.isArray(session.admin.permissions) ? session.admin.permissions : [];
  const merged = [...new Set([...rolePerms, ...directPerms])];

  return {
    type: 'session',
    session,
    admin: session.admin,
    isOwner: session.admin.role === 'OWNER',
    permissions: merged,
  };
}

function setAdminSessionCookie(res, token) {
  const cookieOptions = {
    httpOnly: true,
    secure: PORTAL_COOKIE_SECURE,
    sameSite: PORTAL_COOKIE_SAMESITE,
    path: '/',
    maxAge: ADMIN_SESSION_HOURS * 60 * 60 * 1000,
  };

  if (SAFE_COOKIE_DOMAIN) {
    cookieOptions.domain = SAFE_COOKIE_DOMAIN;
  }

  res.cookie(ADMIN_COOKIE, token, cookieOptions);
}

async function createAdminSession(res, req, adminId) {
  const sessionHours = Number.isFinite(ADMIN_SESSION_HOURS) && ADMIN_SESSION_HOURS > 0 ? ADMIN_SESSION_HOURS : 12;
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = sha256Hex(token);
  const csrfToken = makeCsrfToken();
  const expiresAt = new Date(Date.now() + sessionHours * 60 * 60 * 1000);

  await AdminSession.create({
    admin: adminId,
    tokenHash,
    csrfToken,
    ip: getClientIp(req),
    ua: String(req.headers['user-agent'] || '').slice(0, 240),
    lastSeenAt: new Date(),
    expiresAt,
  });

  setAdminSessionCookie(res, token);
  return { csrfToken, expiresAt };
}

async function clearAdminSession(res, req) {
  const cookies = parseCookies(req);
  const token = cookies[ADMIN_COOKIE];
  if (token) {
    await AdminSession.updateOne({ tokenHash: sha256Hex(token), revokedAt: null }, { $set: { revokedAt: new Date() } }).catch(() => {});
  }
  res.clearCookie(ADMIN_COOKIE, {
    httpOnly: true,
    secure: PORTAL_COOKIE_SECURE,
    sameSite: PORTAL_COOKIE_SAMESITE,
    domain: SAFE_COOKIE_DOMAIN,
    path: '/',
  });
}

function requireOwnerToken(req, res, next) {
  const required = process.env.API_ADMIN_TOKEN;
  if (!required) return fail(res, req, 503, 'Owner token not configured', 'MISCONFIG');

  const token = getAdminTokenFromReq(req);
  if (!token || !safeTokenEqual(token, required)) return fail(res, req, 401, 'Unauthorized', 'UNAUTHORIZED');

  req.adminAuth = { type: 'owner-token', isOwner: true, permissions: ['*'], admin: null };
  return next();
}

const ADMIN_ROLE_VALUES = ['OWNER', 'SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'VIEWER'];

function normalizePermissions(input) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map((p) => String(p || '').trim()).filter(Boolean))];
}

function requireAdminToken(req, res, next) {
  const required = process.env.API_ADMIN_TOKEN;

  (async () => {
    const token = getAdminTokenFromReq(req);
    if (token) {
      if (!required || !safeTokenEqual(token, required)) return fail(res, req, 401, 'Unauthorized', 'UNAUTHORIZED');
      req.adminAuth = { type: 'owner-token', isOwner: true, permissions: ['*'], admin: null };
      return next();
    }

    const auth = await loadAdminSession(req);
    if (!auth) return fail(res, req, 401, 'Unauthorized', 'UNAUTHORIZED');

    const m = String(req.method || '').toUpperCase();
    if (m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS') {
      const csrf = String(req.headers['x-admin-csrf'] || req.headers['x-csrf-token'] || '');
      if (!csrf || csrf !== auth.session.csrfToken) {
        return fail(res, req, 403, 'CSRF invÃ¡lido.', 'ADMIN_CSRF');
      }
    }

    const permission = getAdminRoutePermission(req);
    if (permission === 'owner.manage' && !auth.isOwner) return fail(res, req, 403, 'Forbidden (owner only)', 'FORBIDDEN');
    if (permission && !adminHasPermission(auth, permission)) return fail(res, req, 403, 'Forbidden (permission)', 'FORBIDDEN');

    req.adminAuth = auth;
    return next();
  })().catch((e) => {
    audit({ level: 'ERROR', event: 'ADMIN_AUTH_ERROR', req, statusCode: 500, message: e?.message || 'admin auth error' });
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  });
}

function getSessionAdminId(req) {
  return req?.adminAuth?.admin?._id ? String(req.adminAuth.admin._id) : null;
}

function isOwnerAdmin(req) {
  return Boolean(req?.adminAuth?.isOwner);
}

async function getOwnedProductIds(req) {
  if (isOwnerAdmin(req)) return null;
  const adminId = getSessionAdminId(req);
  if (!adminId) return [];
  const rows = await Product.find({ createdByAdmin: adminId }).select('_id').lean();
  return rows.map((p) => String(p._id));
}

async function getKeyAdminScopeClause(req) {
  if (isOwnerAdmin(req)) return {};
  const adminId = getSessionAdminId(req);
  if (!adminId) return { _id: { $in: [] } };
  const ownedProductIds = await getOwnedProductIds(req);
  return {
    $or: [
      { product: { $in: ownedProductIds } },
      { createdByAdmin: adminId },
    ],
  };
}

async function findScopedKeyByCode(req, code) {
  const scope = await getKeyAdminScopeClause(req);
  return Key.findOne({ code, ...scope });
}

function filterUserProductLinksByIds(userDoc, allowedProductIds) {
  const set = new Set((allowedProductIds || []).map((id) => String(id)));
  const links = Array.isArray(userDoc?.productLinks) ? userDoc.productLinks : [];
  return links.filter((l) => l?.product && set.has(String(l.product)));
}

function makeQueryWritable(req, res, next) {
  try {
    const q = (req.query && typeof req.query === "object") ? req.query : {};
    Object.defineProperty(req, "query", {
      value: { ...q },          // âœ…
      writable: true,
      configurable: true,
      enumerable: true,
    });
  } catch {}
  next();
}


// =====================
// App
// =====================

function createApiApp() {
  const app = express();

  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

  // ✅ CORREÇÃO: Lê do .env ou usa o fallback COM o hífen na URL da Vercel
  const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS 
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(s => s.trim()) 
    : [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "https://spectre-auth.vercel.app",
      "https://spectre-auth-git-main-delete-accountz.vercel.app",
      "https://spectre-auth-7mwa068gw-delete-accountz.vercel.app",
      "https://safetyapi-zeta.vercel.app"
      ];

  app.use(
    cors({
      origin: function(origin, callback) {
        // Permite requisições sem origin (como apps mobile ou ferramentas como Postman)
        if (!origin) return callback(null, true);
        
        // Verifica se a origem está na lista permitida
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        
        return callback(new Error("Not allowed by CORS: " + origin));
      },
      credentials: true, // ✅ Essencial para enviar cookies entre domínios diferentes
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "x-username",
        "x-license-key",
        "x-product-hash",
        "x-api-token",
        "x-admin-csrf",
        "x-censor",
        "x-csrf-token"
      ],
      exposedHeaders: ["x-request-id", "x-censor-enabled"],
      maxAge: 86400,
    })
  );

  app.disable('x-powered-by');
  app.use(requestContext);
  app.use(attachCensorMode);
  app.use(helmet());
  app.use(express.json({ limit: '10kb', strict: true }));
  app.use(makeQueryWritable); 
  app.use(mongoSanitize({ replaceWith: '_' }));
  app.use(hpp());

 app.use(async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isMaintenanceOn()) return next();
  if (isAdminAuthed(req)) return next();

  try {
    const adminAuth = await loadAdminSession(req);
    if (adminAuth) return next();
  } catch {}

  const p = req.path || '';
  if (p === '/v1/health' || p === '/status' || p === '/') return next();

  audit({
    level: 'WARN',
    event: 'MAINTENANCE_BLOCK',
    req,
    statusCode: 503,
    message: 'Blocked by maintenance mode',
    meta: { reason: 'maintenance' },
  });

  return fail(res, req, 503, maintenanceMessage(), 'MAINTENANCE');
});

  app.get('/status', (req, res) => ok(res, req, 'OK', { ok: true }));
  app.get('/v1/health', (req, res) => {
    return ok(res, req, 'OK', {
      ok: true,
      service: 'auth-api',
      time: isoNow(),
    });
  });

  const clientLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
});

  const adminLoginLimiter = rateLimit({
    windowMs: 10 * 60_000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => getClientIp(req),
    handler: (_req, res) => res.status(429).json({ success: false, message: 'Muitas tentativas. Tente novamente em alguns minutos.' }),
  });

const PORTAL_COOKIE = process.env.PORTAL_COOKIE_NAME || "portal_session";
const PORTAL_COOKIE_DOMAIN = process.env.PORTAL_COOKIE_DOMAIN || undefined; // ex: ".sua-domain.com"
const PORTAL_COOKIE_SECURE = String(process.env.PORTAL_COOKIE_SECURE ?? "1") === "1"; // 1 em produÃ§Ã£o
const PORTAL_COOKIE_SAMESITE_RAW = String(process.env.PORTAL_COOKIE_SAMESITE || "none").toLowerCase(); // none|lax|strict
const PORTAL_COOKIE_SAMESITE = ['none', 'lax', 'strict'].includes(PORTAL_COOKIE_SAMESITE_RAW)
  ? PORTAL_COOKIE_SAMESITE_RAW
  : 'lax';
const PORTAL_SESSION_HOURS_RAW = Number(process.env.PORTAL_SESSION_HOURS || 24 * 7); // 7 dias
const PORTAL_SESSION_HOURS = Number.isFinite(PORTAL_SESSION_HOURS_RAW) && PORTAL_SESSION_HOURS_RAW > 0
  ? PORTAL_SESSION_HOURS_RAW
  : (24 * 7);
const ADMIN_COOKIE = process.env.ADMIN_COOKIE_NAME || "admin_session";
const ADMIN_SESSION_HOURS_RAW = Number(process.env.ADMIN_SESSION_HOURS || 12);
const ADMIN_SESSION_HOURS = Number.isFinite(ADMIN_SESSION_HOURS_RAW) && ADMIN_SESSION_HOURS_RAW > 0
  ? ADMIN_SESSION_HOURS_RAW
  : 12;

function sanitizeCookieDomain(value) {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  if (raw.includes('://') || raw.includes('/') || /\s/.test(raw)) return undefined;

  const hasLeadingDot = raw.startsWith('.');
  const core = hasLeadingDot ? raw.slice(1) : raw;

  if (!core || !core.includes('.')) return undefined;
  if (!/^[a-z0-9.-]+$/i.test(core)) return undefined;
  if (core.startsWith('.') || core.endsWith('.')) return undefined;

  return hasLeadingDot ? `.${core}` : core;
}

const SAFE_COOKIE_DOMAIN = sanitizeCookieDomain(PORTAL_COOKIE_DOMAIN);

function parseCookies(req) {
  const h = String(req.headers.cookie || "");
  const out = {};
  h.split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i === -1) return;
    const k = p.slice(0, i).trim();
    const v = p.slice(i + 1).trim();
    if (!k) return;
    out[k] = decodeURIComponent(v);
  });
  return out;
}


function sha256Hex(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex");
}

function makeCsrfToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function hashPassword(password) {
  const pass = String(password || "");
  const salt = crypto.randomBytes(16);
  const N = 16384; // custo
  const r = 8;
  const p = 1;
  const keyLen = 64;
  const derived = crypto.scryptSync(pass, salt, keyLen, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

function verifyPassword(password, stored) {
  try {
    const parts = String(stored || "").split("$");
    if (parts.length !== 6) return false;
    const [alg, N, r, p, saltB64, hashB64] = parts;
    if (alg !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const derived = crypto.scryptSync(String(password || ""), salt, expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
    return crypto.timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

async function createPortalSession(res, req, accountId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = sha256Hex(token);
  const csrfToken = makeCsrfToken();
  const expiresAt = new Date(Date.now() + PORTAL_SESSION_HOURS * 60 * 60 * 1000);

  await PortalSession.create({
    account: accountId,
    tokenHash,
    csrfToken,
    ip: getClientIp(req),
    ua: String(req.headers["user-agent"] || "").slice(0, 240),
    lastSeenAt: new Date(),
    expiresAt,
  });

  res.cookie(PORTAL_COOKIE, token, {
    httpOnly: true,
    secure: PORTAL_COOKIE_SECURE,
    sameSite: PORTAL_COOKIE_SAMESITE, // "none" se frontend e api sÃ£o domÃ­nios diferentes
    domain: SAFE_COOKIE_DOMAIN,
    path: "/",
    maxAge: PORTAL_SESSION_HOURS * 60 * 60 * 1000,
  });

  // CSRF vai no JSON (frontend guarda e manda em x-csrf-token)
  return { csrfToken };
}

async function clearPortalSession(res, req) {
  const cookies = parseCookies(req);
  const token = cookies[PORTAL_COOKIE];
  if (token) {
    await PortalSession.updateOne({ tokenHash: sha256Hex(token), revokedAt: null }, { $set: { revokedAt: new Date() } }).catch(() => {});
  }
  res.cookie(PORTAL_COOKIE, "", {
    httpOnly: true,
    secure: PORTAL_COOKIE_SECURE,
    sameSite: PORTAL_COOKIE_SAMESITE,
    domain: SAFE_COOKIE_DOMAIN,
    path: "/",
    maxAge: 0,
  });
}

async function loadPortalAuth(req, _res, next) {
  try {
    const cookies = parseCookies(req);
    const token = cookies[PORTAL_COOKIE];

    if (!token) return next();

    const tokenHash = sha256Hex(token);
    const session = await PortalSession.findOne({
      tokenHash,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    }).populate("account");

    if (!session || !session.account) return next();

    req.portalSession = session;
    req.portalAccount = session.account;

    // atualiza lastSeen sem travar request
    PortalSession.updateOne({ _id: session._id }, { $set: { lastSeenAt: new Date() } }).catch(() => {});

    return next();
  } catch (e) {
    return next();
  }
}

function requirePortalAuth(req, res, next) {
  if (!req.portalAccount) return fail(res, req, 401, "FaÃ§a login para continuar.", "PORTAL_UNAUTH");
  if (req.portalAccount.status !== "ACTIVE")
    return fail(res, req, 403, "Conta bloqueada.", "PORTAL_BANNED");
  return next();
}

function requireCsrf(req, res, next) {
  const m = String(req.method || "").toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return next();
  const token = String(req.headers["x-csrf-token"] || "");
  if (!token || !req.portalSession || token !== req.portalSession.csrfToken) {
    return fail(res, req, 403, "CSRF invÃ¡lido.", "PORTAL_CSRF");
  }
  return next();
}

async function getPortalEntitlements(account) {
  const now = new Date();

  const keyIds = (account.linkedKeys || []).map((x) => String(x));
  const query = { paused: false, banned: false, expiresAt: { $gt: now } };

  const keysByDiscord = account.discordId
    ? await Key.find({ ...query, usedBy: account.discordId }).populate("product").lean()
    : [];

  const keysByLink = keyIds.length
    ? await Key.find({ ...query, _id: { $in: keyIds } }).populate("product").lean()
    : [];

  const map = new Map();
  for (const k of [...keysByDiscord, ...keysByLink]) map.set(String(k._id), k);

  const keys = [...map.values()].map((k) => ({
    id: String(k._id),
    codeMasked: mask(k.code),
    productId: k.product?._id ? String(k.product._id) : null,
    productName: k.product?.name || "Produto",
    expiresAt: k.expiresAt,
  }));

  const activeProductIds = [...new Set(keys.map((k) => k.productId).filter(Boolean))];
  return { keys, activeProductIds, hasActive: keys.length > 0 };
}

const portalLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
});
app.use("/v1/portal", portalLimiter);

const portalAuthLimiter = rateLimit({
  windowMs: 60_000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
});
app.use(loadPortalAuth);


  app.get('/v1/dll/:version', (req, res) => {
  const version = req.params.version.toLowerCase();
  const fileName = version === 'rage' ? 'rage.dll' : 'safe.dll';
  const filePath = path.join(dllPath, fileName);

  if (fs.existsSync(filePath)) {
    res.download(filePath, fileName); // ForÃ§a download com nome correto
  } else {
    res.status(404).send('DLL nÃ£o encontrado');
  }
});

// ---------- Auth ----------
app.post("/v1/portal/auth/register", portalAuthLimiter, async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const discordId = cleanStr(req.body?.discordId, 32);
    const licenseKey = cleanStr(req.body?.licenseKey, 80);

    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(email)) {
      return fail(res, req, 400, "Email invÃ¡lido.", "PORTAL_EMAIL");
    }
    if (!password || password.length < 8 || password.length > 72) {
      return fail(res, req, 400, "Senha deve ter entre 8 e 72 caracteres.", "PORTAL_PASSWORD");
    }
    if (discordId && !DISCORD_ID_REGEX.test(discordId)) {
      return fail(res, req, 400, "Discord ID invÃ¡lido.", "PORTAL_DISCORD");
    }

    const exists = await Account.findOne({ email }).lean();
    if (exists) return fail(res, req, 409, "Email jÃ¡ cadastrado.", "PORTAL_EMAIL_EXISTS");

    if (discordId) {
      const used = await Account.findOne({ discordId }).lean();
      if (used) return fail(res, req, 409, "Esse Discord jÃ¡ estÃ¡ vinculado a outra conta.", "PORTAL_DISCORD_USED");
    }

    const account = await Account.create({
      email,
      passwordHash: hashPassword(password),
      discordId: discordId || null,
      profile: { displayName: "", avatarUrl: "", bannerUrl: "" },
      linkedKeys: [],
      status: "ACTIVE",
      lastLoginAt: new Date(),
    });

    // opcional: vincular license na criaÃ§Ã£o (somente se tiver discord ligado)
    if (licenseKey) {
      if (!account.discordId) {
        // por seguranÃ§a: sem discord, nÃ£o permito "claim" de license no registro
        await Account.deleteOne({ _id: account._id }).catch(() => {});
        return fail(res, req, 400, "Para vincular license no registro, primeiro vincule seu Discord.", "PORTAL_LICENSE_NEEDS_DISCORD");
      }

      const keyDoc = await Key.findOne({ code: String(licenseKey).trim().toUpperCase() });
      if (!keyDoc) {
        await Account.deleteOne({ _id: account._id }).catch(() => {});
        return fail(res, req, 404, "License nÃ£o encontrada.", "PORTAL_LICENSE_NOT_FOUND");
      }

      // se a key ainda nÃ£o estÃ¡ atribuÃ­da, atribui ao discord do dono
      if (!keyDoc.usedBy) {
        keyDoc.usedBy = account.discordId;
        const bindNow = new Date();
        keyDoc.usedAt = bindNow;
        keyDoc.keyScopeHash = computeKeyScopeHash({
          discordId: account.discordId,
          licenseKey: keyDoc.code,
          productId: normalizeProductId(keyDoc.product),
        });
        ensureKeyHashes(keyDoc);
        activateKeyOnBind(keyDoc, bindNow);
        await keyDoc.save();
        await upsertUserProductLink({ username: account.discordId || null, keyDoc, now: bindNow });
      }
      if (keyDoc.usedBy !== account.discordId) {
        await Account.deleteOne({ _id: account._id }).catch(() => {});
        return fail(res, req, 403, "Essa license pertence a outro Discord.", "PORTAL_LICENSE_OWNERSHIP");
      }

      await upsertUserProductLink({ username: account.discordId || null, keyDoc, now: new Date() });

      await Account.updateOne({ _id: account._id }, { $addToSet: { linkedKeys: keyDoc._id } });
    }

    const session = await createPortalSession(res, req, account._id);
    return ok(res, req, "Conta criada com sucesso.", {
      csrfToken: session.csrfToken,
    });
  } catch (e) {
    return fail(res, req, 500, "Erro ao registrar.", "PORTAL_REGISTER");
  }
});


app.post("/v1/portal/auth/login", portalAuthLimiter, async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) return fail(res, req, 400, "Email e senha sÃ£o obrigatÃ³rios.", "PORTAL_LOGIN_INPUT");

    const account = await Account.findOne({ email });
    // evita enumeraÃ§Ã£o
    if (!account || !verifyPassword(password, account.passwordHash)) {
      return fail(res, req, 401, "Credenciais invÃ¡lidas.", "PORTAL_LOGIN_INVALID");
    }
    if (account.status !== "ACTIVE") return fail(res, req, 403, "Conta bloqueada.", "PORTAL_BANNED");

    account.lastLoginAt = new Date();
    await account.save();

    const session = await createPortalSession(res, req, account._id);
    return ok(res, req, "Login realizado.", { csrfToken: session.csrfToken });
  } catch (e) {
    return fail(res, req, 500, "Erro ao logar.", "PORTAL_LOGIN");
  }
});

app.post("/v1/portal/auth/logout", requirePortalAuth, requireCsrf, async (req, res) => {
  try {
    await clearPortalSession(res, req);
    return ok(res, req, "Logout realizado.", {});
  } catch (e) {
    return fail(res, req, 500, "Erro ao sair.", "PORTAL_LOGOUT");
  }
});

// ---------- Me / Entitlements ----------
app.get("/v1/portal/me", requirePortalAuth, async (req, res) => {
  try {
    const ent = await getPortalEntitlements(req.portalAccount);

    // downloads por produto (usa seu model Config que tem downloadLink por product)
    const downloads = ent.activeProductIds.length
      ? await Config.find({ product: { $in: ent.activeProductIds } }).populate("product").lean()
      : [];

    return ok(res, req, "OK", {
      account: req.portalAccount.toJSON(),
      entitlements: ent,
      downloads: downloads.map((d) => ({
        productId: d.product?._id ? String(d.product._id) : String(d.product),
        productName: d.product?.name || "Produto",
        version: d.version || "",
        downloadLink: d.downloadLink || "",
      })),
      features: {
        showConfigs: ent.hasActive && !!req.portalAccount.discordId,
        showDownloads: ent.hasActive,
        showSettings: true,
        canOpenHwidReset: ent.hasActive && !!req.portalAccount.discordId,
      },
      csrfToken: req.portalSession?.csrfToken || null,
    });
  } catch (e) {
    return fail(res, req, 500, "Erro ao carregar perfil.", "PORTAL_ME");
  }
});

// ---------- Vincular license depois (seguro: sÃ³ com Discord ligado) ----------
app.post("/v1/portal/licenses/link", requirePortalAuth, requireCsrf, async (req, res) => {
  try {
    const licenseKey = String(req.body?.licenseKey || "").trim().toUpperCase();
    if (!licenseKey) return fail(res, req, 400, "Informe a license.", "PORTAL_LICENSE_INPUT");
    if (!req.portalAccount.discordId) return fail(res, req, 400, "Vincule seu Discord antes.", "PORTAL_NEEDS_DISCORD");

    const keyDoc = await Key.findOne({ code: licenseKey });
    if (!keyDoc) return fail(res, req, 404, "License nÃ£o encontrada.", "PORTAL_LICENSE_NOT_FOUND");

    if (!keyDoc.usedBy) {
      keyDoc.usedBy = req.portalAccount.discordId;
      const bindNow = new Date();
      keyDoc.usedAt = bindNow;
      keyDoc.keyScopeHash = computeKeyScopeHash({
        discordId: req.portalAccount.discordId,
        licenseKey: keyDoc.code,
        productId: normalizeProductId(keyDoc.product),
      });
      ensureKeyHashes(keyDoc);
      activateKeyOnBind(keyDoc, bindNow);
      await keyDoc.save();
      await upsertUserProductLink({ username: req.portalAccount.discordId || null, keyDoc, now: bindNow });
    }
    if (keyDoc.usedBy !== req.portalAccount.discordId) {
      return fail(res, req, 403, "Essa license pertence a outro Discord.", "PORTAL_LICENSE_OWNERSHIP");
    }

    await upsertUserProductLink({ username: req.portalAccount.discordId || null, keyDoc, now: new Date() });

    await Account.updateOne({ _id: req.portalAccount._id }, { $addToSet: { linkedKeys: keyDoc._id } });
    return ok(res, req, "License vinculada.", {});
  } catch (e) {
    return fail(res, req, 500, "Erro ao vincular license.", "PORTAL_LICENSE_LINK");
  }
});

// ---------- Configs Cloud (usa seu ConfigUpload) ----------
// regra: sÃ³ com discord ligado + produto ativo
app.get("/v1/portal/configs", requirePortalAuth, async (req, res) => {
  try {
    if (!req.portalAccount.discordId) return ok(res, req, "OK", { items: [] });

    const ent = await getPortalEntitlements(req.portalAccount);
    if (!ent.activeProductIds.length) return ok(res, req, "OK", { items: [] });

    const items = await ConfigUpload.find({
      product: { $in: ent.activeProductIds },
      $or: [{ visibility: "public" }, { visibility: "unlisted" }, { ownerDiscordId: req.portalAccount.discordId }],
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return ok(res, req, "OK", { items });
  } catch (e) {
    return fail(res, req, 500, "Erro ao listar configs.", "PORTAL_CONFIGS_LIST");
  }
});

app.post("/v1/portal/configs", requirePortalAuth, requireCsrf, async (req, res) => {
  try {
    if (!req.portalAccount.discordId) return fail(res, req, 403, "Vincule seu Discord.", "PORTAL_NEEDS_DISCORD");

    const productId = String(req.body?.productId || "").trim();
    const title = cleanStr(req.body?.title, 80) || "Config";
    const description = cleanStr(req.body?.description, 500) || "";
    const visibility = String(req.body?.visibility || "private").toLowerCase();
    const fileKey = cleanStr(req.body?.fileKey, 280);
    const fileUrl = cleanStr(req.body?.fileUrl, 600);

    if (!isHex24(productId)) return fail(res, req, 400, "productId invÃ¡lido.", "PORTAL_PRODUCT");
    if (!fileKey || !fileUrl) return fail(res, req, 400, "fileKey e fileUrl sÃ£o obrigatÃ³rios.", "PORTAL_FILE");

    const ent = await getPortalEntitlements(req.portalAccount);
    if (!ent.activeProductIds.includes(productId)) {
      return fail(res, req, 403, "VocÃª nÃ£o possui acesso a esse produto.", "PORTAL_NO_ACCESS");
    }

    const doc = await ConfigUpload.create({
      ownerDiscordId: req.portalAccount.discordId,
      product: productId,
      title,
      description,
      visibility: ["private", "unlisted", "public"].includes(visibility) ? visibility : "private",
      fileKey,
      fileUrl,
      downloads: 0,
    });

    return ok(res, req, "Config enviada.", { id: String(doc._id) });
  } catch (e) {
    return fail(res, req, 500, "Erro ao criar config.", "PORTAL_CONFIGS_CREATE");
  }
});


// ---------- Ticket HWID Reset ----------
app.post("/v1/portal/tickets/hwid-reset", requirePortalAuth, requireCsrf, async (req, res) => {
  try {
    if (!req.portalAccount.discordId) return fail(res, req, 403, "Vincule seu Discord.", "PORTAL_NEEDS_DISCORD");

    const licenseKey = String(req.body?.licenseKey || "").trim().toUpperCase();
    if (!licenseKey) return fail(res, req, 400, "Informe a license.", "PORTAL_LICENSE_INPUT");

    const keyDoc = await Key.findOne({ code: licenseKey }).populate("product");
    if (!keyDoc) return fail(res, req, 404, "License nÃ£o encontrada.", "PORTAL_LICENSE_NOT_FOUND");
    if (keyDoc.usedBy !== req.portalAccount.discordId)
      return fail(res, req, 403, "Essa license nÃ£o estÃ¡ vinculada ao seu Discord.", "PORTAL_LICENSE_OWNERSHIP");

    const t = await Ticket.create({
      discordId: req.portalAccount.discordId,
      type: "HWID_RESET",
      status: "OPEN",
      product: keyDoc.product?._id || keyDoc.product,
      title: `Reset HWID - ${keyDoc.product?.name || "Produto"}`,
      messages: [
        {
          by: "client",
          content: `Solicito reset de HWID para a license ${mask(licenseKey)}.`,
          at: new Date(),
        },
      ],
    });

    return ok(res, req, "Ticket aberto.", { id: String(t._id) });
  } catch (e) {
    return fail(res, req, 500, "Erro ao abrir ticket.", "PORTAL_TICKET");
  }
});

// ---------- Checkout EfÃ­ (renovar licenÃ§a) ----------
let EfiPay = null;
try {
  EfiPay = require("sdk-node-apis-efi");
} catch {}

function getEfiClient() {
  if (!EfiPay) throw new Error("sdk-node-apis-efi nÃ£o instalado");
  const certPath = process.env.EFI_CERT_PATH; // caminho do .p12/.pem conforme sua conta
  if (!process.env.EFI_CLIENT_ID || !process.env.EFI_CLIENT_SECRET || !certPath) {
    throw new Error("EFI_CLIENT_ID/EFI_CLIENT_SECRET/EFI_CERT_PATH nÃ£o configurados");
  }
  return new EfiPay({
    client_id: process.env.EFI_CLIENT_ID,
    client_secret: process.env.EFI_CLIENT_SECRET,
    sandbox: String(process.env.EFI_SANDBOX ?? "1") === "1",
    certificate: certPath,
  });
}

app.post("/v1/portal/billing/checkout", requirePortalAuth, requireCsrf, async (req, res) => {
  try {
    if (!req.portalAccount.discordId) return fail(res, req, 403, "Vincule seu Discord.", "PORTAL_NEEDS_DISCORD");

    const productId = String(req.body?.productId || "").trim();
    const licenseCode = String(req.body?.licenseKey || "").trim().toUpperCase();
    const days = Number(req.body?.days || 30);

    if (!isHex24(productId)) return fail(res, req, 400, "productId invÃ¡lido.", "PORTAL_PRODUCT");
    if (!licenseCode) return fail(res, req, 400, "Informe a license para renovar.", "PORTAL_LICENSE_INPUT");
    if (!Number.isFinite(days) || days < 1 || days > 365) return fail(res, req, 400, "days invÃ¡lido.", "PORTAL_DAYS");

    const keyDoc = await Key.findOne({ code: licenseCode }).populate("product");
    if (!keyDoc) return fail(res, req, 404, "License nÃ£o encontrada.", "PORTAL_LICENSE_NOT_FOUND");
    if (String(keyDoc.product?._id || keyDoc.product) !== productId)
      return fail(res, req, 400, "Produto nÃ£o corresponde Ã  license.", "PORTAL_PRODUCT_MISMATCH");
    if (keyDoc.usedBy !== req.portalAccount.discordId)
      return fail(res, req, 403, "Essa license nÃ£o estÃ¡ vinculada ao seu Discord.", "PORTAL_LICENSE_OWNERSHIP");

    // preÃ§o: vocÃª pode puxar de AppSetting depois. Aqui: exemplo simples por dia (ajuste!)
    const pricePerDayCents = Number(process.env.BILLING_PRICE_PER_DAY_CENTS || 100); // R$1,00/dia
    const amountCents = Math.round(pricePerDayCents * days);

    const order = await Order.create({
      account: req.portalAccount._id,
      product: productId,
      licenseKey: keyDoc._id,
      amountCents,
      currency: "BRL",
      status: "PENDING",
      meta: { days },
      efi: { paymentUrl: "" },
    });

    const baseUrl = process.env.PUBLIC_API_BASE_URL; // ex: https://api.seudominio.com
    const secret = process.env.EFI_WEBHOOK_SECRET || "";
    if (!baseUrl) return fail(res, req, 500, "PUBLIC_API_BASE_URL nÃ£o configurado.", "PORTAL_BASEURL");

    const notificationUrl = `${baseUrl}/v1/webhooks/efi?secret=${encodeURIComponent(secret)}`;

    const efi = getEfiClient();

    // Link de pagamento One Step (EfÃ­)
    // docs: /v1/charge/one-step/link
    const body = {
      items: [
        {
          name: `RenovaÃ§Ã£o - ${keyDoc.product?.name || "Produto"} (${days} dias)`,
          amount: 1,
          value: amountCents,
        },
      ],
      metadata: {
        custom_id: String(order._id),
        notification_url: notificationUrl,
      },
      customer: { email: req.portalAccount.email },
      settings: {
        payment_method: "all",
      },
    };

    const resp = await efi.createOneStepLink({}, body);

    const paymentUrl =
      resp?.data?.payment_url || resp?.payment_url || resp?.data?.data?.payment_url || "";
    const chargeId = resp?.data?.charge_id || resp?.charge_id || resp?.data?.data?.charge_id || null;

    if (!paymentUrl) {
      await Order.updateOne({ _id: order._id }, { $set: { status: "FAILED" } }).catch(() => {});
      return fail(res, req, 500, "EfÃ­ nÃ£o retornou payment_url.", "PORTAL_EFI");
    }

    await Order.updateOne(
      { _id: order._id },
      { $set: { "efi.paymentUrl": paymentUrl, "efi.chargeId": chargeId } }
    );

    return ok(res, req, "Checkout criado.", {
      orderId: String(order._id),
      paymentUrl,
    });
  } catch (e) {
    return fail(res, req, 500, "Erro ao criar checkout.", "PORTAL_CHECKOUT");
  }
});

// Webhook EfÃ­: recebe token de notificaÃ§Ã£o e consulta detalhes via getNotification
app.post("/v1/webhooks/efi", async (req, res) => {
  try {
    const secret = String(req.query?.secret || "");
    if ((process.env.EFI_WEBHOOK_SECRET || "") !== secret) {
      return res.status(401).json({ ok: false });
    }

    const notificationToken = String(req.body?.notification || "").trim();
    if (!notificationToken) return res.status(400).json({ ok: false });

    const efi = getEfiClient();
    const params = { token: notificationToken };

    // doc oficial usa getNotification(params)
    const notif = await efi.getNotification(params, {});
    const data = notif?.data || notif?.data?.data || notif?.data?.data?.data || notif?.data || [];

    if (!Array.isArray(data) || data.length === 0) return res.status(200).json({ ok: true });

    const last = data[data.length - 1];
    const chargeId = last?.identifiers?.charge_id;
    const current = last?.status?.current; // waiting/paid/identified/approved/etc

    if (!chargeId || !current) return res.status(200).json({ ok: true });

    const order = await Order.findOne({ "efi.chargeId": Number(chargeId) });
    if (!order) return res.status(200).json({ ok: true });

    // idempotÃªncia
    if (order.status === "PAID") return res.status(200).json({ ok: true });

    order.efi.notificationToken = notificationToken;
    order.efi.lastStatus = String(current);

    // status final de sucesso: paid (e Ã s vezes identified/approved antes do paid)
    if (String(current) === "paid") {
      order.status = "PAID";
      order.paidAt = new Date();
      const orderType = String(order.meta?.type || 'LICENSE_RENEWAL').toUpperCase();

      if (orderType === 'HWID_RESET') {
        const alreadyApplied = Boolean(order.meta?.hwidResetApplied);
        if (!alreadyApplied && order.licenseKey) {
          const keyDoc = await Key.findById(order.licenseKey);
          if (keyDoc) {
            keyDoc.hwid = null;
            await keyDoc.save();
          }
          order.meta = { ...(order.meta || {}), hwidResetApplied: true, hwidResetAppliedAt: new Date().toISOString() };
        }
      } else {
        const days = Number(order.meta?.days || 0);
        if (days > 0 && order.licenseKey) {
          const keyDoc = await Key.findById(order.licenseKey);
          if (keyDoc) {
            if (keyDoc.expiresAt) {
              const base = keyDoc.expiresAt > new Date() ? keyDoc.expiresAt : new Date();
              keyDoc.expiresAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
            } else {
              const currentDuration = Number(keyDoc.durationDays);
              const baseDuration = Number.isFinite(currentDuration) ? Math.trunc(currentDuration) : 0;
              keyDoc.durationDays = baseDuration + days;
            }
            await keyDoc.save();
          }
        }
      }
    } else if (["canceled", "expired", "unpaid", "refunded", "contested"].includes(String(current))) {
      order.status = "FAILED";
    }

    await order.save();
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(200).json({ ok: true }); // nÃ£o ficar re-tentando infinito
  }
});

  const loginLimiter = rateLimit({
    windowMs: 60_000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many attempts' },
    keyGenerator: (req) => getClientIp(req),
  });


  app.post('/v1/auth/login', loginLimiter, validateLoginBody, async (req, res) => {
  const { licenseKey, hwid, productHash, client } = req.body;
  const sid = cleanStr(req.body?.sid, 120) || null;
  const clientIp = getClientIp(req);

  const now = new Date();
  const keyMasked = mask(licenseKey);
  const hwidMasked = mask(hwid, 6, 4);

  try {
    let keyDoc = await Key.findOne({ code: licenseKey, productHash }).populate('product');
    if (!keyDoc) {
      keyDoc = await Key.findOne({ code: licenseKey }).populate('product');
    }
    if (!keyDoc) {
      audit({ level: 'WARN', event: 'AUTH_KEY_NOT_FOUND', req, statusCode: 401,
        message: 'Key inexistente', meta: { keyMasked, hwidMasked, reason: 'not_found', client } });
      return fail(res, req, 401, 'Invalid license key', 'INVALID_CREDENTIALS');
    }

    let keyNeedsSave = ensureKeyHashes(keyDoc);

    const productId = normalizeProductId(keyDoc.product);
    const canonicalProductHash = keyDoc?.product?.productHash || (productId ? computeProductHash(productId) : null);
    const expectedProductHash = keyDoc.productHash || canonicalProductHash;

    if (canonicalProductHash && !keyDoc?.product?.productHash && productId) {
      await Product.updateOne({ _id: productId }, { $set: { productHash: canonicalProductHash } }).catch(() => {});
    }
    if (canonicalProductHash && !keyDoc.productHash) {
      keyDoc.productHash = canonicalProductHash;
      keyNeedsSave = true;
    }

    if (!expectedProductHash || !timingSafeEqual(expectedProductHash, productHash)) {
      audit({ level: 'WARN', event: 'AUTH_PRODUCT_MISMATCH', req, statusCode: 401,
        message: 'productHash invalido', meta: { keyMasked, hwidMasked, reason: 'product_mismatch', client } });
      return fail(res, req, 401, 'Product invalid', 'PRODUCT_MISMATCH');
    }

    if (keyDoc.banned) return fail(res, req, 401, keyDoc.banReason || 'Banned', 'KEY_BANNED');
    if (keyDoc.paused) return fail(res, req, 403, 'Key paused', 'KEY_PAUSED');

    // Primeiro uso: vincula a key (usedBy = a própria licenseKey)
    const wasUnlinked = !keyDoc.usedBy;
    if (wasUnlinked) {
      keyDoc.usedBy = licenseKey; // armazena a key em si como identificador
      keyDoc.usedAt = keyDoc.usedAt ?? now;
      keyNeedsSave = true;
    }

    keyNeedsSave = activateKeyOnBind(keyDoc, now) || keyNeedsSave;

    // Verifica User por key
    const userByKey = await User.findOne({ key: licenseKey }).lean();
    if (userByKey?.banned) return fail(res, req, 401, userByKey.banReason || 'Banned', 'USER_BANNED');
    if (userByKey?.paused) return fail(res, req, 403, 'User paused', 'USER_PAUSED');

    // HWID
    const security = await getSetting('security', { hwidLockGlobal: true });
    const hwidLockGlobal = security?.hwidLockGlobal !== false;
    const productDoc = keyDoc.product;
    const hwidLockProduct = (productDoc && typeof productDoc.hwidLockEnabled === 'boolean')
      ? productDoc.hwidLockEnabled : true;
    const hwidLockOn = hwidLockGlobal && hwidLockProduct;
    const incomingStored = computeStoredHwid(hwid);

    if (!keyDoc.hwid) {
      keyDoc.hwid = incomingStored;
      if (sid) keyDoc.sid = sid;
      keyDoc.lastIp = clientIp;
      keyNeedsSave = true;
      // Cria/atualiza User vinculado à key
      await User.findOneAndUpdate(
        { username: licenseKey },
        { $set: { key: licenseKey, linkedAt: now } },
        { upsert: true, new: true }
      );
      audit({ level: 'INFO', event: 'AUTH_FIRST_LINK', req, statusCode: 200,
        message: 'Primeiro uso: vinculou hwid + key', meta: { keyMasked, hwidMasked, client } });
    } else {
      const okHwid = timingSafeEqual(keyDoc.hwid, incomingStored);
      if (!okHwid) {        if (hwidLockOn) {
          audit({ level: 'WARN', event: 'AUTH_HWID_MISMATCH', req, statusCode: 401,
            message: 'HWID divergente', meta: { keyMasked, hwidMasked, reason: 'hwid_mismatch', client } });
          return fail(res, req, 401, 'HwiD invalid, open a support ticket!', 'HWID_MISMATCH');
        }
        audit({ level: 'INFO', event: 'AUTH_HWID_BYPASS', req, statusCode: 200,
          message: 'HWID lock OFF', meta: { keyMasked, hwidMasked, reason: 'hwid_lock_off', client } });
      }
    }

    // Sempre atualiza o IP no último login
    keyDoc.lastIp = clientIp;
    if (keyNeedsSave) await keyDoc.save();
    else await Key.updateOne({ _id: keyDoc._id }, { $set: { lastIp: clientIp } });

    await User.findOneAndUpdate(
      { username: licenseKey },
      { $set: { key: licenseKey, linkedAt: now } },
      { upsert: true, new: true }
    );
    await upsertUserProductLink({ username: licenseKey, keyDoc, now });

    if (!keyDoc.expiresAt || keyDoc.expiresAt <= now) {
      audit({ level: 'WARN', event: 'AUTH_EXPIRED', req, statusCode: 401,
        message: 'Key expirada', meta: { keyMasked, hwidMasked, reason: 'expired', client } });
      return fail(res, req, 401, 'Time expired', 'EXPIRED');
    }

    const product = keyDoc.product
      ? { id: String(keyDoc.product._id), name: keyDoc.product.name, hash: keyDoc.productHash || computeProductHash(String(keyDoc.product._id)) }
      : { id: null, name: null };

    const cfg = product.id ? await Config.findOne({ product: product.id }) : null;
    const msLeft = keyDoc.expiresAt - now;
    const daysLeft = Math.max(0, Math.floor(msLeft / (1000 * 60 * 60 * 24)));

    audit({ level: 'INFO', event: 'AUTH_SUCCESS', req, statusCode: 200,
      message: 'Login autorizado', meta: { keyMasked, hwidMasked, client, hwidLockOn } });

    return ok(res, req, 'Authorized', {
      product,
      licenseKey: keyMasked,
      expiresAt: keyDoc.expiresAt.toISOString(),
      daysLeft,
      config: cfg ? { version: cfg.version, downloadLink: cfg.downloadLink } : null,
    });

  } catch (error) {
    audit({ level: 'ERROR', event: 'AUTH_INTERNAL_ERROR', req, statusCode: 500,
      message: error?.message || 'Erro interno', meta: { keyMasked, hwidMasked } });
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});
// =====================
// CLIENT ROUTES
// =====================
app.use('/v1/client', clientLimiter);

function classifyClientLicense(keyDoc, now = new Date()) {
  const expired = keyDoc.expiresAt ? new Date(keyDoc.expiresAt) <= now : false;
  const pendingActivation = !keyDoc.expiresAt && !keyDoc.activatedAt;

  let status = 'inactive';
  if (keyDoc.banned) status = 'inactive';
  else if (keyDoc.paused) status = 'inactive';
  else if (expired) status = 'expired';
  else if (pendingActivation) status = 'inactive';
  else status = 'active';

  const remainingMs = keyDoc.expiresAt ? Math.max(0, new Date(keyDoc.expiresAt).getTime() - now.getTime()) : null;
  const daysLeft = remainingMs === null ? null : Math.floor(remainingMs / (1000 * 60 * 60 * 24));

  return { status, expired, pendingActivation, remainingMs, daysLeft };
}

function mapClientLicense(req, keyDoc, now = new Date()) {
  const lifecycle = classifyClientLicense(keyDoc, now);
  const productId = keyDoc.product?._id ? String(keyDoc.product._id) : (keyDoc.product ? String(keyDoc.product) : null);

  return {
    id: String(keyDoc._id),
    codeMasked: outKey(req, keyDoc.code),
    prefix: keyDoc.prefix || null,
    product: {
      id: productId,
      name: keyDoc.product?.name || null,
      productHash: keyDoc.productHash || null,
    },
    lifecycle: {
      status: lifecycle.status,
      expired: lifecycle.expired,
      pendingActivation: lifecycle.pendingActivation,
      paused: Boolean(keyDoc.paused),
      banned: Boolean(keyDoc.banned),
      banReason: keyDoc.banReason || null,
    },
    durationDays: Number.isFinite(Number(keyDoc.durationDays)) ? Number(keyDoc.durationDays) : null,
    activatedAt: keyDoc.activatedAt ? new Date(keyDoc.activatedAt).toISOString() : null,
    expiresAt: keyDoc.expiresAt ? new Date(keyDoc.expiresAt).toISOString() : null,
    usedAt: keyDoc.usedAt ? new Date(keyDoc.usedAt).toISOString() : null,
    hwidBound: Boolean(keyDoc.hwid),
    timeRemaining: lifecycle.remainingMs === null ? null : {
      ms: lifecycle.remainingMs,
      days: lifecycle.daysLeft,
      hours: Math.floor(lifecycle.remainingMs / (1000 * 60 * 60)),
    },
  };
}

app.get('/v1/client/me', requireClientAccess, requireActiveClient, async (req, res) => {
  try {
    const username = req.clientAuth.username;
    const now = new Date();

    const [user, badges, account, allKeys] = await Promise.all([
      User.findOne({ username }).lean(),
      UserBadge.find({ username }).populate('badge').sort({ createdAt: -1 }).lean(),
      Account.findOne({ username }).lean(),
      Key.find({ usedBy: username }).populate('product').lean(),
    ]);

    const userOut = user ? {
      username: outUsername(req, user.username),
      displayName: user.displayName || user.username,
      avatarUrl: user.avatarUrl || null,
      linkedAt: user.linkedAt || null,
    } : null;

    const mappedBadges = (badges || []).map(ub => ({
      id: String(ub.badge?._id || ub.badge),
      name: ub.badge?.name || null,
      description: ub.badge?.description || null,
      imageUrl: ub.badge?.imageUrl || null,
      rarity: ub.badge?.rarity || 'common',
      color: ub.badge?.color || '#ffffff',
      effects: ub.badge?.effects || {},
      grantedAt: ub.createdAt || null,
    }));

    const mappedKeys = (allKeys || []).map((k) => mapClientLicense(req, k, now));
    const currentLicense = mapClientLicense(req, req.clientKey, now);

    return ok(res, req, 'OK', {
      product: req.clientProduct,
      expiresAt: req.clientKey?.expiresAt ? new Date(req.clientKey.expiresAt).toISOString() : null,
      currentLicense,
      licenses: {
        total: mappedKeys.length,
        active: mappedKeys.filter((k) => k.lifecycle.status === 'active').length,
        expired: mappedKeys.filter((k) => k.lifecycle.status === 'expired').length,
        inactive: mappedKeys.filter((k) => k.lifecycle.status === 'inactive').length,
      },
      account: account ? {
        id: String(account._id),
        email: account.email,
        status: account.status,
      } : null,
      user: userOut,
      badges: mappedBadges,
    });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.get('/v1/client/account', requireClientAccess, requireActiveClient, async (req, res) => {
  try {
    const username = req.clientAuth.username;
    const now = new Date();

    const [user, account, keys] = await Promise.all([
      User.findOne({ username }).lean(),
      Account.findOne({ username }).lean(),
      Key.find({ usedBy: username }).populate('product').lean(),
    ]);

    const mapped = (keys || []).map((k) => mapClientLicense(req, k, now));
    const activeProducts = [...new Set(
      mapped
        .filter((k) => k.lifecycle.status === 'active')
        .map((k) => k.product.id)
        .filter(Boolean)
    )];

    return ok(res, req, 'OK', {
      user: user ? {
        username: outUsername(req, user.username),
        displayName: user.displayName || user.username,
        avatarUrl: user.avatarUrl || null,
        linkedAt: user.linkedAt || null,
      } : null,
      account: account ? {
        id: String(account._id),
        email: account.email || null,
        status: account.status,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      } : null,
      stats: {
        totalKeys: mapped.length,
        activeKeys: mapped.filter((k) => k.lifecycle.status === 'active').length,
        expiredKeys: mapped.filter((k) => k.lifecycle.status === 'expired').length,
        inactiveKeys: mapped.filter((k) => k.lifecycle.status === 'inactive').length,
        activeProducts: activeProducts.length,
      },
      currentKey: mapClientLicense(req, req.clientKey, now),
    });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.get('/v1/client/licenses', requireClientAccess, requireActiveClient, async (req, res) => {
  try {
    const username = req.clientAuth.username;
    const statusFilter = String(req.query?.status || 'all').trim().toLowerCase();
    const now = new Date();

    const docs = await Key.find({ usedBy: username }).populate('product').sort({ createdAt: -1 }).lean();
    const all = (docs || []).map((k) => mapClientLicense(req, k, now));

    const grouped = {
      active: all.filter((k) => k.lifecycle.status === 'active'),
      expired: all.filter((k) => k.lifecycle.status === 'expired'),
      inactive: all.filter((k) => k.lifecycle.status === 'inactive'),
    };

    let items = all;
    if (['active', 'expired', 'inactive'].includes(statusFilter)) items = grouped[statusFilter];

    const activeProducts = [...new Map(
      grouped.active
        .filter((k) => k.product.id)
        .map((k) => [k.product.id, { id: k.product.id, name: k.product.name, productHash: k.product.productHash }])
    ).values()];

    return ok(res, req, 'OK', {
      filter: statusFilter,
      totals: {
        all: all.length,
        active: grouped.active.length,
        expired: grouped.expired.length,
        inactive: grouped.inactive.length,
      },
      activeProducts,
      groups: grouped,
      items,
    });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.get('/v1/client/products/active', requireClientAccess, requireActiveClient, async (req, res) => {
  try {
    const username = req.clientAuth.username;
    const now = new Date();

    const keys = await Key.find({ usedBy: username }).populate('product').lean();
    const activeKeys = (keys || []).filter((k) => {
      const info = classifyClientLicense(k, now);
      return info.status === 'active';
    });

    const productsMap = new Map();
    for (const k of activeKeys) {
      const productId = k.product?._id ? String(k.product._id) : (k.product ? String(k.product) : null);
      if (!productId) continue;

      if (!productsMap.has(productId)) {
        productsMap.set(productId, {
          id: productId,
          name: k.product?.name || null,
          productHash: k.productHash || null,
          keys: [],
        });
      }

      const mapped = mapClientLicense(req, k, now);
      productsMap.get(productId).keys.push(mapped);
    }

    return ok(res, req, 'OK', {
      items: [...productsMap.values()],
    });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.post('/v1/client/license/reset-hwid', requireClientAccess, requireActiveClient, async (req, res) => {
  try {
    const username = req.clientAuth.username;
    const requestedCode = String(req.body?.licenseKey || req.clientAuth.licenseKey || '').trim().toUpperCase();
    if (!requestedCode) return fail(res, req, 400, 'licenseKey required', 'BAD_REQUEST');

    const [keyDoc, userDoc] = await Promise.all([
      Key.findOne({ code: requestedCode }).populate('product'),
      User.findOne({ username }),
    ]);

    if (!keyDoc) return fail(res, req, 404, 'License not found', 'NOT_FOUND');
    if (String(keyDoc.usedBy || '') !== username) return fail(res, req, 403, 'Forbidden', 'FORBIDDEN');

    const usedFree = Number(userDoc?.selfHwidFreeResetsUsed || 0);
    const freeLimit = 1;

    if (usedFree < freeLimit) {
      keyDoc.hwid = null;
      await keyDoc.save();

      await User.updateOne(
        { username },
        { $inc: { selfHwidFreeResetsUsed: 1 } },
        { upsert: true }
      );

      audit({
        level: 'WARN', event: 'CLIENT_SELF_RESET_HWID_FREE', req, statusCode: 200,
        message: 'Client self reset HWID (free)',
        meta: { usernameMasked: mask(username, 2, 0), keyMasked: mask(requestedCode), freeUsed: usedFree + 1 },
      });

      return ok(res, req, 'HWID resetado (gratuito)', {
        mode: 'free',
        freeResets: { limit: freeLimit, used: usedFree + 1, remaining: Math.max(0, freeLimit - (usedFree + 1)) },
        license: mapClientLicense(req, keyDoc.toObject(), new Date()),
      });
    }

    // Sem pagamento configurado: rejeita apÃ³s usar o reset gratuito
    return fail(res, req, 402, 'Free reset limit reached. Open a support ticket.', 'HWID_RESET_LIMIT');
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.put('/v1/client/profile', requireClientAccess, requireActiveClient, async (req, res) => {
  try {
    const username = req.clientAuth.username;
    const displayName = cleanStr(req.body?.displayName, 32);
    const avatarUrl = cleanStr(req.body?.avatarUrl, 400);
    const urlOk = (u) => !u || /^https?:\/\/.+/i.test(u);
    if (!urlOk(avatarUrl)) return fail(res, req, 400, 'Invalid url', 'BAD_REQUEST');

    const doc = await User.findOneAndUpdate(
      { username },
      { $set: { displayName, avatarUrl } },
      { upsert: true, new: true }
    ).lean();

    audit({
      level: 'INFO', event: 'CLIENT_PROFILE_UPDATE', req, statusCode: 200,
      message: 'Client updated profile',
      meta: { usernameMasked: mask(username, 2, 0) },
    });

    return ok(res, req, 'Updated', {
      profile: { displayName: doc?.displayName, avatarUrl: doc?.avatarUrl },
    });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

// Rota removida: sync-discord nÃ£o se aplica mais (sem Discord)

app.get('/v1/client/billing/history', requireClientAccess, requireActiveClient, async (req, res) => {
  try {
    const username = req.clientAuth.username;
    const limit = Math.min(200, Math.max(1, parseInt(req.query?.limit || '50', 10)));

    const keys = await Key.find({ usedBy: username }).select('_id code product').lean();
    const keyIds = keys.map((k) => k._id);
    const keyMap = new Map(keys.map((k) => [String(k._id), k]));

    if (!keyIds.length) {
      return ok(res, req, 'OK', { items: [], totals: { total: 0, paid: 0, pending: 0 } });
    }

    const orders = await Order.find({ licenseKey: { $in: keyIds } })
      .populate('product')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const items = orders.map((o) => {
      const linkedKey = o.licenseKey ? keyMap.get(String(o.licenseKey)) : null;
      return {
        id: String(o._id),
        status: o.status,
        type: String(o.meta?.type || 'LICENSE_RENEWAL'),
        amountCents: o.amountCents,
        currency: o.currency || 'BRL',
        provider: o.provider,
        product: {
          id: o.product?._id ? String(o.product._id) : (o.product ? String(o.product) : null),
          name: o.product?.name || null,
        },
        license: {
          id: linkedKey ? String(linkedKey._id) : null,
          codeMasked: linkedKey ? outKey(req, linkedKey.code) : null,
        },
        renewal: {
          days: Number(o.meta?.days || 0),
          isRenewal: Number(o.meta?.days || 0) > 0,
        },
        paymentUrl: o.efi?.paymentUrl || null,
        chargeId: o.efi?.chargeId || null,
        paidAt: o.paidAt || null,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
      };
    });

    return ok(res, req, 'OK', {
      totals: {
        total: items.length,
        paid: items.filter((x) => x.status === 'PAID').length,
        pending: items.filter((x) => x.status === 'PENDING').length,
      },
      items,
    });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.get('/v1/client/billing/orders/:id', requireClientAccess, requireActiveClient, async (req, res) => {
  try {
    const username = req.clientAuth.username;
    const id = String(req.params.id || '').trim();
    if (!isHex24(id)) return fail(res, req, 400, 'Invalid id', 'BAD_REQUEST');

    const order = await Order.findById(id).populate('product').populate('licenseKey').lean();
    if (!order) return fail(res, req, 404, 'Not found', 'NOT_FOUND');

    const license = order.licenseKey;
    if (!license || String(license.usedBy || '') !== username) return fail(res, req, 403, 'Forbidden', 'FORBIDDEN');

    return ok(res, req, 'OK', {
      item: {
        id: String(order._id),
        status: order.status,
        type: String(order.meta?.type || 'LICENSE_RENEWAL'),
        amountCents: order.amountCents,
        currency: order.currency || 'BRL',
        provider: order.provider,
        renewalDays: Number(order.meta?.days || 0),
        paymentUrl: order.efi?.paymentUrl || null,
        chargeId: order.efi?.chargeId || null,
        paidAt: order.paidAt || null,
        product: {
          id: order.product?._id ? String(order.product._id) : (order.product ? String(order.product) : null),
          name: order.product?.name || null,
        },
        license: {
          id: String(license._id),
          codeMasked: outKey(req, license.code),
        },
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      }
    });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.post('/v1/client/billing/checkout', requireClientAccess, requireActiveClient, async (req, res) => {
  try {
    const username = req.clientAuth.username;
    const requestedCode = String(req.body?.licenseKey || req.clientAuth.licenseKey || '').trim().toUpperCase();
    const days = Number(req.body?.days || 30);

    if (!requestedCode) return fail(res, req, 400, 'licenseKey required', 'BAD_REQUEST');
    if (!Number.isFinite(days) || days < 1 || days > 3650) {
      return fail(res, req, 400, 'days invÃ¡lido.', 'BAD_REQUEST');
    }

    const keyDoc = await Key.findOne({ code: requestedCode }).populate('product');
    if (!keyDoc) return fail(res, req, 404, 'License not found', 'NOT_FOUND');
    if (String(keyDoc.usedBy || '') !== username) return fail(res, req, 403, 'Forbidden', 'FORBIDDEN');

    return fail(res, req, 503, 'Billing not configured', 'NOT_CONFIGURED');
  } catch (e) {
    return fail(res, req, 500, 'Erro ao criar checkout.', 'CLIENT_CHECKOUT');
  }
});

app.post('/v1/client/tickets', requireClientAccess, requireActiveClient, ensureClientHasProduct, async (req, res) => {
  try {
    const username = req.clientAuth.username;

    const type = String(req.body?.type || 'HWID_RESET').trim().toUpperCase();
    if (!['HWID_RESET', 'SUPPORT'].includes(type)) {
      return fail(res, req, 400, 'Invalid ticket type', 'BAD_REQUEST');
    }

    const message = cleanStr(req.body?.message, 900) || 'SolicitaÃ§Ã£o criada pelo cliente.';

    const existing = await Ticket.findOne({ username, type, status: { $in: ['open', 'in_progress'] } }).lean();
    if (existing) {
      return fail(res, req, 409, 'There is already an active ticket', 'ALREADY_EXISTS', { ticketId: String(existing._id) });
    }

    const doc = await Ticket.create({
      type,
      status: 'open',
      username,
      product: req.clientProduct.id,
      licenseKeyMasked: mask(req.clientAuth.licenseKey),
      messages: [
        { by: 'client', authorUsername: username, content: message }
      ],
    });

    audit({
      level: 'WARN', event: 'CLIENT_TICKET_CREATE', req, statusCode: 200,
      message: `Client created ticket: ${type}`,
      meta: { usernameMasked: mask(username, 2, 0), ticketId: String(doc._id) },
    });

    return ok(res, req, 'Created', { ticketId: String(doc._id) });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.get('/v1/client/tickets', requireClientAccess, requireActiveClient, async (req, res) => {
  try {
    const username = req.clientAuth.username;
    const status = cleanStr(req.query?.status, 24);
    const filter = { username };
    if (status && ['open', 'in_progress', 'closed'].includes(status)) filter.status = status;

    const items = await Ticket.find(filter).sort({ createdAt: -1 }).limit(50).lean();
    const mapped = items.map(t => ({
      id: String(t._id),
      type: t.type,
      status: t.status,
      productId: t.product ? String(t.product) : null,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      lastMessageAt: (t.messages?.length ? t.messages[t.messages.length - 1].createdAt : null),
    }));

    return ok(res, req, 'OK', { items: mapped });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.get('/v1/client/tickets/:id', requireClientAccess, requireActiveClient, async (req, res) => {
  try {
    const username = req.clientAuth.username;
    const id = String(req.params.id || '').trim();
    if (!isHex24(id)) return fail(res, req, 400, 'Invalid id', 'BAD_REQUEST');

    const t = await Ticket.findById(id).lean();
    if (!t || t.username !== username) return fail(res, req, 404, 'Not found', 'NOT_FOUND');

    return ok(res, req, 'OK', {
      item: {
        id: String(t._id),
        type: t.type,
        status: t.status,
        productId: t.product ? String(t.product) : null,
        licenseKeyMasked: t.licenseKeyMasked || null,
        messages: (t.messages || []).map(m => ({
          by: m.by,
          authorUsername: outUsername(req, m.authorUsername),
          content: m.content,
          createdAt: m.createdAt,
        })),
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }
    });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.post('/v1/client/tickets/:id/message', requireClientAccess, requireActiveClient, async (req, res) => {
  try {
    const username = req.clientAuth.username;
    const id = String(req.params.id || '').trim();
    if (!isHex24(id)) return fail(res, req, 400, 'Invalid id', 'BAD_REQUEST');

    const content = cleanStr(req.body?.content, 900);
    if (!content) return fail(res, req, 400, 'Invalid content', 'BAD_REQUEST');

    const t = await Ticket.findById(id);
    if (!t || String(t.username) !== username) return fail(res, req, 404, 'Not found', 'NOT_FOUND');
    if (t.status === 'closed') return fail(res, req, 409, 'Ticket closed', 'TICKET_CLOSED');

    t.messages.push({ by: 'client', authorUsername: username, content });
    await t.save();

    return ok(res, req, 'Sent', { id: String(t._id) });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

// ---------------------
// Configs na nuvem
// ---------------------

app.post('/v1/client/configs', requireClientAccess, requireActiveClient, ensureClientHasProduct, async (req, res) => {
  try {
    const username = req.clientAuth.username;

    const title = cleanStr(req.body?.title, 80);
    const description = cleanStr(req.body?.description, 240);
    const fileUrl = cleanStr(req.body?.fileUrl, 500);
    const fileKey = cleanStr(req.body?.fileKey, 180);
    const fileSize = Number(req.body?.fileSize || 0);

    if (!title) return fail(res, req, 400, 'Invalid title', 'BAD_REQUEST');
    if (!fileUrl && !fileKey) return fail(res, req, 400, 'fileUrl or fileKey required', 'BAD_REQUEST');
    if (fileUrl && !/^https?:\/\/.+/i.test(fileUrl)) return fail(res, req, 400, 'Invalid fileUrl', 'BAD_REQUEST');
    if (!Number.isFinite(fileSize) || fileSize < 0 || fileSize > 50_000_000) {
      return fail(res, req, 400, 'Invalid fileSize', 'BAD_REQUEST');
    }

    const doc = await ConfigUpload.create({
      product: req.clientProduct.id,
      ownerUsername: username,
      title,
      description,
      fileKey: fileKey || null,
      fileUrl: fileUrl || null,
      fileSize: Math.trunc(fileSize),
      visibility: 'public',
    });

    audit({
      level: 'INFO', event: 'CLIENT_CONFIG_UPLOAD', req, statusCode: 200,
      message: 'Client uploaded config metadata',
      meta: { usernameMasked: mask(username, 2, 0), configId: String(doc._id), productId: req.clientProduct.id },
    });

    return ok(res, req, 'Created', { id: String(doc._id) });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.get('/v1/client/configs', requireClientAccess, requireActiveClient, ensureClientHasProduct, async (req, res) => {
  try {
    const productId = req.clientProduct.id;

    const q = cleanStr(req.query?.q, 64);
    const filter = { product: productId, visibility: 'public' };

    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ title: rx }, { description: rx }];
    }

    const items = await ConfigUpload.find(filter).sort({ createdAt: -1 }).limit(100).lean();

    const mapped = items.map(c => ({
      id: String(c._id),
      title: c.title,
      description: c.description,
      fileSize: c.fileSize || 0,
      downloads: c.downloads || 0,
      ownerUsername: outUsername(req, c.ownerUsername),
      createdAt: c.createdAt,
    }));

    return ok(res, req, 'OK', { productId, items: mapped });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.get('/v1/client/configs/:id/download', requireClientAccess, requireActiveClient, ensureClientHasProduct, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!isHex24(id)) return fail(res, req, 400, 'Invalid id', 'BAD_REQUEST');

    const c = await ConfigUpload.findById(id).lean();
    if (!c) return fail(res, req, 404, 'Not found', 'NOT_FOUND');
    if (String(c.product) !== String(req.clientProduct.id)) {
      return fail(res, req, 403, 'Forbidden (product)', 'FORBIDDEN');
    }

    await ConfigUpload.updateOne({ _id: id }, { $inc: { downloads: 1 } });

    // aqui vocÃª pode trocar para "signedUrl" no futuro
    const url = c.fileUrl || null;

    return ok(res, req, 'OK', { url });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.delete('/v1/client/configs/:id', requireClientAccess, requireActiveClient, async (req, res) => {
  try {
    const username = req.clientAuth.username;
    const id = String(req.params.id || '').trim();
    if (!isHex24(id)) return fail(res, req, 400, 'Invalid id', 'BAD_REQUEST');

    const c = await ConfigUpload.findById(id).lean();
    if (!c) return fail(res, req, 404, 'Not found', 'NOT_FOUND');
    if (String(c.ownerUsername) !== username) return fail(res, req, 403, 'Forbidden', 'FORBIDDEN');

    await ConfigUpload.deleteOne({ _id: id });

    audit({
      level: 'WARN', event: 'CLIENT_CONFIG_DELETE', req, statusCode: 200,
      message: 'Client deleted config',
      meta: { usernameMasked: mask(username, 2, 0), configId: id },
    });

    return ok(res, req, 'Deleted', { id });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

// =====================
// ADMIN AUTH
// =====================

app.post('/v1/admin/auth/login', adminLoginLimiter, async (req, res) => {
  try {
    const username = normalizeUsername(req.body?.username);
    const password = String(req.body?.password || '');

    if (!username || username.length < 3 || username.length > 40 || password.length < 8 || password.length > 200) {
      return fail(res, req, 400, 'Credenciais invÃ¡lidas', 'BAD_REQUEST');
    }

    const admin = await AdminUser.findOne({ username });
    if (!admin) return fail(res, req, 401, 'UsuÃ¡rio ou senha invÃ¡lidos', 'INVALID_CREDENTIALS');
    if (admin.status !== 'ACTIVE') return fail(res, req, 403, 'Conta desativada', 'ADMIN_DISABLED');

    const now = new Date();
    if (admin.lockedUntil && admin.lockedUntil > now) {
      return fail(res, req, 429, 'Conta temporariamente bloqueada por tentativas invÃ¡lidas', 'ADMIN_LOCKED', {
        lockedUntil: admin.lockedUntil,
      });
    }

    const valid = verifyPassword(password, admin.passwordHash);
    if (!valid) {
      const failed = Number(admin.failedLogins || 0) + 1;
      const lockThreshold = 5;
      const lockMinutes = 15;
      const update = { failedLogins: failed };
      if (failed >= lockThreshold) {
        update.lockedUntil = new Date(Date.now() + lockMinutes * 60_000);
        update.failedLogins = 0;
      }
      await AdminUser.updateOne({ _id: admin._id }, { $set: update });
      return fail(res, req, 401, 'UsuÃ¡rio ou senha invÃ¡lidos', 'INVALID_CREDENTIALS');
    }

    await AdminUser.updateOne(
      { _id: admin._id },
      { $set: { failedLogins: 0, lockedUntil: null, lastLoginAt: now } }
    );

    const { csrfToken, expiresAt } = await createAdminSession(res, req, admin._id);

    const rolePerms = ROLE_PERMISSIONS[admin.role] || [];
    const directPerms = Array.isArray(admin.permissions) ? admin.permissions : [];
    const permissions = [...new Set([...rolePerms, ...directPerms])];

    return ok(res, req, 'Login efetuado', {
      csrfToken,
      sessionExpiresAt: expiresAt,
      admin: {
        id: String(admin._id),
        username: admin.username,
        displayName: admin.displayName || admin.username,
        role: admin.role,
        permissions,
      },
    });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.post('/v1/admin/auth/logout', requireAdminToken, async (req, res) => {
  try {
    await clearAdminSession(res, req);
    return ok(res, req, 'Logout efetuado');
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.get('/v1/admin/auth/me', requireAdminToken, async (req, res) => {
  try {
    if (req.adminAuth?.type === 'owner-token') {
      return ok(res, req, 'OK', {
        mode: 'owner-token',
        admin: {
          id: null,
          username: 'owner-token',
          displayName: 'Owner',
          role: 'OWNER',
          permissions: ['*'],
        },
      });
    }

    const admin = req.adminAuth?.admin;
    if (!admin) return fail(res, req, 401, 'Unauthorized', 'UNAUTHORIZED');

    return ok(res, req, 'OK', {
      mode: 'session',
      csrfToken: req.adminAuth?.session?.csrfToken,
      sessionExpiresAt: req.adminAuth?.session?.expiresAt,
      admin: {
        id: String(admin._id),
        username: admin.username,
        displayName: admin.displayName || admin.username,
        role: admin.role,
        permissions: req.adminAuth?.permissions || [],
      },
    });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

// =====================
// OWNER ADMIN MANAGEMENT
// =====================

app.post('/v1/admin/owner/bootstrap', requireOwnerToken, async (req, res) => {
  try {
    const username = normalizeUsername(req.body?.username);
    const password = String(req.body?.password || '');
    const displayName = cleanStr(req.body?.displayName, 80);

    if (!username || username.length < 3 || username.length > 40 || password.length < 10 || password.length > 200) {
      return fail(res, req, 400, 'ParÃ¢metros invÃ¡lidos', 'BAD_REQUEST');
    }

    const existingOwner = await AdminUser.findOne({ role: 'OWNER' }).lean();
    if (existingOwner) return fail(res, req, 409, 'OWNER jÃ¡ existe', 'CONFLICT');

    const exists = await AdminUser.findOne({ username }).lean();
    if (exists) return fail(res, req, 409, 'UsuÃ¡rio jÃ¡ existe', 'CONFLICT');

    const created = await AdminUser.create({
      username,
      passwordHash: hashPassword(password),
      displayName: displayName || username,
      role: 'OWNER',
      permissions: ['*'],
      status: 'ACTIVE',
      createdBy: 'owner-token',
    });

    return ok(res, req, 'OWNER criado', {
      admin: {
        id: String(created._id),
        username: created.username,
        displayName: created.displayName || created.username,
        role: created.role,
        permissions: ['*'],
        status: created.status,
      },
    });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.get('/v1/admin/owner/admins', requireAdminToken, async (req, res) => {
  try {
    if (!req.adminAuth?.isOwner) return fail(res, req, 403, 'Forbidden (owner only)', 'FORBIDDEN');
    const items = await AdminUser.find({}).sort({ createdAt: -1 }).lean();
    const mapped = items.map((a) => ({
      id: String(a._id),
      username: a.username,
      displayName: a.displayName || a.username,
      role: a.role,
      permissions: Array.isArray(a.permissions) ? a.permissions : [],
      status: a.status,
      failedLogins: Number(a.failedLogins || 0),
      lockedUntil: a.lockedUntil || null,
      lastLoginAt: a.lastLoginAt || null,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    }));
    return ok(res, req, 'OK', { items: mapped });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.post('/v1/admin/owner/admins', requireAdminToken, async (req, res) => {
  try {
    if (!req.adminAuth?.isOwner) return fail(res, req, 403, 'Forbidden (owner only)', 'FORBIDDEN');

    const username = normalizeUsername(req.body?.username);
    const password = String(req.body?.password || '');
    const displayName = cleanStr(req.body?.displayName, 80);
    const role = String(req.body?.role || 'ADMIN').toUpperCase();
    const status = String(req.body?.status || 'ACTIVE').toUpperCase();
    const permissions = normalizePermissions(req.body?.permissions);

    if (!username || username.length < 3 || username.length > 40 || password.length < 10 || password.length > 200) {
      return fail(res, req, 400, 'ParÃ¢metros invÃ¡lidos', 'BAD_REQUEST');
    }
    if (!ADMIN_ROLE_VALUES.includes(role)) return fail(res, req, 400, 'Role invÃ¡lida', 'BAD_REQUEST');
    if (!['ACTIVE', 'DISABLED'].includes(status)) return fail(res, req, 400, 'Status invÃ¡lido', 'BAD_REQUEST');

    const exists = await AdminUser.findOne({ username }).lean();
    if (exists) return fail(res, req, 409, 'UsuÃ¡rio jÃ¡ existe', 'CONFLICT');

    const created = await AdminUser.create({
      username,
      passwordHash: hashPassword(password),
      displayName: displayName || username,
      role,
      permissions,
      status,
      createdBy: req.adminAuth?.admin?.username || 'owner-token',
    });

    return ok(res, req, 'Admin criado', {
      admin: {
        id: String(created._id),
        username: created.username,
        displayName: created.displayName || created.username,
        role: created.role,
        permissions: created.permissions || [],
        status: created.status,
      },
    });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.put('/v1/admin/owner/admins/:id', requireAdminToken, async (req, res) => {
  try {
    if (!req.adminAuth?.isOwner) return fail(res, req, 403, 'Forbidden (owner only)', 'FORBIDDEN');
    const id = String(req.params.id || '').trim();
    if (!isHex24(id)) return fail(res, req, 400, 'Invalid id', 'BAD_REQUEST');

    const role = req.body?.role !== undefined ? String(req.body.role || '').toUpperCase() : null;
    const status = req.body?.status !== undefined ? String(req.body.status || '').toUpperCase() : null;
    const displayName = req.body?.displayName !== undefined ? cleanStr(req.body.displayName, 80) : undefined;
    const permissions = req.body?.permissions !== undefined ? normalizePermissions(req.body.permissions) : undefined;
    const password = req.body?.password !== undefined ? String(req.body.password || '') : undefined;

    const set = {};
    if (role !== null) {
      if (!ADMIN_ROLE_VALUES.includes(role)) return fail(res, req, 400, 'Role invÃ¡lida', 'BAD_REQUEST');
      set.role = role;
    }
    if (status !== null) {
      if (!['ACTIVE', 'DISABLED'].includes(status)) return fail(res, req, 400, 'Status invÃ¡lido', 'BAD_REQUEST');
      set.status = status;
    }
    if (displayName !== undefined) set.displayName = displayName || null;
    if (permissions !== undefined) set.permissions = permissions;
    if (password !== undefined) {
      if (password.length < 10 || password.length > 200) return fail(res, req, 400, 'Senha invÃ¡lida', 'BAD_REQUEST');
      set.passwordHash = hashPassword(password);
      set.failedLogins = 0;
      set.lockedUntil = null;
    }

    if (!Object.keys(set).length) return fail(res, req, 400, 'Nada para atualizar', 'BAD_REQUEST');

    const updated = await AdminUser.findByIdAndUpdate(id, { $set: set }, { new: true }).lean();
    if (!updated) return fail(res, req, 404, 'Not found', 'NOT_FOUND');

    if (set.status === 'DISABLED') {
      await AdminSession.updateMany({ admin: updated._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    }

    return ok(res, req, 'Admin atualizado', {
      admin: {
        id: String(updated._id),
        username: updated.username,
        displayName: updated.displayName || updated.username,
        role: updated.role,
        permissions: updated.permissions || [],
        status: updated.status,
        failedLogins: Number(updated.failedLogins || 0),
        lockedUntil: updated.lockedUntil || null,
      },
    });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

// =====================
// ADMIN: Badges
// =====================


app.get('/v1/admin/badges', requireAdminToken, async (req, res) => {
  try {
    const items = await Badge.find({}).sort({ createdAt: -1 }).lean();
    return ok(res, req, 'OK', { items });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.post('/v1/admin/badges', requireAdminToken, async (req, res) => {
  try {
    const name = cleanStr(req.body?.name, 40);
    const description = cleanStr(req.body?.description, 180);
    const imageUrl = cleanStr(req.body?.imageUrl, 500);
    const rarity = cleanStr(req.body?.rarity, 16) || 'common';
    const color = cleanStr(req.body?.color, 16) || '#ffffff';

    const effects = req.body?.effects && typeof req.body.effects === 'object' ? req.body.effects : {};
    const safeEffects = {
      glow: Boolean(effects.glow),
      sparkles: Boolean(effects.sparkles),
      confetti: Boolean(effects.confetti),
      gradient: Boolean(effects.gradient),
    };

    if (!name || !imageUrl) return fail(res, req, 400, 'Invalid parameters', 'BAD_REQUEST');
    if (!/^https?:\/\/.+/i.test(imageUrl)) return fail(res, req, 400, 'Invalid imageUrl', 'BAD_REQUEST');
    if (!['common','rare','epic','legendary'].includes(rarity)) return fail(res, req, 400, 'Invalid rarity', 'BAD_REQUEST');

    const doc = await Badge.create({ name, description, imageUrl, rarity, color, effects: safeEffects });

    audit({ level:'WARN', event:'ADMIN_BADGE_CREATE', req, statusCode:200, message:'Badge created', meta:{ badgeId:String(doc._id), name } });
    return ok(res, req, 'Created', { badge: doc });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.put('/v1/admin/badges/:id', requireAdminToken, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!isHex24(id)) return fail(res, req, 400, 'Invalid id', 'BAD_REQUEST');

    const update = {};
    if (req.body?.name !== undefined) update.name = cleanStr(req.body.name, 40);
    if (req.body?.description !== undefined) update.description = cleanStr(req.body.description, 180);
    if (req.body?.imageUrl !== undefined) {
      const imageUrl = cleanStr(req.body.imageUrl, 500);
      if (imageUrl && !/^https?:\/\/.+/i.test(imageUrl)) return fail(res, req, 400, 'Invalid imageUrl', 'BAD_REQUEST');
      update.imageUrl = imageUrl;
    }
    if (req.body?.rarity !== undefined) {
      const rarity = cleanStr(req.body.rarity, 16);
      if (rarity && !['common','rare','epic','legendary'].includes(rarity)) return fail(res, req, 400, 'Invalid rarity', 'BAD_REQUEST');
      update.rarity = rarity;
    }
    if (req.body?.color !== undefined) update.color = cleanStr(req.body.color, 16);

    if (req.body?.effects !== undefined && typeof req.body.effects === 'object') {
      update.effects = {
        glow: Boolean(req.body.effects.glow),
        sparkles: Boolean(req.body.effects.sparkles),
        confetti: Boolean(req.body.effects.confetti),
        gradient: Boolean(req.body.effects.gradient),
      };
    }

    const doc = await Badge.findByIdAndUpdate(id, { $set: update }, { new: true }).lean();
    if (!doc) return fail(res, req, 404, 'Not found', 'NOT_FOUND');

    audit({ level:'WARN', event:'ADMIN_BADGE_UPDATE', req, statusCode:200, message:'Badge updated', meta:{ badgeId:id } });
    return ok(res, req, 'Updated', { badge: doc });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.delete('/v1/admin/badges/:id', requireAdminToken, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!isHex24(id)) return fail(res, req, 400, 'Invalid id', 'BAD_REQUEST');

    await Promise.all([
      Badge.deleteOne({ _id: id }),
      UserBadge.deleteMany({ badge: id }),
    ]);

    audit({ level:'WARN', event:'ADMIN_BADGE_DELETE', req, statusCode:200, message:'Badge deleted', meta:{ badgeId:id } });
    return ok(res, req, 'Deleted', { id });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

// Conceder badge a um usuÃ¡rio
app.post('/v1/admin/badges/grant', requireAdminToken, async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const badgeId = String(req.body?.badgeId || '').trim();

    if (!USERNAME_REGEX.test(username)) return fail(res, req, 400, 'Invalid username', 'BAD_REQUEST');
    if (!isHex24(badgeId)) return fail(res, req, 400, 'Invalid badgeId', 'BAD_REQUEST');

    await UserBadge.updateOne(
      { username, badge: badgeId },
      { $setOnInsert: { grantedBy: 'admin' } },
      { upsert: true }
    );

    audit({ level:'WARN', event:'ADMIN_BADGE_GRANT', req, statusCode:200, message:'Badge granted', meta:{ usernameMasked: mask(username,2,0), badgeId } });
    return ok(res, req, 'Granted', { username: outUsername(req, username), badgeId });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

// Revogar badge
app.post('/v1/admin/badges/revoke', requireAdminToken, async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const badgeId = String(req.body?.badgeId || '').trim();

    if (!USERNAME_REGEX.test(username)) return fail(res, req, 400, 'Invalid username', 'BAD_REQUEST');
    if (!isHex24(badgeId)) return fail(res, req, 400, 'Invalid badgeId', 'BAD_REQUEST');

    await UserBadge.deleteOne({ username, badge: badgeId });

    audit({ level:'WARN', event:'ADMIN_BADGE_REVOKE', req, statusCode:200, message:'Badge revoked', meta:{ usernameMasked: mask(username,2,0), badgeId } });
    return ok(res, req, 'Revoked', { username: outUsername(req, username), badgeId });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

// =====================
// ADMIN: Tickets
// =====================

app.get('/v1/admin/tickets', requireAdminToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '25', 10)));
    const skip = (page - 1) * limit;

    const status = cleanStr(req.query?.status, 24);
    const type = cleanStr(req.query?.type, 24);
    const q = cleanStr(req.query?.q, 64);

    const filter = {};
    if (status && ['open','in_progress','closed'].includes(status)) filter.status = status;
    if (type && ['HWID_RESET','SUPPORT'].includes(type)) filter.type = type;

    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ username: rx }, { licenseKeyMasked: rx }];
    }

    const [items, total] = await Promise.all([
      Ticket.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Ticket.countDocuments(filter),
    ]);

    const mapped = items.map(t => ({
      id: String(t._id),
      type: t.type,
      status: t.status,
      username: outUsername(req, t.username || t.discordId),
      productId: t.product ? String(t.product) : null,
      licenseKeyMasked: t.licenseKeyMasked || null,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));

    return ok(res, req, 'OK', { page, limit, total, pages: Math.ceil(total / limit), items: mapped });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.get('/v1/admin/tickets/:id', requireAdminToken, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!isHex24(id)) return fail(res, req, 400, 'Invalid id', 'BAD_REQUEST');

    const t = await Ticket.findById(id).lean();
    if (!t) return fail(res, req, 404, 'Not found', 'NOT_FOUND');

    return ok(res, req, 'OK', { item: t });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.post('/v1/admin/tickets/:id/status', requireAdminToken, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!isHex24(id)) return fail(res, req, 400, 'Invalid id', 'BAD_REQUEST');

    const status = String(req.body?.status || '').trim();
    if (!['open','in_progress','closed'].includes(status)) {
      return fail(res, req, 400, 'Invalid status', 'BAD_REQUEST');
    }

    const doc = await Ticket.findByIdAndUpdate(id, { $set: { status } }, { new: true }).lean();
    if (!doc) return fail(res, req, 404, 'Not found', 'NOT_FOUND');

    audit({ level:'WARN', event:'ADMIN_TICKET_STATUS', req, statusCode:200, message:`Ticket -> ${status}`, meta:{ ticketId:id, status } });
    return ok(res, req, 'Updated', { ticket: doc });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.post('/v1/admin/tickets/:id/message', requireAdminToken, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!isHex24(id)) return fail(res, req, 400, 'Invalid id', 'BAD_REQUEST');

    const content = cleanStr(req.body?.content, 900);
    if (!content) return fail(res, req, 400, 'Invalid content', 'BAD_REQUEST');

    const t = await Ticket.findById(id);
    if (!t) return fail(res, req, 404, 'Not found', 'NOT_FOUND');

    t.messages.push({ by: 'staff', authorUsername: null, content });
    await t.save();

    return ok(res, req, 'Sent', { id: String(t._id) });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.post('/v1/admin/tickets/:id/reset-hwid', requireAdminToken, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!isHex24(id)) return fail(res, req, 400, 'Invalid id', 'BAD_REQUEST');

    const t = await Ticket.findById(id).lean();
    if (!t) return fail(res, req, 404, 'Not found', 'NOT_FOUND');

    // se vocÃª quiser: buscar a key pelo discordId e product, e resetar.
    const now = new Date();
    const keyDoc = await Key.findOne({
      usedBy: t.username || t.discordId,
      expiresAt: { $gt: now },
      banned: { $ne: true },
    });

    if (!keyDoc) return fail(res, req, 404, 'Active key not found for user', 'NOT_FOUND');

    keyDoc.hwid = null;
    await keyDoc.save();

    audit({ level:'WARN', event:'ADMIN_TICKET_HWID_RESET', req, statusCode:200, message:'HWID reset via ticket', meta:{ ticketId:id, keyMasked: mask(keyDoc.code) } });
    return ok(res, req, 'HWID reset', { ticketId: id, licenseKeyMasked: mask(keyDoc.code) });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

// =====================
// ADMIN: Configs (moderaÃ§Ã£o)
// =====================

app.get('/v1/admin/configs', requireAdminToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '25', 10)));
    const skip = (page - 1) * limit;

    const productId = String(req.query?.productId || '').trim();
    const q = cleanStr(req.query?.q, 64);

    const filter = {};
    if (productId && isHex24(productId)) filter.product = productId;

    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ title: rx }, { description: rx }, { ownerUsername: rx }];
    }

    const [items, total] = await Promise.all([
      ConfigUpload.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ConfigUpload.countDocuments(filter),
    ]);

    return ok(res, req, 'OK', { page, limit, total, pages: Math.ceil(total / limit), items });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.delete('/v1/admin/configs/:id', requireAdminToken, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!isHex24(id)) return fail(res, req, 400, 'Invalid id', 'BAD_REQUEST');

    await ConfigUpload.deleteOne({ _id: id });

    audit({ level:'WARN', event:'ADMIN_CONFIG_DELETE', req, statusCode:200, message:'Config deleted by admin', meta:{ configId:id } });
    return ok(res, req, 'Deleted', { id });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

// =====================
// Admin Routes (Dashboard)
// =====================

function parseDays(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n < -36500 || n > 36500) return null;
  // Allow decimals to support hour-based keys (e.g. 0.5 = 12h, 0.25 = 6h)
  // Round to 4 decimal places to avoid floating point noise
  return Math.round(n * 10000) / 10000;
}

app.get('/v1/admin/audit-logs', requireAdminToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '25', 10)));
    const skip = (page - 1) * limit;

    const {
      level, event, route, method,
      statusCode,
      requestId,
      discordIdMasked,
      from, to,
      q,
    } = req.query;

    const filter = {};

    if (level) filter.level = String(level).toUpperCase();
    if (event) filter.event = String(event);
    if (route) {
  const safe = String(route).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  filter.route = { $regex: safe, $options: "i" };
}
    if (method) filter.method = String(method).toUpperCase();

    if (statusCode) filter.statusCode = Number(statusCode);
    if (requestId) filter.requestId = String(requestId);

    if (discordIdMasked) filter.discordIdMasked = { $regex: String(discordIdMasked), $options: 'i' };

    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(String(from));
      if (to) filter.createdAt.$lte = new Date(String(to));
    }

    if (q) {
      const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { message: rx },
        { event: rx },
        { route: rx },
        { requestId: rx },
      ];
    }

    const [items, total] = await Promise.all([
      ApiLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ApiLog.countDocuments(filter),
    ]);

    const safeItems = items.map(it => {
  const x = { ...it };

  x.ip = outIp(req, it.ip);
  x.userAgent = outUa(req, it.userAgent);

  return x;
});

    return ok(res, req, 'OK', { page, limit, total, pages: Math.ceil(total / limit), items: safeItems });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.get('/v1/admin/audit-logs/:id', requireAdminToken, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    const doc = await ApiLog.findById(id).lean();
    if (!doc) return fail(res, req, 404, 'Not found', 'NOT_FOUND');
    return ok(res, req, 'OK', { item: doc });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

// Rota removida: sync-discord nÃ£o se aplica mais (sem Discord)
app.post('/v1/admin/users/sync-discord', requireAdminToken, async (req, res) => {
  return fail(res, req, 410, 'Discord sync removed. This API no longer uses Discord.', 'REMOVED');
});

app.get('/v1/admin/settings/privacy', requireAdminToken, async (req, res) => {
  const enabled = await getCensorEnabled();
  return ok(res, req, 'OK', { censorEnabled: enabled });
});

app.put('/v1/admin/settings/privacy', requireAdminToken, async (req, res) => {
  const enabled = parseBoolLike(req.body?.censorEnabled);
  if (enabled === null) return fail(res, req, 400, 'Invalid censorEnabled', 'BAD_REQUEST');

  await setCensorEnabled(enabled, 'dashboard');

  audit({
    level: 'WARN',
    event: 'ADMIN_PRIVACY_TOGGLE',
    req,
    statusCode: 200,
    message: `Censor ${enabled ? 'ENABLED' : 'DISABLED'}`,
    meta: { censorEnabled: enabled },
  });

  return ok(res, req, 'Updated', { censorEnabled: enabled });
});


app.get('/v1/admin/overview', requireAdminToken, async (req, res) => {
  try {
    const now = new Date();
    const productCountFilter = isOwnerAdmin(req) ? {} : { createdByAdmin: getSessionAdminId(req) };
    const keyScope = await getKeyAdminScopeClause(req);
    const ownedProductIds = isOwnerAdmin(req) ? null : await getOwnedProductIds(req);
    const userScope = isOwnerAdmin(req) ? {} : { 'productLinks.product': { $in: ownedProductIds } };
    const uniqueLinkedUsersFilter = isOwnerAdmin(req)
      ? { productLinks: { $exists: true, $not: { $size: 0 } } }
      : userScope;
    const linkedUserProductsPipeline = isOwnerAdmin(req)
      ? [{ $project: { c: { $size: { $ifNull: ['$productLinks', []] } } } }, { $group: { _id: null, total: { $sum: '$c' } } }]
      : [
          { $unwind: '$productLinks' },
          { $match: { 'productLinks.product': { $in: ownedProductIds } } },
          { $group: { _id: null, total: { $sum: 1 } } },
        ];

    const [
      keys,
      users,
      products,
      activeKeys,
      pausedKeys,
      bannedKeys,
      expiredKeys,
      pendingKeys,
      expiringSoon,
      linkedUserProducts,
      uniqueLinkedUsers,
    ] = await Promise.all([
      Key.countDocuments(keyScope),
      User.countDocuments(userScope),
      require('./database/models/Product').countDocuments(productCountFilter),
      Key.countDocuments({ ...keyScope, expiresAt: { $gt: now }, banned: { $ne: true }, paused: { $ne: true } }),
      Key.countDocuments({ ...keyScope, paused: true, banned: { $ne: true } }),
      Key.countDocuments({ ...keyScope, banned: true }),
      Key.countDocuments({ ...keyScope, expiresAt: { $lte: now }, banned: { $ne: true } }),
      Key.countDocuments({ ...keyScope, expiresAt: null, activatedAt: null, banned: { $ne: true } }),
      Key.countDocuments({
        ...keyScope,
        expiresAt: {
          $gt: now,
          $lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
        banned: { $ne: true },
      }),
      User.aggregate(linkedUserProductsPipeline),
      User.countDocuments(uniqueLinkedUsersFilter),
    ]);

    return ok(res, req, 'OK', {
      keys,
      users,
      products,
      activeKeys,
      pausedKeys,
      bannedKeys,
      expiredKeys,
      pendingKeys,
      expiringSoon,
      linkedUserProducts: linkedUserProducts?.[0]?.total || 0,
      uniqueLinkedUsers,
    });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.get('/v1/admin/system/status', requireAdminToken, async (req, res) => {
  try {
    const stateMap = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
    const dbState = mongoose?.connection?.readyState ?? 0;
    return ok(res, req, 'OK', {
      api: {
        uptimeSec: Math.floor(process.uptime()),
        now: new Date().toISOString(),
        node: process.version,
      },
      database: {
        readyState: dbState,
        state: stateMap[dbState] || 'unknown',
        host: mongoose?.connection?.host || null,
        name: mongoose?.connection?.name || null,
      },
    });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.get('/v1/admin/products', requireAdminToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '25', 10)));
    const skip = (page - 1) * limit;

    const q = String(req.query.q || '').trim();
    const filter = {};

    if (!isOwnerAdmin(req)) {
      const adminId = getSessionAdminId(req);
      if (!adminId) return fail(res, req, 403, 'Forbidden', 'FORBIDDEN');
      filter.createdByAdmin = adminId;
    }

    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { _id: q.match(/^[0-9a-f]{24}$/i) ? q : undefined }].filter(Boolean);
    }

    const [items, total] = await Promise.all([
      Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Product.countDocuments(filter),
    ]);

    const mapped = items.map((p) => ({
      ...p,
      productHash: p.productHash || computeProductHash(String(p._id)),
    }));

    return ok(res, req, 'OK', { page, limit, total, pages: Math.ceil(total / limit), items: mapped });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.post('/v1/admin/products', requireAdminToken, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name || name.length < 2 || name.length > 64) {
    return fail(res, req, 400, 'Invalid name', 'BAD_REQUEST');
  }

  const hwidLockEnabled = parseBoolLike(req.body?.hwidLockEnabled);
  const creatorAdminId = getSessionAdminId(req);
  const doc = await Product.create({
    name,
    hwidLockEnabled: hwidLockEnabled === null ? true : hwidLockEnabled,
    createdByAdmin: creatorAdminId || null,
  });

  const productHash = await ensureProductHash(doc);
  if (productHash && !doc.productHash) {
    doc.productHash = productHash;
  }

  audit({
    level: 'WARN',
    event: 'ADMIN_PRODUCT_CREATE',
    req,
    statusCode: 200,
    message: 'Product created',
    meta: { productId: String(doc._id), name },
  });

  return ok(res, req, 'Created', {
    product: {
      ...(typeof doc.toObject === 'function' ? doc.toObject() : doc),
      productHash: doc.productHash || productHash || computeProductHash(String(doc._id)),
    },
  });
});

app.put('/v1/admin/products/:id', requireAdminToken, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!/^[0-9a-f]{24}$/i.test(id)) return fail(res, req, 400, 'Invalid id', 'BAD_REQUEST');

  const update = {};
  if (req.body?.name !== undefined) {
    const name = String(req.body.name || '').trim();
    if (!name || name.length < 2 || name.length > 64) return fail(res, req, 400, 'Invalid name', 'BAD_REQUEST');
    update.name = name;
  }

  const where = { _id: id };
  if (!isOwnerAdmin(req)) {
    const adminId = getSessionAdminId(req);
    if (!adminId) return fail(res, req, 403, 'Forbidden', 'FORBIDDEN');
    where.createdByAdmin = adminId;
  }

  const doc = await Product.findOneAndUpdate(where, { $set: update }, { new: true }).lean();
  if (!doc) return fail(res, req, 404, 'Not found', 'NOT_FOUND');

  audit({ level:'WARN', event:'ADMIN_PRODUCT_UPDATE', req, statusCode:200, message:'Product updated', meta:{ productId:id } });
  return ok(res, req, 'Updated', { product: doc });
});

app.put('/v1/admin/products/:id/hwid-lock', requireAdminToken, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!/^[0-9a-f]{24}$/i.test(id)) return fail(res, req, 400, 'Invalid id', 'BAD_REQUEST');

  const enabled = parseBoolLike(req.body?.enabled);
  if (enabled === null) return fail(res, req, 400, 'Invalid enabled', 'BAD_REQUEST');

  const where = { _id: id };
  if (!isOwnerAdmin(req)) {
    const adminId = getSessionAdminId(req);
    if (!adminId) return fail(res, req, 403, 'Forbidden', 'FORBIDDEN');
    where.createdByAdmin = adminId;
  }

  const doc = await Product.findOneAndUpdate(
    where,
    { $set: { hwidLockEnabled: enabled } },
    { new: true }
  ).lean();

  if (!doc) return fail(res, req, 404, 'Not found', 'NOT_FOUND');

  audit({
    level: 'WARN',
    event: 'ADMIN_PRODUCT_HWID_LOCK',
    req,
    statusCode: 200,
    message: `Product HWID lock = ${enabled ? 'ON' : 'OFF'}`,
    meta: { productId: id, enabled },
  });

  return ok(res, req, 'Updated', { product: doc });
});

app.delete('/v1/admin/products/:id', requireAdminToken, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!/^[0-9a-f]{24}$/i.test(id)) return fail(res, req, 400, 'Invalid id', 'BAD_REQUEST');

  const where = { _id: id };
  if (!isOwnerAdmin(req)) {
    const adminId = getSessionAdminId(req);
    if (!adminId) return fail(res, req, 403, 'Forbidden', 'FORBIDDEN');
    where.createdByAdmin = adminId;
  }

  const product = await Product.findOne(where).lean();
  if (!product) return fail(res, req, 404, 'Not found', 'NOT_FOUND');

  const keysUsingProduct = await Key.countDocuments({ product: id });
  if (keysUsingProduct > 0) {
    return fail(res, req, 409, 'NÃ£o Ã© possÃ­vel apagar produto com keys vinculadas', 'CONFLICT', {
      keysCount: keysUsingProduct,
    });
  }

  await Product.deleteOne({ _id: id });

  audit({
    level: 'WARN',
    event: 'ADMIN_PRODUCT_DELETE',
    req,
    statusCode: 200,
    message: 'Product deleted',
    meta: { productId: id, name: product.name || null },
  });

  return ok(res, req, 'Deleted', { id });
});

function genKeyCode(prefix = 'SAFE-', bytes = 10) {
  const raw = crypto.randomBytes(bytes).toString('hex').toUpperCase();
  const chunks = raw.match(/.{1,4}/g) || [raw];
  return `${prefix}${chunks.join('-')}`;
}

const { generateKey } = require('./utils/generateKey'); // ajuste o path

app.post('/v1/admin/keys/create', requireAdminToken, async (req, res) => {
  const productId = String(req.body?.productId || '').trim();
  if (!/^[0-9a-f]{24}$/i.test(productId)) return fail(res, req, 400, 'Invalid productId', 'BAD_REQUEST');

  const days = parseDays(req.body?.days);
  if (days === null || days <= 0) return fail(res, req, 400, 'Invalid days', 'BAD_REQUEST');

  const quantityRaw = Number(req.body?.quantity ?? 1);
  if (!Number.isFinite(quantityRaw)) return fail(res, req, 400, 'Invalid quantity', 'BAD_REQUEST');
  const quantity = Math.min(500, Math.max(1, Math.trunc(quantityRaw)));

  const prefix = req.body?.prefix
    ? String(req.body.prefix).trim().toUpperCase()
    : (process.env.KEY_PREFIX || 'Spectre');

  const productWhere = { _id: productId };
  if (!isOwnerAdmin(req)) {
    const adminId = getSessionAdminId(req);
    if (!adminId) return fail(res, req, 403, 'Forbidden', 'FORBIDDEN');
    productWhere.createdByAdmin = adminId;
  }

  const product = await Product.findOne(productWhere).lean();
  if (!product) return fail(res, req, 404, 'Product not found', 'NOT_FOUND');

  const canonicalProductHash = product.productHash || computeProductHash(String(product._id));
  if (!product.productHash) {
    await Product.updateOne({ _id: product._id }, { $set: { productHash: canonicalProductHash } }).catch(() => {});
  }

  const creatorAdminId = getSessionAdminId(req);

  const created = [];

  for (let i = 0; i < quantity; i++) {
    const code = await generateKey(prefix);

    const doc = await Key.create({
      prefix,
      code,
      codeHash: sha256Hex(String(code).toUpperCase()),
      product: productId,
      productHash: canonicalProductHash,
      createdByAdmin: creatorAdminId || null,
      durationDays: days,
      activatedAt: null,
      expiresAt: null,
      usedBy: null,
      usedAt: null,
      keyScopeHash: null,
      hwid: null,
      paused: false,
      banned: false,
      banReason: null,
    });

    created.push({
      id: String(doc._id),
      code: outKey(req, doc.code),
      durationDays: doc.durationDays,
      activatesOn: 'bind',
      productHash: doc.productHash,
      expiresAt: doc.expiresAt,
    });
  }

  await Product.updateOne({ _id: productId }, { $inc: { keysCount: created.length } });

  audit({
    level: 'WARN',
    event: 'ADMIN_KEYS_CREATE',
    req,
    statusCode: 200,
    message: `Created ${created.length} key(s)`,
    meta: { productId, days, quantity: created.length, prefix },
  });

  return ok(res, req, 'Created', { items: created });
});

app.get('/v1/admin/users/:username', requireAdminToken, async (req, res) => {
  const username = String(req.params.username || '').trim().toLowerCase();

  if (!USERNAME_REGEX.test(username)) {
    return fail(res, req, 400, 'Invalid username', 'INVALID_USERNAME');
  }

  try {
    const u = await User.findOne({ username }).lean();
    if (!u) return fail(res, req, 404, 'User not found', 'NOT_FOUND');

    if (!isOwnerAdmin(req)) {
      const ownedProductIds = await getOwnedProductIds(req);
      const scopedLinks = filterUserProductLinksByIds(u, ownedProductIds);
      if (!scopedLinks.length) return fail(res, req, 404, 'User not found', 'NOT_FOUND');
      u.productLinks = scopedLinks;
    }

    const item = {
      username: outUsername(req, u.username),
      displayName: u.displayName || u.username,
      avatarUrl: u.avatarUrl || null,
      key: outKey(req, u.key),
      linkedAt: u.linkedAt || null,
      productLinks: (u.productLinks || []).map((l) => ({
        productId: l.product ? String(l.product) : null,
        key: outKey(req, l.key),
        linkedAt: l.linkedAt || null,
        expiresAt: l.expiresAt || null,
        productHash: req.censorEnabled ? null : (l.productHash || null),
      })),
      paused: Boolean(u.paused),
      banned: Boolean(u.banned),
      banReason: req.censorEnabled ? (u.banReason ? '[censored]' : null) : (u.banReason || null),
      createdAt: u.createdAt || null,
      updatedAt: u.updatedAt || null,
    };

    return ok(res, req, 'OK', { item });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.delete('/v1/admin/users/:username', requireAdminToken, async (req, res) => {
  const username = String(req.params.username || '').trim().toLowerCase();

  if (!USERNAME_REGEX.test(username)) {
    return fail(res, req, 400, 'Invalid username', 'INVALID_USERNAME');
  }

  try {
    const u = await User.findOne({ username });
    if (!u) return fail(res, req, 404, 'User not found', 'NOT_FOUND');

    if (!isOwnerAdmin(req)) {
      const ownedProductIds = await getOwnedProductIds(req);
      const scopedLinks = filterUserProductLinksByIds(u.toObject(), ownedProductIds);
      if (!scopedLinks.length) return fail(res, req, 404, 'User not found', 'NOT_FOUND');
    }

    await User.deleteOne({ username });

    audit({
      level: 'WARN',
      event: 'ADMIN_USER_DELETE',
      req,
      statusCode: 200,
      message: `Deleted user ${outUsername(req, username)}`,
      meta: { username: outUsername(req, username) },
    });

    return ok(res, req, 'Deleted', { username });
  } catch (e) {
    audit({ level: 'ERROR', event: 'ADMIN_USER_DELETE_ERROR', req, statusCode: 500, message: e?.message || 'error' });
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.get('/v1/admin/keys/:id', requireAdminToken, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!/^[0-9a-f]{24}$/i.test(id)) {
    return fail(res, req, 400, 'Invalid key id', 'BAD_REQUEST');
  }

  try {
    const scope = await getKeyAdminScopeClause(req);
    const k = await Key.findOne({ _id: id, ...scope }).populate('product', 'name hwidLockEnabled').lean();
    if (!k) return fail(res, req, 404, 'Key not found', 'NOT_FOUND');

    const item = {
      id: String(k._id),
      prefix: k.prefix || null,
      code: outKey(req, k.code),

      product: k.product ? {
        id: String(k.product._id),
        name: k.product.name,
        hwidLockEnabled: typeof k.product.hwidLockEnabled === 'boolean' ? k.product.hwidLockEnabled : true,
      } : null,

      createdAt: k.createdAt || null,
      updatedAt: k.updatedAt || null,

      durationDays: k.durationDays ?? null,
      activatedAt: k.activatedAt || null,
      expiresAt: k.expiresAt || null,
      productHash: k.productHash || null,

      usedBy: outUsername(req, k.usedBy),
      usedAt: k.usedAt || null,

      hwid: req.censorEnabled ? (k.hwid ? 'SET' : null) : (k.hwid || null),

      paused: Boolean(k.paused),
      pausedAt: k.pausedAt || null,
      pausedBy: k.pausedBy || null,

      banned: Boolean(k.banned),
      bannedAt: k.bannedAt || null,
      bannedBy: k.bannedBy || null,

      banReason: req.censorEnabled ? (k.banReason ? '[censored]' : null) : (k.banReason || null),
    };

    return ok(res, req, 'OK', { item });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.delete('/v1/admin/keys/:id', requireAdminToken, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!/^[0-9a-f]{24}$/i.test(id)) {
    return fail(res, req, 400, 'Invalid key id', 'BAD_REQUEST');
  }

  try {
    const scope = await getKeyAdminScopeClause(req);
    const keyDoc = await Key.findOne({ _id: id, ...scope });
    if (!keyDoc) return fail(res, req, 404, 'Key not found', 'NOT_FOUND');

    const codeSnapshot = keyDoc.code;

    await Key.deleteOne({ _id: id });

    audit({
      level: 'WARN',
      event: 'ADMIN_KEY_DELETE',
      req,
      statusCode: 200,
      message: `Deleted key ${mask(codeSnapshot)}`,
      meta: { id, keyMasked: mask(codeSnapshot) },
    });

    return ok(res, req, 'Deleted', { id });
  } catch (e) {
    audit({ level: 'ERROR', event: 'ADMIN_KEY_DELETE_ERROR', req, statusCode: 500, message: e?.message || 'error' });
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.post('/v1/admin/key/info', requireAdminToken, async (req, res) => {
  const code = String(req.body?.licenseKey || '').trim().toUpperCase();
  if (!code) return fail(res, req, 400, 'Invalid parameters', 'BAD_REQUEST');

  try {
    const scope = await getKeyAdminScopeClause(req);
    const k = await Key.findOne({ code, ...scope }).populate('product', 'name hwidLockEnabled').lean();
    if (!k) return fail(res, req, 404, 'Key not found', 'NOT_FOUND');

    const now = new Date();
    const expired = k.expiresAt ? k.expiresAt <= now : false;
    const pendingActivation = !k.expiresAt && !k.activatedAt;

    const item = {
      licenseKey: req.censorEnabled ? null : (k.code || null),
      licenseKeyMasked: mask(k.code || ''),
      productId: k.product ? String(k.product._id) : null,
      productName: k.product ? k.product.name : null,

      status: {
        paused: Boolean(k.paused),
        banned: Boolean(k.banned),
        expired: Boolean(expired),
        pendingActivation,
      },

      hwid: req.censorEnabled ? (k.hwid ? 'SET' : null) : (k.hwid || null),
      usedBy: outUsername(req, k.usedBy),

      expiresAt: k.expiresAt ? new Date(k.expiresAt).toISOString() : null,
      durationDays: k.durationDays ?? null,
      activatedAt: k.activatedAt ? new Date(k.activatedAt).toISOString() : null,
      productHash: k.productHash || null,
      createdAt: k.createdAt ? new Date(k.createdAt).toISOString() : null,
      lastUsed: k.usedAt ? new Date(k.usedAt).toISOString() : null,

      banReason: req.censorEnabled ? (k.banReason ? '[censored]' : null) : (k.banReason || null),

      hwidLock: {
        global: true, 
        product: k.product?.hwidLockEnabled ?? true,
        enabled: (k.product?.hwidLockEnabled ?? true) === true,
      }
    };

    return ok(res, req, 'OK', item);
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.get('/v1/admin/keys', requireAdminToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '25', 10)));
    const skip = (page - 1) * limit;

    const q = String(req.query.q || '').trim().toUpperCase();
    const status = String(req.query.status || '').trim().toLowerCase();
    const productId = String(req.query.productId || '').trim();

    const now = new Date();
    const filter = await getKeyAdminScopeClause(req);

    if (productId && /^[0-9a-fA-F]{24}$/.test(productId)) filter.product = productId;

    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { code: rx },
        { prefix: rx },
        { usedBy: rx },
      ];
    }

    if (status === 'active') {
      filter.expiresAt = { $gt: now };
      filter.banned = { $ne: true };
      filter.paused = { $ne: true };
    } else if (status === 'expired') {
      filter.expiresAt = { $lte: now };
    } else if (status === 'banned') {
      filter.banned = true;
    } else if (status === 'paused') {
      filter.paused = true;
    }

    const [items, total] = await Promise.all([
      Key.find(filter)
        .populate('product', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Key.countDocuments(filter),
    ]);

    const mapped = items.map(k => ({
  id: String(k._id),
  prefix: k.prefix,
  code: outKey(req, k.code),
  product: k.product ? { id: String(k.product._id), name: k.product.name } : null,
  createdAt: k.createdAt,
  durationDays: k.durationDays ?? null,
  activatedAt: k.activatedAt || null,
  expiresAt: k.expiresAt,
  productHash: k.productHash || null,
  usedBy: outUsername(req, k.usedBy),
  usedAt: k.usedAt || null,
  hwid: req.censorEnabled ? (k.hwid ? 'SET' : null) : (k.hwid || null),
  paused: Boolean(k.paused),
  banned: Boolean(k.banned),
  banReason: req.censorEnabled ? (k.banReason ? '[censored]' : null) : (k.banReason || null),
}));

    return ok(res, req, 'OK', { page, limit, total, pages: Math.ceil(total / limit), items: mapped });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});

app.post('/v1/admin/key/reset-hwid', requireAdminToken, async (req, res) => {
  const code = String(req.body?.licenseKey || '').trim().toUpperCase();
  if (!code) return fail(res, req, 400, 'Invalid parameters', 'BAD_REQUEST');
  const keyDoc = await findScopedKeyByCode(req, code);
  if (!keyDoc) return fail(res, req, 404, 'Key not found', 'NOT_FOUND');
  keyDoc.hwid = null;
  await keyDoc.save();
  return ok(res, req, 'HWID reset', { licenseKeyMasked: mask(code) });
});

app.get('/v1/admin/users', requireAdminToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '25', 10)));
    const skip = (page - 1) * limit;

    const q = String(req.query.q || '').trim();
    const productId = String(req.query.productId || '').trim();
    const filter = {};

    let ownedProductIds = null;
    if (!isOwnerAdmin(req)) {
      ownedProductIds = await getOwnedProductIds(req);
      filter['productLinks.product'] = { $in: ownedProductIds };
    }

    if (productId && /^[0-9a-fA-F]{24}$/.test(productId)) {
      if (ownedProductIds) {
        if (!ownedProductIds.includes(productId)) {
          return ok(res, req, 'OK', { page, limit, total: 0, pages: 0, items: [] });
        }
      }
      filter['productLinks.product'] = productId;
    }
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { username: rx },
        { displayName: rx },
        { key: rx },
        { 'productLinks.key': rx },
      ];
    }
    const [items, total] = await Promise.all([
      User.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);
    const mapped = items.map(u => {
      const links = ownedProductIds ? filterUserProductLinksByIds(u, ownedProductIds) : (u.productLinks || []);
      return {
        username: outUsername(req, u.username),
        displayName: u.displayName || u.username,
        avatarUrl: u.avatarUrl || null,
        key: outKey(req, u.key),
        linkedAt: u.linkedAt,
        productLinks: links.map((l) => ({
          productId: l.product ? String(l.product) : null,
          key: outKey(req, l.key),
          linkedAt: l.linkedAt || null,
          expiresAt: l.expiresAt || null,
          productHash: req.censorEnabled ? null : (l.productHash || null),
        })),
        paused: Boolean(u.paused),
        banned: Boolean(u.banned),
        banReason: req.censorEnabled ? (u.banReason ? '[censored]' : null) : (u.banReason || null),
      };
    });

    return ok(res, req, 'OK', { page, limit, total, pages: Math.ceil(total / limit), items: mapped });
  } catch (e) {
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  }
});


app.post('/v1/admin/key/unlink', requireAdminToken, async (req, res) => {
  const code = String(req.body?.licenseKey || '').trim().toUpperCase();
  if (!code) return fail(res, req, 400, 'Invalid parameters', 'BAD_REQUEST');

  const keyDoc = await findScopedKeyByCode(req, code);
  if (!keyDoc) return fail(res, req, 404, 'Key not found', 'NOT_FOUND');

  const oldDiscord = keyDoc.usedBy;
  keyDoc.usedBy = null;
  keyDoc.usedAt = null;
  keyDoc.keyScopeHash = null;
  keyDoc.hwid = null;
  if (Number.isFinite(Number(keyDoc.durationDays)) && Number(keyDoc.durationDays) > 0) {
    keyDoc.activatedAt = null;
    keyDoc.expiresAt = null;
  }
  await keyDoc.save();

  if (oldDiscord) {
    await removeUserProductLink({
      username: oldDiscord,
      productId: normalizeProductId(keyDoc.product),
      licenseKey: keyDoc.code,
    });
  }

  return ok(res, req, 'Unlinked', { licenseKeyMasked: mask(code), oldUsedBy: oldDiscord || null });
});

app.post('/v1/admin/key/add-days', requireAdminToken, async (req, res) => {
  const code = String(req.body?.licenseKey || '').trim().toUpperCase();
  const days = parseDays(req.body?.days);
  if (!code || days === null) return fail(res, req, 400, 'Invalid parameters', 'BAD_REQUEST');

  const keyDoc = await findScopedKeyByCode(req, code);
  if (!keyDoc) return fail(res, req, 404, 'Key not found', 'NOT_FOUND');

  if (keyDoc.expiresAt) {
    keyDoc.expiresAt = addDays(keyDoc.expiresAt, days);
  } else {
    const currentDuration = Number(keyDoc.durationDays);
    const baseDuration = Number.isFinite(currentDuration) ? Math.trunc(currentDuration) : 0;
    keyDoc.durationDays = Math.max(1, baseDuration + days);
  }
  await keyDoc.save();

  return ok(res, req, 'Updated', {
    licenseKeyMasked: mask(code),
    expiresAt: keyDoc.expiresAt ? keyDoc.expiresAt.toISOString() : null,
    durationDays: keyDoc.durationDays ?? null,
  });
});

app.post('/v1/admin/key/pause', requireAdminToken, async (req, res) => {
  const code = String(req.body?.licenseKey || '').trim().toUpperCase();
  const paused = Boolean(req.body?.paused);
  if (!code) return fail(res, req, 400, 'Invalid parameters', 'BAD_REQUEST');

  const keyDoc = await findScopedKeyByCode(req, code);
  if (!keyDoc) return fail(res, req, 404, 'Key not found', 'NOT_FOUND');

  keyDoc.paused = paused;
  keyDoc.pausedAt = paused ? new Date() : null;
  keyDoc.pausedBy = paused ? 'dashboard' : null;
  await keyDoc.save();

  return ok(res, req, 'Updated', { licenseKeyMasked: mask(code), paused });
});

app.post('/v1/admin/key/ban', requireAdminToken, async (req, res) => {
  const code = String(req.body?.licenseKey || '').trim().toUpperCase();
  const banned = Boolean(req.body?.banned);
  const reason = req.body?.reason ? String(req.body.reason).slice(0, 220) : null;
  if (!code) return fail(res, req, 400, 'Invalid parameters', 'BAD_REQUEST');

  const keyDoc = await findScopedKeyByCode(req, code);
  if (!keyDoc) return fail(res, req, 404, 'Key not found', 'NOT_FOUND');

  keyDoc.banned = banned;
  keyDoc.banReason = banned ? reason : null;
  keyDoc.bannedAt = banned ? new Date() : null;
  keyDoc.bannedBy = banned ? 'dashboard' : null;
  await keyDoc.save();

  return ok(res, req, 'Updated', { licenseKeyMasked: mask(code), banned, reason: keyDoc.banReason });
});

app.post('/v1/admin/actives/pause-all', requireAdminToken, async (req, res) => {
  const paused = Boolean(req.body?.paused);
  const now = new Date();
  const scope = await getKeyAdminScopeClause(req);
  const filter = { expiresAt: { $gt: now }, banned: { $ne: true }, ...scope };
  const update = paused
    ? { $set: { paused: true, pausedAt: now, pausedBy: 'dashboard' } }
    : { $set: { paused: false, pausedAt: null, pausedBy: null } };

  const r = await Key.updateMany(filter, update);
  return ok(res, req, 'Updated', { matched: r.matchedCount ?? r.n, modified: r.modifiedCount ?? r.nModified });
});

app.post('/v1/admin/actives/reset-hwid-all', requireAdminToken, async (req, res) => {
  const now = new Date();
  const scope = await getKeyAdminScopeClause(req);
  const r = await Key.updateMany(
    { expiresAt: { $gt: now }, banned: { $ne: true }, ...scope },
    { $set: { hwid: null } },
  );
  return ok(res, req, 'Updated', { matched: r.matchedCount ?? r.n, modified: r.modifiedCount ?? r.nModified });
});

app.get('/v1/admin/settings/security', requireAdminToken, async (req, res) => {
  const security = await getSetting('security', { hwidLockGlobal: true });
  return ok(res, req, 'OK', security);
});

app.put('/v1/admin/settings/security', requireAdminToken, async (req, res) => {
  const hwidLockGlobal = parseBoolLike(req.body?.hwidLockGlobal);
  if (hwidLockGlobal === null) return fail(res, req, 400, 'Invalid hwidLockGlobal', 'BAD_REQUEST');

  const saved = await setSetting('security', { hwidLockGlobal }, 'dashboard');

  audit({
    level: 'WARN',
    event: 'ADMIN_SECURITY_UPDATE',
    req,
    statusCode: 200,
    message: `HWID_LOCK_GLOBAL = ${hwidLockGlobal ? 'ON' : 'OFF'}`,
    meta: { hwidLockGlobal },
  });

  return ok(res, req, 'Updated', saved.value);
});

app.get('/v1/admin/settings/webhooks', requireAdminToken, async (req, res) => {
  const webhooks = await getSetting('webhooks', {
    enabled: true,
    url: null,
    minLevel: 'WARN',
    username: null,
    avatarUrl: null,
    allowSensitive: false,
  });
  return ok(res, req, 'OK', webhooks);
});

app.put('/v1/admin/settings/webhooks', requireAdminToken, async (req, res) => {
  const current = await getSetting('webhooks', {
    enabled: true, url: null, minLevel: 'WARN', username: null, avatarUrl: null, allowSensitive: false,
  });

  const enabled = parseBoolLike(req.body?.enabled);
  const allowSensitive = parseBoolLike(req.body?.allowSensitive);

  const url = req.body?.url ? String(req.body.url).trim() : undefined;
  const minLevel = req.body?.minLevel ? String(req.body.minLevel).toUpperCase() : undefined;
  const username = req.body?.username !== undefined ? String(req.body.username || '').trim() : undefined;
  const avatarUrl = req.body?.avatarUrl !== undefined ? String(req.body.avatarUrl || '').trim() : undefined;

  if (minLevel && !['INFO', 'WARN', 'ERROR'].includes(minLevel)) {
    return fail(res, req, 400, 'Invalid minLevel', 'BAD_REQUEST');
  }
  if (url !== undefined && url && !/^https?:\/\//i.test(url)) {
    return fail(res, req, 400, 'Invalid url', 'BAD_REQUEST');
  }

  const nextValue = {
    ...current,
    ...(enabled !== null ? { enabled } : {}),
    ...(allowSensitive !== null ? { allowSensitive } : {}),
    ...(url !== undefined ? { url: url || null } : {}),
    ...(minLevel ? { minLevel } : {}),
    ...(username !== undefined ? { username: username || null } : {}),
    ...(avatarUrl !== undefined ? { avatarUrl: avatarUrl || null } : {}),
  };

  const saved = await setSetting('webhooks', nextValue, 'dashboard');

  audit({
    level: 'WARN',
    event: 'ADMIN_WEBHOOK_SETTINGS_UPDATE',
    req,
    statusCode: 200,
    message: 'Webhook settings updated',
    meta: { enabled: nextValue.enabled, minLevel: nextValue.minLevel },
  });

  return ok(res, req, 'Updated', saved.value);
});


app.post('/v1/admin/maintenance', requireAdminToken, async (req, res) => {
  const enabled = Boolean(req.body?.enabled);
  const msg = req.body?.message ? String(req.body.message).slice(0, 220) : null;

  process.env.MAINTENANCE_MODE = enabled ? '1' : '0';
  if (msg) process.env.MAINTENANCE_MESSAGE = msg;

  return ok(res, req, 'Updated', {
    enabled,
    message: String(process.env.MAINTENANCE_MESSAGE || ''),
  });
});

app.post('/v1/admin/actives/add-days-all', requireAdminToken, async (req, res) => {
  const days = parseDays(req.body?.days);
  if (days === null) return fail(res, req, 400, 'Invalid parameters', 'BAD_REQUEST');

  const now = new Date();
  const scope = await getKeyAdminScopeClause(req);
  const keys = await Key.find({ expiresAt: { $gt: now }, banned: { $ne: true }, ...scope }).select('_id expiresAt');
  let updated = 0;

  for (const k of keys) {
    await Key.updateOne({ _id: k._id }, { $set: { expiresAt: addDays(k.expiresAt, days) } });
    updated++;
  }

  return ok(res, req, 'Updated', { updated, days });
});

app.post('/v1/admin/keys/delete-by-status', requireAdminToken, async (req, res) => {
  const status = String(req.body?.status || '').trim().toLowerCase();
  const dryRun = parseBoolLike(req.body?.dryRun) === true;
  const now = new Date();

  let filter = null;
  if (status === 'expired') {
    filter = { expiresAt: { $lte: now } };
  } else if (status === 'pending') {
    filter = { expiresAt: null, activatedAt: null };
  } else if (status === 'paused') {
    filter = { paused: true };
  } else if (status === 'banned') {
    filter = { banned: true };
  } else if (status === 'inactive') {
    filter = {
      $or: [
        { paused: true },
        { banned: true },
        { expiresAt: { $lte: now } },
        { expiresAt: null, activatedAt: null },
      ],
    };
  } else {
    return fail(res, req, 400, 'Invalid status. Use expired|inactive|paused|banned|pending', 'BAD_REQUEST');
  }

  const scope = await getKeyAdminScopeClause(req);
  const scopedFilter = { ...filter, ...scope };

  const matched = await Key.countDocuments(scopedFilter);
  if (dryRun) {
    return ok(res, req, 'Dry run', { status, dryRun: true, matched, deleted: 0 });
  }

  const r = await Key.deleteMany(scopedFilter);
  const deleted = r.deletedCount ?? 0;

  audit({
    level: 'WARN',
    event: 'ADMIN_BULK_DELETE_KEYS',
    req,
    statusCode: 200,
    message: `Bulk delete keys by status=${status}`,
    meta: { status, matched, deleted },
  });

  return ok(res, req, 'Deleted', { status, dryRun: false, matched, deleted });
});

  app.post('/v1/admin/reset-hwid', requireAdminToken, async (req, res) => {
    const licenseKey = String(req.body?.licenseKey || '').trim().toUpperCase();
    if (!licenseKey) return fail(res, req, 400, 'Invalid parameters', 'BAD_REQUEST');

    try {
      const keyDoc = await findScopedKeyByCode(req, licenseKey);
      if (!keyDoc) return fail(res, req, 404, 'Key not found', 'NOT_FOUND');

      keyDoc.hwid = null;
      await keyDoc.save();

      audit({
        level: 'WARN',
        event: 'ADMIN_RESET_HWID',
        req,
        statusCode: 200,
        message: 'Reset HWID via admin endpoint',
        meta: { keyMasked: mask(licenseKey) },
      });

      return ok(res, req, 'HWID reset', { licenseKeyMasked: mask(licenseKey) });
    } catch (e) {
      audit({ level: 'ERROR', event: 'ADMIN_RESET_HWID_ERROR', req, statusCode: 500, message: e?.message || 'error' });
      return fail(res, req, 500, 'Internal server error', 'INTERNAL');
    }
  });

  app.use((req, res) => fail(res, req, 404, 'route not found', 'NOT_FOUND'));

  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      return fail(res, req, 400, 'Invalid JSON', 'INVALID_JSON');
    }
    audit({
      level: 'ERROR',
      event: 'EXPRESS_ERROR',
      req,
      statusCode: 500,
      message: err?.message || 'Express error',
    });
    return fail(res, req, 500, 'Internal server error', 'INTERNAL');
  });

  return app;
}

async function startApi(port = Number(process.env.API_PORT || 3000)) {
  const app = createApiApp();

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      logger.info(`API rodando na porta ${port}`);
      resolve({ app, server });
    });

    server.requestTimeout = 10_000;
    server.headersTimeout = 11_000;
    server.keepAliveTimeout = 5_000;
  });
}

module.exports = { createApiApp, startApi };

if (require.main === module) {
  const { connectDB } = require('./database/connect');
  connectDB()
    .then(() => startApi())
    .catch((err) => {
      logger.error(`Falha ao iniciar API: ${err.stack || err.message}`);
      process.exit(1);
    });
}