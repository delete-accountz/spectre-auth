const mongoose = require('mongoose');

const apiLogSchema = new mongoose.Schema(
  {
    requestId: { type: String, index: true },
    level: { type: String, index: true }, // INFO/WARN/ERROR
    event: { type: String, index: true },

    route: { type: String, index: true },
    method: { type: String, index: true },
    statusCode: { type: Number, index: true },
    latencyMs: { type: Number, default: null },

    ip: { type: String, default: null },
    userAgent: { type: String, default: null },

    keyMasked: { type: String, default: null, index: true },
    hwidMasked: { type: String, default: null },
    discordIdMasked: { type: String, default: null, index: true },

    message: { type: String, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ApiLog', apiLogSchema);
