const mongoose = require('mongoose');

const adminSessionSchema = new mongoose.Schema(
  {
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    csrfToken: { type: String, required: true, maxlength: 128 },
    ip: { type: String, maxlength: 80, default: '' },
    ua: { type: String, maxlength: 260, default: '' },
    lastSeenAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true, minimize: true }
);

adminSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

adminSessionSchema.set('toJSON', { versionKey: false });

module.exports = mongoose.models.AdminSession || mongoose.model('AdminSession', adminSessionSchema);
